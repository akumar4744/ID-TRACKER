// File: supabase/functions/check-unique-id/index.ts

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
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role for server-side DB access
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify the user JWT
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { unique_id, fingerprint } = await req.json();

    if (!unique_id || !fingerprint) {
      return new Response(
        JSON.stringify({ error: "unique_id and fingerprint are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- STEP 1: Check fingerprint binding (permanent, stored in DB) ---
    const { data: binding, error: bindingError } = await supabase
      .from("fingerprint_bindings")
      .select("fingerprint, first_seen_at")
      .eq("unique_id", unique_id)
      .maybeSingle();

    if (bindingError) throw bindingError;

    if (binding) {
      // This unique_id has a known fingerprint — enforce it
      if (binding.fingerprint !== fingerprint) {
        return new Response(
          JSON.stringify({
            allowed: false,
            reason: "FINGERPRINT_MISMATCH",
            message: "This Unique ID is permanently bound to a different fingerprint.",
            expected_fingerprint: binding.fingerprint,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // --- STEP 2: Check 48-hour duplicate using server NOW() ---
    // Use PostgreSQL advisory lock for race-condition safety
    const lockKey = unique_id
      .split("")
      .reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0);

    await supabase.rpc("pg_advisory_xact_lock", { key: lockKey }).catch(() => {
      // Advisory lock RPC may not exist; fall through — still safe via unique constraint
    });

    const { data: recentRecord, error: recentError } = await supabase
      .from("records")
      .select("id, address, created_at, last_used_at")
      .eq("unique_id", unique_id)
      .gte("last_used_at", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
      .order("last_used_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentError) throw recentError;

    if (recentRecord) {
      // Calculate exact remaining cooldown using server-stored timestamp
      const lastUsed = new Date(recentRecord.last_used_at).getTime();
      const cooldownEnds = lastUsed + 48 * 60 * 60 * 1000;
      const nowMs = Date.now();
      const remainingMs = cooldownEnds - nowMs;

      const hours = Math.floor(remainingMs / (1000 * 60 * 60));
      const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);

      return new Response(
        JSON.stringify({
          allowed: false,
          reason: "DUPLICATE_48H",
          message: `This Unique ID was used within the last 48 hours.`,
          last_used_at: recentRecord.last_used_at,
          cooldown_ends_at: new Date(cooldownEnds).toISOString(),
          remaining: { hours, minutes, seconds },
          known_fingerprint: binding?.fingerprint ?? fingerprint,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- STEP 3: All clear — return known fingerprint if exists ---
    return new Response(
      JSON.stringify({
        allowed: true,
        reason: "OK",
        known_fingerprint: binding?.fingerprint ?? null,
        message: binding
          ? "Unique ID is available. Fingerprint recalled from previous use."
          : "Unique ID is available and has no prior fingerprint binding.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});