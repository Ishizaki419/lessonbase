"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { useClientSupabase } from "@/lib/hooks/useClientSupabase";
import { useSchool } from "@/lib/hooks/useSchool";

type AbsenceRow = {
  id: string;
  absence_date: string;
  reason: string | null;
  status: "pending" | "scheduled" | "cancelled";
  created_at: string;
  original_booking_id: string | null;
  makeup_booking_id: string | null;
  students: { id: string; name: string; line_user_id: string | null } | null;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "振替待ち",
  scheduled: "振替確定",
  cancelled: "キャンセル"
};

const STATUS_CLASS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  scheduled: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-600"
};

export default function AbsencesPage() {
  const router = useRouter();
  const supabase = useClientSupabase();
  const { schoolId, loading: schoolLoading } = useSchool();

  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [absences, setAbsences] = useState<AbsenceRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;

  const loadAbsences = useCallback(async (sid: string) => {
    setIsLoading(true);
    const res = await fetch(`/api/absences?schoolId=${sid}`);
    const json = (await res.json()) as { ok: boolean; absences: AbsenceRow[] };
    if (json.ok) setAbsences(json.absences);
    setIsLoading(false);
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
    void loadAbsences(schoolId);
  }, [schoolId, isCheckingAuth, schoolLoading, loadAbsences]);

  const handleLogout = async () => {
    if (!supabase) return;
    setIsLoggingOut(true);
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const handleCancel = async (absenceId: string) => {
    if (!confirm("この欠席をキャンセルしますか？")) return;
    setErrorMsg(null);
    const res = await fetch("/api/absences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ absenceId, status: "cancelled" })
    });
    const json = (await res.json()) as { ok?: boolean };
    if (json.ok) {
      setInfoMsg("キャンセルしました");
      if (schoolId) await loadAbsences(schoolId);
    }
  };

  const getMakeupUrl = (absenceId: string) => {
    if (liffId) return `https://liff.line.me/${liffId}/makeup/${absenceId}`;
    return `/makeup/${absenceId}`;
  };

  const pendingCount = absences.filter((a) => a.status === "pending").length;

  if (!supabase || isCheckingAuth || schoolLoading) {
    return <div className="flex min-h-screen items-center justify-center"><p className="text-sm text-gray-600">読み込み中...</p></div>;
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Header onLogout={handleLogout} isLoggingOut={isLoggingOut} />
      <main className="mx-auto max-w-5xl p-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-gray-900">欠席・振替管理</h1>
          {pendingCount > 0 && (
            <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-bold text-white">
              振替待ち {pendingCount}件
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-gray-600">生徒からの欠席連絡と振替状況を管理します。</p>

        {errorMsg && <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMsg}</div>}
        {infoMsg && <div className="mt-4 rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{infoMsg}</div>}

        <section className="mt-6">
          {isLoading ? (
            <p className="text-sm text-gray-500">読み込み中...</p>
          ) : absences.length === 0 ? (
            <div className="rounded border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
              欠席連絡はありません
            </div>
          ) : (
            <div className="overflow-x-auto rounded border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-[#1E3A5F]">
                  <tr>
                    <th className="px-3 py-2 text-left text-white">生徒</th>
                    <th className="px-3 py-2 text-left text-white">欠席日</th>
                    <th className="px-3 py-2 text-left text-white">理由</th>
                    <th className="px-3 py-2 text-left text-white">状態</th>
                    <th className="px-3 py-2 text-left text-white">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {absences.map((a) => (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">{a.students?.name ?? "-"}</td>
                      <td className="px-3 py-2">{a.absence_date}</td>
                      <td className="px-3 py-2 text-gray-500">{a.reason ?? "-"}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[a.status]}`}>
                          {STATUS_LABEL[a.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          {a.status === "pending" && (
                            <>
                              <a
                                href={getMakeupUrl(a.id)}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded border border-[#1E3A5F] px-2.5 py-1 text-xs text-[#1E3A5F] hover:bg-blue-50"
                              >
                                振替URLを開く
                              </a>
                              <button type="button" onClick={() => {
                                void navigator.clipboard.writeText(getMakeupUrl(a.id));
                                setInfoMsg("振替URLをコピーしました");
                              }}
                                className="rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50">
                                URLコピー
                              </button>
                              <button type="button" onClick={() => void handleCancel(a.id)}
                                className="rounded border border-gray-300 px-2.5 py-1 text-xs text-red-600 hover:bg-gray-50">
                                キャンセル
                              </button>
                            </>
                          )}
                          {a.status === "scheduled" && (
                            <span className="text-xs text-gray-400">振替確定済み</span>
                          )}
                        </div>
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
