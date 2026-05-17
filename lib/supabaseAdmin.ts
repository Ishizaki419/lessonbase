import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

export type SupabaseAdminEnvCheck = {
  ok: boolean;
  url: string | null;
  serviceKey: string | null;
  missing: string[];
  present: Record<string, boolean>;
};

/**
 * Cron / サーバー専用 API 用。ログインユーザーがいないため SERVICE_ROLE_KEY が必要。
 * ANON_KEY だけでは RLS により全校・全生徒のデータにアクセスできない。
 */
export function checkSupabaseAdminEnv(): SupabaseAdminEnvCheck {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || null;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null;

  const present = {
    NEXT_PUBLIC_SUPABASE_URL: !!url,
    SUPABASE_SERVICE_ROLE_KEY: !!serviceKey
  };

  const missing: string[] = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");

  return {
    ok: missing.length === 0,
    url,
    serviceKey,
    missing,
    present
  };
}

export function createSupabaseAdminClient() {
  const env = checkSupabaseAdminEnv();
  if (!env.ok || !env.url || !env.serviceKey) {
    return { client: null, env };
  }

  const client = createClient<Database>(env.url, env.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  return { client, env };
}

export function supabaseAdminEnvErrorPayload(env: SupabaseAdminEnvCheck) {
  return {
    error:
      "Supabase のサーバー用キーが不足しています。Vercel の環境変数に SUPABASE_SERVICE_ROLE_KEY を追加してください（Cron はユーザーの JWT がないため必須です）。",
    stage: "env_supabase_admin",
    missing: env.missing,
    details: env.present,
    hint:
      "Supabase ダッシュボード → Project Settings → API → service_role（secret）をコピーし、NEXT_PUBLIC_ は付けずに SUPABASE_SERVICE_ROLE_KEY として設定してください。"
  };
}
