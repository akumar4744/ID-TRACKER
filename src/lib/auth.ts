// File: src/lib/auth.ts

import { supabase } from "./supabase";

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "employee";
  status: "active" | "inactive" | "revoked";
  created_at: string;
  last_active: string | null;
  revoked_at: string | null;
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

// Fetch profile from DB — uses session user id directly to avoid timing issues
export async function getProfile(): Promise<UserProfile | null> {
  // Get session first — do NOT nest getUser() inside here
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData?.session?.user?.id;

  if (!userId) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, status, created_at, last_active, revoked_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("getProfile error:", error.message);
    return null;
  }

  return data as UserProfile | null;
}

// Called periodically to keep last_active fresh (heartbeat)
export async function pingLastActive() {
  await supabase.rpc("update_last_active");
}