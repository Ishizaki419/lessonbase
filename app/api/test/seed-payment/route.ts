/**
 * テスト用: pending支払いデータを挿入する（CRON_SECRETで保護）
 * 本番運用では使用しないこと
 */
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { client: admin } = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const body = (await req.json().catch(() => ({}))) as {
    schoolId?: string;
    studentId?: string;
    amount?: number;
    description?: string;
  };

  const schoolId = body.schoolId ?? "0961eec9-ef24-4c62-82e9-5beb7d9675e6";
  const studentId = body.studentId ?? "a5d2590c-3b77-41a2-bc17-cbc5b911b6c8";
  const amount = body.amount ?? 10000;
  const description = body.description ?? "テスト月謝";

  const { data, error } = await admin
    .from("payments")
    .insert({ school_id: schoolId, student_id: studentId, amount, description, status: "pending", currency: "jpy" })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, paymentId: data.id, amount, description });
}
