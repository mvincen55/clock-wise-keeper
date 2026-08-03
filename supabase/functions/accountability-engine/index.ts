// accountability-engine — turns tracked patterns into neutral, signed records.
//
// Actions:
//   scan   — evaluate active escalation policies, open records when a threshold
//            is crossed, and ask the member for their reason + signature.
//   sweep  — remind whoever is holding a review, then push idle reviews up the
//            chain (that hop is invisible to the member).
//
// Tone: documentation, not punishment. The record says what happened; it never
// characterizes the person.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { OFFICE_DOCTRINE } from "../_shared/office-doctrine.ts";

import { scrubMessages } from "../_shared/ai-safe.ts";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.6-flash";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Tardy = { user_id: string; entry_date: string; minutes_late: number };

/** Deterministic fallback — real numbers, zero judgment. */
function plainSummary(kind: string, rows: Tardy[], windowDays: number): string {
  if (kind !== "tardy_threshold") {
    return `${rows.length} recorded events in the last ${windowDays} days.`;
  }
  const mins = rows.map((r) => `${r.minutes_late}`).join(", ");
  const dates = rows.map((r) => r.entry_date).join(", ");
  return `${rows.length} tardies in ${windowDays} days: ${mins} minutes late, on ${dates}.`;
}

async function draftSummary(
  apiKey: string | undefined,
  kind: string,
  rows: Tardy[],
  windowDays: number,
): Promise<string> {
  const fallback = plainSummary(kind, rows, windowDays);
  if (!apiKey) return fallback;

  const facts = rows
    .map((r) => `${r.entry_date}: ${r.minutes_late} minutes late`)
    .join("\n");

  const prompt =
    `Write the factual summary line for an attendance record. This is record-keeping, not discipline.\n\n` +
    `RULES:\n` +
    `- State only the numbers and dates below. Nothing else.\n` +
    `- No judgment, no adjectives about the person, no advice, no encouragement, no consequences.\n` +
    `- Two sentences maximum. Sometimes it's school, sometimes it's traffic — the record just says what happened.\n\n` +
    `Threshold crossed: ${rows.length} occurrences within ${windowDays} days.\n` +
    `Events:\n${facts}`;

  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: scrubMessages([
          { role: "system", content: OFFICE_DOCTRINE },
          { role: "user", content: prompt },
        ], "accountability-engine"),
      }),
    });
    if (!res.ok) {
      console.error(`AI summary failed [${res.status}]: ${await res.text()}`);
      return fallback;
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    return text && text.length > 10 ? text : fallback;
  } catch (e) {
    console.error("AI summary error:", (e as Error).message);
    return fallback;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Backend not configured" }, 500);

  const admin = createClient(url, serviceKey);
  const aiKey = Deno.env.get("LOVABLE_API_KEY");

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
      const { data: pending } = await admin
        .from("accountability_reports")
        .select("id, org_id, review_due_at, subject_user_id")
        .eq("status", "awaiting_manager");

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

      // 2) Push idle reviews up the chain (owner-only visibility).
      const { data: escalated, error } = await admin.rpc(
        "sweep_accountability_escalations",
      );
      if (error) throw error;
      return json({ ok: true, reminded, escalated });
    }

    // ---- scan ----
    let policyQuery = admin
      .from("escalation_policies")
      .select("*")
      .eq("is_active", true);
    if (body.org_id) policyQuery = policyQuery.eq("org_id", body.org_id);
    else if (callerOrgIds) policyQuery = policyQuery.in("org_id", callerOrgIds);

    const { data: policies, error: polErr } = await policyQuery;
    if (polErr) throw polErr;

    let created = 0;

    for (const p of policies ?? []) {
      if (p.kind !== "tardy_threshold") continue; // other kinds ride the same engine as they land

      const since = new Date();
      since.setDate(since.getDate() - (p.threshold_window_days as number));
      const sinceStr = since.toISOString().slice(0, 10);

      const { data: tardies } = await admin
        .from("tardies")
        .select("user_id, employee_id, entry_date, minutes_late")
        .eq("org_id", p.org_id)
        .gte("entry_date", sinceStr)
        .order("entry_date", { ascending: true });

      const byUser = new Map<string, Tardy[]>();
      const empByUser = new Map<string, string>();
      for (const t of tardies ?? []) {
        const uid = t.user_id as string;
        byUser.set(uid, [...(byUser.get(uid) ?? []), t as unknown as Tardy]);
        if (t.employee_id) empByUser.set(uid, t.employee_id as string);
      }

      for (const [uid, rows] of byUser) {
        if (rows.length < (p.threshold_count as number)) continue;

        // One open record at a time, and no re-opening the same window.
        const { data: recent } = await admin
          .from("accountability_reports")
          .select("id, status, created_at")
          .eq("org_id", p.org_id)
          .eq("kind", p.kind)
          .eq("subject_user_id", uid)
          .gte("created_at", since.toISOString())
          .limit(1);
        if ((recent ?? []).length > 0) continue;

        const summary = await draftSummary(
          aiKey,
          p.kind as string,
          rows,
          p.threshold_window_days as number,
        );

        const { data: inserted, error: insErr } = await admin
          .from("accountability_reports")
          .insert({
            org_id: p.org_id,
            policy_id: p.id,
            kind: p.kind,
            subject_user_id: uid,
            subject_employee_id: empByUser.get(uid) ?? null,
            period_start: sinceStr,
            period_end: new Date().toISOString().slice(0, 10),
            summary,
            facts: { events: rows },
            status: "awaiting_member",
          })
          .select("id")
          .single();
        if (insErr) {
          console.error("report insert failed:", insErr.message);
          continue;
        }

        await admin.from("notifications").insert({
          org_id: p.org_id,
          recipient_user_id: uid,
          notification_type: "accountability_record",
          title: "A record needs your note",
          message:
            "Nothing to worry about — this is record-keeping. Add what happened in your own words and sign it, then it goes to your manager for review.",
          related_table: "accountability_reports",
          related_id: inserted.id,
        });

        created += 1;
      }
    }

    return json({ ok: true, created });
  } catch (e) {
    const msg = (e as Error).message;
    console.error("accountability-engine failed:", msg);
    return json({ error: "Accountability engine failed", details: msg }, 500);
  }
});
