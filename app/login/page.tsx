"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { getSupabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const supabase = getSupabase();

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
  }, [router]);

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
    <div className="min-h-screen bg-[#F5F5F5] px-4 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center">
        <div className="w-full rounded-2xl bg-white p-8 shadow-lg">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-extrabold tracking-tight text-blue-700">LessonBase</h1>
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
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
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
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                placeholder="********"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? "ログイン中..." : "ログイン"}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-600">
            <Link href="/reset-password" className="text-blue-600 hover:underline">
              パスワードを忘れた方はこちら
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

