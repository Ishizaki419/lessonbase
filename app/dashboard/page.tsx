"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { useClientSupabase } from "@/lib/hooks/useClientSupabase";
import { useSchool } from "@/lib/hooks/useSchool";

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useClientSupabase();
  const { schoolId, loading: schoolLoading } = useSchool();
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [studentCount, setStudentCount] = useState(0);
  const [todayBookingCount, setTodayBookingCount] = useState(0);
  const [weekBookingCount, setWeekBookingCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noSchoolMessage, setNoSchoolMessage] = useState<string | null>(null);

  const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const getWeekRange = (baseDate: Date) => {
    const day = baseDate.getDay();
    const mondayDiff = day === 0 ? -6 : 1 - day;
    const start = new Date(baseDate);
    start.setDate(baseDate.getDate() + mondayDiff);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: formatDate(start), end: formatDate(end) };
  };

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let mounted = true;

    const fetchStats = async (sid: string | null) => {
      const today = formatDate(new Date());
      const thisWeek = getWeekRange(new Date());

      if (!sid) {
        setNoSchoolMessage("教室に所属していません。「設定」から教室を作成してください。");
        setStudentCount(0);
        setTodayBookingCount(0);
        setWeekBookingCount(0);
        return;
      }

      setNoSchoolMessage(null);

      const [{ count: studentsCount, error: studentsError }, { count: todayCount, error: todayError }, { count: weeklyCount, error: weeklyError }] =
        await Promise.all([
          supabase.from("students").select("id", { count: "exact", head: true }).eq("school_id", sid),
          supabase
            .from("bookings")
            .select("id", { count: "exact", head: true })
            .eq("school_id", sid)
            .eq("booking_date", today),
          supabase
            .from("bookings")
            .select("id", { count: "exact", head: true })
            .eq("school_id", sid)
            .gte("booking_date", thisWeek.start)
            .lte("booking_date", thisWeek.end)
        ]);

      if (studentsError || todayError || weeklyError) {
        setErrorMessage("ダッシュボード情報の取得に失敗しました。");
        return;
      }

      setStudentCount(studentsCount ?? 0);
      setTodayBookingCount(todayCount ?? 0);
      setWeekBookingCount(weeklyCount ?? 0);
    };

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      if (!data.session) {
        router.replace("/login");
        return;
      }

      if (schoolLoading) {
        return;
      }

      await fetchStats(schoolId ?? null);
      setIsLoading(false);
    };

    void checkSession();

    const { data: authListenerData } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!session) {
          router.replace("/login");
        }
      }
    );

    return () => {
      mounted = false;
      authListenerData.subscription.unsubscribe();
    };
  }, [router, supabase, schoolId, schoolLoading]);

  const today = useMemo(() => {
    return new Date().toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long"
    });
  }, []);

  const handleLogout = async () => {
    if (!supabase) {
      return;
    }
    setIsLoggingOut(true);
    try {
      await supabase.auth.signOut();
    } finally {
      router.replace("/login");
      setIsLoggingOut(false);
    }
  };

  if (!supabase || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-gray-600">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Header onLogout={handleLogout} isLoggingOut={isLoggingOut} />
      <main className="mx-auto max-w-5xl p-6">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-900">ダッシュボード</h1>
          <p className="mt-2 text-gray-700">今日の日付: {today}</p>
        </div>

        {errorMessage && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        {noSchoolMessage && (
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {noSchoolMessage}{" "}
            <Link href="/settings" className="font-medium text-blue-700 underline">
              設定へ
            </Link>
          </div>
        )}

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-500">👨‍🎓 登録生徒数</p>
            <p className="mt-3 text-4xl font-bold text-gray-900">{studentCount}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-500">📅 今日の予約</p>
            <p className="mt-3 text-4xl font-bold text-blue-700">{todayBookingCount}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-500">🗓️ 今週の予約</p>
            <p className="mt-3 text-4xl font-bold text-indigo-700">{weekBookingCount}</p>
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <Link
            href="/students"
            className="rounded-xl bg-[#1E3A5F] p-6 text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#17304D] hover:shadow-md"
          >
            <h2 className="text-xl font-semibold">生徒管理へ →</h2>
            <p className="mt-2 text-sm text-blue-100">生徒情報の登録・確認を行います。</p>
          </Link>
          <Link
            href="/bookings"
            className="rounded-xl bg-[#1E3A5F] p-6 text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#17304D] hover:shadow-md"
          >
            <h2 className="text-xl font-semibold">予約管理へ →</h2>
            <p className="mt-2 text-sm text-blue-100">予約の追加・確認を行います。</p>
          </Link>
        </section>
      </main>
    </div>
  );
}

