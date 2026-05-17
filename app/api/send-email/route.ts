import { NextResponse } from "next/server";
import { sendLinePush, buildBookingConfirmMessage } from "@/lib/line";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const { studentId, studentName, bookingDate, startTime, endTime, schoolName } =
      (await req.json()) as {
        studentId?: string;
        studentName: string;
        bookingDate: string;
        startTime: string;
        endTime: string;
        schoolName?: string;
      };

    if (!studentName || !bookingDate || !startTime || !endTime) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const displaySchoolName = schoolName ?? "教室";
    const msg = buildBookingConfirmMessage(
      studentName,
      bookingDate,
      startTime,
      endTime,
      displaySchoolName
    );

    // LINE user ID を取得して通知
    if (studentId) {
      const { client: admin } = createSupabaseAdminClient();
      if (admin) {
        const { data } = await admin
          .from("students")
          .select("line_user_id")
          .eq("id", studentId)
          .maybeSingle();

        if (data?.line_user_id) {
          const result = await sendLinePush(data.line_user_id, [msg]);
          if (!result.ok) {
            console.error("[send-notification]", "line_push", result.error, { studentId });
            return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
          }
          return NextResponse.json({ ok: true, channel: "line" });
        }
      }
    }

    // LINE未連携の場合はスキップ（将来的にメール等を追加可能）
    return NextResponse.json({ ok: true, channel: "none", reason: "LINE not connected" });
  } catch (err) {
    console.error("[send-notification]", err);
    return NextResponse.json({ error: "Failed to send notification" }, { status: 500 });
  }
}
