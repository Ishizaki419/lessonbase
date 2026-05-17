import { createHash } from "crypto";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  sendLinePush,
  buildChargeCompleteMessage,
  buildChargeSummaryMessage
} from "@/lib/line";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  checkSupabaseAdminEnv,
  createSupabaseAdminClient,
  probeSchoolsTable,
  supabaseAdminEnvErrorPayload,
  type SchoolsTableProbe
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
  line_user_id: string | null;
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
  supabaseAdmin?: {
    keyRole: string;
    supabaseUrlHost: string | null;
  };
  schoolsTableProbe?: SchoolsTableProbe;
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

async function notifyChargeComplete(
  student: StudentRow,
  totalAmount: number,
  items: { description: string; amount: number }[],
  schoolName: string
) {
  if (!student.line_user_id) return;
  const msg = buildChargeCompleteMessage(student.name, totalAmount, items, schoolName);
  const result = await sendLinePush(student.line_user_id, [msg]);
  if (!result.ok) {
    console.error("[charge-monthly]", "line_push_student", result.error, { studentId: student.id });
  }
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

  const { client: admin } = createSupabaseAdminClient();
  const schoolsTableProbe = admin ? await probeSchoolsTable(admin) : null;

  return routeJson(200, {
    ok: missing.length === 0 && supabaseEnv.keyRole === "service_role",
    message:
      missing.length === 0
        ? supabaseEnv.keyRole === "service_role"
          ? "環境変数は揃っています。POST で Cron 実行してください。"
          : "SUPABASE_SERVICE_ROLE_KEY が anon キーです。service_role に差し替えてください。"
        : "不足している環境変数があります。",
    missing,
    jst,
    billingDayFilterToday: jst.day,
    supabaseAdmin: {
      keyRole: supabaseEnv.keyRole,
      supabaseUrlHost: supabaseEnv.supabaseUrlHost
    },
    schoolsTableProbe,
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

  if (supabaseEnv.keyRole === "anon") {
    return routeJson(500, {
      error: "SUPABASE_SERVICE_ROLE_KEY に anon キーが設定されています。service_role キーに差し替えてください。",
      stage: "env_wrong_supabase_key",
      details: {
        keyRole: supabaseEnv.keyRole,
        supabaseUrlHost: supabaseEnv.supabaseUrlHost
      }
    });
  }

  const schoolsTableProbe = await probeSchoolsTable(admin);

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
    allSchoolsBillingDays: schoolsTableProbe.selectIdNameBillingDay.rows,
    supabaseAdmin: {
      keyRole: schoolsTableProbe.keyRole,
      supabaseUrlHost: schoolsTableProbe.supabaseUrlHost
    },
    schoolsTableProbe,
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
      debug.allSchoolsBillingDays = schoolsTableProbe.selectIdNameBillingDay.rows;

      const probeHint =
        schoolsTableProbe.selectStar.rowCount === 0
          ? "schools テーブルに行がありません（別プロジェクトの URL / キーの可能性）"
          : schoolsTableProbe.selectIdNameBillingDay.error
            ? `billing_day 列の取得に失敗: ${schoolsTableProbe.selectIdNameBillingDay.error.message}（マイグレーション未適用の可能性）`
            : "settings の引き落とし日と schools.billing_day が一致しているか確認してください";

      return routeJson(200, {
        ok: true,
        billingDay: day,
        chargedStudents: 0,
        failedStudents: 0,
        skipped: 0,
        message: `本日(JST ${jst.dateString})の引き落とし日(billing_day=${day})に一致する教室がありません`,
        hint: probeHint,
        debug,
        studentResults
      });
    }

    const schoolIds = schools.map((s) => s.id);

    const { data: studentsWithCard, error: studentsError } = await admin
      .from("students")
      .select("id, name, email, stripe_customer_id, school_id, line_user_id")
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

        const schoolName =
          schools.find((s) => s.id === studentRow.school_id)?.name ?? "教室";
        await notifyChargeComplete(
          studentRow,
          totalAmount,
          studentPayments.map((p) => ({ description: p.description ?? "月謝", amount: p.amount })),
          schoolName
        );

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

    // 教室オーナーへサマリー通知
    if (!dryRun && chargedStudents + failedStudents > 0) {
      const { data: schoolsWithOwnerLine } = await admin
        .from("schools")
        .select("id, name, owner_line_user_id")
        .in("id", schoolIds);

      for (const school of schoolsWithOwnerLine ?? []) {
        if (!school.owner_line_user_id) continue;
        const schoolCharged = studentResults.filter(
          (r) => r.schoolId === school.id && r.outcome === "charged"
        );
        const schoolFailed = studentResults.filter(
          (r) => r.schoolId === school.id && r.outcome === "failed"
        );
        const schoolTotal = schoolCharged.reduce((sum, r) => sum + r.totalAmount, 0);
        const msg = buildChargeSummaryMessage(
          school.name,
          year,
          month,
          schoolCharged.length,
          schoolFailed.length,
          schoolTotal
        );
        const result = await sendLinePush(school.owner_line_user_id, [msg]);
        if (!result.ok) {
          console.error("[charge-monthly]", "line_push_owner", result.error, {
            schoolId: school.id
          });
        }
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
