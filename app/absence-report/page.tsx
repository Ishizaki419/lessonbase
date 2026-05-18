"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Script from "next/script";


type Step = "loading" | "form" | "done" | "error" | "not_linked";

function AbsenceReportInner() {
  const [step, setStep] = useState<Step>("loading");
  const [displayName, setDisplayName] = useState("");
  const [studentId, setStudentId] = useState<string | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [absenceDate, setAbsenceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const initialized = useRef(false);

  const liffId = process.env.NEXT_PUBLIC_LIFF_ID ?? "";

  /** URL / liff.state から schoolId を取得 */
  const getSchoolId = (): string | null => {
    if (typeof window === "undefined") return null;
    const u = new URLSearchParams(window.location.search);
    let sid = u.get("schoolId");
    if (sid) return sid;
    const state = u.get("liff.state");
    if (state) {
      const decoded = decodeURIComponent(state);
      const su = new URLSearchParams(decoded.startsWith("?") ? decoded.slice(1) : decoded);
      sid = su.get("schoolId");
      if (sid) return sid;
      // /absence-report?schoolId=xxx の形式
      const pathPart = decoded.split("?")[1];
      if (pathPart) return new URLSearchParams(pathPart).get("schoolId");
    }
    return null;
  };

  const initLiff = async () => {
    if (initialized.current) return;
    initialized.current = true;

    if (!liffId) {
      setStep("error");
      setErrorMsg("LIFF IDが設定されていません。管理者にお問い合わせください。");
      return;
    }

    try {
      await window.liff.init({ liffId });

      if (!window.liff.isLoggedIn()) {
        window.liff.login();
        return;
      }

      const profile = await window.liff.getProfile();
      const sid = getSchoolId();

      if (!sid) {
        setStep("error");
        setErrorMsg("URLが正しくありません。先生から受け取ったリンクを開いてください。");
        return;
      }

      setSchoolId(sid);
      setDisplayName(profile.displayName);

      // LINE User ID から生徒を検索
      const res = await fetch(`/api/students/by-line?lineUserId=${profile.userId}&schoolId=${sid}`);
      const json = (await res.json()) as { ok: boolean; studentId?: string; name?: string; error?: string };

      if (!json.ok || !json.studentId) {
        setStep("not_linked");
        return;
      }

      setStudentId(json.studentId);
      setStep("form");
    } catch (err) {
      console.error("LIFF init error:", err);
      setStep("error");
      setErrorMsg("LINE初期化に失敗しました。もう一度お試しください。");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId || !schoolId) return;
    setIsSubmitting(true);
    setErrorMsg(null);

    const res = await fetch("/api/absences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schoolId, studentId, absenceDate, reason })
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    setIsSubmitting(false);

    if (!json.ok) {
      setErrorMsg(json.error ?? "送信に失敗しました");
      return;
    }
    setStep("done");
  };

  if (step === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Script
          src="https://static.line-scdn.net/liff/edge/2/sdk.js"
          onReady={() => { void initLiff(); }}
        />
        <p className="text-sm text-gray-500">LINE 初期化中...</p>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-6">
        <Script src="https://static.line-scdn.net/liff/edge/2/sdk.js" />
        <div className="max-w-sm text-center">
          <p className="text-2xl">⚠️</p>
          <p className="mt-2 font-semibold text-red-600">エラーが発生しました</p>
          <p className="mt-1 text-sm text-gray-600">{errorMsg}</p>
        </div>
      </div>
    );
  }

  if (step === "not_linked") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-6">
        <Script src="https://static.line-scdn.net/liff/edge/2/sdk.js" />
        <div className="max-w-sm text-center">
          <p className="text-2xl">🔗</p>
          <p className="mt-2 font-semibold text-gray-800">LINE連携が必要です</p>
          <p className="mt-1 text-sm text-gray-600">
            先生に「LINE連携」の設定をお願いしてください。
          </p>
        </div>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-6">
        <Script src="https://static.line-scdn.net/liff/edge/2/sdk.js" />
        <div className="max-w-sm text-center">
          <div className="mb-4 text-5xl">✅</div>
          <p className="text-xl font-semibold text-gray-800">欠席連絡を送信しました</p>
          <p className="mt-2 text-sm text-gray-500">先生に通知が届きました。振替日はご連絡します。</p>
          <button
            type="button"
            onClick={() => window.liff?.closeWindow()}
            className="mt-6 rounded bg-[#1E3A5F] px-6 py-2 text-sm font-semibold text-white hover:bg-[#17304D]"
          >
            閉じる
          </button>
        </div>
      </div>
    );
  }

  // step === "form"
  return (
    <div className="min-h-screen bg-white p-6">
      <Script src="https://static.line-scdn.net/liff/edge/2/sdk.js" />
      <div className="mx-auto max-w-sm">
        <h1 className="text-xl font-semibold text-gray-900">欠席連絡</h1>
        {displayName && (
          <p className="mt-1 text-sm text-gray-500">{displayName} さん</p>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              欠席する日 <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={absenceDate}
              onChange={(e) => setAbsenceDate(e.target.value)}
              required
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">欠席理由（任意）</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="体調不良・家庭の都合など"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded bg-[#1E3A5F] py-3 text-sm font-semibold text-white hover:bg-[#17304D] disabled:opacity-60"
          >
            {isSubmitting ? "送信中..." : "欠席を連絡する"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function AbsenceReportPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-gray-500">読み込み中...</p>
        </div>
      }
    >
      <AbsenceReportInner />
    </Suspense>
  );
}
