"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Script from "next/script";

declare global {
  interface Window {
    liff: {
      init: (opts: { liffId: string }) => Promise<void>;
      isLoggedIn: () => boolean;
      login: () => void;
      getProfile: () => Promise<{ userId: string; displayName: string }>;
    };
  }
}

function AbsenceReportInner() {
  const searchParams = useSearchParams();

  const [step, setStep] = useState<"loading" | "form" | "done" | "error">("loading");
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>("");
  const [studentId, setStudentId] = useState<string | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [absenceDate, setAbsenceDate] = useState(() => {
    const t = new Date();
    return t.toISOString().slice(0, 10);
  });
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const liffId = process.env.NEXT_PUBLIC_LIFF_ID ?? "";

  useEffect(() => {
    // パラメータ解析（LIFF の liff.state を含む）
    const getParam = (key: string): string | null => {
      const sp = searchParams.get(key);
      if (sp) return sp;
      if (typeof window === "undefined") return null;
      const raw = window.location.search;
      const u = new URLSearchParams(raw);
      const v = u.get(key);
      if (v) return v;
      // liff.state
      const state = u.get("liff.state");
      if (state) {
        const decoded = decodeURIComponent(state);
        const stateU = new URLSearchParams(decoded.startsWith("?") ? decoded.slice(1) : decoded);
        return stateU.get(key);
      }
      return null;
    };

    setStudentId(getParam("studentId"));
    setSchoolId(getParam("schoolId"));

    const initLiff = async () => {
      if (!liffId) { setStep("error"); setErrorMsg("LIFF IDが設定されていません"); return; }
      try {
        await window.liff.init({ liffId });
        if (!window.liff.isLoggedIn()) { window.liff.login(); return; }
        const profile = await window.liff.getProfile();
        setLineUserId(profile.userId);
        setDisplayName(profile.displayName);
        setStep("form");
      } catch (err) {
        console.error(err);
        setStep("error");
        setErrorMsg("LINE初期化に失敗しました");
      }
    };

    if (typeof window !== "undefined" && window.liff) {
      void initLiff();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLiffReady = () => {
    const initLiff = async () => {
      if (!liffId) { setStep("error"); return; }
      try {
        await window.liff.init({ liffId });
        if (!window.liff.isLoggedIn()) { window.liff.login(); return; }
        const profile = await window.liff.getProfile();
        setLineUserId(profile.userId);
        setDisplayName(profile.displayName);
        setStep("form");
      } catch { setStep("error"); }
    };
    void initLiff();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(null);

    if (!studentId || !schoolId || !lineUserId) {
      setErrorMsg("必要な情報が取得できませんでした。URLを確認してください。");
      setIsSubmitting(false);
      return;
    }

    const res = await fetch("/api/absences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schoolId, studentId, absenceDate, reason })
    });
    const json = (await res.json()) as { ok?: boolean; absenceId?: string; error?: string; alreadyExists?: boolean };

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
        <Script src="https://static.line-scdn.net/liff/edge/2/sdk.js" onReady={handleLiffReady} />
        <p className="text-sm text-gray-500">LINE初期化中...</p>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-6">
        <Script src="https://static.line-scdn.net/liff/edge/2/sdk.js" />
        <div className="max-w-sm text-center">
          <p className="text-red-600 font-medium">エラーが発生しました</p>
          {errorMsg && <p className="mt-2 text-sm text-gray-600">{errorMsg}</p>}
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
          <p className="mt-2 text-sm text-gray-500">先生に通知が届きました。振替日はLINEでご連絡します。</p>
        </div>
      </div>
    );
  }

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
            <label className="mb-1 block text-sm font-medium text-gray-700">欠席する日 <span className="text-red-500">*</span></label>
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
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><p className="text-sm text-gray-500">読み込み中...</p></div>}>
      <AbsenceReportInner />
    </Suspense>
  );
}
