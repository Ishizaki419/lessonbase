import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import type { Database } from "@/lib/database.types";

type JstParts = {
  year: number;
  month: number;
  day: number;
};

function getJstParts(date = new Date()): JstParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const [year, month, day] = formatter.format(date).split("-").map(Number);
  return { year, month, day };
}

function jstMonthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01T00:00:00+09:00`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00+09:00`;
  const lastDay = new Date(year, month, 0).getDate();
  const dueDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end, dueDate };
}

export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const admin = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { year, month, day } = getJstParts();
  const { start: monthStart, end: monthEnd, dueDate } = jstMonthRange(year, month);

  const { data: settings, error: settingsError } = await admin
    .from("payment_settings")
    .select("id, school_id, student_id, amount, description")
    .eq("billing_type", "monthly")
    .eq("billing_day", day)
    .eq("is_active", true);

  if (settingsError) {
    return NextResponse.json({ error: settingsError.message }, { status: 500 });
  }

  let created = 0;
  let skipped = 0;

  for (const setting of settings ?? []) {
    if (!setting.school_id || !setting.student_id) {
      skipped++;
      continue;
    }

    const { count, error: countError } = await admin
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("school_id", setting.school_id)
      .eq("student_id", setting.student_id)
      .gte("created_at", monthStart)
      .lt("created_at", monthEnd);

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    if ((count ?? 0) > 0) {
      skipped++;
      continue;
    }

    const defaultDescription = `${year}年${month}月分月謝`;
    const { error: insertError } = await admin.from("payments").insert({
      school_id: setting.school_id,
      student_id: setting.student_id,
      amount: setting.amount,
      currency: "jpy",
      status: "pending",
      description: setting.description?.trim() || defaultDescription,
      due_date: dueDate
    });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    created++;
  }

  return NextResponse.json({
    ok: true,
    billingDay: day,
    year,
    month,
    created,
    skipped,
    processed: (settings ?? []).length
  });
}
