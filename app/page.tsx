import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">LessonBase</h1>
      <p className="mt-2 text-gray-600">開発用トップページです。</p>
      <div className="mt-6">
        <Link href="/login" className="text-blue-600 hover:underline">
          ログインへ
        </Link>
      </div>
    </main>
  );
}

