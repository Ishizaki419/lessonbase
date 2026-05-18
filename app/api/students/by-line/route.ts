/**
 * GET /api/students/by-line?lineUserId=xxx&schoolId=xxx
 * LINE User ID から生徒情報を取得する（欠席連絡LIFF用）
 */
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lineUserId = searchParams.get("lineUserId");
  const schoolId = searchParams.get("schoolId");

  if (!lineUserId || !schoolId) {
    return NextResponse.json({ ok: false, error: "lineUserId and schoolId are required" }, { status: 400 });
  }

  const { client: admin } = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });

  const { data, error } = await admin
    .from("students")
    .select("id, name")
    .eq("line_user_id", lineUserId)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "not_linked" }, { status: 404 });

  return NextResponse.json({ ok: true, studentId: data.id, name: data.name });
}
