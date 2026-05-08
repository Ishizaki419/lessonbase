import { NextResponse } from "next/server";
import { Resend } from "resend";

export async function POST(req: Request) {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "RESEND_API_KEY is not set" }, { status: 500 });
    }

    const { to, studentName, bookingDate, startTime, endTime, status } = await req.json();

    if (!to || !studentName || !bookingDate || !startTime || !endTime || !status) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const resend = new Resend(apiKey);

    const { error } = await resend.emails.send({
      from: "onboarding@resend.dev",
      to,
      subject: "【LessonBase】予約が確定しました",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>予約内容のお知らせ</h2>
          <p>生徒名: ${studentName}</p>
          <p>レッスン日付: ${bookingDate}</p>
          <p>時間: ${startTime} 〜 ${endTime}</p>
          <p>ステータス: ${status}</p>
        </div>
      `
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}
