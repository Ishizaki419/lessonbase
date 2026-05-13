import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import Stripe from "stripe";

import type { Database } from "@/lib/database.types";

type CompleteCardSetupBody = {
  student_id?: string;
  payment_method_id?: string;
};

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

  let body: CompleteCardSetupBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const studentId = body.student_id?.trim();
  const paymentMethodId = body.payment_method_id?.trim();
  if (!studentId || !paymentMethodId) {
    return NextResponse.json({ error: "student_id and payment_method_id are required" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const admin = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const {
    data: { user },
    error: userError
  } = await admin.auth.getUser(token);

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: student, error: studentError } = await admin
    .from("students")
    .select("id, school_id, stripe_customer_id")
    .eq("id", studentId)
    .maybeSingle();

  if (studentError || !student?.school_id || !student.stripe_customer_id) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  const { data: member } = await admin
    .from("school_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("school_id", student.school_id)
    .maybeSingle();

  if (!member) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const stripe = new Stripe(secretKey);
    await stripe.customers.update(student.stripe_customer_id, {
      invoice_settings: {
        default_payment_method: paymentMethodId
      }
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to complete card setup";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
