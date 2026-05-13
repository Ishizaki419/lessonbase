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
  email: string | null;
};

type BookingRow = {
  id: string;
  student_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  memo: string | null;
  status: "確定" | "キャンセル" | "完了";
  created_at: string;
  students: {
    name: string;
  };
};

const BOOKING_STATUSES = ["確定", "キャンセル", "完了"] as const;

const STATUS_BADGE_CLASS: Record<(typeof BOOKING_STATUSES)[number], string> = {
  確定: "bg-[#EAF3DE] text-[#3B6D11]",
  完了: "bg-gray-100 text-gray-600",
  キャンセル: "bg-[#FCEBEB] text-[#A32D2D]"
};

export default function BookingsPage() {
  const router = useRouter();
  const supabase = useClientSupabase();
  const { schoolId, loading: schoolLoading } = useSchool();

  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [students, setStudents] = useState<StudentOption[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);

  const [studentId, setStudentId] = useState("");
  const [bookingDate, setBookingDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [memo, setMemo] = useState("");
  const [status, setStatus] = useState<(typeof BOOKING_STATUSES)[number]>("確定");

  const fetchStudents = useCallback(
    async (sid: string) => {
      if (!supabase) {
        return;
      }
      const { data, error } = await supabase
        .from("students")
        .select("id, name, email")
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

  const fetchBookings = useCallback(
    async (sid: string) => {
      if (!supabase) {
        return;
      }
      setIsLoading(true);
      setErrorMessage(null);

      const { data, error } = await supabase
        .from("bookings")
        .select(
          `
        id,
        student_id,
        booking_date,
        start_time,
        end_time,
        memo,
        status,
        created_at,
        students (
          name
        )
      `
        )
        .eq("school_id", sid)
        .order("booking_date", { ascending: true })
        .order("start_time", { ascending: true });

      if (error) {
        setErrorMessage("予約一覧の取得に失敗しました。");
        setIsLoading(false);
        return;
      }

      setBookings((data ?? []) as BookingRow[]);
      setIsLoading(false);
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
      setBookings([]);
      setIsLoading(false);
      return;
    }
    void Promise.all([fetchStudents(schoolId), fetchBookings(schoolId)]);
  }, [supabase, isCheckingAuth, schoolLoading, schoolId, fetchStudents, fetchBookings]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!supabase) {
      return;
    }

    if (!studentId) {
      setErrorMessage("生徒名を選択してください。");
      return;
    }
    if (!bookingDate) {
      setErrorMessage("日付を入力してください。");
      return;
    }
    if (!startTime || !endTime) {
      setErrorMessage("開始時間と終了時間を入力してください。");
      return;
    }
    if (startTime >= endTime) {
      setErrorMessage("終了時間は開始時間より後にしてください。");
      return;
    }

    if (!schoolId) {
      setErrorMessage("教室が未設定です。「設定」から教室を作成してください。");
      return;
    }

    const basePayload = {
      student_id: studentId,
      booking_date: bookingDate,
      start_time: startTime,
      end_time: endTime,
      memo: memo.trim() || null,
      status
    };

    const isNewBooking = !editingBookingId;
    const studentIdForEmail = studentId;

    setIsSubmitting(true);
    const { error } = editingBookingId
      ? await supabase.from("bookings").update(basePayload).eq("id", editingBookingId)
      : await supabase.from("bookings").insert({ ...basePayload, school_id: schoolId });

    if (error) {
      setErrorMessage(editingBookingId ? "予約の更新に失敗しました。" : "予約の追加に失敗しました。");
      setIsSubmitting(false);
      return;
    }

    setEditingBookingId(null);
    setStudentId("");
    setBookingDate("");
    setStartTime("");
    setEndTime("");
    setMemo("");
    setStatus("確定");

    if (isNewBooking) {
      const selectedStudent = students.find((student) => student.id === studentIdForEmail);
      if (selectedStudent?.email) {
        try {
          await fetch("/api/send-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: selectedStudent.email,
              studentName: selectedStudent.name,
              bookingDate,
              startTime,
              endTime,
              status
            })
          });
        } catch {
          // Booking creation should remain successful even if email fails.
        }
      }
    }

    if (schoolId) {
      await fetchBookings(schoolId);
    }
    setIsSubmitting(false);
  };

  const handleEdit = (booking: BookingRow) => {
    setEditingBookingId(booking.id);
    setStudentId(booking.student_id);
    setBookingDate(booking.booking_date);
    setStartTime(booking.start_time);
    setEndTime(booking.end_time);
    setMemo(booking.memo ?? "");
    setStatus(booking.status);
    setErrorMessage(null);
  };

  const handleCancelEdit = () => {
    setEditingBookingId(null);
    setStudentId("");
    setBookingDate("");
    setStartTime("");
    setEndTime("");
    setMemo("");
    setStatus("確定");
    setErrorMessage(null);
  };

  const handleDelete = async (bookingId: string) => {
    const confirmed = window.confirm("この予約を削除しますか？");
    if (!confirmed) return;
    if (!supabase) {
      return;
    }

    setErrorMessage(null);
    const { error } = await supabase.from("bookings").delete().eq("id", bookingId);
    if (error) {
      setErrorMessage("予約の削除に失敗しました。");
      return;
    }

    if (editingBookingId === bookingId) {
      handleCancelEdit();
    }
    if (schoolId) {
      await fetchBookings(schoolId);
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
        <h1 className="text-2xl font-semibold">予約一覧</h1>

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

      <section className="mt-6 rounded border border-gray-200 bg-white p-4">
        <h2 className="text-lg font-medium">{editingBookingId ? "予約を編集" : "予約を追加"}</h2>
        <form onSubmit={handleSubmit} className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label htmlFor="student" className="mb-1 block text-sm font-medium text-gray-700">
              生徒名
            </label>
            <select
              id="student"
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
            <label htmlFor="bookingDate" className="mb-1 block text-sm font-medium text-gray-700">
              日付
            </label>
            <input
              id="bookingDate"
              type="date"
              value={bookingDate}
              onChange={(e) => setBookingDate(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="status" className="mb-1 block text-sm font-medium text-gray-700">
              ステータス
            </label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as (typeof BOOKING_STATUSES)[number])}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              {BOOKING_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="startTime" className="mb-1 block text-sm font-medium text-gray-700">
              開始時間
            </label>
            <input
              id="startTime"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="endTime" className="mb-1 block text-sm font-medium text-gray-700">
              終了時間
            </label>
            <input
              id="endTime"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="md:col-span-2">
            <label htmlFor="memo" className="mb-1 block text-sm font-medium text-gray-700">
              メモ
            </label>
            <textarea
              id="memo"
              rows={3}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="予約に関するメモ"
            />
          </div>

          <div className="md:col-span-2">
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? (editingBookingId ? "保存中..." : "追加中...") : editingBookingId ? "保存する" : "予約を追加"}
              </button>
              {editingBookingId && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="rounded border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  キャンセル
                </button>
              )}
            </div>
          </div>
        </form>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium">予約リスト</h2>
        {isLoading ? (
          <p className="mt-3 text-sm text-gray-600">読み込み中...</p>
        ) : bookings.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600">予約データがありません。</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-[#1E3A5F]">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-white">生徒名</th>
                  <th className="px-3 py-2 text-left font-medium text-white">日付</th>
                  <th className="px-3 py-2 text-left font-medium text-white">時間</th>
                  <th className="px-3 py-2 text-left font-medium text-white">ステータス</th>
                  <th className="px-3 py-2 text-left font-medium text-white">メモ</th>
                  <th className="px-3 py-2 text-left font-medium text-white">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {bookings.map((booking) => (
                  <tr key={booking.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">{booking.students?.name ?? "不明な生徒"}</td>
                    <td className="px-3 py-2">{booking.booking_date}</td>
                    <td className="px-3 py-2">
                      {booking.start_time} - {booking.end_time}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[booking.status]}`}>
                        {booking.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">{booking.memo ?? "-"}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(booking)}
                          className="rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                        >
                          編集
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(booking.id)}
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

