// accountability-engine — turns tracked patterns into neutral, signed records.
//
// Actions:
//   scan   — evaluate active escalation policies, open records when a threshold
//            is crossed, and ask the member for their reason + signature.
//            Late arrivals are NOT scanned here any more: the database opens
//            an attendance incident report itself when the office's rule is
//            met (see 20260928120000_late_arrival_workflow.sql), so this scan
//            only covers kinds that have no engine yet, i.e. nothing today.
//   sweep  — remind whoever is holding a review, then push idle reviews up the
//            chain (that hop is invisible to the member). Still runs for
//            accountability records opened before the attendance workflow.
//
// Tone: documentation, not punishment. The record says what happened; it never
// characterizes the person.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * The org-scoped twin of the `sweep_accountability_escalations` database
 * function: reviews that sat past due + grace move up to the owner, who is
 * notified. Used for a signed-in admin's on-demand sweep so one office's
 * button never touches another office's records.
 */
// deno-lint-ignore no-explicit-any
async function escalateWithinOrgs(admin: any, orgIds: string[]): Promise<number> {
  if (orgIds.length === 0) return 0;
  const { data: waiting } = await admin
    .from("accountability_reports")
    .select("id, org_id, subject_user_id, review_due_at, policy_id")
    .eq("status", "awaiting_manager")
    .in("org_id", orgIds)
    .not("review_due_at", "is", null);
  let escalated = 0;
  for (const r of waiting ?? []) {
    let afterDays = 2;
    let target: string | null = "owner";
    if (r.policy_id) {
      const { data: policy } = await admin
        .from("escalation_policies")
        .select("escalate_after_days, escalate_to")
        .eq("id", r.policy_id)
        .maybeSingle();
      if (policy) {
        afterDays = Number(policy.escalate_after_days ?? 2);
        target = (policy.escalate_to as string | null) ?? "owner";
      }
    }
    if (!target) continue;
    const due = new Date(r.review_due_at as string).getTime();
    if (Date.now() < due + afterDays * 24 * 3600 * 1000) continue;

    const { error: upErr } = await admin
      .from("accountability_reports")
      .update({ status: "awaiting_owner", escalated_at: new Date().toISOString() })
      .eq("id", r.id)
      .eq("status", "awaiting_manager");
    if (upErr) throw upErr;

    const { data: owners } = await admin
      .from("org_members")
      .select("user_id")
      .eq("org_id", r.org_id)
      .eq("role", "owner")
      .eq("status", "active")
      .neq("user_id", r.subject_user_id);
    for (const o of owners ?? []) {
      await admin.from("notifications").insert({
        org_id: r.org_id,
        recipient_user_id: o.user_id,
        notification_type: "accountability_escalation",
        title: "A review has been sitting",
        message:
          "This review has sat past its due date and needs a look. The record is waiting on a sign-off.",
        related_table: "accountability_reports",
        related_id: r.id,
      });
    }
    escalated += 1;
  }
  return escalated;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Backend not configured" }, 500);

  const admin = createClient(url, serviceKey);

  let body: { action?: string; org_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const action = body.action ?? "scan";

  // Cron proves itself with the service-role bearer and nothing else. A header
  // like "Lovable-Context: cron" is trivially spoofable from outside, so it is
  // not accepted as proof. A signed-in caller must be an org admin.
  const authHeader = req.headers.get("Authorization") ?? "";
  const isCron = authHeader === `Bearer ${serviceKey}`;
  let callerOrgIds: string[] | null = null;

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
    callerOrgIds = (memberships ?? []).map((m) => m.org_id as string);
    if (callerOrgIds.length === 0) {
      return json({ error: "Only an owner or manager can run this" }, 403);
    }
  }

  try {
    if (action === "sweep") {
      // 1) Remind whoever holds the review, once per day, before it moves up.
      //    Cron sweeps every office; a signed-in admin sweeps only theirs.
      let pendingQuery = admin
        .from("accountability_reports")
        .select("id, org_id, review_due_at, subject_user_id")
        .eq("status", "awaiting_manager");
      if (callerOrgIds) pendingQuery = pendingQuery.in("org_id", callerOrgIds);
      const { data: pending } = await pendingQuery;

      let reminded = 0;
      for (const r of pending ?? []) {
        if (!r.review_due_at) continue;
        const due = new Date(r.review_due_at as string);
        const soon = due.getTime() - Date.now() < 36 * 3600 * 1000;
        if (!soon) continue;

        const { data: admins } = await admin
          .from("org_members")
          .select("user_id")
          .eq("org_id", r.org_id)
          .eq("status", "active")
          .in("role", ["owner", "manager"]);

        for (const a of admins ?? []) {
          if (a.user_id === r.subject_user_id) continue;
          const { count } = await admin
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("recipient_user_id", a.user_id)
            .eq("related_id", r.id)
            .eq("notification_type", "accountability_review_due")
            .gte("created_at", new Date(Date.now() - 22 * 3600 * 1000).toISOString());
          if ((count ?? 0) > 0) continue;

          await admin.from("notifications").insert({
            org_id: r.org_id,
            recipient_user_id: a.user_id,
            notification_type: "accountability_review_due",
            title: "A record needs your sign-off",
            message:
              `This one needs your note and sign-off by ${due.toLocaleDateString("en-US", { timeZone: "America/New_York" })} — after that it moves up.`,
            related_table: "accountability_reports",
            related_id: r.id,
          });
          reminded += 1;
        }
      }

      // 2) Push idle reviews up the chain (owner-only visibility). The
      //    database sweep is global, so only cron may run it; an admin's
      //    on-demand sweep escalates the same way but inside their org only.
      if (isCron) {
        const { data: escalated, error } = await admin.rpc(
          "sweep_accountability_escalations",
        );
        if (error) throw error;
        return json({ ok: true, reminded, escalated });
      }
      const escalated = await escalateWithinOrgs(admin, callerOrgIds ?? []);
      return json({ ok: true, reminded, escalated });
    }

    // ---- scan ----
    // A signed-in admin may only scan an office they administer. A requested
    // org_id outside that set is refused rather than silently widened.
    if (callerOrgIds && body.org_id && !callerOrgIds.includes(body.org_id)) {
      return json({ error: "That office is not yours to scan" }, 403);
    }
    let policyQuery = admin
      .from("escalation_policies")
      .select("*")
      .eq("is_active", true);
    if (body.org_id) policyQuery = policyQuery.eq("org_id", body.org_id);
    else if (callerOrgIds) policyQuery = policyQuery.in("org_id", callerOrgIds);

    const { data: policies, error: polErr } = await policyQuery;
    if (polErr) throw polErr;

    // Late arrivals no longer open accountability records here. The
    // tardy_threshold rule is evaluated by the database the moment a late
    // arrival, an excuse decision, or a correction lands, and a crossing
    // opens an attendance incident report (migration 20260928120000) with
    // its own meeting-and-signatures workflow. Scanning it here again would
    // open a second, parallel record for the same events. Records already
    // open keep moving through `sweep` until they are signed off. No other
    // kind has an engine yet, so a scan opens nothing today.
    const skipped = (policies ?? []).filter((p) => p.kind === "tardy_threshold").length;
    const created = 0;
    if (skipped > 0) {
      console.log(`scan: ${skipped} late-arrival rule(s) left to the attendance incident workflow`);
    }

    return json({ ok: true, created });
  } catch (e) {
    const msg = (e as Error).message;
    console.error("accountability-engine failed:", msg);
    return json({ error: "Accountability engine failed" }, 500);
  }
});
