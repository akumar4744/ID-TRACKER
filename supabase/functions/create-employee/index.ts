// File: supabase/functions/create-employee/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Service role client (admin powers — never exposed to frontend) ──────
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // ── Verify the calling user is an admin (check their profile) ───────────
    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data: { user: caller }, error: callerErr } =
      await callerClient.auth.getUser(authHeader.replace("Bearer ", ""));

    if (callerErr || !caller) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check caller role in profiles table
    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .maybeSingle();

    if (!callerProfile || callerProfile.role !== "admin") {
      return new Response(JSON.stringify({ ok: false, error: "Only admins can create employees" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Parse request body ───────────────────────────────────────────────────
    const { p_email, p_password, p_full_name } = await req.json();

    if (!p_email || !p_password || !p_full_name) {
      return new Response(JSON.stringify({ ok: false, error: "All fields are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (p_password.length < 6) {
      return new Response(JSON.stringify({ ok: false, error: "Password must be at least 6 characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Check email not already taken ────────────────────────────────────────
    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("id")
      .eq("email", p_email.trim().toLowerCase())
      .maybeSingle();

    if (existingProfile) {
      return new Response(JSON.stringify({ ok: false, error: "Email already exists" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Create auth user using Supabase Admin API (no pgcrypto needed) ───────
    const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
      email:             p_email.trim().toLowerCase(),
      password:          p_password,
      email_confirm:     true,   // skip email confirmation — admin is creating this
      user_metadata:     { full_name: p_full_name.trim() },
    });

    if (createErr || !newUser?.user) {
      return new Response(
        JSON.stringify({ ok: false, error: createErr?.message ?? "Failed to create auth user" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const newUserId = newUser.user.id;

    // ── Create profile row ────────────────────────────────────────────────────
    const { error: profileErr } = await adminClient.from("profiles").insert({
      id:          newUserId,
      email:       p_email.trim().toLowerCase(),
      full_name:   p_full_name.trim(),
      role:        "employee",
      status:      "active",
      created_by:  caller.id,
    });

    if (profileErr) {
      // Rollback: delete the auth user we just created
      await adminClient.auth.admin.deleteUser(newUserId);
      return new Response(
        JSON.stringify({ ok: false, error: "Profile creation failed: " + profileErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, user_id: newUserId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("create-employee error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});