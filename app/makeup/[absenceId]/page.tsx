"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Script from "next/script";
import type { AvailableSlot } from "@/app/api/availability/slots/route";

declare global {
  interface Window {
    liff: {
      init: (opts: { liffId: string }) => Promise<void>;
      isLoggedIn: () => boolean;
      login: () => void;
      getProfile: () => Promise<{ userId: string; displayName: string }>;
      closeWindow: () => void;
    };
  }
}

const DAYS_JP = ["日", "月", "火", "水", "木", "金", "土"];

function groupByDate(slots: AvailableSlot[]): Record<string, AvailableSlot[]> {
  return slots.reduce<Record<string, AvailableSlot[]>>((acc, s) => {
    if (!acc[s.date]) acc[s.date] = [];
    acc[s.date].push(s);
    return acc;
  }, {});
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const dow = DAYS_JP[d.getDay()];
  return `${dateStr}（${dow}）`;
}

function MakeupInner() {
  const params = useParams<{ absenceId: string }>();
  const absenceId = params.absenceId;

  const [liffReady, setLiffReady] = useState(false);
  const [step, setStep] = useState<"loading" | "select" | "confirm" | "done" | "error">("loading");
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [selected, setSelected] = useState<AvailableSlot | null>(null);
  const [isBooking, setIsBooking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const liffId = process.env.NEXT_PUBLIC_LIFF_ID ?? "";

  const initLiff = async () => {
    if (!liffId) { setStep("error"); setErrorMsg("LIFF IDが設定されていません"); return; }
    try {
      await window.liff.init({ liffId });
      if (!window.liff.isLoggedIn()) { window.liff.login(); return; }
      await loadAbsenceAndSlots();
    } catch (err) {
      console.error(err);
      setStep("error");
      setErrorMsg("LINE初期化に失敗しました");
    }
  };

  const loadAbsenceAndSlots = async () => {
    if (!absenceId) { setStep("error"); setErrorMsg("欠席IDが指定されていません"); return; }

    let sid: string | null = null;

    // schoolId は URL パラメータから取得（振替URLに含める）
    if (typeof window !== "undefined") {
      const u = new URLSearchParams(window.location.search);
      sid = u.get("schoolId") ?? u.get("school_id");
      if (!sid) {
        const state = u.get("liff.state");
        if (state) {
          const decoded = decodeURIComponent(state);
          const stateU = new URLSearchParams(decoded.startsWith("?") ? decoded.slice(1) : decoded);
          sid = stateU.get("schoolId");
        }
      }
    }
    setSchoolId(sid);

    if (!sid) {
      setStep("error");
      setErrorMsg("教室情報が取得できませんでした。先生に振替URLを再発行してもらってください。");
      return;
    }

    const slotsRes = await fetch(`/api/availability/slots?schoolId=${sid}&days=30`);
    const slotsJson = (await slotsRes.json()) as { ok: boolean; slots: AvailableSlot[] };
    if (!slotsJson.ok) {
      setStep("error"); setErrorMsg("空き枠の取得に失敗しました"); return;
    }
    setSlots(slotsJson.slots);
    setStep("select");
  };

  useEffect(() => {
    if (liffReady) void initLiff();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liffReady]);

  const handleBook = async () => {
    if (!selected || !absenceId) return;
    setIsBooking(true);
    setErrorMsg(null);

    const res = await fetch("/api/makeups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        absenceId,
        bookingDate: selected.date,
        startTime: selected.startTime,
        endTime: selected.endTime
      })
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    setIsBooking(false);

    if (!json.ok) {
      setErrorMsg(json.error ?? "予約に失敗しました");
      return;
    }
    setStep("done");
  };

  if (step === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Script src="https://static.line-scdn.net/liff/edge/2/sdk.js" onReady={() => setLiffReady(true)} />
        <p className="text-sm text-gray-500">読み込み中...</p>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-6">
        <Script src="https://static.line-scdn.net/liff/edge/2/sdk.js" />
        <div className="max-w-sm text-center">
          <p className="text-red-600 font-medium">エラー</p>
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
          <div className="mb-4 text-5xl">🎉</div>
          <p className="text-xl font-semibold text-gray-800">振替が確定しました！</p>
          {selected && (
            <p className="mt-2 text-sm text-gray-600">
              {formatDate(selected.date)} {selected.startTime}〜{selected.endTime}
            </p>
          )}
          <p className="mt-3 text-sm text-gray-500">先生とあなたにLINEでお知らせしました。</p>
          <button type="button" onClick={() => window.liff?.closeWindow()}
            className="mt-6 rounded bg-[#1E3A5F] px-6 py-2 text-sm font-semibold text-white">
            閉じる
          </button>
        </div>
      </div>
    );
  }

  if (step === "confirm" && selected) {
    return (
      <div className="min-h-screen bg-white p-6">
        <Script src="https://static.line-scdn.net/liff/edge/2/sdk.js" />
        <div className="mx-auto max-w-sm">
          <h1 className="text-xl font-semibold text-gray-900">振替日の確認</h1>
          <div className="mt-6 rounded border border-gray-200 bg-gray-50 p-4">
            <p className="text-sm text-gray-500">選択した振替日時</p>
            <p className="mt-2 text-lg font-medium text-gray-900">{formatDate(selected.date)}</p>
            <p className="text-gray-700">{selected.startTime}〜{selected.endTime}</p>
          </div>
          {errorMsg && <p className="mt-3 text-sm text-red-600">{errorMsg}</p>}
          <div className="mt-6 flex gap-3">
            <button type="button" onClick={() => setStep("select")}
              className="flex-1 rounded border border-gray-300 py-3 text-sm font-medium text-gray-700">
              戻る
            </button>
            <button type="button" onClick={() => void handleBook()} disabled={isBooking}
              className="flex-1 rounded bg-[#1E3A5F] py-3 text-sm font-semibold text-white disabled:opacity-60">
              {isBooking ? "予約中..." : "確定する"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // step === "select"
  const grouped = groupByDate(slots);
  const dates = Object.keys(grouped).sort();

  return (
    <div className="min-h-screen bg-white p-6">
      <Script src="https://static.line-scdn.net/liff/edge/2/sdk.js" />
      <div className="mx-auto max-w-sm">
        <h1 className="text-xl font-semibold text-gray-900">振替日を選んでください</h1>
        <p className="mt-1 text-sm text-gray-500">空き枠の中から希望の日時を選んでください。</p>

        {dates.length === 0 && (
          <p className="mt-6 text-sm text-gray-500">現在、振替可能な空き枠がありません。先生にご確認ください。</p>
        )}

        <div className="mt-6 space-y-4">
          {dates.map((date) => (
            <div key={date}>
              <p className="mb-2 text-sm font-medium text-gray-700">{formatDate(date)}</p>
              <div className="flex flex-wrap gap-2">
                {grouped[date].map((slot) => (
                  <button
                    key={`${slot.date}-${slot.startTime}`}
                    type="button"
                    onClick={() => { setSelected(slot); setStep("confirm"); }}
                    className="rounded border border-[#1E3A5F] px-3 py-1.5 text-sm text-[#1E3A5F] hover:bg-blue-50"
                  >
                    {slot.startTime}〜{slot.endTime}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function MakeupPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><p className="text-sm text-gray-500">読み込み中...</p></div>}>
      <MakeupInner />
    </Suspense>
  );
}
