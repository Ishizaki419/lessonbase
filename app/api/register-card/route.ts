import { NextResponse } from "next/server";
import Stripe from "stripe";

import { createSupabaseRouteClient } from "@/lib/supabaseRouteClient";

type RegisterCardBody = {
  student_id?: string;
};

type ErrorPayload = {
  error: string;
  stage: string;
  details?: Record<string, unknown>;
};

function logAndRespond(status: number, payload: ErrorPayload) {
  console.error("[register-card]", payload.stage, payload.error, payload.details ?? {});
  return NextResponse.json(payload, { status });
}

type StudentRow = {
  id: string;
  name: string;
  email: string | null;
  school_id: string;
  stripe_customer_id: string | null;
};

async function verifyStudentAccess(
  supabase: NonNullable<ReturnType<typeof createSupabaseRouteClient>>,
  token: string,
  studentId: string
): Promise<{ ok: true; student: StudentRow } | { ok: false; response: NextResponse }> {
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    return {
      ok: false,
      response: logAndRespond(401, {
        stage: "verify_auth",
        error: "Unauthorized",
        details: userError ? { message: userError.message, code: userError.code } : undefined
      })
    };
  }

  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id, name, email, school_id, stripe_customer_id")
    .eq("id", studentId)
    .maybeSingle();

  if (studentError) {
    return {
      ok: false,
      response: logAndRespond(500, {
        stage: "fetch_student",
        error: studentError.message || "Failed to load student",
        details: {
          code: studentError.code,
          hint: studentError.hint,
          details: studentError.details
        }
      })
    };
  }

  if (!student?.school_id) {
    return {
      ok: false,
      response: logAndRespond(404, {
        stage: "fetch_student",
        error: "Student not found",
        details: { studentId }
      })
    };
  }

  const { data: member, error: memberError } = await supabase
    .from("school_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("school_id", student.school_id)
    .maybeSingle();

  if (memberError) {
    return {
      ok: false,
      response: logAndRespond(500, {
        stage: "verify_membership",
        error: memberError.message || "Failed to verify school membership",
        details: {
          code: memberError.code,
          hint: memberError.hint,
          details: memberError.details
        }
      })
    };
  }

  if (!member) {
    return {
      ok: false,
      response: logAndRespond(403, {
        stage: "verify_membership",
        error: "Forbidden",
        details: { userId: user.id, schoolId: student.school_id }
      })
    };
  }

  return { ok: true, student: student as StudentRow };
}

export async function POST(req: Request) {
  try {
    const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
    if (!secretKey) {
      return logAndRespond(500, {
        stage: "env_stripe",
        error: "STRIPE_SECRET_KEY is not set"
      });
    }

    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return logAndRespond(401, {
        stage: "auth_header",
        error: "Missing Authorization Bearer token"
      });
    }

    let body: RegisterCardBody;
    try {
      body = await req.json();
    } catch (parseErr) {
      console.error("[register-card]", "parse_body", "Invalid JSON", parseErr);
      return NextResponse.json(
        {
          error: "Invalid JSON",
          stage: "parse_body",
          details: parseErr instanceof Error ? { message: parseErr.message } : undefined
        },
        { status: 400 }
      );
    }

    const studentId = body.student_id?.trim();
    if (!studentId) {
      return logAndRespond(400, {
        stage: "validate_body",
        error: "student_id is required"
      });
    }

    const supabaseUrlPresent = !!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const anonKeyPresent = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

    const supabase = createSupabaseRouteClient(token);
    if (!supabase) {
      return logAndRespond(500, {
        stage: "supabase_client",
        error:
          "Supabase の環境変数が不足しています。NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY を設定してください。",
        details: {
          NEXT_PUBLIC_SUPABASE_URL_set: supabaseUrlPresent,
          NEXT_PUBLIC_SUPABASE_ANON_KEY_set: anonKeyPresent
        }
      });
    }

    const access = await verifyStudentAccess(supabase, token, studentId);
    if (!access.ok) {
      return access.response;
    }

    const student = access.student;

    const stripe = new Stripe(secretKey, {
      typescript: true
    });

    let customerId = student.stripe_customer_id;

    if (!customerId) {
      try {
        const customer = await stripe.customers.create({
          email: student.email ?? undefined,
          name: student.name,
          metadata: {
            student_id: student.id,
            school_id: student.school_id ?? ""
          }
        });
        customerId = customer.id;
      } catch (stripeErr) {
        const message = stripeErr instanceof Error ? stripeErr.message : String(stripeErr);
        const stripeAny = stripeErr as { type?: string; code?: string; decline_code?: string };
        return logAndRespond(500, {
          stage: "stripe_customer_create",
          error: message,
          details: {
            stripeType: stripeAny.type,
            stripeCode: stripeAny.code,
            declineCode: stripeAny.decline_code
          }
        });
      }

      const { error: updateError } = await supabase
        .from("students")
        .update({ stripe_customer_id: customerId })
        .eq("id", student.id);

      if (updateError) {
        return logAndRespond(500, {
          stage: "supabase_update_stripe_customer_id",
          error: updateError.message,
          details: {
            code: updateError.code,
            hint: updateError.hint,
            details: updateError.details
          }
        });
      }
    }

    let setupIntent: Stripe.SetupIntent;
    try {
      setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ["card"],
        usage: "off_session",
        metadata: {
          student_id: student.id
        }
      });
    } catch (stripeErr) {
      const message = stripeErr instanceof Error ? stripeErr.message : String(stripeErr);
      const stripeAny = stripeErr as { type?: string; code?: string };
      return logAndRespond(500, {
        stage: "stripe_setup_intent",
        error: message,
        details: {
          stripeType: stripeAny.type,
          stripeCode: stripeAny.code,
          customerId
        }
      });
    }

    if (!setupIntent.client_secret) {
      return logAndRespond(500, {
        stage: "stripe_setup_intent",
        error: "SetupIntent has no client_secret",
        details: { setupIntentId: setupIntent.id }
      });
    }

    return NextResponse.json({
      clientSecret: setupIntent.client_secret,
      customerId
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[register-card]", "unexpected", message, err);
    return NextResponse.json(
      {
        error: message || "Unexpected error",
        stage: "unexpected",
        details: err instanceof Error ? { name: err.name, stack: err.stack } : undefined
      },
      { status: 500 }
    );
  }
}
