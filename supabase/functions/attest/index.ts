// attest — the PIN attestation primitive's single write path.
//
// Input: employee id + PIN + action type + a reference to what is being
// confirmed. The PIN is verified SERVER-SIDE (_verify_employee_pin_internal,
// service_role only), lockout included, and on success THIS function writes
// the attestation row. Clients hold no insert path on `attestations` at all
// — see migration 20260825120000_pin_attestation.sql.
//
// Reusable by design: any feature can pass its own action_type and target
// reference. Feature-specific side effects (e.g. stamping an onboarding
// sign-off row) register in APPLIERS below and run server-side, so clients
// can never wire an attestation into the wrong row.
//
// Employment/business data only. The PIN itself is never logged.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PIN_RE = /^[0-9]{4,8}$/;
const ACTION_RE = /^[a-z0-9_]{3,64}$/;
const TABLE_RE = /^[a-z_]{1,64}$/;

type AttestationRow = {
  id: string;
  org_id: string;
  employee_id: string;
  action_type: string;
  related_table: string;
  related_id: string;
  payload: Record<string, unknown>;
  attested_at: string;
};

/**
 * Server-side per-action side effects, keyed by action_type. An applier runs
 * AFTER the attestation row is written and must be idempotent. Features add
 * their applier here; an action type with no applier is still a valid,
 * recorded attestation.
 */
const APPLIERS: Record<
  string,
  (admin: SupabaseClient, attestation: AttestationRow) => Promise<{ error?: string }>
> = {
  // Onboarding dual sign-off: the private SQL core decides the SIDE from who
  // attested (the instance's employee = trainee, anyone else = trainer) and
  // stamps the item — the client never wires an attestation into a row.
  onboarding_item_signoff: async (admin, attestation) => {
    const { data, error } = await admin.rpc("_apply_onboarding_signoff_internal", {
      _attestation_id: attestation.id,
    });
    if (error) return { error: error.message };
    const verdict = data as { applied?: boolean; error?: string } | null;
    if (!verdict?.applied) return { error: verdict?.error ?? "Could not record the sign-off" };
    return {};
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Not authenticated" }, 401);

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch (_) {
      return json({ error: "Invalid request body" }, 400);
    }

    const employeeId = typeof body.employee_id === "string" ? body.employee_id : "";
    const pin = typeof body.pin === "string" ? body.pin : "";
    const actionType = typeof body.action_type === "string" ? body.action_type : "";
    const relatedTable = typeof body.related_table === "string" ? body.related_table : "";
    const relatedId = typeof body.related_id === "string" ? body.related_id : "";
    const payload =
      body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
        ? (body.payload as Record<string, unknown>)
        : {};

    if (!UUID_RE.test(employeeId)) return json({ error: "employee_id is required" }, 400);
    if (!ACTION_RE.test(actionType)) return json({ error: "action_type is required" }, 400);
    if (!TABLE_RE.test(relatedTable)) return json({ error: "related_table is required" }, 400);
    if (!UUID_RE.test(relatedId)) return json({ error: "related_id is required" }, 400);
    if (JSON.stringify(payload).length > 4000) return json({ error: "payload too large" }, 400);
    if (!PIN_RE.test(pin)) {
      // Format failures never reach the counter — only real wrong PINs do.
      return json({ code: "wrong_pin", error: "A sign-off PIN is 4-8 digits" }, 403);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const asUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userError } = await asUser.auth.getUser();
    if (userError || !user) return json({ error: "Not authenticated" }, 401);

    // Org identity comes from the caller's active membership, never the client.
    const { data: membership } = await admin
      .from("org_members")
      .select("org_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (!membership) return json({ error: "No active membership" }, 403);
    const orgId = membership.org_id as string;

    // The person attesting must be an active employee of the SAME org the
    // terminal session belongs to.
    const { data: employee } = await admin
      .from("employees")
      .select("id, org_id, employment_status")
      .eq("id", employeeId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (!employee || employee.employment_status !== "active") {
      return json({ error: "Employee not found" }, 404);
    }

    const { data: verdict, error: verifyError } = await admin.rpc(
      "_verify_employee_pin_internal",
      { _employee_id: employeeId, _pin: pin },
    );
    if (verifyError) {
      console.error("PIN verification failed", { error: verifyError.message });
      return json({ error: "Could not verify the PIN" }, 500);
    }

    const status = (verdict as Record<string, unknown>)?.status;
    if (status === "no_pin") {
      return json(
        { code: "no_pin", error: "No sign-off PIN is set for this team member yet" },
        409,
      );
    }
    if (status === "locked") {
      return json(
        {
          code: "locked",
          locked_until: (verdict as Record<string, unknown>).locked_until,
          error: "Too many wrong attempts — this PIN is temporarily locked",
        },
        403,
      );
    }
    if (status !== "ok") {
      return json(
        {
          code: "wrong_pin",
          attempts_remaining: (verdict as Record<string, unknown>).attempts_remaining,
          error: "That PIN is not right",
        },
        403,
      );
    }

    const { data: attestation, error: insertError } = await admin
      .from("attestations")
      .insert({
        org_id: orgId,
        employee_id: employeeId,
        session_user_id: user.id,
        action_type: actionType,
        related_table: relatedTable,
        related_id: relatedId,
        payload,
        verified: true,
      })
      .select("id, org_id, employee_id, action_type, related_table, related_id, payload, attested_at")
      .single();
    if (insertError || !attestation) {
      console.error("attestation insert failed", { error: insertError?.message });
      return json({ error: "Could not record the attestation" }, 500);
    }

    const applier = APPLIERS[actionType];
    if (applier) {
      const { error: applyError } = await applier(admin, attestation as AttestationRow);
      if (applyError) {
        // The attestation row stands (the confirmation happened); the caller
        // is told the follow-through did not, so the UI can surface it.
        console.error("attestation applier failed", { action: actionType, error: applyError });
        return json(
          { verified: true, attestation_id: attestation.id, applied: false, error: applyError },
          500,
        );
      }
    }

    return json({
      verified: true,
      attestation_id: attestation.id,
      attested_at: attestation.attested_at,
      applied: Boolean(applier),
    });
  } catch (e) {
    console.error("attest error", { error: (e as Error)?.message });
    return json({ error: "Unexpected error" }, 500);
  }
});
