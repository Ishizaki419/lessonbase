import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

/**
 * Route Handler 用: ユーザーの JWT で Supabase を呼び出し、RLS が効いたまま DB にアクセスする。
 * SERVICE_ROLE_KEY は不要（Cron などサーバー専用処理以外ではこちらを使う）。
 */
export function createSupabaseRouteClient(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return null;
  }
  return createClient<Database>(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
