/**
 * GET  /api/availability?schoolId=xxx  — 週次稼働時間と休校日を取得
 * POST /api/availability               — 週次稼働時間をupsert
 * DELETE /api/availability?id=xxx      — 曜日設定を削除
 */
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const schoolId = searchParams.get("schoolId");
  if (!schoolId) return NextResponse.json({ error: "schoolId required" }, { status: 400 });

  const { client: admin } = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const [availRes, closedRes] = await Promise.all([
    admin
      .from("teacher_availability")
      .select("*")
      .eq("school_id", schoolId)
      .order("day_of_week"),
    admin
      .from("school_closed_days")
      .select("*")
      .eq("school_id", schoolId)
      .order("closed_date", { ascending: false })
  ]);

  return NextResponse.json({
    ok: true,
    availability: availRes.data ?? [],
    closedDays: closedRes.data ?? []
  });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    schoolId: string;
    action: "upsert_availability" | "add_closed_day" | "delete_closed_day";
    dayOfWeek?: number;
    startTime?: string;
    endTime?: string;
    lessonDurationMinutes?: number;
    closedDate?: string;
    reason?: string;
    closedDayId?: string;
  };

  const { client: admin } = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  if (body.action === "upsert_availability") {
    const { schoolId, dayOfWeek, startTime, endTime, lessonDurationMinutes } = body;
    if (!schoolId || dayOfWeek === undefined || !startTime || !endTime) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const { error } = await admin
      .from("teacher_availability")
      .upsert(
        {
          school_id: schoolId,
          day_of_week: dayOfWeek,
          start_time: startTime,
          end_time: endTime,
          lesson_duration_minutes: lessonDurationMinutes ?? 60
        },
        { onConflict: "school_id,day_of_week" }
      );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "add_closed_day") {
    const { schoolId, closedDate, reason } = body;
    if (!schoolId || !closedDate) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const { error } = await admin
      .from("school_closed_days")
      .upsert({ school_id: schoolId, closed_date: closedDate, reason: reason ?? null },
               { onConflict: "school_id,closed_date" });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "delete_closed_day") {
    if (!body.closedDayId) return NextResponse.json({ error: "closedDayId required" }, { status: 400 });
    const { error } = await admin.from("school_closed_days").delete().eq("id", body.closedDayId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === undefined && body.dayOfWeek !== undefined) {
    // 稼働時間削除
    const { error } = await admin
      .from("teacher_availability")
      .delete()
      .eq("school_id", body.schoolId)
      .eq("day_of_week", body.dayOfWeek);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
