import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import Stripe from "stripe";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  checkSupabaseAdminEnv,
  createSupabaseAdminClient,
  supabaseAdminEnvErrorPayload
} from "@/lib/supabaseAdmin";

/** デプロイ済みコードの判別用（GET /api/charge-monthly で確認可能） */
const ROUTE_ID = "charge-monthly";
const API_VERSION = 2;

function routeJson(status: number, body: Record<string, unknown>) {
  return NextResponse.json({ route: ROUTE_ID, apiVersion: API_VERSION, ...body }, { status });
}

function collectEnvMissing(): string[] {
  const missing: string[] = [];
  if (!process.env.CRON_SECRET?.trim()) missing.push("CRON_SECRET");
  if (!process.env.STRIPE_SECRET_KEY?.trim()) missing.push("STRIPE_SECRET_KEY");
  missing.push(...checkSupabaseAdminEnv().missing);
  return [...new Set(missing)];
}

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
  school_id: string;
};

type StudentChargeResult = {
  studentId: string;
  studentName: string;
  stripeCustomerId: string;
  schoolId: string;
  paymentIds: string[];
  totalAmount: number;
  outcome: "charged" | "failed" | "skipped";
  reason?: string;
  stripeStatus?: string;
  paymentIntentId?: string;
};

type ChargeDebugInfo = {
  serverTimeUtc: string;
  jst: JstParts & { dateString: string };
  billingDayFilter: number;
  dryRun: boolean;
  schoolsMatched: { id: string; name: string; billing_day: number | null }[];
  allSchoolsBillingDays?: { id: string; name: string; billing_day: number | null }[];
  billableStudents: {
    id: string;
    school_id: string;
    stripe_customer_id: string;
    name: string;
  }[];
  pendingPaymentsFetched: number;
  studentGroups: { studentId: string; paymentCount: number; totalAmount: number; schoolIds: string[] }[];
  orphanPendingPayments?: {
    id: string;
    school_id: string | null;
    student_id: string | null;
    status: string | null;
    amount: number;
  }[];
};

function getJstParts(date = new Date()): JstParts & { dateString: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  const dateString = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  return { year, month, day, dateString };
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

async function markPaymentsFailed(admin: SupabaseClient<Database>, paymentIds: string[]) {
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
    return routeJson(500, {
      error: "CRON_SECRET is not configured",
      stage: "env_cron",
      missing: ["CRON_SECRET"],
      details: { CRON_SECRET_set: false }
    });
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    console.error("[charge-monthly]", "cron_auth", "Unauthorized cron request");
    return routeJson(401, {
      error: "Unauthorized",
      stage: "cron_auth",
      hint: "Authorization: Bearer <CRON_SECRET> ヘッダーが必要です"
    });
  }

  return null;
}

/** デプロイ確認・環境変数チェック（認証不要） */
export async function GET() {
  const supabaseEnv = checkSupabaseAdminEnv();
  const missing = collectEnvMissing();
  const jst = getJstParts();

  return routeJson(200, {
    ok: missing.length === 0,
    message:
      missing.length === 0
        ? "環境変数は揃っています。POST で Cron 実行してください。"
        : "不足している環境変数があります。",
    missing,
    jst,
    billingDayFilterToday: jst.day,
    details: {
      CRON_SECRET_set: !!process.env.CRON_SECRET?.trim(),
      STRIPE_SECRET_KEY_set: !!process.env.STRIPE_SECRET_KEY?.trim(),
      ...supabaseEnv.present
    },
    postHint:
      'curl -X POST "/api/charge-monthly?dryRun=1" -H "Authorization: Bearer $CRON_SECRET" でDB照合のみ実行可能'
  });
}

