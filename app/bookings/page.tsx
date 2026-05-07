"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type StudentOption = {
  id: string;
  name: string;
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
  } | null;
};

const BOOKING_STATUSES = ["確定", "キャンセル", "完了"] as const;

export default function BookingsPage() {
  const router = useRouter();

  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [students, setStudents] = useState<StudentOption[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);

  const [studentId, setStudentId] = useState("");
  const [bookingDate, setBookingDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [memo, setMemo] = useState("");
  const [status, setStatus] = useState<(typeof BOOKING_STATUSES)[number]>("確定");

  const fetchStudents = async () => {
    const { data, error } = await supabase.from("students").select("id, name").order("name");
    if (error) {
      setErrorMessage("生徒一覧の取得に失敗しました。");
      return;
    }
    setStudents((data ?? []) as StudentOption[]);
  };

  const fetchBookings = async () => {
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
      .order("booking_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) {
      setErrorMessage("予約一覧の取得に失敗しました。");
      setIsLoading(false);
      return;
    }

    setBookings((data ?? []) as BookingRow[]);
    setIsLoading(false);
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
      await Promise.all([fetchStudents(), fetchBookings()]);
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

    setIsSubmitting(true);
    const { error } = await supabase.from("bookings").insert({
      student_id: studentId,
      booking_date: bookingDate,
      start_time: startTime,
      end_time: endTime,
      memo: memo.trim() || null,
      status
    });

    if (error) {
      setErrorMessage("予約の追加に失敗しました。");
      setIsSubmitting(false);
      return;
    }

    setStudentId("");
    setBookingDate("");
    setStartTime("");
    setEndTime("");
    setMemo("");
    setStatus("確定");
    await fetchBookings();
    setIsSubmitting(false);
  };

  if (isCheckingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-gray-600">認証確認中...</p>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-semibold">予約一覧</h1>

      {errorMessage && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <section className="mt-6 rounded border border-gray-200 bg-white p-4">
        <h2 className="text-lg font-medium">予約を追加</h2>
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
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "追加中..." : "予約を追加"}
            </button>
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
          <ul className="mt-4 space-y-3">
            {bookings.map((booking) => (
              <li key={booking.id} className="rounded border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold">
                    {booking.students?.name ?? "不明な生徒"}
                  </span>
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                    {booking.status}
                  </span>
                </div>
                <p className="mt-2 text-sm text-gray-700">
                  {booking.booking_date} {booking.start_time} - {booking.end_time}
                </p>
                <p className="mt-1 text-sm text-gray-600">メモ: {booking.memo ?? "-"}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

