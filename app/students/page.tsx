"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { useClientSupabase } from "@/lib/hooks/useClientSupabase";
import { useSchool } from "@/lib/hooks/useSchool";

type Student = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  memo: string | null;
  stripe_customer_id: string | null;
  line_user_id: string | null;
  created_at: string;
};

export default function StudentsPage() {
  const router = useRouter();
  const supabase = useClientSupabase();
  const { schoolId, loading: schoolLoading } = useSchool();

  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [students, setStudents] = useState<Student[]>([]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [memo, setMemo] = useState("");

  const fetchStudents = useCallback(
    async (sid: string) => {
      if (!supabase) {
        return;
      }
      setIsLoadingList(true);
      setErrorMessage(null);

      const { data, error } = await supabase
        .from("students")
        .select("id, name, email, phone, memo, stripe_customer_id, line_user_id, created_at")
        .eq("school_id", sid)
        .order("created_at", { ascending: false });

      if (error) {
        setErrorMessage("生徒一覧の取得に失敗しました。");
        setIsLoadingList(false);
        return;
      }

      setStudents((data ?? []) as Student[]);
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
      setIsLoadingList(false);
      return;
    }
    void fetchStudents(schoolId);
  }, [supabase, isCheckingAuth, schoolLoading, schoolId, fetchStudents]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!supabase) {
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage("名前は必須です。");
      return;
    }
    if (!schoolId) {
      setErrorMessage("教室が未設定です。「設定」から教室を作成してください。");
      return;
    }

    setIsSubmitting(true);
    const studentPayload = {
      name: trimmedName,
      email: email.trim() || null,
      phone: phone.trim() || null,
      memo: memo.trim() || null
    };

    const { error } = editingStudentId
      ? await supabase.from("students").update(studentPayload).eq("id", editingStudentId)
      : await supabase.from("students").insert({ ...studentPayload, school_id: schoolId });

    if (error) {
      setErrorMessage(editingStudentId ? "生徒の更新に失敗しました。" : "生徒の追加に失敗しました。");
      setIsSubmitting(false);
      return;
    }

    setIsFormOpen(false);
    setEditingStudentId(null);
    setName("");
    setEmail("");
    setPhone("");
    setMemo("");
    await fetchStudents(schoolId);
    setIsSubmitting(false);
  };

  const handleEdit = (student: Student) => {
    setIsFormOpen(true);
    setEditingStudentId(student.id);
    setName(student.name);
    setEmail(student.email ?? "");
    setPhone(student.phone ?? "");
    setMemo(student.memo ?? "");
    setErrorMessage(null);
  };

  const handleCancelEdit = () => {
    setIsFormOpen(false);
    setEditingStudentId(null);
    setName("");
    setEmail("");
    setPhone("");
    setMemo("");
    setErrorMessage(null);
  };

  const handleDelete = async (studentId: string) => {
    const confirmed = window.confirm("この生徒を削除しますか？");
    if (!confirmed) return;
    if (!supabase) {
      return;
    }

    setErrorMessage(null);
    const { error } = await supabase.from("students").delete().eq("id", studentId);
    if (error) {
      setErrorMessage("生徒の削除に失敗しました。");
      return;
    }

    if (editingStudentId === studentId) {
      handleCancelEdit();
    }
    if (schoolId) {
      await fetchStudents(schoolId);
    }
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
        <h1 className="text-2xl font-semibold">生徒一覧</h1>

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
          onClick={() => {
            if (isFormOpen && editingStudentId) {
              handleCancelEdit();
              return;
            }
            setIsFormOpen((prev) => !prev);
          }}
          className="rounded bg-[#1E3A5F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#17304D]"
        >
          {isFormOpen ? "フォームを閉じる" : "+ 生徒を追加"}
        </button>
      </section>

      <section
        className={`mt-4 overflow-hidden rounded border border-gray-200 bg-white transition-all duration-300 ${
          isFormOpen ? "max-h-[900px] p-4 opacity-100" : "max-h-0 border-transparent p-0 opacity-0"
        }`}
      >
        <h2 className="text-lg font-medium">{editingStudentId ? "生徒を編集" : "生徒を追加"}</h2>
        <form onSubmit={handleSubmit} className="mt-4 grid gap-4">
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium text-gray-700">
              名前（必須）
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="山田 太郎"
            />
          </div>

          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
              メールアドレス
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="student@example.com"
            />
          </div>

          <div>
            <label htmlFor="phone" className="mb-1 block text-sm font-medium text-gray-700">
              電話番号
            </label>
            <input
              id="phone"
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="090-1234-5678"
            />
          </div>

          <div>
            <label htmlFor="memo" className="mb-1 block text-sm font-medium text-gray-700">
              メモ
            </label>
            <textarea
              id="memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={3}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="備考など"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? (editingStudentId ? "保存中..." : "追加中...") : editingStudentId ? "保存する" : "生徒を追加"}
            </button>
            <button
              type="button"
              onClick={handleCancelEdit}
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
        ) : students.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600">生徒データがありません。</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-[#1E3A5F]">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-white">名前</th>
                  <th className="px-3 py-2 text-left font-medium text-white">メール</th>
                  <th className="px-3 py-2 text-left font-medium text-white">電話番号</th>
                  <th className="px-3 py-2 text-left font-medium text-white">メモ</th>
                  <th className="px-3 py-2 text-left font-medium text-white">カード</th>
                  <th className="px-3 py-2 text-left font-medium text-white">LINE</th>
                  <th className="px-3 py-2 text-left font-medium text-white">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {students.map((student) => (
                  <tr key={student.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">{student.name}</td>
                    <td className="px-3 py-2">{student.email ?? "-"}</td>
                    <td className="px-3 py-2">{student.phone ?? "-"}</td>
                    <td className="px-3 py-2">{student.memo ?? "-"}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          student.stripe_customer_id
                            ? "bg-[#EAF3DE] text-[#3B6D11]"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {student.stripe_customer_id ? "登録済み" : "未登録"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          student.line_user_id
                            ? "bg-[#E6F9ED] text-[#06C755]"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {student.line_user_id ? "連携済み" : "未連携"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/students/${student.id}/register-card`}
                          className="rounded border border-gray-300 px-2.5 py-1 text-xs text-[#1E3A5F] hover:bg-gray-50"
                        >
                          カードを登録
                        </Link>
                        {!student.line_user_id && (
                          <Link
                            href={`/students/${student.id}/line-connect`}
                            className="rounded border border-[#06C755] px-2.5 py-1 text-xs text-[#06C755] hover:bg-green-50"
                          >
                            LINE連携
                          </Link>
                        )}
                        <button
                          type="button"
                          onClick={() => handleEdit(student)}
                          className="rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                        >
                          編集
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(student.id)}
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
      </main>
    </div>
  );
}

