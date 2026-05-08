"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { AppHeader } from "@/components/AppHeader";

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
    <div className="min-h-screen bg-gray-50">
      <AppHeader onLogout={handleLogout} isLoggingOut={isLoggingOut} />
      <main className="mx-auto max-w-5xl p-6">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-900">ダッシュボード</h1>
          <p className="mt-2 text-gray-700">今日の日付: {today}</p>
        </div>
      </main>
    </div>
  );
}

