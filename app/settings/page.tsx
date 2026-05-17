"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";

import { Header } from "@/components/Header";
import { useClientSupabase } from "@/lib/hooks/useClientSupabase";
import { useSchool } from "@/lib/hooks/useSchool";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    liff: any;
  }
}

type MemberRow = {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
};

type InviteRpcResult = { ok?: boolean; error?: string };

export default function SettingsPage() {
  const router = useRouter();
  const supabase = useClientSupabase();
  const { schoolId, schoolName, role, isOwner, loading: schoolLoading, refresh: refreshSchool } = useSchool();

  const context =
    schoolId !== null ? { schoolId, schoolName: schoolName ?? "", role: role ?? "staff", isOwner } : null;
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [schoolNameInput, setSchoolNameInput] = useState("");
  const [newSchoolName, setNewSchoolName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isSavingBillingDay, setIsSavingBillingDay] = useState(false);
  const [isCreatingSchool, setIsCreatingSchool] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [billingDayInput, setBillingDayInput] = useState("25");

  // LINE連携
  const [liffReady, setLiffReady] = useState(false);
  const [ownerLineUserId, setOwnerLineUserId] = useState<string | null>(null);
  const [isConnectingLine, setIsConnectingLine] = useState(false);

  const loadMembers = useCallback(
    async (sid: string) => {
      if (!supabase) {
        return;
      }
      const { data, error } = await supabase
        .from("school_members")
        .select("id, user_id, role, created_at")
        .eq("school_id", sid)
        .order("created_at", { ascending: true });

      if (error) {
        setErrorMessage("メンバー一覧の取得に失敗しました。");
        return;
      }
      setMembers((data ?? []) as MemberRow[]);
    },
    [supabase]
  );

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let mounted = true;

    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setCurrentUserId(data.session.user.id);
      setIsCheckingAuth(false);
    };

    void init();

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
    if (schoolName) {
      setSchoolNameInput(schoolName);
    }
  }, [schoolName]);

  useEffect(() => {
    if (!schoolId || !supabase) {
      if (!schoolId) {
        setMembers([]);
      }
      return;
    }
    void loadMembers(schoolId);

    const loadSchoolSettings = async () => {
      const { data, error } = await supabase
        .from("schools")
        .select("billing_day, owner_line_user_id")
        .eq("id", schoolId)
        .maybeSingle();
      if (!error && data) {
        if (data.billing_day) setBillingDayInput(String(data.billing_day));
        if (data.owner_line_user_id) setOwnerLineUserId(data.owner_line_user_id);
      }
    };
    void loadSchoolSettings();
  }, [schoolId, loadMembers, supabase]);

  const handleLineConnect = async () => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (!liffId) {
      setErrorMessage("LIFF IDが設定されていません。");
      return;
    }
    if (!context?.schoolId) return;

    setIsConnectingLine(true);
    setErrorMessage(null);
    try {
      await window.liff.init({ liffId });
      if (!window.liff.isLoggedIn()) {
        window.liff.login();
        return;
      }
      const profile = await window.liff.getProfile();
      const idToken: string = window.liff.getIDToken() ?? "";

      const res = await fetch("/api/line/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "school",
          schoolId: context.schoolId,
          lineUserId: profile.userId,
          idToken,
          liffId
        })
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "連携に失敗しました");

      setOwnerLineUserId(profile.userId);
      setInfoMessage("LINEと連携しました。引き落とし結果がLINEで届くようになります。");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "LINE連携に失敗しました。");
    } finally {
      setIsConnectingLine(false);
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

  const handleSaveSchoolName = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      return;
    }
    if (!context?.isOwner) return;
    const trimmed = schoolNameInput.trim();
    if (!trimmed) {
      setErrorMessage("教室名を入力してください。");
      return;
    }
    setIsSavingName(true);
    setErrorMessage(null);
    const { error } = await supabase.from("schools").update({ name: trimmed }).eq("id", context.schoolId);
    setIsSavingName(false);
    if (error) {
      setErrorMessage("教室名の更新に失敗しました。");
      return;
    }
    setInfoMessage("教室名を更新しました。");
    await refreshSchool();
  };

  const handleSaveBillingDay = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      return;
    }
    if (!context?.isOwner) return;

    const parsed = Number.parseInt(billingDayInput, 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 28) {
      setErrorMessage("引き落とし日は1〜28日の範囲で指定してください。");
      return;
    }

    setIsSavingBillingDay(true);
    setErrorMessage(null);
    const { error } = await supabase.from("schools").update({ billing_day: parsed }).eq("id", context.schoolId);
    setIsSavingBillingDay(false);

    if (error) {
      setErrorMessage("引き落とし日の更新に失敗しました。");
      return;
    }

    setInfoMessage("引き落とし日を更新しました。");
  };

  const handleCreateSchool = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      return;
    }
    const trimmed = newSchoolName.trim();
    if (!trimmed) {
      setErrorMessage("教室名を入力してください。");
      return;
    }
    const {
      data: { session }
    } = await supabase.auth.getSession();
    if (!session?.user) {
      setErrorMessage("セションが無効です。再度ログインしてください。");
      return;
    }
    const userId = session.user.id;
    setIsCreatingSchool(true);
    setErrorMessage(null);

    const { data: schoolRow, error: schoolError } = await supabase
      .from("schools")
      .insert({ name: trimmed, owner_id: userId })
      .select("id")
      .single();

    if (schoolError || !schoolRow) {
      setIsCreatingSchool(false);
      setErrorMessage("教室の作成に失敗しました。");
      return;
    }

    const { error: memberError } = await supabase.from("school_members").insert({
      school_id: schoolRow.id,
      user_id: userId,
      role: "owner"
    });

    if (memberError) {
      await supabase.from("schools").delete().eq("id", schoolRow.id);
      setIsCreatingSchool(false);
      setErrorMessage("教室の作成に失敗しました。");
      return;
    }

    setIsCreatingSchool(false);
    setNewSchoolName("");
    setInfoMessage("教室を作成しました。");
    await refreshSchool();
  };

  const handleInvite = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      return;
    }
    if (!context?.isOwner) return;
    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      setErrorMessage("招待するメールアドレスを入力してください。");
      return;
    }
    setIsInviting(true);
    setErrorMessage(null);
    const { data, error } = await supabase.rpc("invite_school_member", {
      p_school_id: context.schoolId,
      p_email: email
    });
    setIsInviting(false);
    if (error) {
      setErrorMessage("招待に失敗しました。");
      return;
    }
    const result = data as InviteRpcResult | null;
    if (!result?.ok) {
      if (result?.error === "user_not_found") {
        setErrorMessage("このメールアドレスのユーザーが見つかりません。先にサインアップ済みである必要があります。");
      } else if (result?.error === "forbidden") {
        setErrorMessage("招待する権限がありません。");
      } else if (result?.error === "cannot_invite_self") {
        setErrorMessage("自分自身は招待できません。");
      } else {
        setErrorMessage("招待に失敗しました。");
      }
      return;
    }
    setInviteEmail("");
    setInfoMessage("メンバーを追加しました。");
    await loadMembers(context.schoolId);
  };

  const handleRemoveMember = async (member: MemberRow) => {
    if (!supabase) {
      return;
    }
    if (!context?.isOwner) return;
    const confirmed = window.confirm("このメンバーを削除しますか？");
    if (!confirmed) return;
    setErrorMessage(null);
    const { error } = await supabase.from("school_members").delete().eq("id", member.id);
    if (error) {
      setErrorMessage("メンバーの削除に失敗しました。");
      return;
    }
    setInfoMessage("メンバーを削除しました。");
    await loadMembers(context.schoolId);
  };

  if (!supabase || isCheckingAuth || schoolLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-gray-600">読み込み中...</p>
      </div>
    );
  }

  return (
    <>
      <Script
        src="https://static.line-scdn.net/liff/edge/2/sdk.js"
        onLoad={() => setLiffReady(true)}
        strategy="afterInteractive"
      />
    <div className="min-h-screen bg-[var(--background)]">
      <Header onLogout={handleLogout} isLoggingOut={isLoggingOut} />
      <main className="mx-auto max-w-5xl p-6">
        <h1 className="text-2xl font-semibold text-gray-900">設定</h1>
        <p className="mt-1 text-sm text-gray-600">教室の名前変更・引き落とし日・メンバー管理を行います。</p>

        {errorMessage && (
          <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
        )}
        {infoMessage && (
          <div className="mt-4 rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{infoMessage}</div>
        )}

        {!context ? (
          <section className="mt-8 rounded border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-medium text-gray-900">教室を作成</h2>
            <p className="mt-2 text-sm text-gray-600">まだ教室に所属していません。教室名を入力して作成してください。</p>
            <form onSubmit={handleCreateSchool} className="mt-4 flex max-w-md flex-col gap-3">
              <input
                type="text"
                value={newSchoolName}
                onChange={(e) => setNewSchoolName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-[#F8FAFC] px-3 py-2 text-sm outline-none focus:border-[#1E3A5F] focus:ring-2 focus:ring-blue-100"
                placeholder="教室名"
              />
              <button
                type="submit"
                disabled={isCreatingSchool}
                className="w-fit rounded-lg bg-[#1E3A5F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#17304D] disabled:opacity-60"
              >
                {isCreatingSchool ? "作成中..." : "教室を作成"}
              </button>
            </form>
          </section>
        ) : (
          <>
            <section className="mt-8 rounded border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-medium text-gray-900">教室名</h2>
              {context.isOwner ? (
                <form onSubmit={handleSaveSchoolName} className="mt-4 flex max-w-md flex-col gap-3">
                  <input
                    type="text"
                    value={schoolNameInput}
                    onChange={(e) => setSchoolNameInput(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-[#F8FAFC] px-3 py-2 text-sm outline-none focus:border-[#1E3A5F] focus:ring-2 focus:ring-blue-100"
                  />
                  <button
                    type="submit"
                    disabled={isSavingName}
                    className="w-fit rounded-lg bg-[#1E3A5F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#17304D] disabled:opacity-60"
                  >
                    {isSavingName ? "保存中..." : "保存する"}
                  </button>
                </form>
              ) : (
                <p className="mt-2 text-sm text-gray-700">{context.schoolName}</p>
              )}
            </section>

            <section className="mt-8 rounded border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-medium text-gray-900">引き落とし日</h2>
              <p className="mt-2 text-sm text-gray-600">
                毎月この日の午前9時（日本時間）に、未払いの請求を生徒ごとにまとめて自動引き落としします。
              </p>
              {context.isOwner ? (
                <form onSubmit={handleSaveBillingDay} className="mt-4 flex max-w-md flex-col gap-3">
                  <div>
                    <label htmlFor="billingDay" className="mb-1 block text-sm font-medium text-gray-700">
                      引き落とし日（1〜28日）
                    </label>
                    <input
                      id="billingDay"
                      type="number"
                      min={1}
                      max={28}
                      value={billingDayInput}
                      onChange={(e) => setBillingDayInput(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-[#F8FAFC] px-3 py-2 text-sm outline-none focus:border-[#1E3A5F] focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSavingBillingDay}
                    className="w-fit rounded-lg bg-[#1E3A5F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#17304D] disabled:opacity-60"
                  >
                    {isSavingBillingDay ? "保存中..." : "保存する"}
                  </button>
                </form>
              ) : (
                <p className="mt-2 text-sm text-gray-700">毎月{billingDayInput}日</p>
              )}
            </section>

            {/* LINE連携セクション */}
            <section className="mt-8 rounded border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-medium text-gray-900">LINE通知連携</h2>
              <p className="mt-2 text-sm text-gray-600">
                連携すると引き落とし完了時にLINEでサマリーを受け取れます。
              </p>
              {ownerLineUserId ? (
                <div className="mt-4 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#06C755]">
                    <svg viewBox="0 0 24 24" fill="white" className="h-5 w-5">
                      <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">LINE連携済み</p>
                    <p className="text-xs text-gray-500 font-mono">{ownerLineUserId.slice(0, 16)}...</p>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={!liffReady || isConnectingLine}
                  onClick={() => void handleLineConnect()}
                  className="mt-4 flex items-center gap-2 rounded-lg bg-[#06C755] px-4 py-2 text-sm font-semibold text-white hover:bg-[#05a849] disabled:opacity-60"
                >
                  <svg viewBox="0 0 24 24" fill="white" className="h-4 w-4">
                    <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
                  </svg>
                  {isConnectingLine ? "連携中..." : "LINEと連携する"}
                </button>
              )}
            </section>

            <section className="mt-8 rounded border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-medium text-gray-900">メンバー招待</h2>
              <p className="mt-2 text-sm text-gray-600">
                招待先は<strong>既に LessonBase にサインアップ済み</strong>のメールアドレスである必要があります。
              </p>
              {context.isOwner ? (
                <form onSubmit={handleInvite} className="mt-4 flex max-w-md flex-col gap-3">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-[#F8FAFC] px-3 py-2 text-sm outline-none focus:border-[#1E3A5F] focus:ring-2 focus:ring-blue-100"
                    placeholder="member@example.com"
                  />
                  <button
                    type="submit"
                    disabled={isInviting}
                    className="w-fit rounded-lg bg-[#1E3A5F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#17304D] disabled:opacity-60"
                  >
                    {isInviting ? "招待中..." : "招待する"}
                  </button>
                </form>
              ) : (
                <p className="mt-2 text-sm text-gray-500">オーナーのみ招待できます。</p>
              )}
            </section>

            <section className="mt-8 rounded border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-medium text-gray-900">メンバー一覧</h2>
              <div className="mt-4 overflow-x-auto rounded border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-[#1E3A5F]">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-white">ユーザーID</th>
                      <th className="px-3 py-2 text-left font-medium text-white">ロール</th>
                      <th className="px-3 py-2 text-left font-medium text-white">登録日</th>
                      {context.isOwner && <th className="px-3 py-2 text-left font-medium text-white">操作</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {members.map((m) => (
                      <tr key={m.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-xs text-gray-800">{m.user_id}</td>
                        <td className="px-3 py-2">{m.role}</td>
                        <td className="px-3 py-2 text-gray-600">{new Date(m.created_at).toLocaleString("ja-JP")}</td>
                        {context.isOwner && (
                          <td className="px-3 py-2">
                            {currentUserId && m.user_id !== currentUserId ? (
                              <button
                                type="button"
                                onClick={() => handleRemoveMember(m)}
                                className="rounded border border-gray-300 px-2.5 py-1 text-xs text-red-600 hover:bg-gray-50"
                              >
                                削除
                              </button>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
    </>
  );
}
