// File: src/lib/supabase.ts

import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL as string;

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. Check your .env.local file."
  );
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {

      // CRITICAL FIXES

      persistSession: true,

      autoRefreshToken: true,

      detectSessionInUrl: true,

      storageKey: "id-tracker-auth",

    },
  }
);