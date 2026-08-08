// sprint-architect — builds grounded sprint suggestions for a manager, on demand.
//
// Two actions, both owner/manager only:
//   ideas   — 3-5 sprint suggestions for a chosen audience, grounded in what is
//             actually happening in this office: closeout trends, schedule
//             utilization, staffing strain, sprint history, and the office's
//             own recorded rules. Also surfaces (separately) an operational
//             concern when the deterministic signal layer found a real pattern.
//   rewards — a handful of inexpensive, practical reward ideas sized to the group.
//
// The lines it will not cross:
//   - Office policy outranks any metric. A suggestion may never bend a recorded
//     rule to move a number.
//   - Signals are computed in code (sprint-signals.ts), never by the model. The
//     model phrases; it does not diagnose. A concern can only be returned when
//     the deterministic layer actually found one — one odd data point is not a
//     pattern, and the model cannot invent one.
//   - Problems get named, people do not. A metric living in someone's column is
//     not proof they caused it.
//   - Verification suggestions stay inside what the system truly supports:
//     honor, manager approval, or the document read. Nothing is promised that
//     the app cannot actually verify.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { OFFICE_DOCTRINE } from "../_shared/office-doctrine.ts";
import { logScrub, scrubFreeText } from "../_shared/phi-scrub.ts";
import { guardAiInput, JAILBREAK_REFUSAL } from "../_shared/jailbreak-guard.ts";
import {
  type DailyCloseout,
  detectSignals,
  type ProviderDayRow,
  rollupWeeks,
} from "../_shared/sprint-signals.ts";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.6-flash";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const bounded = (value: unknown, cap: number): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, cap) : "";

/** Staff-authored text gets scrubbed on the way to the gateway, always. */
const safe = (value: unknown, cap: number): string => {
  const r = scrubFreeText(bounded(value, cap), cap);
  logScrub("sprint-architect", r);
  return r.text;
};

function easternToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const ROLE_LABELS: Record<string, string> = {
  dentist: "Doctors",
  hygienist: "Hygienists",
  dental_assistant: "Dental assistants",
  front_desk: "Front desk",
  office_manager: "Managers",
  sterilization: "Sterilization",
  floater: "Floaters",
  other: "Other roles",
};

const VERIFICATIONS = new Set(["honor", "manager_approval", "document"]);
const PERIODS = new Set(["week", "month"]);
const CATEGORIES = new Set([
  "scheduling", "cancellations", "patient_experience", "communication",
  "handoffs", "documentation", "training", "teamwork", "financial",
  "clinical_workflow", "operations", "recognition", "other",
]);

type ChatMessage = { role: "system" | "user"; content: string };

async function callModel(
  apiKey: string,
  messages: ChatMessage[],
  maxTokens: number,
): Promise<string | null> {
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages }),
  });
  if (!res.ok) {
    console.error("sprint-architect: gateway answered", res.status);
    return null;
  }
  const data = await res.json();
  return (data?.choices?.[0]?.message?.content as string | undefined) ?? "";
}

