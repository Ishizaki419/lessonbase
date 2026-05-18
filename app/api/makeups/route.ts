/**
 * POST /api/makeups — 振替ブッキングを作成し、欠席レコードを更新する
 */
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  sendLinePush,
  buildMakeupConfirmedMessage
} from "@/lib/line";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    absenceId: string;
    bookingDate: string;
    startTime: string;
    endTime: string;
  };

  const { absenceId, bookingDate, startTime, endTime } = body;
  if (!absenceId || !bookingDate || !startTime || !endTime) {
    return NextResponse.json({ error: "absenceId / bookingDate / startTime / endTime are required" }, { status: 400 });
  }

  const { client: admin } = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  // 欠席情報を取得
  const { data: absence, error: absenceErr } = await admin
    .from("absences")
    .select("id, school_id, student_id, status, students(name, line_user_id)")
    .eq("id", absenceId)
    .maybeSingle();

  if (absenceErr || !absence) {
    return NextResponse.json({ error: "Absence not found" }, { status: 404 });
  }
  if (absence.status === "scheduled") {
    return NextResponse.json({ ok: false, error: "Already scheduled" }, { status: 409 });
  }

  // 振替ブッキングを作成
  const { data: booking, error: bookingErr } = await admin
    .from("bookings")
    .insert({
      school_id: absence.school_id,
      student_id: absence.student_id,
      booking_date: bookingDate,
      start_time: startTime,
      end_time: endTime,
      status: "確定",
      is_makeup: true,
      absence_id: absenceId,
      memo: "【振替】"
    })
    .select("id")
    .single();

  if (bookingErr || !booking) {
    return NextResponse.json({ error: bookingErr?.message ?? "Booking failed" }, { status: 500 });
  }

  // 欠席レコードを更新
  const { error: updateErr } = await admin
    .from("absences")
    .update({ status: "scheduled", makeup_booking_id: booking.id })
    .eq("id", absenceId);

  if (updateErr) {
    console.error("[makeups]", "update_absence", updateErr.message);
  }

  // LINE通知
  const student = absence.students as { name: string; line_user_id: string | null } | null;
  const { data: school } = await admin
    .from("schools")
    .select("name, owner_line_user_id")
    .eq("id", absence.school_id)
    .maybeSingle();

  const msg = buildMakeupConfirmedMessage(
    student?.name ?? "生徒",
    bookingDate,
    startTime,
    endTime,
    school?.name ?? "教室"
  );

  // 生徒へ通知
  if (student?.line_user_id) {
    await sendLinePush(student.line_user_id, [msg]);
  }
  // 先生へ通知
  if (school?.owner_line_user_id) {
    await sendLinePush(school.owner_line_user_id, [msg]);
  }

  return NextResponse.json({ ok: true, bookingId: booking.id });
}
