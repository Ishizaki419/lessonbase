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
  stripe_customer_id: string | null;
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

export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!stripeKey || !url || !serviceKey) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const admin = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const stripe = new Stripe(stripeKey);
  const { day } = getJstParts();

  const { data: schools, error: schoolsError } = await admin
    .from("schools")
    .select("id, name, billing_day")
    .eq("billing_day", day);

  if (schoolsError) {
    return NextResponse.json({ error: schoolsError.message }, { status: 500 });
  }

  if (!schools?.length) {
    return NextResponse.json({ ok: true, billingDay: day, chargedStudents: 0, skipped: 0 });
  }

  const schoolIds = schools.map((s) => s.id);
  const { data: payments, error: paymentsError } = await admin
    .from("payments")
    .select("id, school_id, student_id, amount, description, currency")
    .in("school_id", schoolIds)
    .in("status", ["pending", "unpaid"]);

  if (paymentsError) {
    return NextResponse.json({ error: paymentsError.message }, { status: 500 });
  }

  const byStudent = new Map<string, PaymentRow[]>();
  for (const payment of (payments ?? []) as PaymentRow[]) {
    if (!payment.student_id) continue;
    const list = byStudent.get(payment.student_id) ?? [];
    list.push(payment);
    byStudent.set(payment.student_id, list);
  }

  let chargedStudents = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  for (const [studentId, studentPayments] of byStudent) {
    const { data: student, error: studentError } = await admin
      .from("students")
      .select("id, name, email, stripe_customer_id")
      .eq("id", studentId)
      .maybeSingle();

    if (studentError || !student) {
      skipped++;
      continue;
    }

    const studentRow = student as StudentRow;
    if (!studentRow.stripe_customer_id) {
      skipped++;
      continue;
    }

    const customer = await stripe.customers.retrieve(studentRow.stripe_customer_id);
    if (customer.deleted) {
      skipped++;
      continue;
    }

    let paymentMethodId =
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

    if (!paymentMethodId) {
      skipped++;
      continue;
    }

    const totalAmount = studentPayments.reduce((sum, p) => sum + p.amount, 0);
    if (totalAmount <= 0) {
      skipped++;
      continue;
    }

    const paymentIds = studentPayments.map((p) => p.id);

    try {
      const paymentIntent = await stripe.paymentIntents.create({
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
      });

      if (paymentIntent.status !== "succeeded") {
        skipped++;
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
        return NextResponse.json({ error: updateError.message }, { status: 500 });
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
        } catch {
          // Charge succeeded; email failure should not fail the cron run.
        }
      }

      chargedStudents++;
    } catch {
      skipped++;
    }
  }

  return NextResponse.json({
    ok: true,
    billingDay: day,
    schoolsProcessed: schools.length,
    chargedStudents,
    skipped
  });
}
