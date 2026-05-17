import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

export type SupabaseAdminEnvCheck = {
  ok: boolean;
  url: string | null;
  serviceKey: string | null;
  missing: string[];
  present: Record<string, boolean>;
  /** JWT の role クレーム（anon を誤設定していないか確認用） */
  keyRole: "service_role" | "anon" | "unknown";
  supabaseUrlHost: string | null;
};

export type SchoolsTableProbe = {
  keyRole: SupabaseAdminEnvCheck["keyRole"];
  supabaseUrlHost: string | null;
  selectStar: {
    rowCount: number;
    error: { message: string; code?: string; hint?: string; details?: string } | null;
    rows: Record<string, unknown>[];
  };
  selectIdNameBillingDay: {
    rowCount: number;
    error: { message: string; code?: string; hint?: string; details?: string } | null;
    rows: { id: string; name: string; billing_day: number | null }[];
  };
};

function decodeJwtRole(apiKey: string): SupabaseAdminEnvCheck["keyRole"] {
  try {
    const parts = apiKey.split(".");
    if (parts.length < 2) return "unknown";
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as { role?: string };
    if (payload.role === "service_role") return "service_role";
    if (payload.role === "anon") return "anon";
    return "unknown";
  } catch {
    return "unknown";
  }
}

function formatSupabaseError(error: {
  message: string;
  code?: string;
  hint?: string;
  details?: string;
}) {
  return {
    message: error.message,
    code: error.code,
    hint: error.hint,
    details: error.details
  };
}

/**
 * Cron / サーバー専用 API 用。ログインユーザーがいないため SERVICE_ROLE_KEY が必要。
 * 第2引数に service_role キーを渡すと RLS をバイパスする（anon キーでは全校データは取れない）。
 */
export function checkSupabaseAdminEnv(): SupabaseAdminEnvCheck {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || null;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null;

  let supabaseUrlHost: string | null = null;
  if (url) {
    try {
      supabaseUrlHost = new URL(url).host;
    } catch {
      supabaseUrlHost = null;
    }
  }

  const present = {
    NEXT_PUBLIC_SUPABASE_URL: !!url,
    SUPABASE_SERVICE_ROLE_KEY: !!serviceKey
  };

  const missing: string[] = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");

  const keyRole = serviceKey ? decodeJwtRole(serviceKey) : "unknown";

  return {
    ok: missing.length === 0,
    url,
    serviceKey,
    missing,
    present,
    keyRole,
    supabaseUrlHost
  };
}

export function createSupabaseAdminClient() {
  const env = checkSupabaseAdminEnv();
  if (!env.ok || !env.url || !env.serviceKey) {
    return { client: null, env };
  }

  if (env.keyRole === "anon") {
    console.error(
      "[supabaseAdmin]",
      "SUPABASE_SERVICE_ROLE_KEY appears to be the anon key (JWT role=anon). Use service_role key from Supabase Dashboard."
    );
  }

  // service_role キーを第2引数に渡すだけで Supabase 側が RLS をバイパスする。
  // global.headers を上書きすると内部のヘッダー管理と競合するため設定しない。
  const client = createClient<Database>(env.url, env.serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  return { client, env };
}

/** デバッグ: schools テーブルを service role で読む（SELECT * 相当） */
export async function probeSchoolsTable(admin: SupabaseClient<Database>): Promise<SchoolsTableProbe> {
  const env = checkSupabaseAdminEnv();

  const star = await admin.from("schools").select("*");
  const withBillingDay = await admin.from("schools").select("id, name, billing_day");

  return {
    keyRole: env.keyRole,
    supabaseUrlHost: env.supabaseUrlHost,
    selectStar: {
      rowCount: star.data?.length ?? 0,
      error: star.error ? formatSupabaseError(star.error) : null,
      rows: (star.data ?? []) as Record<string, unknown>[]
    },
    selectIdNameBillingDay: {
      rowCount: withBillingDay.data?.length ?? 0,
      error: withBillingDay.error ? formatSupabaseError(withBillingDay.error) : null,
      rows: (withBillingDay.data ?? []) as { id: string; name: string; billing_day: number | null }[]
    }
  };
}

export function supabaseAdminEnvErrorPayload(env: SupabaseAdminEnvCheck, route?: string) {
  return {
    route: route ?? "unknown",
    error:
      "Supabase のサーバー用キーが不足しています。Vercel の環境変数に SUPABASE_SERVICE_ROLE_KEY を追加してください（Cron はユーザーの JWT がないため必須です）。",
    stage: "env_supabase_admin",
    missing: env.missing,
    details: {
      ...env.present,
      keyRole: env.keyRole,
      supabaseUrlHost: env.supabaseUrlHost
    },
    hint:
      env.keyRole === "anon"
        ? "SUPABASE_SERVICE_ROLE_KEY に anon キーが入っています。service_role（secret）に差し替えてください。"
        : "Supabase ダッシュボード → Project Settings → API → service_role（secret）をコピーし、NEXT_PUBLIC_ は付けずに SUPABASE_SERVICE_ROLE_KEY として設定してください。"
  };
}
