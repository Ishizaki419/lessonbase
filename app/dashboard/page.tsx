"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";

export default function DashboardPage() {
  const router = useRouter();
  const supabase = getSupabase();
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      if (!data.session) {
        router.replace("/login");
        return;
      }

      setIsLoading(false);
    };

    checkSession();

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
  }, [router]);

  const today = useMemo(() => {
    return new Date().toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long"
    });
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await supabase.auth.signOut();
    } finally {
      router.replace("/login");
      setIsLoggingOut(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-gray-600">読み込み中...</p>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">ダッシュボード</h1>
      <p className="mt-2 text-gray-700">今日の日付: {today}</p>

      <button
        type="button"
        onClick={handleLogout}
        disabled={isLoggingOut}
        className="mt-6 rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoggingOut ? "ログアウト中..." : "ログアウト"}
      </button>
    </main>
  );
}

