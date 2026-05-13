"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type HeaderProps = {
  onLogout: () => void;
  isLoggingOut?: boolean;
};

export function Header({ onLogout, isLoggingOut = false }: HeaderProps) {
  const pathname = usePathname();
  const navItems = [
    { href: "/dashboard", label: "ダッシュボード" },
    { href: "/students", label: "生徒管理" },
    { href: "/bookings", label: "予約管理" },
    { href: "/settings", label: "設定" }
  ];

  return (
    <header className="border-b border-[#1A324F] bg-[#1E3A5F]">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-6">
        <Link href="/dashboard" className="mr-auto px-4 py-2 text-[18px] font-semibold text-white">
          LessonBase
        </Link>
        <nav className="flex items-center gap-3 text-sm font-medium">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded px-4 py-2 text-white transition hover:bg-white/10 ${
                  isActive ? "bg-[rgba(255,255,255,0.15)]" : ""
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-3">
          <button
            type="button"
            onClick={onLogout}
            disabled={isLoggingOut}
            className="rounded border border-white/30 px-4 py-2 text-sm text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoggingOut ? "ログアウト中..." : "ログアウト"}
          </button>
        </div>
      </div>
    </header>
  );
}
