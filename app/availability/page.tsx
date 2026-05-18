"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { useClientSupabase } from "@/lib/hooks/useClientSupabase";
import { useSchool } from "@/lib/hooks/useSchool";

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

type AvailRow = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  lesson_duration_minutes: number;
};

type ClosedDay = {
  id: string;
  closed_date: string;
  reason: string | null;
};

export default function AvailabilityPage() {
  const router = useRouter();
  const supabase = useClientSupabase();
  const { schoolId, loading: schoolLoading } = useSchool();

  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const [availability, setAvailability] = useState<AvailRow[]>([]);
  const [closedDays, setClosedDays] = useState<ClosedDay[]>([]);

  // フォーム
  const [editDow, setEditDow] = useState<number>(1);
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("20:00");
  const [duration, setDuration] = useState("60");
  const [isSavingAvail, setIsSavingAvail] = useState(false);

  const [closedDate, setClosedDate] = useState("");
  const [closedReason, setClosedReason] = useState("");
  const [isAddingClosed, setIsAddingClosed] = useState(false);

  const loadData = useCallback(async (sid: string) => {
    const res = await fetch(`/api/availability?schoolId=${sid}`);
    const json = (await res.json()) as { ok: boolean; availability: AvailRow[]; closedDays: ClosedDay[] };
    if (json.ok) {
      setAvailability(json.availability);
      setClosedDays(json.closedDays);
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (!data.session) { router.replace("/login"); return; }
      setIsCheckingAuth(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!s) router.replace("/login");
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [router, supabase]);

  useEffect(() => {
    if (!schoolId || isCheckingAuth || schoolLoading) return;
    void loadData(schoolId);
  }, [schoolId, isCheckingAuth, schoolLoading, loadData]);

  const handleLogout = async () => {
    if (!supabase) return;
    setIsLoggingOut(true);
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const handleSaveAvail = async (e: FormEvent) => {
    e.preventDefault();
    if (!schoolId) return;
    setIsSavingAvail(true);
    setErrorMsg(null);
    const res = await fetch("/api/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "upsert_availability",
        schoolId,
        dayOfWeek: editDow,
        startTime,
        endTime,
        lessonDurationMinutes: Number(duration)
      })
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    setIsSavingAvail(false);
    if (!json.ok) { setErrorMsg(json.error ?? "保存に失敗しました"); return; }
    setInfoMsg("稼働時間を保存しました");
    await loadData(schoolId);
  };

  const handleDeleteAvail = async (dow: number) => {
    if (!schoolId || !confirm(`${DAY_LABELS[dow]}曜日の設定を削除しますか？`)) return;
    await fetch("/api/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schoolId, dayOfWeek: dow })
    });
    await loadData(schoolId);
  };

  const handleAddClosed = async (e: FormEvent) => {
    e.preventDefault();
    if (!schoolId || !closedDate) return;
    setIsAddingClosed(true);
    const res = await fetch("/api/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_closed_day", schoolId, closedDate, reason: closedReason })
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    setIsAddingClosed(false);
    if (!json.ok) { setErrorMsg(json.error ?? "追加に失敗しました"); return; }
    setClosedDate("");
    setClosedReason("");
    setInfoMsg("休校日を追加しました");
    await loadData(schoolId);
  };

  const handleDeleteClosed = async (id: string) => {
    if (!schoolId) return;
    await fetch("/api/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_closed_day", schoolId, closedDayId: id })
    });
    await loadData(schoolId);
  };

  if (!supabase || isCheckingAuth || schoolLoading) {
    return <div className="flex min-h-screen items-center justify-center"><p className="text-sm text-gray-600">読み込み中...</p></div>;
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Header onLogout={handleLogout} isLoggingOut={isLoggingOut} />
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold text-gray-900">稼働時間・休校日設定</h1>
        <p className="mt-1 text-sm text-gray-600">振替可能な空き枠の計算に使用します。1回設定すれば自動で反映されます。</p>

        {errorMsg && <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMsg}</div>}
        {infoMsg && <div className="mt-4 rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{infoMsg}</div>}

        {/* 稼働時間設定 */}
        <section className="mt-8 rounded border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-gray-900">週次稼働時間</h2>
          <p className="mt-1 text-sm text-gray-500">曜日ごとにレッスン可能な時間帯を設定します。</p>

          {/* 既存設定一覧 */}
          {availability.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-[#1E3A5F]">
                  <tr>
                    <th className="px-3 py-2 text-left text-white">曜日</th>
                    <th className="px-3 py-2 text-left text-white">開始</th>
                    <th className="px-3 py-2 text-left text-white">終了</th>
                    <th className="px-3 py-2 text-left text-white">コマ（分）</th>
                    <th className="px-3 py-2 text-left text-white">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {availability.map((a) => (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">{DAY_LABELS[a.day_of_week]}曜日</td>
                      <td className="px-3 py-2">{a.start_time.slice(0, 5)}</td>
                      <td className="px-3 py-2">{a.end_time.slice(0, 5)}</td>
                      <td className="px-3 py-2">{a.lesson_duration_minutes}分</td>
                      <td className="px-3 py-2">
                        <button type="button" onClick={() => void handleDeleteAvail(a.day_of_week)}
                          className="rounded border border-gray-300 px-2.5 py-1 text-xs text-red-600 hover:bg-gray-50">
                          削除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 追加フォーム */}
          <form onSubmit={(e) => void handleSaveAvail(e)} className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">曜日</label>
              <select value={editDow} onChange={(e) => setEditDow(Number(e.target.value))}
                className="rounded border border-gray-300 px-2 py-2 text-sm">
                {DAY_LABELS.map((l, i) => <option key={i} value={i}>{l}曜日</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">開始時間</label>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
                className="rounded border border-gray-300 px-2 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">終了時間</label>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)}
                className="rounded border border-gray-300 px-2 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">コマ（分）</label>
              <select value={duration} onChange={(e) => setDuration(e.target.value)}
                className="rounded border border-gray-300 px-2 py-2 text-sm">
                {[30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m}分</option>)}
              </select>
            </div>
            <button type="submit" disabled={isSavingAvail}
              className="rounded bg-[#1E3A5F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#17304D] disabled:opacity-60">
              {isSavingAvail ? "保存中..." : "保存"}
            </button>
          </form>
        </section>

        {/* 休校日設定 */}
        <section className="mt-8 rounded border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-gray-900">休校日</h2>
          <p className="mt-1 text-sm text-gray-500">この日は振替枠として表示されません。</p>

          <form onSubmit={(e) => void handleAddClosed(e)} className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">日付</label>
              <input type="date" value={closedDate} onChange={(e) => setClosedDate(e.target.value)}
                className="rounded border border-gray-300 px-2 py-2 text-sm" required />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">理由（任意）</label>
              <input type="text" value={closedReason} onChange={(e) => setClosedReason(e.target.value)}
                placeholder="祝日・行事など"
                className="rounded border border-gray-300 px-2 py-2 text-sm" />
            </div>
            <button type="submit" disabled={isAddingClosed}
              className="rounded bg-[#1E3A5F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#17304D] disabled:opacity-60">
              {isAddingClosed ? "追加中..." : "追加"}
            </button>
          </form>

          {closedDays.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-[#1E3A5F]">
                  <tr>
                    <th className="px-3 py-2 text-left text-white">日付</th>
                    <th className="px-3 py-2 text-left text-white">理由</th>
                    <th className="px-3 py-2 text-left text-white">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {closedDays.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">{c.closed_date}</td>
                      <td className="px-3 py-2">{c.reason ?? "-"}</td>
                      <td className="px-3 py-2">
                        <button type="button" onClick={() => void handleDeleteClosed(c.id)}
                          className="rounded border border-gray-300 px-2.5 py-1 text-xs text-red-600 hover:bg-gray-50">
                          削除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
