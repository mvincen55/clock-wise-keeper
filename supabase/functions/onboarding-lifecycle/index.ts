// onboarding-lifecycle — the daily sweep for the onboarding sign-off module.
//
// Two jobs, both implemented in SQL (_onboarding_lifecycle_sweep_internal,
// service_role only):
//   * stale scan — escalation_policies kind 'onboarding_stale' turns items
//     open past the office's threshold into ONE factual task on the manager
//     checklist (+ admin notifications);
//   * completion — when every item is dual-signed and every scheduled
//     review is checked off, write the completion entry to the employee's
//     HR file (accountability_reports) and mark the instance complete.
//
// Auth mirrors accountability-engine: the cron proves itself with the
// service-role bearer; a signed-in caller must be an owner/manager (useful
// for "run it now" checks). Nothing else gets in.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Backend not configured" }, 500);

  const admin = createClient(url, serviceKey);

  const authHeader = req.headers.get("Authorization") ?? "";
  const isCron = authHeader === `Bearer ${serviceKey}`;

  if (!isCron) {
    const token = authHeader.replace("Bearer ", "");
    const { data: userData } = await admin.auth.getUser(token);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Sign in required" }, 401);
    const { data: memberships } = await admin
      .from("org_members")
      .select("org_id, role")
      .eq("user_id", uid)
      .eq("status", "active")
      .in("role", ["owner", "manager"]);
    if (!memberships?.length) {
      return json({ error: "Only an owner or manager can run this" }, 403);
    }
  }

  try {
    const { data, error } = await admin.rpc("_onboarding_lifecycle_sweep_internal");
    if (error) throw error;
    return json({ ok: true, ...(data as Record<string, unknown>) });
  } catch (e) {
    const msg = (e as Error).message;
    console.error("onboarding-lifecycle failed:", msg);
    return json({ error: "Onboarding lifecycle sweep failed", details: msg }, 500);
  }
});
