"use client";

/**
 * 生徒の LINE 連携ページ（LIFF）
 * このページを LINE ブラウザで開くと、LIFF 認証後に LINE ユーザーIDが保存される。
 * URL例: https://liff.line.me/{LIFF_ID}?studentId=xxx
 */

import { useEffect, useState } from "react";
import Script from "next/script";
import { useParams } from "next/navigation";

type Status = "loading" | "ready" | "connecting" | "success" | "already" | "error";

declare global {
  interface Window {
    liff: {
      init: (opts: { liffId: string }) => Promise<void>;
      isLoggedIn: () => boolean;
      login: () => void;
      getProfile: () => Promise<{ userId: string; displayName: string }>;
      getIDToken: () => string | null;
      closeWindow: () => void;
    };
  }
}

export default function LineConnectPage() {
  const params = useParams();
  const studentId = typeof params.id === "string" ? params.id : "";

  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");
  const [liffReady, setLiffReady] = useState(false);

  useEffect(() => {
    if (!liffReady) return;

    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (!liffId) {
      setStatus("error");
      setMessage("LIFF IDが設定されていません。管理者に連絡してください。");
      return;
    }

    const init = async () => {
      try {
        await window.liff.init({ liffId });

        if (!window.liff.isLoggedIn()) {
          window.liff.login();
          return;
        }

        setStatus("ready");
      } catch (err) {
        console.error("[line-connect] liff.init error", err);
        setStatus("error");
        setMessage("LINE連携の初期化に失敗しました。LINEアプリから開き直してください。");
      }
    };

    void init();
  }, [liffReady]);

  const handleConnect = async () => {
    setStatus("connecting");
    setMessage("");

    try {
      const profile = await window.liff.getProfile();
      const idToken: string = window.liff.getIDToken() ?? "";
      const lineUserId: string = profile.userId;
      const liffId = process.env.NEXT_PUBLIC_LIFF_ID ?? "";

      const res = await fetch("/api/line/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "student", studentId, lineUserId, idToken, liffId })
      });

      const data = (await res.json()) as { ok?: boolean; error?: string; alreadyLinked?: boolean };

      if (data.alreadyLinked) {
        setStatus("already");
        setMessage("すでにLINE連携済みです。");
        return;
      }

      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "登録に失敗しました");
      }

      setStatus("success");
    } catch (err) {
      console.error("[line-connect] connect error", err);
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "エラーが発生しました。");
    }
  };

  return (
    <>
      <Script
        src="https://static.line-scdn.net/liff/edge/2/sdk.js"
        onLoad={() => setLiffReady(true)}
        strategy="afterInteractive"
      />

      <div className="flex min-h-screen flex-col items-center justify-center bg-[#06C755] px-6">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
          {/* LINE ロゴ風ヘッダー */}
          <div className="mb-6 flex flex-col items-center gap-2">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#06C755]">
              <svg viewBox="0 0 24 24" fill="white" className="h-10 w-10">
                <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-900">LINE連携</h1>
            <p className="text-center text-sm text-gray-500">
              LINEと連携すると引き落とし完了や予約確定の通知を受け取れます。
            </p>
          </div>

          {/* ステータス表示 */}
          {status === "loading" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#06C755] border-t-transparent" />
              <p className="text-sm text-gray-500">読み込み中...</p>
            </div>
          )}

          {status === "ready" && (
            <button
              type="button"
              onClick={() => void handleConnect()}
              className="w-full rounded-xl bg-[#06C755] py-3 text-base font-bold text-white hover:bg-[#05a849] active:scale-95"
            >
              LINEと連携する
            </button>
          )}

          {status === "connecting" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#06C755] border-t-transparent" />
              <p className="text-sm text-gray-500">連携中...</p>
            </div>
          )}

          {status === "success" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
                <svg className="h-8 w-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="font-semibold text-gray-900">連携が完了しました！</p>
              <p className="text-center text-sm text-gray-500">
                これからLINEで通知を受け取れます。
                <br />
                このページを閉じてください。
              </p>
            </div>
          )}

          {status === "already" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100">
                <svg className="h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="font-semibold text-gray-900">連携済みです</p>
              <p className="text-center text-sm text-gray-500">{message}</p>
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
                <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="font-semibold text-gray-900">エラーが発生しました</p>
              <p className="text-center text-sm text-gray-500">{message}</p>
              <button
                type="button"
                onClick={() => setStatus("ready")}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                やり直す
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
