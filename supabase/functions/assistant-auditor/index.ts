// Assistant auditor: a second AI whose only job is checking that what the
// office has taught the assistant is CONSISTENT and FILED IN THE RIGHT
// PLACE. It never answers questions and never talks to staff — it writes
// findings a manager reviews on the Ask AI → Memory & Audit tab.
//
// Three checks:
//
//   1. memory_contradiction — two active memories that cannot both be true.
//      (Saves are already gated one-at-a-time in kimi-agent; this catches
//      pairs that drifted apart over time, or that predate the gate.)
//
//   2. note_misfiled — a code note in the wrong home. Two homes exist and
//      the distinction is the whole point:
//        OFFICE schedule  → universal, applies to every patient
//        CARRIER schedule → applies only when billing that code to that
//                           insurance
//      So: universal guidance stranded on one carrier (invisible for
//      everyone else), or carrier-specific guidance sitting on the office
//      schedule (wrongly applied to every patient).
//
//   3. code_fact_in_memory — knowledge about a specific procedure code
//      kept as chat memory, when it belongs on that code's fee row.
//
// Findings are fingerprinted, so a nightly run never re-reports something
// already open or already cleared. Read-only with respect to office
// configuration: it proposes fixes, it does not apply them.
//
// Auth: any active org member may run it (it only reads their own org's
// data via RLS and writes findings). Managers are the ones who act on it.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadCodeNotes, type CodeNote } from "../_shared/procedure-notes.ts";

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

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_CHECK_MODEL = "moonshotai/kimi-k2.6";

const MAX_MEMORIES = 120;
const MAX_NOTES = 120;

const bounded = (value: unknown, cap: number): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, cap) : "";

