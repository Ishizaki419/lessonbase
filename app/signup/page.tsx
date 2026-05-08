"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { getSupabase } from "@/lib/supabase";

export default function SignupPage() {
  const router = useRouter();
  const supabase = getSupabase();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const [validationError, setValidationError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const isEmailValidFormat = useMemo(() => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }, [email]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) router.replace("/dashboard");
    })();

    return () => {
      cancelled = true;
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
    if (password !== passwordConfirm) {
      setValidationError("パスワード確認が一致しません。");
      return false;
    }
    return true;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password
      });

      if (error) {
        setAuthError(error.message);
        return;
      }

      setSuccessMessage("登録が完了しました。ログインしてください。");
      setTimeout(() => {
        router.replace("/login");
      }, 1200);
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

          {successMessage && (
            <div className="mb-4 rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {successMessage}
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
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-[#F8FAFC] px-3 py-2.5 text-sm outline-none transition focus:border-[#1E3A5F] focus:ring-2 focus:ring-blue-100"
                placeholder="8文字以上"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="passwordConfirm">
                パスワード確認
              </label>
              <input
                id="passwordConfirm"
                type="password"
                autoComplete="new-password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-[#F8FAFC] px-3 py-2.5 text-sm outline-none transition focus:border-[#1E3A5F] focus:ring-2 focus:ring-blue-100"
                placeholder="パスワードを再入力"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !!successMessage}
              className="w-full rounded-lg bg-[#1E3A5F] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#17304D] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? "登録中..." : "新規登録"}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-600">
            <Link href="/login" className="text-blue-600 hover:underline">
              ログインページへ戻る
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
