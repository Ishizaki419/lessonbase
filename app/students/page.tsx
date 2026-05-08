"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { Header } from "@/components/Header";

type Student = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  memo: string | null;
  created_at: string;
};

export default function StudentsPage() {
  const router = useRouter();
  const supabase = getSupabase();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [students, setStudents] = useState<Student[]>([]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [memo, setMemo] = useState("");

  const fetchStudents = async () => {
    setIsLoadingList(true);
    setErrorMessage(null);

    const { data, error } = await supabase
      .from("students")
      .select("id, name, email, phone, memo, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setErrorMessage("生徒一覧の取得に失敗しました。");
      setIsLoadingList(false);
      return;
    }

    setStudents((data ?? []) as Student[]);
    setIsLoadingList(false);
  };

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      if (!data.session) {
        router.replace("/login");
        return;
      }

      setIsCheckingAuth(false);
      await fetchStudents();
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage("名前は必須です。");
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
      : await supabase.from("students").insert(studentPayload);

    if (error) {
      setErrorMessage(editingStudentId ? "生徒の更新に失敗しました。" : "生徒の追加に失敗しました。");
      setIsSubmitting(false);
      return;
    }

    setEditingStudentId(null);
    setName("");
    setEmail("");
    setPhone("");
    setMemo("");
    await fetchStudents();
    setIsSubmitting(false);
  };

  const handleEdit = (student: Student) => {
    setEditingStudentId(student.id);
    setName(student.name);
    setEmail(student.email ?? "");
    setPhone(student.phone ?? "");
    setMemo(student.memo ?? "");
    setErrorMessage(null);
  };

  const handleCancelEdit = () => {
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

    setErrorMessage(null);
    const { error } = await supabase.from("students").delete().eq("id", studentId);
    if (error) {
      setErrorMessage("生徒の削除に失敗しました。");
      return;
    }

    if (editingStudentId === studentId) {
      handleCancelEdit();
    }
    await fetchStudents();
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await supabase.auth.signOut();
    } finally {
      router.replace("/login");
      setIsLoggingOut(false);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-gray-600">認証確認中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header onLogout={handleLogout} isLoggingOut={isLoggingOut} />
      <main className="mx-auto max-w-5xl p-6">
        <h1 className="text-2xl font-semibold">生徒一覧</h1>

      {errorMessage && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <section className="mt-6 rounded border border-gray-200 bg-white p-4">
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
            {editingStudentId && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="rounded border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                キャンセル
              </button>
            )}
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
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-700">名前</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-700">メール</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-700">電話番号</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-700">メモ</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-700">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {students.map((student) => (
                  <tr key={student.id}>
                    <td className="px-3 py-2">{student.name}</td>
                    <td className="px-3 py-2">{student.email ?? "-"}</td>
                    <td className="px-3 py-2">{student.phone ?? "-"}</td>
                    <td className="px-3 py-2">{student.memo ?? "-"}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(student)}
                          className="rounded border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                        >
                          編集
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(student.id)}
                          className="rounded border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
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

