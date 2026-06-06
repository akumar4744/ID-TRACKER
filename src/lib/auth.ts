// File: src/lib/auth.ts

import { supabase } from "./supabase";

export interface UserProfile {
  id:          string;
  email:       string;
  full_name:   string;
  role:        "admin" | "employee";
  status:      "active" | "inactive" | "revoked";
  created_at:  string;
  last_active: string | null;
  revoked_at:  string | null;
  is_owner:    boolean;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// Fetch profile from DB — uses session user id directly to avoid timing issues.
// Tolerates a missing `is_owner` column (older DBs that haven't run the
// ownership migration yet) so login isn't blocked by a schema mismatch.
export async function getProfile(): Promise<UserProfile | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData?.session?.user?.id;
  if (!userId) return null;

  // Try the full select first
  let { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, status, created_at, last_active, revoked_at, is_owner")
    .eq("id", userId)
    .maybeSingle();

  // If is_owner column doesn't exist, retry without it
  if (error && /is_owner/i.test(error.message)) {
    const retry = await supabase
      .from("profiles")
      .select("id, email, full_name, role, status, created_at, last_active, revoked_at")
      .eq("id", userId)
      .maybeSingle();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    console.error("getProfile error:", error.message);
    return null;
  }

  const profile = data as (UserProfile & { is_owner?: boolean }) | null;
  if (profile && typeof profile.is_owner === "undefined") profile.is_owner = false;
  return profile as UserProfile | null;
}

// Heartbeat
export async function pingLastActive() {
  await supabase.rpc("update_last_active");
}
