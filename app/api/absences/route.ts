import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { sendLinePush, buildAbsenceNotifyMessage } from "@/lib/line";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const schoolId = searchParams.get("schoolId");
  if (!schoolId) return NextResponse.json({ error: "schoolId required" }, { status: 400 });

  const { client: admin } = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { data, error } = await admin
    .from("absences")
    .select(`
      id, school_id, absence_date, reason, status, created_at,
      original_booking_id, makeup_booking_id,
      students ( id, name, line_user_id )
    `)
    .eq("school_id", schoolId)
    .order("absence_date", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, absences: data ?? [] });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    schoolId: string;
    studentId: string;
    absenceDate: string;
    reason?: string;
    originalBookingId?: string;
  };

  const { schoolId, studentId, absenceDate, reason, originalBookingId } = body;
  if (!schoolId || !studentId || !absenceDate) {
    return NextResponse.json({ error: "schoolId / studentId / absenceDate are required" }, { status: 400 });
  }

  const { client: admin } = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  // 重複チェック
  const { data: existing } = await admin
    .from("absences")
    .select("id")
    .eq("school_id", schoolId)
    .eq("student_id", studentId)
    .eq("absence_date", absenceDate)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true, absenceId: existing.id, alreadyExists: true });
  }

  const { data: absence, error } = await admin
    .from("absences")
    .insert({
      school_id: schoolId,
      student_id: studentId,
      absence_date: absenceDate,
      reason: reason ?? null,
      original_booking_id: originalBookingId ?? null,
      status: "pending"
    })
    .select("id")
    .single();

  if (error || !absence) {
    return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
  }

  // 生徒情報を取得（LINE通知用）
  const { data: student } = await admin
    .from("students")
    .select("name")
    .eq("id", studentId)
    .maybeSingle();

  // 学校オーナーのLINE IDを取得して通知
  const { data: school } = await admin
    .from("schools")
    .select("name, owner_line_user_id")
    .eq("id", schoolId)
    .maybeSingle();

  if (school?.owner_line_user_id && student?.name) {
    const msg = buildAbsenceNotifyMessage(
      student.name,
      absenceDate,
      reason ?? "",
      absence.id,
      school.name,
      schoolId
    );
    await sendLinePush(school.owner_line_user_id, [msg]);
  }

  return NextResponse.json({ ok: true, absenceId: absence.id });
}

export async function PATCH(req: Request) {
  const body = (await req.json()) as { absenceId: string; status: "cancelled" };
  const { absenceId, status } = body;
  if (!absenceId) return NextResponse.json({ error: "absenceId required" }, { status: 400 });

  const { client: admin } = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { error } = await admin
    .from("absences")
    .update({ status })
    .eq("id", absenceId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
