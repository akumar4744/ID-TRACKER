// File: supabase/functions/delete-employee/index.ts
// Completes the deletion by removing the auth.users entry.
// Called by frontend AFTER delete_employee RPC succeeds.

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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify caller is admin
    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data: { user: caller }, error: callerErr } =
      await callerClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (callerErr || !caller) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerProfile } = await adminClient
      .from("profiles").select("role").eq("id", caller.id).maybeSingle();
    if (!callerProfile || callerProfile.role !== "admin") {
      return new Response(JSON.stringify({ ok: false, error: "Admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { p_target_id } = await req.json();
    if (!p_target_id) {
      return new Response(JSON.stringify({ ok: false, error: "p_target_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify profile is already marked deleted by the RPC
    const { data: profile } = await adminClient
      .from("profiles").select("status").eq("id", p_target_id).maybeSingle();
    if (!profile || profile.status !== "deleted") {
      return new Response(
        JSON.stringify({ ok: false, error: "Profile must be deleted via RPC first" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Hard-delete auth user
    const { error: deleteErr } = await adminClient.auth.admin.deleteUser(p_target_id);
    if (deleteErr) {
      return new Response(JSON.stringify({ ok: false, error: deleteErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});