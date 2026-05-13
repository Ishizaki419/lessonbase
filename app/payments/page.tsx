"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Header } from "@/components/Header";
import { useClientSupabase } from "@/lib/hooks/useClientSupabase";
import { useSchool } from "@/lib/hooks/useSchool";

type TabId = "list" | "settings";

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

type PaymentSettingRow = {
  id: string;
  student_id: string | null;
  billing_type: string;
  amount: number;
  billing_day: number;
  description: string | null;
  is_active: boolean;
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

function billingTypeLabel(type: string) {
  return type === "monthly" ? "月謝" : "都度払い";
}

export default function PaymentsPage() {
  const router = useRouter();
  const supabase = useClientSupabase();
  const { schoolId, loading: schoolLoading } = useSchool();

  const [activeTab, setActiveTab] = useState<TabId>("list");
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingSetting, setIsSavingSetting] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSettingFormOpen, setIsSettingFormOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const [togglingSettingId, setTogglingSettingId] = useState<string | null>(null);

  const [students, setStudents] = useState<StudentOption[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettingRow[]>([]);

  const [studentId, setStudentId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");

  const [editingSettingId, setEditingSettingId] = useState<string | null>(null);
  const [settingStudentId, setSettingStudentId] = useState("");
  const [billingType, setBillingType] = useState<"monthly" | "per_lesson">("monthly");
  const [settingAmount, setSettingAmount] = useState("");
  const [billingDay, setBillingDay] = useState("1");
  const [settingDescription, setSettingDescription] = useState("");
  const [settingIsActive, setSettingIsActive] = useState(true);

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

  const fetchPaymentSettings = useCallback(
    async (sid: string) => {
      if (!supabase) {
        return;
      }
      setIsLoadingSettings(true);

      const { data, error } = await supabase
        .from("payment_settings")
        .select(
          `
          id,
          student_id,
          billing_type,
          amount,
          billing_day,
          description,
          is_active,
          created_at,
          students (
            name
          )
        `
        )
        .eq("school_id", sid)
        .order("created_at", { ascending: false });

      if (error) {
        setErrorMessage("月謝設定の取得に失敗しました。");
        setIsLoadingSettings(false);
        return;
      }

      setPaymentSettings((data ?? []) as PaymentSettingRow[]);
      setIsLoadingSettings(false);
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
      setPaymentSettings([]);
      setIsLoadingList(false);
      setIsLoadingSettings(false);
      return;
    }
    void Promise.all([fetchStudents(schoolId), fetchPayments(schoolId), fetchPaymentSettings(schoolId)]);
  }, [supabase, isCheckingAuth, schoolLoading, schoolId, fetchStudents, fetchPayments, fetchPaymentSettings]);

  const resetSettingForm = () => {
    setEditingSettingId(null);
    setSettingStudentId("");
    setBillingType("monthly");
    setSettingAmount("");
    setBillingDay("1");
    setSettingDescription("");
    setSettingIsActive(true);
    setIsSettingFormOpen(false);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);
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

  const handleSettingSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);
    if (!supabase || !schoolId) {
      return;
    }

    if (!settingStudentId) {
      setErrorMessage("生徒を選択してください。");
      return;
    }

    const parsedAmount = Number.parseInt(settingAmount, 10);
    if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
      setErrorMessage("金額は1円以上の整数で入力してください。");
      return;
    }

    let parsedBillingDay = 1;
    if (billingType === "monthly") {
      parsedBillingDay = Number.parseInt(billingDay, 10);
      if (!Number.isInteger(parsedBillingDay) || parsedBillingDay < 1 || parsedBillingDay > 28) {
        setErrorMessage("請求日は1〜28日の範囲で指定してください。");
        return;
      }
    }

    setIsSavingSetting(true);

    const payload = {
      school_id: schoolId,
      student_id: settingStudentId,
      billing_type: billingType,
      amount: parsedAmount,
      billing_day: billingType === "monthly" ? parsedBillingDay : 1,
      description: settingDescription.trim() || null,
      is_active: settingIsActive
    };

    const { error } = editingSettingId
      ? await supabase.from("payment_settings").update(payload).eq("id", editingSettingId)
      : await supabase.from("payment_settings").insert(payload);

    setIsSavingSetting(false);

    if (error) {
      if (error.code === "23505") {
        setErrorMessage("この生徒の設定は既に存在します。一覧から編集してください。");
      } else {
        setErrorMessage("月謝設定の保存に失敗しました。");
      }
      return;
    }

    setInfoMessage(editingSettingId ? "月謝設定を更新しました。" : "月謝設定を追加しました。");
    resetSettingForm();
    await fetchPaymentSettings(schoolId);
  };

  const handleEditSetting = (setting: PaymentSettingRow) => {
    setEditingSettingId(setting.id);
    setSettingStudentId(setting.student_id ?? "");
    setBillingType(setting.billing_type === "per_lesson" ? "per_lesson" : "monthly");
    setSettingAmount(String(setting.amount));
    setBillingDay(String(setting.billing_day));
    setSettingDescription(setting.description ?? "");
    setSettingIsActive(setting.is_active);
    setIsSettingFormOpen(true);
    setErrorMessage(null);
    setInfoMessage(null);
  };

  const handleToggleSettingActive = async (setting: PaymentSettingRow) => {
    if (!supabase || !schoolId) {
      return;
    }

    setTogglingSettingId(setting.id);
    setErrorMessage(null);

    const { error } = await supabase
      .from("payment_settings")
      .update({ is_active: !setting.is_active })
      .eq("id", setting.id);

    setTogglingSettingId(null);

    if (error) {
      setErrorMessage("設定の更新に失敗しました。");
      return;
    }

    await fetchPaymentSettings(schoolId);
  };

  const handleDeleteSetting = async (settingId: string) => {
    if (!supabase || !schoolId) {
      return;
    }

    const confirmed = window.confirm("この月謝設定を削除しますか？");
    if (!confirmed) return;

    setErrorMessage(null);
    const { error } = await supabase.from("payment_settings").delete().eq("id", settingId);

    if (error) {
      setErrorMessage("月謝設定の削除に失敗しました。");
      return;
    }

    setInfoMessage("月謝設定を削除しました。");
    if (editingSettingId === settingId) {
      resetSettingForm();
    }
    await fetchPaymentSettings(schoolId);
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
        {infoMessage && (
          <div className="mt-4 rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {infoMessage}
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

        <div className="mt-6 flex gap-2 border-b border-gray-200">
          <button
            type="button"
            onClick={() => setActiveTab("list")}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition ${
              activeTab === "list"
                ? "border-[#1E3A5F] text-[#1E3A5F]"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            請求一覧
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("settings")}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition ${
              activeTab === "settings"
                ? "border-[#1E3A5F] text-[#1E3A5F]"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            月謝設定
          </button>
        </div>

        {activeTab === "list" && (
          <>
            <section className="mt-6">
              <button
                type="button"
                onClick={() => setIsFormOpen((prev) => !prev)}
                className="rounded bg-[#1E3A5F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#17304D]"
              >
                {isFormOpen ? "フォームを閉じる" : "+ 請求を追加"}
              </button>
              <p className="mt-2 text-xs text-gray-500">都度払いの生徒は、レッスン後にここから手動で請求を作成してください。</p>
            </section>

            <section
              className={`mt-4 overflow-hidden rounded border border-gray-200 bg-white transition-all duration-300 ${
                isFormOpen ? "max-h-[900px] p-4 opacity-100" : "max-h-0 border-transparent p-0 opacity-0"
              }`}
            >
              <h2 className="text-lg font-medium">請求を追加</h2>
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
                    {isSubmitting ? "追加中..." : "請求を追加"}
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
                <p className="mt-3 text-sm text-gray-600">請求データがありません。</p>
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
                              <span
                                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
                              >
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
          </>
        )}

        {activeTab === "settings" && (
          <>
            <section className="mt-6">
              <button
                type="button"
                onClick={() => {
                  if (isSettingFormOpen && editingSettingId) {
                    resetSettingForm();
                    return;
                  }
                  setIsSettingFormOpen((prev) => !prev);
                }}
                className="rounded bg-[#1E3A5F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#17304D]"
              >
                {isSettingFormOpen ? "フォームを閉じる" : "+ 月謝設定を追加"}
              </button>
              <p className="mt-2 text-xs text-gray-500">
                月謝タイプは設定した請求日（毎月1〜28日）の午前9時に自動で請求が作成されます。
              </p>
            </section>

            <section
              className={`mt-4 overflow-hidden rounded border border-gray-200 bg-white transition-all duration-300 ${
                isSettingFormOpen ? "max-h-[1000px] p-4 opacity-100" : "max-h-0 border-transparent p-0 opacity-0"
              }`}
            >
              <h2 className="text-lg font-medium">{editingSettingId ? "月謝設定を編集" : "月謝設定を追加"}</h2>
              <form onSubmit={handleSettingSubmit} className="mt-4 grid gap-4">
                <div>
                  <label htmlFor="settingStudentId" className="mb-1 block text-sm font-medium text-gray-700">
                    生徒（必須）
                  </label>
                  <select
                    id="settingStudentId"
                    value={settingStudentId}
                    onChange={(e) => setSettingStudentId(e.target.value)}
                    disabled={!!editingSettingId}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
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
                  <label htmlFor="billingType" className="mb-1 block text-sm font-medium text-gray-700">
                    請求タイプ
                  </label>
                  <select
                    id="billingType"
                    value={billingType}
                    onChange={(e) => setBillingType(e.target.value as "monthly" | "per_lesson")}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="monthly">月謝（毎月自動請求）</option>
                    <option value="per_lesson">都度払い（手動請求）</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="settingAmount" className="mb-1 block text-sm font-medium text-gray-700">
                    金額（必須・円）
                  </label>
                  <input
                    id="settingAmount"
                    type="number"
                    min={1}
                    step={1}
                    value={settingAmount}
                    onChange={(e) => setSettingAmount(e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="10000"
                  />
                </div>

                {billingType === "monthly" && (
                  <>
                    <div>
                      <label htmlFor="billingDay" className="mb-1 block text-sm font-medium text-gray-700">
                        請求日（毎月・1〜28日）
                      </label>
                      <input
                        id="billingDay"
                        type="number"
                        min={1}
                        max={28}
                        step={1}
                        value={billingDay}
                        onChange={(e) => setBillingDay(e.target.value)}
                        className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label htmlFor="settingDescription" className="mb-1 block text-sm font-medium text-gray-700">
                        説明
                      </label>
                      <input
                        id="settingDescription"
                        type="text"
                        value={settingDescription}
                        onChange={(e) => setSettingDescription(e.target.value)}
                        className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        placeholder="月謝"
                      />
                    </div>
                  </>
                )}

                {billingType === "per_lesson" && (
                  <p className="text-sm text-gray-600">
                    都度払いの場合、レッスン完了後に「請求一覧」タブから手動で請求を作成してください。上記の金額は参考用として保存されます。
                  </p>
                )}

                <div className="flex items-center gap-2">
                  <input
                    id="settingIsActive"
                    type="checkbox"
                    checked={settingIsActive}
                    onChange={(e) => setSettingIsActive(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <label htmlFor="settingIsActive" className="text-sm text-gray-700">
                    設定を有効にする
                  </label>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={isSavingSetting}
                    className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSavingSetting ? "保存中..." : editingSettingId ? "更新する" : "設定を追加"}
                  </button>
                  <button
                    type="button"
                    onClick={resetSettingForm}
                    className="rounded border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    キャンセル
                  </button>
                </div>
              </form>
            </section>

            <section className="mt-8">
              <h2 className="text-lg font-medium">設定一覧</h2>
              {isLoadingSettings ? (
                <p className="mt-3 text-sm text-gray-600">読み込み中...</p>
              ) : paymentSettings.length === 0 ? (
                <p className="mt-3 text-sm text-gray-600">月謝設定がありません。</p>
              ) : (
                <div className="mt-3 overflow-x-auto rounded border border-gray-200">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-[#1E3A5F]">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-white">生徒名</th>
                        <th className="px-3 py-2 text-left font-medium text-white">タイプ</th>
                        <th className="px-3 py-2 text-left font-medium text-white">金額</th>
                        <th className="px-3 py-2 text-left font-medium text-white">請求日</th>
                        <th className="px-3 py-2 text-left font-medium text-white">説明</th>
                        <th className="px-3 py-2 text-left font-medium text-white">有効</th>
                        <th className="px-3 py-2 text-left font-medium text-white">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {paymentSettings.map((setting) => (
                        <tr key={setting.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2">{setting.students?.name ?? "-"}</td>
                          <td className="px-3 py-2">{billingTypeLabel(setting.billing_type)}</td>
                          <td className="px-3 py-2">{formatAmount(setting.amount, "jpy")}</td>
                          <td className="px-3 py-2">
                            {setting.billing_type === "monthly" ? `毎月${setting.billing_day}日` : "—"}
                          </td>
                          <td className="px-3 py-2">{setting.description ?? "-"}</td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => handleToggleSettingActive(setting)}
                              disabled={togglingSettingId === setting.id}
                              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                setting.is_active
                                  ? "bg-[#EAF3DE] text-[#3B6D11]"
                                  : "bg-gray-100 text-gray-600"
                              } disabled:cursor-not-allowed disabled:opacity-60`}
                            >
                              {togglingSettingId === setting.id
                                ? "更新中..."
                                : setting.is_active
                                  ? "有効"
                                  : "無効"}
                            </button>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleEditSetting(setting)}
                                className="rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                              >
                                編集
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSetting(setting.id)}
                                className="rounded border border-gray-300 px-2.5 py-1 text-xs text-red-600 hover:bg-gray-50"
                              >
                                削除
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
