"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";

import { Header } from "@/components/Header";
import { useClientSupabase } from "@/lib/hooks/useClientSupabase";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

type CardFormProps = {
  studentId: string;
  studentName: string;
  clientSecret: string;
  accessToken: string;
  onSuccess: () => void;
};

function CardRegistrationForm({ studentId, studentName, clientSecret, accessToken, onSuccess }: CardFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const { error, setupIntent } = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/students/${studentId}/register-card`
      },
      redirect: "if_required"
    });

    if (error) {
      setErrorMessage(error.message ?? "カード登録に失敗しました。");
      setIsSubmitting(false);
      return;
    }

    const paymentMethodId =
      typeof setupIntent?.payment_method === "string"
        ? setupIntent.payment_method
        : setupIntent?.payment_method?.id;

    if (paymentMethodId) {
      const completeRes = await fetch("/api/complete-card-setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          student_id: studentId,
          payment_method_id: paymentMethodId
        })
      });

      if (!completeRes.ok) {
        setErrorMessage("カードの既定支払い方法の設定に失敗しました。");
        setIsSubmitting(false);
        return;
      }
    }

    setIsSubmitting(false);
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-5">
      <p className="text-sm text-gray-600">
        <span className="font-medium text-gray-900">{studentName}</span> さんのカード情報を登録します。
      </p>
      <PaymentElement
        options={{
          layout: "tabs"
        }}
      />
      {errorMessage && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
      )}
      <button
        type="submit"
        disabled={!stripe || !elements || isSubmitting}
        className="w-full rounded-lg bg-[#1E3A5F] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#17304D] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "登録中..." : "カードを登録する"}
      </button>
    </form>
  );
}

export default function RegisterCardPage() {
  const router = useRouter();
  const params = useParams();
  const studentId = typeof params.id === "string" ? params.id : "";
  const supabase = useClientSupabase();

  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [studentName, setStudentName] = useState("");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const elementsOptions = useMemo(
    () => (clientSecret ? { clientSecret, appearance: { theme: "stripe" as const } } : undefined),
    [clientSecret]
  );

  const initRegistration = useCallback(async () => {
    if (!supabase || !studentId) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session) {
      router.replace("/login");
      return;
    }

    setAccessToken(session.access_token);

    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id, name")
      .eq("id", studentId)
      .maybeSingle();

    if (studentError || !student) {
      setErrorMessage("生徒が見つかりません。");
      setIsLoading(false);
      return;
    }

    setStudentName(student.name);

    const res = await fetch("/api/register-card", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ student_id: studentId })
    });

    const data = (await res.json()) as { clientSecret?: string; error?: string };

    if (!res.ok || !data.clientSecret) {
      setErrorMessage(data.error ?? "カード登録の準備に失敗しました。");
      setIsLoading(false);
      return;
    }

    setClientSecret(data.clientSecret);
    setIsLoading(false);
  }, [router, studentId, supabase]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let mounted = true;

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      if (!data.session) {
        router.replace("/login");
        return;
      }

      setIsCheckingAuth(false);
      await initRegistration();
    };

    void checkSession();

    const { data: authListenerData } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace("/login");
      }
    });

    return () => {
      mounted = false;
      authListenerData.subscription.unsubscribe();
    };
  }, [initRegistration, router, supabase]);

  const handleLogout = async () => {
    if (!supabase) {
      return;
    }
    setIsLoggingOut(true);
    try {
      await supabase.auth.signOut();
    } finally {
      router.replace("/login");
      setIsLoggingOut(false);
    }
  };

  const handleSuccess = () => {
    router.replace("/students");
  };

  if (!supabase || isCheckingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-gray-600">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Header onLogout={handleLogout} isLoggingOut={isLoggingOut} />
      <main className="mx-auto max-w-lg p-6">
        <h1 className="text-2xl font-semibold text-gray-900">カード登録</h1>
        <p className="mt-1 text-sm text-gray-600">引き落とし用のクレジットカードを登録します。</p>

        {!publishableKey && (
          <div className="mt-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY が設定されていません。
          </div>
        )}

        {errorMessage && (
          <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <section className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          {isLoading ? (
            <p className="text-sm text-gray-600">読み込み中...</p>
          ) : clientSecret && stripePromise && accessToken ? (
            <Elements stripe={stripePromise} options={elementsOptions}>
              <CardRegistrationForm
                studentId={studentId}
                studentName={studentName}
                clientSecret={clientSecret}
                accessToken={accessToken}
                onSuccess={handleSuccess}
              />
            </Elements>
          ) : null}
        </section>
      </main>
    </div>
  );
}
