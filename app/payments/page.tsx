"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Header } from "@/components/Header";
import { useClientSupabase } from "@/lib/hooks/useClientSupabase";
import { useSchool } from "@/lib/hooks/useSchool";

type StudentOption = {
  id: string;
  name: string;
};

type PaymentRow = {
  id: string;
  student_id: string | null;
  amount: number;
  currency: string;
  status: string;
  description: string | null;
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
  students: { name: string } | null;
};

function formatAmount(amount: number, currency: string) {
  if (currency.toLowerCase() === "jpy") {
    return `¥${amount.toLocaleString("ja-JP")}`;
  }
  return `${amount.toLocaleString("ja-JP")} ${currency.toUpperCase()}`;
}

function formatDate(date: string | null) {
  if (!date) return "-";
  return new Date(date + "T00:00:00").toLocaleDateString("ja-JP");
}

function getStatusBadge(status: string) {
  if (status === "paid") {
    return { label: "支払済み", className: "bg-[#EAF3DE] text-[#3B6D11]" };
  }
  if (status === "pending") {
    return { label: "保留中", className: "bg-gray-100 text-gray-600" };
  }
  return { label: "未払い", className: "bg-[#FCEBEB] text-[#A32D2D]" };
}

export default function PaymentsPage() {
  const router = useRouter();
  const supabase = useClientSupabase();
  const { schoolId, loading: schoolLoading } = useSchool();

  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);

  const [students, setStudents] = useState<StudentOption[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);

  const [studentId, setStudentId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");

  const fetchStudents = useCallback(
    async (sid: string) => {
      if (!supabase) {
        return;
      }
      const { data, error } = await supabase
        .from("students")
        .select("id, name")
        .eq("school_id", sid)
        .order("name");

      if (error) {
        setErrorMessage("生徒一覧の取得に失敗しました。");
        return;
      }
      setStudents((data ?? []) as StudentOption[]);
    },
    [supabase]
  );

  const fetchPayments = useCallback(
    async (sid: string) => {
      if (!supabase) {
        return;
      }
      setIsLoadingList(true);
      setErrorMessage(null);

      const { data, error } = await supabase
        .from("payments")
        .select(
          `
          id,
          student_id,
          amount,
          currency,
          status,
          description,
          due_date,
          paid_at,
          created_at,
          students (
            name
          )
        `
        )
        .eq("school_id", sid)
        .order("due_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (error) {
        setErrorMessage("月謝一覧の取得に失敗しました。");
        setIsLoadingList(false);
        return;
      }

      setPayments((data ?? []) as PaymentRow[]);
      setIsLoadingList(false);
    },
    [supabase]
  );

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
  }, [router, supabase]);

  useEffect(() => {
    if (!supabase || isCheckingAuth || schoolLoading) return;
    if (!schoolId) {
      setStudents([]);
      setPayments([]);
      setIsLoadingList(false);
      return;
    }
    void Promise.all([fetchStudents(schoolId), fetchPayments(schoolId)]);
  }, [supabase, isCheckingAuth, schoolLoading, schoolId, fetchStudents, fetchPayments]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!supabase) {
      return;
    }

    if (!studentId) {
      setErrorMessage("生徒を選択してください。");
      return;
    }

    const parsedAmount = Number.parseInt(amount, 10);
    if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
      setErrorMessage("金額は1円以上の整数で入力してください。");
      return;
    }
    if (!schoolId) {
      setErrorMessage("教室が未設定です。「設定」から教室を作成してください。");
      return;
    }

    setIsSubmitting(true);

    const trimmedDescription = description.trim();
    const currency = "jpy";

    const { data: inserted, error: insertError } = await supabase
      .from("payments")
      .insert({
        school_id: schoolId,
        student_id: studentId,
        amount: parsedAmount,
        currency,
        status: "unpaid",
        description: trimmedDescription || null,
        due_date: dueDate || null
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      setErrorMessage("月謝の追加に失敗しました。");
      setIsSubmitting(false);
      return;
    }

    try {
      const piRes = await fetch("/api/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parsedAmount,
          currency,
          student_id: studentId,
          description: trimmedDescription
        })
      });

      if (piRes.ok) {
        const piData = (await piRes.json()) as { paymentIntentId?: string };
        if (piData.paymentIntentId) {
          await supabase
            .from("payments")
            .update({
              stripe_payment_intent_id: piData.paymentIntentId,
              status: "pending"
            })
            .eq("id", inserted.id);
        }
      }
    } catch {
      // Payment record remains as unpaid if Stripe intent creation fails.
    }

    setIsFormOpen(false);
    setStudentId("");
    setAmount("");
    setDescription("");
    setDueDate("");
    await fetchPayments(schoolId);
    setIsSubmitting(false);
  };

  const handleMarkPaid = async (paymentId: string) => {
    if (!supabase || !schoolId) {
      return;
    }

    setMarkingPaidId(paymentId);
    setErrorMessage(null);

    const { error } = await supabase
      .from("payments")
      .update({
        status: "paid",
        paid_at: new Date().toISOString()
      })
      .eq("id", paymentId);

    setMarkingPaidId(null);

    if (error) {
      setErrorMessage("支払済みへの更新に失敗しました。");
      return;
    }

    await fetchPayments(schoolId);
  };

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

  if (!supabase || isCheckingAuth || schoolLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-gray-600">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Header onLogout={handleLogout} isLoggingOut={isLoggingOut} />
      <main className="mx-auto max-w-5xl p-6">
        <h1 className="text-2xl font-semibold">月謝管理</h1>

        {errorMessage && (
          <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        {!schoolId && (
          <div className="mt-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            教室に所属していません。{" "}
            <Link href="/settings" className="font-medium text-blue-700 underline">
              設定
            </Link>
            から教室を作成してください。
          </div>
        )}

        <section className="mt-6">
          <button
            type="button"
            onClick={() => setIsFormOpen((prev) => !prev)}
            className="rounded bg-[#1E3A5F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#17304D]"
          >
            {isFormOpen ? "フォームを閉じる" : "+ 月謝を追加"}
          </button>
        </section>

        <section
          className={`mt-4 overflow-hidden rounded border border-gray-200 bg-white transition-all duration-300 ${
            isFormOpen ? "max-h-[900px] p-4 opacity-100" : "max-h-0 border-transparent p-0 opacity-0"
          }`}
        >
          <h2 className="text-lg font-medium">月謝を追加</h2>
          <form onSubmit={handleSubmit} className="mt-4 grid gap-4">
            <div>
              <label htmlFor="studentId" className="mb-1 block text-sm font-medium text-gray-700">
                生徒（必須）
              </label>
              <select
                id="studentId"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                <option value="">選択してください</option>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="amount" className="mb-1 block text-sm font-medium text-gray-700">
                金額（必須・円）
              </label>
              <input
                id="amount"
                type="number"
                min={1}
                step={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="10000"
              />
            </div>

            <div>
              <label htmlFor="description" className="mb-1 block text-sm font-medium text-gray-700">
                説明
              </label>
              <input
                id="description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="5月分月謝"
              />
            </div>

            <div>
              <label htmlFor="dueDate" className="mb-1 block text-sm font-medium text-gray-700">
                支払期限
              </label>
              <input
                id="dueDate"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "追加中..." : "月謝を追加"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsFormOpen(false);
                  setStudentId("");
                  setAmount("");
                  setDescription("");
                  setDueDate("");
                  setErrorMessage(null);
                }}
                className="rounded border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                キャンセル
              </button>
            </div>
          </form>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-medium">一覧</h2>
          {isLoadingList ? (
            <p className="mt-3 text-sm text-gray-600">読み込み中...</p>
          ) : payments.length === 0 ? (
            <p className="mt-3 text-sm text-gray-600">月謝データがありません。</p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-[#1E3A5F]">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-white">生徒名</th>
                    <th className="px-3 py-2 text-left font-medium text-white">金額</th>
                    <th className="px-3 py-2 text-left font-medium text-white">説明</th>
                    <th className="px-3 py-2 text-left font-medium text-white">ステータス</th>
                    <th className="px-3 py-2 text-left font-medium text-white">支払期限</th>
                    <th className="px-3 py-2 text-left font-medium text-white">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {payments.map((payment) => {
                    const badge = getStatusBadge(payment.status);
                    return (
                      <tr key={payment.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2">{payment.students?.name ?? "-"}</td>
                        <td className="px-3 py-2">{formatAmount(payment.amount, payment.currency)}</td>
                        <td className="px-3 py-2">{payment.description ?? "-"}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-3 py-2">{formatDate(payment.due_date)}</td>
                        <td className="px-3 py-2">
                          {payment.status !== "paid" ? (
                            <button
                              type="button"
                              onClick={() => handleMarkPaid(payment.id)}
                              disabled={markingPaidId === payment.id}
                              className="rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {markingPaidId === payment.id ? "更新中..." : "支払済みにする"}
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
