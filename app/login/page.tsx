"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useClientSupabase } from "@/lib/hooks/useClientSupabase";

export default function LoginPage() {
  const router = useRouter();
  const supabase = useClientSupabase();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [authError, setAuthError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const isEmailValidFormat = useMemo(() => {
    // Simple RFC-5322-ish check: practical validation for UI input.
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }, [email]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) router.replace("/dashboard");
    })();

    const { data: authListenerData } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) router.replace("/dashboard");
      }
    );

    return () => {
      cancelled = true;
      authListenerData.subscription.unsubscribe();
    };
  }, [router, supabase]);

  const validate = () => {
    setValidationError(null);
    setAuthError(null);

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setValidationError("メールアドレスを入力してください。");
      return false;
    }
    if (!isEmailValidFormat) {
      setValidationError("メールアドレスの形式を確認してください。");
      return false;
    }
    if (!password) {
      setValidationError("パスワードを入力してください。");
      return false;
    }
    if (password.length < 8) {
      setValidationError("パスワードは8文字以上で入力してください。");
      return false;
    }

    return true;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!validate()) return;
    if (!supabase) {
      return;
    }

    setIsLoading(true);
    try {
      const trimmedEmail = email.trim();

      const { error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (error) {
        setAuthError("メールアドレスまたはパスワードが違います");
        setPassword(""); // spec: password clear on failure
        return;
      }

      router.replace("/dashboard");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] px-4">
      <div className="mx-auto flex min-h-screen max-w-md items-center justify-center">
        <div className="w-full max-w-[320px] rounded-2xl bg-white p-8 shadow-xl">
          <div className="mb-8 text-center">
            <h1 className="text-[22px] font-bold text-[#1E3A5F]">LessonBase</h1>
            <p className="mt-2 text-sm text-gray-500">教室運営をシンプルに</p>
          </div>

          {(validationError || authError) && (
            <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {validationError ?? authError}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="email">
                メールアドレス
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-[#F8FAFC] px-3 py-2.5 text-sm outline-none transition focus:border-[#1E3A5F] focus:ring-2 focus:ring-blue-100"
                placeholder="example@example.com"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="password">
                パスワード
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-[#F8FAFC] px-3 py-2.5 text-sm outline-none transition focus:border-[#1E3A5F] focus:ring-2 focus:ring-blue-100"
                placeholder="********"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !supabase}
              className="w-full rounded-lg bg-[#1E3A5F] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#17304D] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? "ログイン中..." : "ログイン"}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-600">
            <Link href="/reset-password" className="text-blue-600 hover:underline">
              パスワードを忘れた方はこちら
            </Link>
            <p className="mt-2">
              <Link href="/signup" className="text-blue-600 hover:underline">
                アカウントをお持ちでない方はこちら
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

