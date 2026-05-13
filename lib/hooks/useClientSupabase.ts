"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { getSupabase } from "@/lib/supabase";

/**
 * Returns a Supabase browser client after mount only, so `getSupabase()` is not
 * invoked during Next.js prerender/SSR when env vars may be unavailable.
 */
export function useClientSupabase(): SupabaseClient<Database> | null {
  const [client, setClient] = useState<SupabaseClient<Database> | null>(null);

  useEffect(() => {
    setClient(getSupabase());
  }, []);

  return client;
}
