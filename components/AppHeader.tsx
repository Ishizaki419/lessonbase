"use client";

import Link from "next/link";

type AppHeaderProps = {
  onLogout: () => void;
  isLoggingOut?: boolean;
};

export function AppHeader({ onLogout, isLoggingOut = false }: AppHeaderProps) {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-6">
        <Link href="/dashboard" className="text-xl font-bold tracking-tight text-blue-700">
          LessonBase
        </Link>
        <nav className="flex items-center gap-6 text-sm font-medium text-gray-700">
          <Link href="/students" className="transition hover:text-blue-600">
            生徒管理
          </Link>
          <Link href="/bookings" className="transition hover:text-blue-600">
            予約管理
          </Link>
          <button
            type="button"
            onClick={onLogout}
            disabled={isLoggingOut}
            className="text-gray-700 transition hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoggingOut ? "ログアウト中..." : "ログアウト"}
          </button>
        </nav>
      </div>
    </header>
  );
}
