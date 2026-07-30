// integrity-report — the only door the client has into the security log.
//
// Members can never insert security_events directly (RLS blocks it). The app
// calls here when it observes a system-level signal: repeated failed sign-ins,
// a destructive admin action, an after-close deposit edit, a punch-edit spree.
//
// NEVER send message content, AI conversation text, or patient data here.
// Payloads carry counters, record ids, and signal names only.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  adminClient,
  logSecurityEvent,
  maskEmail,
  type SecurityEventKind,
} from "../_shared/integrity.ts";

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

const AUTHED_KINDS: SecurityEventKind[] = [
  "destructive_action",
  "deposit_discrepancy",
  "time_anomaly",
  "function_abuse",
];

const bounded = (v: unknown, cap: number) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, cap) : "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Fails open in every branch: the caller's real work already happened.
  try {
    const body = (await req.json()) as {
      kind?: string;
      signal?: string;
      severity?: string;
      summary?: string;
      detail?: Record<string, unknown>;
      email?: string;
    };

    const kind = bounded(body.kind, 40) as SecurityEventKind;
    const signal = bounded(body.signal, 60) || kind;
    const severity = body.severity === "elevated" ? "elevated" : "watch";
    const summary = bounded(body.summary, 300) || `Integrity signal: ${signal}`;
    const detail: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body.detail ?? {})) {
      if (Object.keys(detail).length >= 12) break;
      if (typeof v === "number" || typeof v === "boolean") detail[k] = v;
      else if (typeof v === "string") detail[k] = v.slice(0, 200);
    }
    detail.signal = signal;

    const admin = adminClient();

    // --- Unauthenticated path: sign-in / allowlist probing only ---
    if (kind === "auth_abuse") {
      const email = bounded(body.email, 200).toLowerCase();
      let orgId: string | null = null;

      if (email) {
        const { data: profile } = await admin
          .from("profiles")
          .select("id")
          .ilike("email", email)
          .maybeSingle();
        if (profile?.id) {
          const { data: membership } = await admin
            .from("org_members")
            .select("org_id")
            .eq("user_id", profile.id)
            .eq("status", "active")
            .maybeSingle();
          orgId = membership?.org_id ?? null;
        }
      }
      if (!orgId) {
        const { data: orgs } = await admin.from("orgs").select("id").limit(2);
        if ((orgs ?? []).length === 1) orgId = orgs![0].id as string;
      }
      if (!orgId) return json({ ok: true, recorded: false });

      await logSecurityEvent(admin, {
        orgId,
        kind: "auth_abuse",
        severity,
        detail: { ...detail, account: maskEmail(email) },
        fingerprintParts: [signal, maskEmail(email), new Date().toISOString().slice(0, 10)],
        summary,
      });
      return json({ ok: true, recorded: true });
    }

    if (!AUTHED_KINDS.includes(kind)) return json({ ok: true, recorded: false });

    // --- Authenticated path ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: true, recorded: false });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ ok: true, recorded: false });

    const { data: membership } = await admin
      .from("org_members")
      .select("org_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    if (!membership?.org_id) return json({ ok: true, recorded: false });

    await logSecurityEvent(admin, {
      orgId: membership.org_id,
      actorUserId: user.id,
      kind,
      severity,
      detail,
      fingerprintParts: [signal, user.id, new Date().toISOString().slice(0, 13)],
      summary,
    });

    return json({ ok: true, recorded: true });
  } catch (err) {
    console.error("integrity-report error", err);
    return json({ ok: true, recorded: false });
  }
});
