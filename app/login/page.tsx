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
    <div className="min-h-screen bg-white">
      <div className="mx-auto flex min-h-screen max-w-md items-center px-4">
        <div className="w-full">
          <h1 className="mb-6 text-center text-2xl font-semibold">ログイン</h1>

          {(validationError || authError) && (
            <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {validationError ?? authError}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
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
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="********"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? "ログイン中..." : "ログイン"}
            </button>
          </form>

          <div className="mt-5 text-center text-sm text-gray-600">
            <Link href="/reset-password" className="text-blue-600 hover:underline">
              パスワードを忘れた方はこちら
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

