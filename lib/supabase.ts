import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let _supabase: ReturnType<typeof createClient> | null = null;

export function getSupabase() {
  // Avoid throwing at import time (e.g. during build) to keep CI/Vercel logs readable.
  // If env vars are missing at runtime, pages that use Supabase should fail fast.
  if (_supabase) return _supabase;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
  _supabase = createClient(supabaseUrl, supabaseAnonKey);
  return _supabase;
}

