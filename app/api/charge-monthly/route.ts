import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import Stripe from "stripe";

import type { Database } from "@/lib/database.types";

type JstParts = {
  year: number;
  month: number;
  day: number;
};

type PaymentRow = {
  id: string;
  school_id: string | null;
  student_id: string | null;
  amount: number;
  description: string | null;
  currency: string;
};

type StudentRow = {
  id: string;
  name: string;
  email: string | null;
  stripe_customer_id: string;
};

function getJstParts(date = new Date()): JstParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const [year, month, day] = formatter.format(date).split("-").map(Number);
  return { year, month, day };
}

function formatYen(amount: number) {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

/** Stripe idempotency keys are max 255 chars; hash payment ids for stable retries. */
function buildIdempotencyKey(studentId: string, paymentIds: string[]) {
  const sorted = [...paymentIds].sort();
  const hash = createHash("sha256").update(sorted.join(",")).digest("hex").slice(0, 32);
  return `charge-${studentId}-${hash}`;
}

async function markPaymentsFailed(
  admin: ReturnType<typeof createClient<Database>>,
  paymentIds: string[]
) {
  if (paymentIds.length === 0) return;
  const { error } = await admin.from("payments").update({ status: "failed" }).in("id", paymentIds);
  if (error) {
    console.error("[charge-monthly]", "mark_failed", error.message, { paymentIds });
  }
}

async function sendChargeEmail(
  to: string,
  studentName: string,
  totalAmount: number,
  items: { description: string; amount: number }[]
) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return;
  }

  const resend = new Resend(apiKey);
  const lines = items
    .map((item) => `<li>${item.description || "請求"} — ${formatYen(item.amount)}</li>`)
    .join("");

  await resend.emails.send({
    from: "onboarding@resend.dev",
    to,
    subject: `【LessonBase】${formatYen(totalAmount)}の引き落としが完了しました`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <p>${studentName} 様</p>
        <p>LessonBaseより、引き落とし完了のお知らせです。</p>
        <p><strong>合計金額: ${formatYen(totalAmount)}</strong></p>
        <h3>請求明細</h3>
        <ul>${lines}</ul>
        <p>ご不明な点があれば教室までお問い合わせください。</p>
      </div>
    `
  });
}

function verifyCronAuth(req: Request): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    console.error("[charge-monthly]", "cron_auth", "CRON_SECRET is not set");
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    console.error("[charge-monthly]", "cron_auth", "Unauthorized cron request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

export async function POST(req: Request) {
  const authError = verifyCronAuth(req);
  if (authError) {
    return authError;
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!stripeKey || !url || !serviceKey) {
    console.error("[charge-monthly]", "env", "Missing STRIPE_SECRET_KEY, Supabase URL, or SERVICE_ROLE_KEY");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const admin = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const stripe = new Stripe(stripeKey, { typescript: true });
  const { year, month, day } = getJstParts();

  try {
    const { data: schools, error: schoolsError } = await admin
      .from("schools")
      .select("id, name, billing_day")
      .eq("billing_day", day);

    if (schoolsError) {
      console.error("[charge-monthly]", "fetch_schools", schoolsError.message);
      return NextResponse.json({ error: schoolsError.message, stage: "fetch_schools" }, { status: 500 });
    }

    if (!schools?.length) {
      return NextResponse.json({
        ok: true,
        billingDay: day,
        chargedStudents: 0,
        failedStudents: 0,
        skipped: 0
      });
    }

    const schoolIds = schools.map((s) => s.id);

    const { data: studentsWithCard, error: studentsError } = await admin
      .from("students")
      .select("id, name, email, stripe_customer_id, school_id")
      .in("school_id", schoolIds)
      .not("stripe_customer_id", "is", null);

    if (studentsError) {
      console.error("[charge-monthly]", "fetch_students", studentsError.message);
      return NextResponse.json({ error: studentsError.message, stage: "fetch_students" }, { status: 500 });
    }

    const billableStudents = (studentsWithCard ?? []).filter(
      (s): s is StudentRow & { school_id: string } =>
        !!s.stripe_customer_id && !!s.school_id
    );

    if (billableStudents.length === 0) {
      return NextResponse.json({
        ok: true,
        billingDay: day,
        chargedStudents: 0,
        failedStudents: 0,
        skipped: 0,
        message: "No students with registered cards"
      });
    }

    const billableStudentIds = billableStudents.map((s) => s.id);
    const studentById = new Map(billableStudents.map((s) => [s.id, s]));

    const { data: payments, error: paymentsError } = await admin
      .from("payments")
      .select("id, school_id, student_id, amount, description, currency")
      .in("school_id", schoolIds)
      .in("student_id", billableStudentIds)
      .in("status", ["pending", "unpaid"]);

    if (paymentsError) {
      console.error("[charge-monthly]", "fetch_payments", paymentsError.message);
      return NextResponse.json({ error: paymentsError.message, stage: "fetch_payments" }, { status: 500 });
    }

    const byStudent = new Map<string, PaymentRow[]>();
    for (const payment of (payments ?? []) as PaymentRow[]) {
      if (!payment.student_id) continue;
      const list = byStudent.get(payment.student_id) ?? [];
      list.push(payment);
      byStudent.set(payment.student_id, list);
    }

    let chargedStudents = 0;
    let failedStudents = 0;
    let skipped = 0;
    const now = new Date().toISOString();

    for (const [studentId, studentPayments] of byStudent) {
      const studentRow = studentById.get(studentId);
      if (!studentRow) {
        skipped++;
        continue;
      }

      const totalAmount = studentPayments.reduce((sum, p) => sum + p.amount, 0);
      if (totalAmount <= 0) {
        skipped++;
        continue;
      }

      const paymentIds = studentPayments.map((p) => p.id);
      const idempotencyKey = buildIdempotencyKey(studentId, paymentIds);

      let paymentMethodId: string | null = null;
      try {
        const customer = await stripe.customers.retrieve(studentRow.stripe_customer_id);
        if (customer.deleted) {
          console.error("[charge-monthly]", "stripe_customer", "Customer deleted", { studentId });
          await markPaymentsFailed(admin, paymentIds);
          failedStudents++;
          continue;
        }

        paymentMethodId =
          typeof customer.invoice_settings?.default_payment_method === "string"
            ? customer.invoice_settings.default_payment_method
            : customer.invoice_settings?.default_payment_method?.id ?? null;

        if (!paymentMethodId) {
          const methods = await stripe.paymentMethods.list({
            customer: studentRow.stripe_customer_id,
            type: "card",
            limit: 1
          });
          paymentMethodId = methods.data[0]?.id ?? null;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[charge-monthly]", "stripe_customer", message, { studentId });
        await markPaymentsFailed(admin, paymentIds);
        failedStudents++;
        continue;
      }

      if (!paymentMethodId) {
        console.error("[charge-monthly]", "payment_method", "No default card", { studentId });
        await markPaymentsFailed(admin, paymentIds);
        failedStudents++;
        continue;
      }

      try {
        const paymentIntent = await stripe.paymentIntents.create(
          {
            amount: totalAmount,
            currency: "jpy",
            customer: studentRow.stripe_customer_id,
            payment_method: paymentMethodId,
            off_session: true,
            confirm: true,
            description: `LessonBase 月謝引き落とし（${studentPayments.length}件）`,
            metadata: {
              student_id: studentId,
              payment_ids: paymentIds.join(",")
            }
          },
          { idempotencyKey }
        );

        if (paymentIntent.status !== "succeeded") {
          console.error("[charge-monthly]", "stripe_charge", "Non-succeeded status", {
            studentId,
            status: paymentIntent.status,
            paymentIntentId: paymentIntent.id
          });
          await markPaymentsFailed(admin, paymentIds);
          failedStudents++;
          continue;
        }

        const { error: updateError } = await admin
          .from("payments")
          .update({
            status: "paid",
            paid_at: now,
            charged_at: now,
            stripe_payment_intent_id: paymentIntent.id
          })
          .in("id", paymentIds);

        if (updateError) {
          console.error("[charge-monthly]", "supabase_paid", updateError.message, { paymentIds });
          return NextResponse.json(
            {
              error: updateError.message,
              stage: "supabase_paid",
              warning: "Stripe charge succeeded but DB update failed; reconcile manually",
              paymentIntentId: paymentIntent.id,
              paymentIds
            },
            { status: 500 }
          );
        }

        if (studentRow.email) {
          try {
            await sendChargeEmail(
              studentRow.email,
              studentRow.name,
              totalAmount,
              studentPayments.map((p) => ({
                description: p.description ?? "請求",
                amount: p.amount
              }))
            );
          } catch (emailErr) {
            console.error(
              "[charge-monthly]",
              "send_email",
              emailErr instanceof Error ? emailErr.message : emailErr,
              { studentId }
            );
          }
        }

        chargedStudents++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const stripeAny = err as { type?: string; code?: string; decline_code?: string };
        console.error("[charge-monthly]", "stripe_charge", message, {
          studentId,
          stripeType: stripeAny.type,
          stripeCode: stripeAny.code,
          declineCode: stripeAny.decline_code,
          idempotencyKey
        });
        await markPaymentsFailed(admin, paymentIds);
        failedStudents++;
      }
    }

    return NextResponse.json({
      ok: true,
      billingDay: day,
      year,
      month,
      schoolsProcessed: schools.length,
      studentsWithCard: billableStudents.length,
      chargedStudents,
      failedStudents,
      skipped
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[charge-monthly]", "unexpected", message, err);
    return NextResponse.json({ error: message, stage: "unexpected" }, { status: 500 });
  }
}
