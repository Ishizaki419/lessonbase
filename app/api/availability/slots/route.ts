/**
 * GET /api/availability/slots?schoolId=xxx&days=30
 * 振替可能な空き枠を計算して返す
 * 空き枠 = 週次稼働時間 − 休校日 − 既存予約
 */
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export type AvailableSlot = {
  date: string;       // "2026-05-20"
  startTime: string;  // "10:00"
  endTime: string;    // "11:00"
};

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const schoolId = searchParams.get("schoolId");
  const days = Math.min(Number(searchParams.get("days") ?? "30"), 60);

  if (!schoolId) return NextResponse.json({ error: "schoolId required" }, { status: 400 });

  const { client: admin } = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  // 今日から days 日間の日付範囲
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const toDate = new Date(today);
  toDate.setDate(toDate.getDate() + days);
  const fromStr = today.toISOString().slice(0, 10);
  const toStr = toDate.toISOString().slice(0, 10);

  // 週次稼働時間・休校日・既存予約を並列取得
  const [availRes, closedRes, bookingsRes] = await Promise.all([
    admin.from("teacher_availability").select("*").eq("school_id", schoolId),
    admin.from("school_closed_days").select("closed_date").eq("school_id", schoolId)
      .gte("closed_date", fromStr).lte("closed_date", toStr),
    admin.from("bookings").select("booking_date, start_time, end_time")
      .eq("school_id", schoolId)
      .gte("booking_date", fromStr).lte("booking_date", toStr)
      .eq("status", "確定")
  ]);

  const availability = availRes.data ?? [];
  const closedDates = new Set((closedRes.data ?? []).map((c) => c.closed_date));
  const bookedSlots = bookingsRes.data ?? [];

  const slots: AvailableSlot[] = [];

  for (let i = 1; i <= days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const dow = d.getDay(); // 0=日

    // 休校日はスキップ
    if (closedDates.has(dateStr)) continue;

    // この曜日の稼働設定を探す
    const avail = availability.find((a) => a.day_of_week === dow);
    if (!avail) continue;

    const duration = avail.lesson_duration_minutes;
    let slotStart = avail.start_time.slice(0, 5); // "HH:MM"
    const endBound = avail.end_time.slice(0, 5);

    // この日の既存予約を取得
    const dayBookings = bookedSlots.filter((b) => b.booking_date === dateStr);

    while (toMinutes(slotStart) + duration <= toMinutes(endBound)) {
      const slotEnd = addMinutes(slotStart, duration);

      // 既存予約と重複チェック
      const overlaps = dayBookings.some((b) => {
        const bs = toMinutes(b.start_time.slice(0, 5));
        const be = toMinutes(b.end_time.slice(0, 5));
        const ss = toMinutes(slotStart);
        const se = toMinutes(slotEnd);
        return ss < be && se > bs;
      });

      if (!overlaps) {
        slots.push({ date: dateStr, startTime: slotStart, endTime: slotEnd });
      }

      slotStart = slotEnd;
    }
  }

  return NextResponse.json({ ok: true, slots });
}
