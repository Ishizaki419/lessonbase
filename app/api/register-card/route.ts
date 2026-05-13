import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import Stripe from "stripe";

import type { Database } from "@/lib/database.types";

type RegisterCardBody = {
  student_id?: string;
};

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return null;
  }
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function verifyStudentAccess(admin: ReturnType<typeof createClient<Database>>, token: string, studentId: string) {
  const {
    data: { user },
    error: userError
  } = await admin.auth.getUser(token);

  if (userError || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: student, error: studentError } = await admin
    .from("students")
    .select("id, name, email, school_id, stripe_customer_id")
    .eq("id", studentId)
    .maybeSingle();

  if (studentError || !student?.school_id) {
    return { error: NextResponse.json({ error: "Student not found" }, { status: 404 }) };
  }

  const { data: member } = await admin
    .from("school_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("school_id", student.school_id)
    .maybeSingle();

  if (!member) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { student };
}

export async function POST(req: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ error: "STRIPE_SECRET_KEY is not set" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RegisterCardBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const studentId = body.student_id?.trim();
  if (!studentId) {
    return NextResponse.json({ error: "student_id is required" }, { status: 400 });
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const access = await verifyStudentAccess(admin, token, studentId);
  if ("error" in access && access.error) {
    return access.error;
  }

  const student = access.student!;
  const stripe = new Stripe(secretKey);

  try {
    let customerId = student.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: student.email ?? undefined,
        name: student.name,
        metadata: {
          student_id: student.id,
          school_id: student.school_id ?? ""
        }
      });
      customerId = customer.id;

      const { error: updateError } = await admin
        .from("students")
        .update({ stripe_customer_id: customerId })
        .eq("id", student.id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
      usage: "off_session",
      metadata: {
        student_id: student.id
      }
    });

    if (!setupIntent.client_secret) {
      return NextResponse.json({ error: "Failed to create setup intent" }, { status: 500 });
    }

    return NextResponse.json({
      clientSecret: setupIntent.client_secret,
      customerId
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to register card";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