/** Stable key so a re-run doesn't duplicate an open or cleared finding. */
function fingerprint(parts: string[]): string {
  const joined = parts.join("|").toLowerCase();
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < joined.length; i++) {
    const c = joined.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16)}${h2.toString(16)}`;
}

interface Memory {
  id: string;
  kind: string;
  content: string;
}

interface Finding {
  kind: string;
  severity: string;
  title: string;
  detail: string;
  memory_id?: string | null;
  suggested_action?: Record<string, unknown> | null;
  fingerprint: string;
}

async function askChecker(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  maxTokens = 1500
  // deno-lint-ignore no-explicit-any
): Promise<any | null> {
  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/mvincen55/clock-wise-keeper",
        "X-Title": "TimeVault Assistant Auditor",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature: 0,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      console.error("auditor model error", response.status, (await response.text()).slice(0, 300));
      return null;
    }
    const data = await response.json();
    const raw: string = data?.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch (err) {
    console.error("auditor model call failed:", err);
    return null;
  }
}

/** Check 1 — memories that cannot both be true. */
async function auditContradictions(
  apiKey: string,
  model: string,
  memories: Memory[]
): Promise<Finding[]> {
  if (memories.length < 2) return [];
  const numbered = memories.map((m, i) => `${i + 1}. ${m.content}`).join("\n");
  const result = await askChecker(
    apiKey,
    model,
    "You audit a dental office's standing facts for CONTRADICTIONS — pairs that cannot both be true at once " +
      "(a changed number, time, price, rule, or a direct reversal). " +
      "NOT contradictions: one fact adding detail to another; facts about different subjects; a narrower case " +
      "of a general rule; the same fact reworded. Be conservative — only real, direct clashes. " +
      'Reply with ONLY JSON: {"conflicts":[{"a":<number>,"b":<number>,"explanation":"<one sentence>"}]} ' +
      "and an empty array when the facts are consistent.",
    `FACTS:\n${numbered}`
  );
  const conflicts = Array.isArray(result?.conflicts) ? result.conflicts : [];
  const findings: Finding[] = [];
  const seen = new Set<string>();
  for (const c of conflicts) {
    const a = Number(c?.a);
    const b = Number(c?.b);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a === b) continue;
    if (a < 1 || b < 1 || a > memories.length || b > memories.length) continue;
    const ma = memories[a - 1];
    const mb = memories[b - 1];
    const pairKey = [ma.id, mb.id].sort().join(":");
    if (seen.has(pairKey)) continue;
    seen.add(pairKey);
    findings.push({
      kind: "memory_contradiction",
      severity: "high",
      title: "Two things I was told disagree",
      detail: `"${ma.content}" vs "${mb.content}" — ${bounded(c?.explanation, 300)}`,
      memory_id: mb.id,
      suggested_action: { type: "resolve_memory_conflict", pending_id: mb.id, existing_id: ma.id },
      fingerprint: fingerprint(["contradiction", pairKey]),
    });
  }
  return findings;
}

/** Check 2 — code notes sitting in the wrong home. */
async function auditNotePlacement(
  apiKey: string,
  model: string,
  notes: CodeNote[],
  officeScheduleId: string | null
): Promise<Finding[]> {
  if (notes.length === 0) return [];
  const listed = notes
    .map(
      (n, i) =>
        `${i + 1}. [${n.code}] on "${n.scheduleName}" (${
          n.scheduleKind === "office" ? "OFFICE/universal" : "CARRIER/insurance-specific"
        }): ${n.notes}`
    )
    .join("\n");
  const result = await askChecker(
    apiKey,
    model,
    "You audit where a dental office files its notes about procedure codes. There are exactly two correct homes:\n" +
      "- OFFICE schedule: guidance true for EVERY patient regardless of insurance (how the office words things, " +
      "what a procedure includes, sequencing, lab/delivery policy, clinical preferences).\n" +
      "- CARRIER schedule: guidance that only applies when billing that code to that specific insurance " +
      "(downgrades, narrative or x-ray requirements, frequency limits, that carrier's allowables or quirks).\n\n" +
      "Report a note ONLY when it is clearly in the wrong home:\n" +
      "- misplaced_universal: it sits on a CARRIER schedule but names no carrier-specific rule — it is general " +
      "guidance every patient needs, currently invisible unless that carrier is in play.\n" +
      "- misplaced_carrier: it sits on the OFFICE schedule but describes one insurer's rule (it names a carrier, " +
      "or describes downgrades/narratives/frequency limits) — it would wrongly be applied to every patient.\n\n" +
      "A note mentioning a carrier by way of contrast is fine. When unsure, do not report it. " +
      'Reply with ONLY JSON: {"misfiled":[{"index":<number>,"problem":"misplaced_universal"|"misplaced_carrier",' +
      '"explanation":"<one sentence>"}]}',
    `NOTES:\n${listed}`
  );
  const misfiled = Array.isArray(result?.misfiled) ? result.misfiled : [];
  const findings: Finding[] = [];
  for (const m of misfiled) {
    const index = Number(m?.index);
    if (!Number.isInteger(index) || index < 1 || index > notes.length) continue;
    const note = notes[index - 1];
    const problem = m?.problem === "misplaced_carrier" ? "misplaced_carrier" : "misplaced_universal";
    // Only the universal case has an unambiguous destination (the office
    // schedule). Moving the other way needs a human to say WHICH carrier.
    const canAutoTarget = problem === "misplaced_universal" && officeScheduleId !== null;
    findings.push({
      kind: "note_misfiled",
      severity: "medium",
      title:
        problem === "misplaced_universal"
          ? `${note.code}: general guidance is stuck on "${note.scheduleName}"`
          : `${note.code}: an insurance-specific rule is on the office schedule`,
      detail:
        `"${note.notes}" — ${bounded(m?.explanation, 300)} ` +
        (problem === "misplaced_universal"
          ? "As filed it only applies to that carrier's patients; on the office schedule it would apply to everyone."
          : "As filed it applies to every patient; it should sit on the schedule for the insurance it describes."),
      suggested_action: canAutoTarget
        ? {
            type: "move_note",
            code: note.code,
            note: note.notes,
            from_schedule_id: note.scheduleId,
            to_schedule_id: officeScheduleId,
          }
        : { type: "review_note", code: note.code, schedule_id: note.scheduleId },
      fingerprint: fingerprint(["misfiled", note.scheduleId, note.code, note.notes]),
    });
  }
  return findings;
}

/** Check 3 — code knowledge kept as chat memory instead of a fee note. */
function auditCodeFactsInMemory(memories: Memory[], notes: CodeNote[]): Finding[] {
  const findings: Finding[] = [];
  for (const memory of memories) {
    const codes = [...new Set((memory.content.toUpperCase().match(/\bD\d{4}\b/g) ?? []))];
    if (codes.length === 0 || codes.length > 3) continue;
    // Already documented against every code it names? Then it's fine.
    const undocumented = codes.filter((code) => !notes.some((n) => n.code === code));
    if (undocumented.length === 0) continue;
    findings.push({
      kind: "code_fact_in_memory",
      severity: "low",
      title: `${undocumented.join(", ")}: knowledge is in chat memory, not on the fee schedule`,
      detail: `"${memory.content}" — procedure knowledge belongs on the code's fee-schedule row, where the team sees it too. Keep it as a note on the office schedule if it is true for every patient, or on a carrier's schedule if it only applies to that insurance.`,
      memory_id: memory.id,
      suggested_action: { type: "file_code_note", codes: undocumented, memory_id: memory.id },
      fingerprint: fingerprint(["codefact", memory.id, undocumented.join(",")]),
    });
  }
  return findings;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!apiKey) {
      return json({ error: "The auditor needs the OPENROUTER_API_KEY secret (see docs/kimi-assistant.md)." });
    }
    const model = Deno.env.get("OPENROUTER_CHECK_MODEL") ?? DEFAULT_CHECK_MODEL;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const { data: membership } = await supabase
      .from("org_members")
      .select("org_id, role")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (!membership) return json({ error: "Unauthorized" }, 403);

    const [memoriesRes, notes, schedulesRes] = await Promise.all([
      supabase
        .from("assistant_memories")
        .select("id, kind, content")
        .eq("org_id", membership.org_id)
        .eq("is_active", true)
        .eq("status", "active")
        .order("created_at", { ascending: true })
        .limit(MAX_MEMORIES),
      loadCodeNotes(supabase, MAX_NOTES),
      supabase.from("fee_schedules").select("id, kind").eq("is_active", true),
    ]);
    const memories = ((memoriesRes.data ?? []) as Memory[]).map((m) => ({
      id: m.id,
      kind: m.kind,
      content: bounded(m.content, 500),
    }));
    const officeScheduleId =
      ((schedulesRes.data ?? []) as { id: string; kind: string }[]).find((s) => s.kind === "office")?.id ??
      null;

    const [contradictions, misfiled] = await Promise.all([
      auditContradictions(apiKey, model, memories),
      auditNotePlacement(apiKey, model, notes, officeScheduleId),
    ]);
    const findings = [...contradictions, ...misfiled, ...auditCodeFactsInMemory(memories, notes)];

    // Upsert on the partial unique index: an already-open finding is left
    // alone, and one the manager dismissed does not come back.
    let recorded = 0;
    for (const finding of findings) {
      const { data: existing } = await supabase
        .from("assistant_audit_findings")
        .select("id")
        .eq("org_id", membership.org_id)
        .eq("fingerprint", finding.fingerprint)
        .limit(1)
        .maybeSingle();
      if (existing) continue;
      const { error } = await supabase.from("assistant_audit_findings").insert({
        org_id: membership.org_id,
        kind: finding.kind,
        severity: finding.severity,
        title: finding.title,
        detail: finding.detail,
        memory_id: finding.memory_id ?? null,
        suggested_action: finding.suggested_action ?? null,
        fingerprint: finding.fingerprint,
      });
      if (!error) recorded++;
    }

    const { count: openCount } = await supabase
      .from("assistant_audit_findings")
      .select("id", { count: "exact", head: true })
      .eq("org_id", membership.org_id)
      .eq("status", "open");

    return json({
      checked: { memories: memories.length, codeNotes: notes.length },
      found: findings.length,
      recorded,
      openTotal: openCount ?? 0,
    });
  } catch (err) {
    console.error("assistant-auditor error:", err);
    return json({ error: "The audit could not finish. Try again in a moment." });
  }
});