export async function POST(req: Request) {
  const authError = verifyCronAuth(req);
  if (authError) {
    return authError;
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1" || url.searchParams.get("dryRun") === "true";

  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!stripeKey && !dryRun) {
    console.error("[charge-monthly]", "env", "STRIPE_SECRET_KEY is not set");
    return routeJson(500, {
      error: "STRIPE_SECRET_KEY is not set",
      stage: "env_stripe",
      missing: ["STRIPE_SECRET_KEY"],
      details: { STRIPE_SECRET_KEY_set: false }
    });
  }

  const { client: admin, env: supabaseEnv } = createSupabaseAdminClient();
  if (!admin) {
    const payload = supabaseAdminEnvErrorPayload(supabaseEnv, ROUTE_ID);
    console.error("[charge-monthly]", "env", payload);
    return routeJson(500, payload);
  }

  const stripe = stripeKey ? new Stripe(stripeKey, { typescript: true }) : null;
  const jst = getJstParts();
  const { year, month, day } = jst;
  const serverTimeUtc = new Date().toISOString();

  const debug: ChargeDebugInfo = {
    serverTimeUtc,
    jst,
    billingDayFilter: day,
    dryRun,
    schoolsMatched: [],
    billableStudents: [],
    pendingPaymentsFetched: 0,
    studentGroups: []
  };

  const studentResults: StudentChargeResult[] = [];

  try {
    const { data: schools, error: schoolsError } = await admin
      .from("schools")
      .select("id, name, billing_day")
      .eq("billing_day", day);

    if (schoolsError) {
      console.error("[charge-monthly]", "fetch_schools", schoolsError.message);
      return routeJson(500, { error: schoolsError.message, stage: "fetch_schools", debug });
    }

    debug.schoolsMatched = (schools ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      billing_day: s.billing_day
    }));

    if (!schools?.length) {
      const { data: allSchools } = await admin.from("schools").select("id, name, billing_day");
      debug.allSchoolsBillingDays = (allSchools ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        billing_day: s.billing_day
      }));

      return routeJson(200, {
        ok: true,
        billingDay: day,
        chargedStudents: 0,
        failedStudents: 0,
        skipped: 0,
        message: `本日(JST ${jst.dateString})の引き落とし日(billing_day=${day})に一致する教室がありません`,
        hint: "settings の引き落とし日と schools.billing_day が一致しているか確認してください",
        debug,
        studentResults
      });
    }

    const schoolIds = schools.map((s) => s.id);

    const { data: studentsWithCard, error: studentsError } = await admin
      .from("students")
      .select("id, name, email, stripe_customer_id, school_id")
      .in("school_id", schoolIds)
      .not("stripe_customer_id", "is", null)
      .neq("stripe_customer_id", "");

    if (studentsError) {
      console.error("[charge-monthly]", "fetch_students", studentsError.message);
      return routeJson(500, { error: studentsError.message, stage: "fetch_students", debug });
    }

    const billableStudents = (studentsWithCard ?? []).filter((s): s is StudentRow => {
      const cid = s.stripe_customer_id?.trim();
      return !!cid && !!s.school_id;
    });

    debug.billableStudents = billableStudents.map((s) => ({
      id: s.id,
      school_id: s.school_id,
      stripe_customer_id: s.stripe_customer_id,
      name: s.name
    }));

    if (billableStudents.length === 0) {
      return routeJson(200, {
        ok: true,
        billingDay: day,
        chargedStudents: 0,
        failedStudents: 0,
        skipped: 0,
        message: "カード登録済みの生徒がいません（stripe_customer_id が空の行は除外）",
        debug,
        studentResults
      });
    }

    const billableStudentIds = billableStudents.map((s) => s.id);
    const studentById = new Map(billableStudents.map((s) => [s.id, s]));

    const { data: payments, error: paymentsError } = await admin
      .from("payments")
      .select("id, school_id, student_id, amount, description, currency, status")
      .in("school_id", schoolIds)
      .in("student_id", billableStudentIds)
      .in("status", ["pending", "unpaid"]);

    if (paymentsError) {
      console.error("[charge-monthly]", "fetch_payments", paymentsError.message);
      return routeJson(500, { error: paymentsError.message, stage: "fetch_payments", debug });
    }

    const paymentRows = (payments ?? []) as (PaymentRow & { status?: string })[];
    debug.pendingPaymentsFetched = paymentRows.length;

    const byStudent = new Map<string, PaymentRow[]>();
    for (const payment of paymentRows) {
      if (!payment.student_id) continue;
      const list = byStudent.get(payment.student_id) ?? [];
      list.push(payment);
      byStudent.set(payment.student_id, list);
    }

    debug.studentGroups = [...byStudent.entries()].map(([studentId, rows]) => ({
      studentId,
      paymentCount: rows.length,
      totalAmount: rows.reduce((sum, p) => sum + p.amount, 0),
      schoolIds: [...new Set(rows.map((p) => p.school_id).filter(Boolean))] as string[]
    }));

    if (byStudent.size === 0) {
      const { data: orphanPending } = await admin
        .from("payments")
        .select("id, school_id, student_id, status, amount")
        .in("school_id", schoolIds)
        .in("status", ["pending", "unpaid"]);

      return routeJson(200, {
        ok: true,
        billingDay: day,
        chargedStudents: 0,
        failedStudents: 0,
        skipped: 0,
        message:
          "未払い請求はありますが、カード登録済み生徒との紐付けがありません（payments.student_id が未設定、または別教室の生徒IDの可能性）",
        debug: {
          ...debug,
          orphanPendingPayments: orphanPending ?? []
        },
        studentResults
      });
    }

    let chargedStudents = 0;
    let failedStudents = 0;
    let skipped = 0;
    const now = new Date().toISOString();

    for (const [studentId, studentPayments] of byStudent) {
      const studentRow = studentById.get(studentId);
      if (!studentRow) {
        skipped++;
        studentResults.push({
          studentId,
          studentName: "?",
          stripeCustomerId: "",
          schoolId: studentPayments[0]?.school_id ?? "",
          paymentIds: studentPayments.map((p) => p.id),
          totalAmount: studentPayments.reduce((sum, p) => sum + p.amount, 0),
          outcome: "skipped",
          reason: "billableStudents に含まれない student_id"
        });
        continue;
      }

      const totalAmount = studentPayments.reduce((sum, p) => sum + p.amount, 0);
      if (totalAmount <= 0) {
        skipped++;
        studentResults.push({
          studentId,
          studentName: studentRow.name,
          stripeCustomerId: studentRow.stripe_customer_id,
          schoolId: studentRow.school_id,
          paymentIds: studentPayments.map((p) => p.id),
          totalAmount,
          outcome: "skipped",
          reason: "合計金額が0以下"
        });
        continue;
      }

      const paymentIds = studentPayments.map((p) => p.id);
      const idempotencyKey = buildIdempotencyKey(studentId, paymentIds);

      if (dryRun) {
        studentResults.push({
          studentId,
          studentName: studentRow.name,
          stripeCustomerId: studentRow.stripe_customer_id,
          schoolId: studentRow.school_id,
          paymentIds,
          totalAmount,
          outcome: "skipped",
          reason: "dryRun=true のため Stripe 課金はスキップ"
        });
        skipped++;
        continue;
      }

      if (!stripe) {
        failedStudents++;
        studentResults.push({
          studentId,
          studentName: studentRow.name,
          stripeCustomerId: studentRow.stripe_customer_id,
          schoolId: studentRow.school_id,
          paymentIds,
          totalAmount,
          outcome: "failed",
          reason: "Stripe クライアント未初期化"
        });
        continue;
      }

      let paymentMethodId: string | null = null;
      try {
        const customer = await stripe.customers.retrieve(studentRow.stripe_customer_id);
        if (customer.deleted) {
          console.error("[charge-monthly]", "stripe_customer", "Customer deleted", { studentId });
          await markPaymentsFailed(admin, paymentIds);
          failedStudents++;
          studentResults.push({
            studentId,
            studentName: studentRow.name,
            stripeCustomerId: studentRow.stripe_customer_id,
            schoolId: studentRow.school_id,
            paymentIds,
            totalAmount,
            outcome: "failed",
            reason: "Stripe Customer が削除済み"
          });
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
        studentResults.push({
          studentId,
          studentName: studentRow.name,
          stripeCustomerId: studentRow.stripe_customer_id,
          schoolId: studentRow.school_id,
          paymentIds,
          totalAmount,
          outcome: "failed",
          reason: `Stripe Customer 取得失敗: ${message}`
        });
        continue;
      }

      if (!paymentMethodId) {
        console.error("[charge-monthly]", "payment_method", "No default card", { studentId });
        await markPaymentsFailed(admin, paymentIds);
        failedStudents++;
        studentResults.push({
          studentId,
          studentName: studentRow.name,
          stripeCustomerId: studentRow.stripe_customer_id,
          schoolId: studentRow.school_id,
          paymentIds,
          totalAmount,
          outcome: "failed",
          reason: "登録済みカード（default_payment_method）がありません"
        });
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
          studentResults.push({
            studentId,
            studentName: studentRow.name,
            stripeCustomerId: studentRow.stripe_customer_id,
            schoolId: studentRow.school_id,
            paymentIds,
            totalAmount,
            outcome: "failed",
            reason: `PaymentIntent 未成功: ${paymentIntent.status}`,
            stripeStatus: paymentIntent.status,
            paymentIntentId: paymentIntent.id
          });
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
          return routeJson(500, {
            error: updateError.message,
            stage: "supabase_paid",
            warning: "Stripe charge succeeded but DB update failed; reconcile manually",
            paymentIntentId: paymentIntent.id,
            paymentIds,
            debug,
            studentResults
          });
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
        studentResults.push({
          studentId,
          studentName: studentRow.name,
          stripeCustomerId: studentRow.stripe_customer_id,
          schoolId: studentRow.school_id,
          paymentIds,
          totalAmount,
          outcome: "charged",
          stripeStatus: paymentIntent.status,
          paymentIntentId: paymentIntent.id
        });
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
        studentResults.push({
          studentId,
          studentName: studentRow.name,
          stripeCustomerId: studentRow.stripe_customer_id,
          schoolId: studentRow.school_id,
          paymentIds,
          totalAmount,
          outcome: "failed",
          reason: `Stripe 課金失敗: ${message}`,
          stripeStatus: stripeAny.code
        });
      }
    }

    return routeJson(200, {
      ok: true,
      billingDay: day,
      year,
      month,
      schoolsProcessed: schools.length,
      studentsWithCard: billableStudents.length,
      chargedStudents,
      failedStudents,
      skipped,
      debug,
      studentResults
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[charge-monthly]", "unexpected", message, err);
    return routeJson(500, { error: message, stage: "unexpected", debug });
  }
}
