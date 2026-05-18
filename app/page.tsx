"use client";

import { useRef } from "react";
import Script from "next/script";
import Link from "next/link";

/**
 * ルートページ
 * LIFF URL でパスが指定された場合（liff.state に /absence-report 等が含まれる場合）、
 * liff.init() を呼ぶことで LIFF SDK が自動的に正しいページへリダイレクトする。
 */
export default function Home() {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID ?? "";
  const initialized = useRef(false);

  const handleLiffReady = () => {
    if (!liffId || initialized.current) return;
    initialized.current = true;
    // liff.init() が liff.state のパスを処理して自動リダイレクトする
    void window.liff.init({ liffId }).catch(() => {
      // LIFF 未使用のブラウザからの通常アクセスはエラーになるが無視する
    });
  };

  return (
    <>
      {liffId && (
        <Script
          src="https://static.line-scdn.net/liff/edge/2/sdk.js"
          onReady={handleLiffReady}
        />
      )}
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-semibold">LessonBase</h1>
        <p className="mt-2 text-gray-600">開発用トップページです。</p>
        <div className="mt-6">
          <Link href="/login" className="text-blue-600 hover:underline">
            ログインへ
          </Link>
        </div>
      </main>
    </>
  );
}