function parseJsonBlock<T>(raw: string): T | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Sign in first." }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    );
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) return json({ error: "Sign in first." }, 401);

    const { data: membership } = await supabase
      .from("org_members")
      .select("org_id, role")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (!membership || !["owner", "manager"].includes(String(membership.role))) {
      return json({ error: "Only a manager or the owner can build sprints." }, 403);
    }
    const orgId = membership.org_id as string;

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI is not configured yet." }, 500);

    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      scope?: string;
      scope_role?: string;
      scope_department?: string;
      direction?: string;
      exclude?: unknown;
      sprint_title?: string;
    };
    const action = body.action === "rewards" ? "rewards" : "ideas";

    // --- Audience -----------------------------------------------------------
    const scope = ["team", "role", "department", "individual"].includes(body.scope ?? "")
      ? (body.scope as string)
      : "team";
    const scopeRole = scope === "role" && ROLE_LABELS[bounded(body.scope_role, 24)]
      ? bounded(body.scope_role, 24)
      : null;
    const scopeDept = scope === "department" && ["clinical", "clerical"].includes(body.scope_department ?? "")
      ? (body.scope_department as string)
      : null;
    if (scope === "role" && !scopeRole) return json({ error: "Pick a real position." }, 400);

    // Head count for the audience, from the org's actual configuration.
    const { data: roleRows } = await supabase
      .from("employee_operational_roles")
      .select("employee_id, operational_role")
      .eq("org_id", orgId);
    const roleCensus = new Map<string, Set<string>>();
    for (const r of roleRows ?? []) {
      const set = roleCensus.get(String(r.operational_role)) ?? new Set<string>();
      set.add(String(r.employee_id));
      roleCensus.set(String(r.operational_role), set);
    }
    const { count: staffCount } = await supabase
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId);

    const audienceLabel = scope === "role" && scopeRole
      ? ROLE_LABELS[scopeRole]
      : scope === "department"
      ? `${scopeDept === "clerical" ? "Clerical" : "Clinical"} team`
      : scope === "individual"
      ? "One team member"
      : "Whole team";
    const audienceSize = scope === "role" && scopeRole
      ? roleCensus.get(scopeRole)?.size ?? 0
      : scope === "individual"
      ? 1
      : staffCount ?? 0;

    // --- Rewards: quick, cheap, sized to the group --------------------------
    if (action === "rewards") {
      const title = safe(body.sprint_title, 120);
      const raw = await callModel(
        apiKey,
        [
          {
            role: "system",
            content:
              `${OFFICE_DOCTRINE}\n\n---\n\nYou suggest small, inexpensive, practical rewards a dental office ` +
              `could offer a team for winning a sprint. Think lunch on the practice, a coffee run, team breakfast, ` +
              `a small celebration. Never cash bonuses, never anything per-person competitive, never anything that ` +
              `could conflict with a workplace rule — if an idea depends on office rules (like a casual dress day), ` +
              `say "if office rules allow". Keep each idea under 8 words. ` +
              `Reply with ONLY JSON: {"rewards":[string]}`,
          },
          {
            role: "user",
            content:
              `Audience: ${audienceLabel} (about ${Math.max(1, audienceSize)} people). ` +
              `Sprint: ${title || "(not named yet)"}. Give 5 ideas.`,
          },
        ],
        250,
      );
      if (raw === null) return json({ error: "The AI could not run right now." }, 502);
      const parsed = parseJsonBlock<{ rewards?: unknown }>(raw ?? "");
      const rewards = (Array.isArray(parsed?.rewards) ? parsed!.rewards : [])
        .map((r: unknown) => bounded(r, 80))
        .filter((r) => r !== "")
        .slice(0, 6);
      return json({ rewards });
    }

    // --- Ideas --------------------------------------------------------------
    const direction = safe(body.direction, 300);
    if (
      direction &&
      (await guardAiInput({
        orgId,
        actorUserId: user.id,
        surface: "sprint-architect",
        input: direction,
      }))
    ) {
      return json({ error: JAILBREAK_REFUSAL }, 400);
    }
    const exclude = (Array.isArray(body.exclude) ? body.exclude : [])
      .map((t: unknown) => safe(t, 80))
      .filter((t) => t !== "")
      .slice(0, 20);

    const today = easternToday();
    const [sprintsRes, depositsRes, metricsRes, practiceRes, baRes, memoriesRes, itemsRes] =
      await Promise.all([
        supabase
          .from("team_goals")
          .select("title, metric, target_count, progress, status, period, scope, scope_role, scope_department, category, starts_on, ends_on")
          .eq("org_id", orgId)
          .order("created_at", { ascending: false })
          .limit(12),
        supabase
          .from("deposit_logs")
          .select("deposit_date, production_cents, hygiene_cancellations, hygiene_no_shows, doctor_cancellations, doctor_no_shows, staffing_assessment")
          .eq("org_id", orgId)
          .gte("deposit_date", addDays(today, -42))
          .order("deposit_date", { ascending: true })
          .limit(45),
        supabase
          .from("provider_day_metrics")
          .select("business_date, department, net_bookable_minutes, scheduled_minutes, true_open_minutes, cancellation_open_minutes, no_show_open_minutes")
          .eq("org_id", orgId)
          .gte("business_date", addDays(today, -28))
          .limit(200),
        supabase
          .from("org_practice_settings")
          .select("confirmation_lead_days")
          .eq("org_id", orgId)
          .maybeSingle(),
        supabase
          .from("broken_appt_settings")
          .select("notice_business_hours, fee_amount")
          .eq("org_id", orgId)
          .maybeSingle(),
        supabase
          .from("assistant_memories")
          .select("content")
          .eq("org_id", orgId)
          .eq("kind", "office")
          .eq("is_active", true)
          .eq("status", "active")
          .order("created_at", { ascending: true })
          .limit(30),
        supabase
          .from("knowledge_items")
          .select("current_published_version_id")
          .eq("org_id", orgId)
          .is("archived_at", null)
          .not("current_published_version_id", "is", null)
          .limit(30),
      ]);

    // Deterministic signal pass — the numbers come from code, not the model.
    const weeks = rollupWeeks((depositsRes.data ?? []) as DailyCloseout[]);
    const signals = detectSignals(weeks, (metricsRes.data ?? []) as ProviderDayRow[]);
    const hasRealConcern = signals.some((s) => s.concernLevel === "concern");

    const sprints = sprintsRes.data ?? [];
    const liveSprints = sprints.filter(
      (s) => s.status === "active" || s.status === "pending_verification",
    );
    const pastSprints = sprints.filter(
      (s) => !["active", "pending_verification"].includes(String(s.status)),
    );

    const sprintLine = (s: Record<string, unknown>) => {
      const who = s.scope === "role"
        ? ROLE_LABELS[String(s.scope_role)] ?? String(s.scope_role)
        : s.scope === "department"
        ? `${s.scope_department} team`
        : s.scope === "individual"
        ? "one person"
        : "whole team";
      return `"${safe(s.title, 80)}" (${who}${s.category ? `, ${s.category}` : ""}): ` +
        `${s.progress}/${s.target_count} ${safe(s.metric, 80)} — ${s.status}, ended ${s.ends_on}`;
    };

    const rulesLines: string[] = [];
    const lead = practiceRes.data?.confirmation_lead_days;
    if (lead != null) {
      rulesLines.push(`Confirmation window: appointments are confirmed ${lead} day(s) ahead.`);
    }
    if (baRes.data) {
      rulesLines.push(
        `Broken-appointment policy: ${baRes.data.notice_business_hours} business hours' notice ` +
          `to cancel or reschedule; $${Number(baRes.data.fee_amount)} scheduling fee.`,
      );
    }
    for (const m of memoriesRes.data ?? []) {
      const line = safe(m.content, 240);
      if (line) rulesLines.push(`Office rule/memory: ${line}`);
    }
    const versionIds = (itemsRes.data ?? [])
      .map((i) => i.current_published_version_id as string | null)
      .filter((id): id is string => !!id);
    if (versionIds.length > 0) {
      const { data: versions } = await supabase
        .from("knowledge_versions")
        .select("title, summary")
        .in("id", versionIds)
        .eq("status", "published");
      for (const v of versions ?? []) {
        rulesLines.push(`Published policy "${safe(v.title, 100)}": ${safe(v.summary, 200)}`);
      }
    }

    const rolesConfigured = [...roleCensus.entries()]
      .map(([role, ids]) => `${ROLE_LABELS[role] ?? role}: ${ids.size}`)
      .join(", ");

    const facts = [
      `TODAY: ${today}.`,
      `AUDIENCE: ${audienceLabel} (about ${Math.max(1, audienceSize)} people). ` +
        `Roles configured in this office — ${rolesConfigured || "none recorded"}.`,
      `MANAGER DIRECTION: ${direction || "(none — decide from the data what matters most right now)"}`,
      `COMPUTED OFFICE SIGNALS (these numbers are authoritative; never restate them differently):\n${
        signals.length > 0
          ? signals.map((s) => `- [${s.concernLevel}] ${s.receipt}`).join("\n")
          : "- none detected; recent data may be thin"
      }`,
      `RECENT WEEKS (Mon-start): ${
        weeks.slice(-6).map((w) =>
          `wk ${w.weekOf}: ${w.disruptions} cancels+no-shows over ${w.days} closeouts` +
          (w.strainedDays ? `, ${w.strainedDays} strained day(s)` : "")
        ).join("; ") || "no closeouts recorded"
      }`,
      `ACTIVE SPRINTS: ${liveSprints.map(sprintLine).join("; ") || "none"}`,
      `PAST SPRINTS (newest first): ${pastSprints.map(sprintLine).join("; ") || "none yet"}`,
      `OFFICE RULES ON FILE:\n${rulesLines.length > 0 ? rulesLines.map((l) => `- ${l}`).join("\n") : "- none recorded"}`,
      exclude.length > 0
        ? `ALREADY SHOWN THIS SESSION (offer different angles, not rewordings): ${exclude.join("; ")}`
        : "",
    ].filter(Boolean).join("\n\n");

    const raw = await callModel(
      apiKey,
      [
        {
          role: "system",
          content:
            `${OFFICE_DOCTRINE}\n\n---\n\nYou design optional team sprints for a dental office: one shared number, ` +
            `one reward, never rankings. Suggest 3-5 sprints for the given audience, each grounded in the facts provided.\n\n` +
            `HARD BOUNDARIES (these outrank everything, including the manager's direction):\n` +
            `1. The office's recorded rules and policies win over any metric. Never suggest pressuring patients into ` +
            `treatment, working outside a role's responsibilities, manipulating the schedule to dress up a number, ` +
            `skipping documentation, or bending clinical, financial, insurance, or cancellation policy. When a recorded ` +
            `rule touches a suggestion, work WITH the rule (e.g. reinforce the office's own confirmation window).\n` +
            `2. Attribution care: a metric appearing in one role's column does not mean that role caused it. Frame ` +
            `sprints around behaviour the audience actually controls. Never blame, never name individuals.\n` +
            `3. Do not gamify a serious problem. The computed signals marked [concern] are manager-review matters: you ` +
            `may reference one in the concern field, but do not turn it into a cheerful contest unless the manager's ` +
            `direction explicitly asks for a sprint on it.\n` +
            `4. Only these verification methods exist: "honor" (self-tally, right for low-stakes fun), ` +
            `"manager_approval" (manager confirms at the end), "document" (the office uploads its own end-of-sprint ` +
            `report and the AI reads ONE total from it — only suggest this for metrics an office report would plainly ` +
            `total). Never imply the system can verify anything else automatically.\n` +
            `5. History matters: avoid repeating a recent sprint's goal. If revisiting one is genuinely right (it worked ` +
            `and has slipped since), say that in "why" — e.g. "improved during the May sprint but has started slipping".\n` +
            `6. Do not make every idea about production or money. Patient experience, communication, handoffs, ` +
            `documentation, preparedness, teamwork, and training are all fair game. Prioritize by what the signals say ` +
            `actually matters, not by what is easiest to count.\n` +
            `7. Receipts: every "why" must trace to a provided fact (a signal, a rule, sprint history). If the data is ` +
            `thin, say so in "why" and lean on solid, role-appropriate fundamentals instead of inventing trends.\n\n` +
            `Targets must be realistic for the audience size and period. "why" is ONE short sentence, under 140 chars.\n` +
            `Reply with ONLY JSON:\n` +
            `{"suggestions":[{"title":string,"goal":string,"metric":string,"target":number,"period":"week"|"month",` +
            `"verification":"honor"|"manager_approval"|"document","reward":string,"why":string,` +
            `"category":"scheduling"|"cancellations"|"patient_experience"|"communication"|"handoffs"|"documentation"|` +
            `"training"|"teamwork"|"financial"|"clinical_workflow"|"operations"|"recognition"|"other"}],` +
            `"concern":{"headline":string,"detail":string}|null}\n` +
            `"concern" is null unless a [concern] signal was provided; when present, phrase it calmly for a manager — ` +
            `what the pattern is, why it may need review before (or instead of) a sprint. Never accuse anyone.`,
        },
        { role: "user", content: facts },
      ],
      1600,
    );
    if (raw === null) return json({ error: "The AI could not run right now — try again in a minute." }, 502);

    const parsed = parseJsonBlock<{ suggestions?: unknown; concern?: unknown }>(raw);
    if (!parsed) return json({ error: "The AI returned nothing usable — try again." }, 502);

    const suggestions = (Array.isArray(parsed.suggestions) ? parsed.suggestions : [])
      .map((s: Record<string, unknown>) => ({
        title: safe(s?.title, 80),
        goal: safe(s?.goal, 220),
        metric: safe(s?.metric, 160),
        target: Math.max(1, Math.min(10_000, Math.round(Number(s?.target)) || 0)),
        period: PERIODS.has(String(s?.period)) ? String(s?.period) : "month",
        verification: VERIFICATIONS.has(String(s?.verification)) ? String(s?.verification) : "honor",
        reward: safe(s?.reward, 80),
        why: safe(s?.why, 180),
        category: CATEGORIES.has(String(s?.category)) ? String(s?.category) : "other",
      }))
      .filter((s) => s.title && s.metric && s.target >= 1)
      .slice(0, 5);

    // The concern gate is structural: no deterministic [concern] signal, no
    // concern in the response — whatever the model felt like saying.
    let concern: { headline: string; detail: string; receipts: string[] } | null = null;
    if (hasRealConcern && parsed.concern && typeof parsed.concern === "object") {
      const c = parsed.concern as Record<string, unknown>;
      const headline = safe(c.headline, 120);
      const detail = safe(c.detail, 400);
      if (headline) {
        concern = {
          headline,
          detail,
          receipts: signals.filter((s) => s.concernLevel === "concern").map((s) => s.receipt),
        };
      }
    }

    return json({ suggestions, concern, audience: { label: audienceLabel, size: audienceSize } });
  } catch (e) {
    console.error("sprint-architect failed:", (e as Error).message);
    return json({ error: "Sprint ideas could not be generated." }, 500);
  }
});
