import { NextResponse } from "next/server";
import { verifyLiffIdToken } from "@/lib/line";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

type CallbackBody = {
  type: "student" | "school";
  studentId?: string;
  schoolId?: string;
  lineUserId: string;
  idToken: string;
  liffId: string;
};

export async function POST(req: Request) {
  let body: CallbackBody;
  try {
    body = (await req.json()) as CallbackBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, studentId, schoolId, lineUserId, idToken, liffId } = body;

  if (!lineUserId || !idToken || !liffId) {
    return NextResponse.json({ error: "lineUserId / idToken / liffId are required" }, { status: 400 });
  }

  // LIFF IDトークンをLINEサーバーで検証
  const verified = await verifyLiffIdToken(idToken, liffId);
  if (!verified.ok) {
    return NextResponse.json({ error: `Token verification failed: ${verified.error}` }, { status: 401 });
  }

  if (verified.lineUserId !== lineUserId) {
    return NextResponse.json({ error: "lineUserId mismatch" }, { status: 401 });
  }

  const { client: admin } = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  if (type === "student") {
    if (!studentId) {
      return NextResponse.json({ error: "studentId is required for type=student" }, { status: 400 });
    }

    // 既存の連携確認（別生徒が同じLINEアカウントで登録しようとしている場合）
    const { data: existing } = await admin
      .from("students")
      .select("id")
      .eq("line_user_id", lineUserId)
      .maybeSingle();

    if (existing && existing.id !== studentId) {
      return NextResponse.json(
        { ok: false, error: "この LINE アカウントは既に別の生徒と連携されています" },
        { status: 409 }
      );
    }

    if (existing && existing.id === studentId) {
      return NextResponse.json({ ok: true, alreadyLinked: true });
    }

    const { error } = await admin
      .from("students")
      .update({ line_user_id: lineUserId })
      .eq("id", studentId);

    if (error) {
      console.error("[line/callback]", "update_student", error.message, { studentId });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  if (type === "school") {
    if (!schoolId) {
      return NextResponse.json({ error: "schoolId is required for type=school" }, { status: 400 });
    }

    const { error } = await admin
      .from("schools")
      .update({ owner_line_user_id: lineUserId })
      .eq("id", schoolId);

    if (error) {
      console.error("[line/callback]", "update_school", error.message, { schoolId });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 });
}
