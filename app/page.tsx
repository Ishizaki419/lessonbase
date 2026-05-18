"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Home() {
  useEffect(() => {
    // LIFFがパスを liff.state に格納して渡してくる場合のリダイレクト処理
    // 例: liff.state=%2Fabsence-report%3FschoolId%3Dxxx → /absence-report?schoolId=xxx
    const params = new URLSearchParams(window.location.search);
    const liffState = params.get("liff.state");
    if (liffState) {
      const decoded = decodeURIComponent(liffState);
      if (decoded.startsWith("/")) {
        window.location.replace(decoded);
        return;
      }
    }
  }, []);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">LessonBase</h1>
      <p className="mt-2 text-gray-600">開発用トップページです。</p>
      <div className="mt-6">
        <Link href="/login" className="text-blue-600 hover:underline">
          ログインへ
        </Link>
      </div>
    </main>
  );
}
