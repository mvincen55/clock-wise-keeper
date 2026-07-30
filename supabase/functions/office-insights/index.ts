// Office Intelligence — the proactive layer.
//
// Two jobs:
//   brief   -> "The Office Brief": 2-3 sentences of today's real numbers,
//              written for the caller's role, regenerated once per day.
//   nudges  -> computed, deduped, quiet-when-dismissed prompts across surfaces.
//   huddle  -> the computed business-only "Office context" block.
//
// House rules, enforced here and not just asked of the model:
//   * Every claim carries the number behind it (data_refs on every nudge).
//   * Office rules (assistant_memories + office docs) are authoritative.
//   * NO patient data is read, computed, or stored. Business tables only.
//   * Calm colleague tone. At most ONE nudge per surface per day per person.
//   * Everything fails open: any error returns an empty, harmless payload.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.6-flash";
const TZ = "America/New_York";

/** Today in the office's timezone, as YYYY-MM-DD. */
function officeToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}
function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}
function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86400000,
  );
}
const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

type Ctx = {
  db: ReturnType<typeof createClient>;
  orgId: string;
  userId: string;
  role: string;
  isAdmin: boolean;
  employeeId: string | null;
  displayName: string;
  today: string;
};

// ---------------------------------------------------------------- facts

/** Everything the brief and the nudges are allowed to reason about. */
async function gatherFacts(ctx: Ctx) {
  const { db, orgId, userId, today } = ctx;
  const yesterday = shiftDate(today, -1);
  const monthStart = `${today.slice(0, 7)}-01`;

  const [
    employees,
    attendanceToday,
    deposits,
    settings,
    myChecklistItems,
    completions,
    myGoals,
    ptoPending,
    bypasses,
    corrections,
    changes,
    events,
    closures,
    memories,
    org,
  ] = await Promise.all([
    db.from("employees").select("id, user_id, display_name, employment_status")
      .eq("org_id", orgId).eq("employment_status", "active"),
    db.from("attendance_day_status")
      .select("user_id, employee_id, status_code, is_scheduled_day, has_day_off, office_closed, is_absent")
      .eq("org_id", orgId).eq("entry_date", today),
    db.from("deposit_logs")
      .select("deposit_date, production_cents, cash_cents, checks, ins_cc_cents, pt_cc_cents, illumitrac_cents, outside_financing_cents, hygiene_cancellations, hygiene_no_shows, doctor_cancellations, doctor_no_shows")
      .eq("org_id", orgId).gte("deposit_date", shiftDate(today, -90)).order("deposit_date", { ascending: false }),
    db.from("org_practice_settings").select("monthly_collections_target_cents").eq("org_id", orgId).maybeSingle(),
    db.from("checklist_items").select("id, title, cadence, per_person, checklist_id")
      .eq("org_id", orgId).eq("is_active", true),
    db.from("checklist_completions").select("item_id, completed_by, completed_at, period_key")
      .eq("org_id", orgId).gte("period_key", shiftDate(today, -30)),
    db.from("goals").select("id, user_id, title, smart_target, status, month, updated_at")
      .eq("org_id", orgId).is("archived_at", null),
    db.from("pto_requests").select("id, employee_id, start_date, end_date, status, pto_type")
      .eq("org_id", orgId).eq("status", "pending"),
    db.from("checklist_bypasses").select("id, user_id, checklist_date, incomplete_count, resolved, created_at")
      .eq("org_id", orgId).eq("resolved", false),
    db.from("correction_requests").select("id").eq("org_id", orgId).eq("status", "pending"),
    db.from("change_requests").select("id").eq("org_id", orgId).eq("status", "pending"),
    db.from("office_events").select("event_date, title, category")
      .eq("org_id", orgId).gte("event_date", today).lte("event_date", shiftDate(today, 60))
      .order("event_date"),
    db.from("office_closures").select("closure_date, name")
      .eq("org_id", orgId).gte("closure_date", shiftDate(today, -1)).lte("closure_date", shiftDate(today, 14)),
    db.from("assistant_memories").select("kind, content")
      .eq("org_id", orgId).eq("is_active", true).limit(40),
    db.from("orgs").select("name").eq("id", orgId).maybeSingle(),
  ]);

  const emps = employees.data ?? [];
  const empByUser = new Map(emps.map((e) => [e.user_id, e]));
  const att = attendanceToday.data ?? [];

  const outToday = att
    .filter((a) => a.has_day_off || a.office_closed || a.is_absent)
    .map((a) => empByUser.get(a.user_id)?.display_name)
    .filter(Boolean) as string[];
  const scheduledToday = att.filter((a) => a.is_scheduled_day && !a.has_day_off && !a.office_closed).length;

  const depositRows = deposits.data ?? [];
  const collectedOf = (d: Record<string, number>) =>
    (d.cash_cents ?? 0) + (d.checks ?? 0) + (d.ins_cc_cents ?? 0) + (d.pt_cc_cents ?? 0) +
    (d.illumitrac_cents ?? 0) + (d.outside_financing_cents ?? 0);
  const monthRows = depositRows.filter((d) => d.deposit_date >= monthStart);
  const collectedMtd = monthRows.reduce((s, d) => s + collectedOf(d), 0);
  const producedMtd = monthRows.reduce((s, d) => s + (d.production_cents ?? 0), 0);
  const yesterdayRow = depositRows.find((d) => d.deposit_date === yesterday) ?? null;

  const target = settings.data?.monthly_collections_target_cents ?? null;
  const daysInMonth = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7), 0)).getUTCDate();
  const monthElapsedPct = Math.round((Number(today.slice(8, 10)) / daysInMonth) * 100);
  const collectionsPacePct = target ? Math.round((collectedMtd / target) * 100) : null;

  const items = myChecklistItems.data ?? [];
  const comps = completions.data ?? [];
  const myDaily = items.filter((i) => i.per_person && i.cadence === "daily");
  const doneTodayIds = new Set(
    comps.filter((c) => c.completed_by === userId && c.period_key === today).map((c) => c.item_id),
  );
  const myOpenChecklist = myDaily.filter((i) => !doneTodayIds.has(i.id)).length;

  const goals = myGoals.data ?? [];
  const myActiveGoal = goals.find((g) => g.user_id === userId && g.status !== "completed") ?? null;

  let myNextTask: { title: string; due_date: string | null } | null = null;
  if (myActiveGoal) {
    const { data } = await db.from("goal_tasks")
      .select("title, due_date, done").eq("goal_id", myActiveGoal.id).eq("done", false)
      .order("due_date", { ascending: true, nullsFirst: false }).limit(1);
    myNextTask = data?.[0] ? { title: data[0].title, due_date: data[0].due_date } : null;
  }

  const meetings = (events.data ?? []).filter((e) => e.category === "team_meeting");
  const nextMeeting = meetings[0] ?? null;

  const pendingApprovals =
    (ptoPending.data?.length ?? 0) + (corrections.data?.length ?? 0) + (changes.data?.length ?? 0);
  const agingBypasses = (bypasses.data ?? []).filter(
    (b) => daysBetween(b.checklist_date, today) >= 2,
  ).length;

  return {
    today, yesterday,
    orgName: org.data?.name ?? "the office",
    employees: emps,
    empByUser,
    outToday,
    scheduledToday,
    teamCount: emps.length,
    depositRows,
    collectedOf,
    collectedMtd,
    producedMtd,
    yesterdayVitals: yesterdayRow
      ? {
        date: yesterday,
        production_cents: yesterdayRow.production_cents ?? 0,
        collected_cents: collectedOf(yesterdayRow),
        cancellations: (yesterdayRow.hygiene_cancellations ?? 0) + (yesterdayRow.doctor_cancellations ?? 0),
        no_shows: (yesterdayRow.hygiene_no_shows ?? 0) + (yesterdayRow.doctor_no_shows ?? 0),
      }
      : null,
    target, monthElapsedPct, collectionsPacePct,
    myOpenChecklist, myDailyCount: myDaily.length,
    goals, myActiveGoal, myNextTask,
    ptoPending: ptoPending.data ?? [],
    unresolvedBypasses: bypasses.data ?? [],
    agingBypasses,
    pendingApprovals,
    events: events.data ?? [],
    closures: closures.data ?? [],
    nextMeeting,
    memories: memories.data ?? [],
    items, comps,
  };
}

// ---------------------------------------------------------------- brief

async function buildBrief(ctx: Ctx, facts: Awaited<ReturnType<typeof gatherFacts>>) {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return null;

  const rules = facts.memories.map((m) => `- [${m.kind}] ${m.content}`).join("\n").slice(0, 4000);

  const shared: string[] = [
    `Office: ${facts.orgName}. Today: ${facts.today}.`,
    `Team: ${facts.teamCount} active, ${facts.scheduledToday} scheduled today.`,
    facts.outToday.length
      ? `Out today: ${facts.outToday.join(", ")}.`
      : `Nobody is out today.`,
    `${ctx.displayName}'s personal daily checklist: ${facts.myOpenChecklist} of ${facts.myDailyCount} still open.`,
    facts.myNextTask
      ? `Their next goal task: "${facts.myNextTask.title}"${facts.myNextTask.due_date ? ` due ${facts.myNextTask.due_date}` : " (no due date)"}.`
      : facts.myActiveGoal
        ? `Their goal "${facts.myActiveGoal.title}" has no open tasks.`
        : `They have no active goal this month.`,
    facts.target
      ? `Collections: ${money(facts.collectedMtd)} of the ${money(facts.target)} monthly target (${facts.collectionsPacePct}% of target, ${facts.monthElapsedPct}% of the month elapsed).`
      : `Collections month to date: ${money(facts.collectedMtd)} (no monthly target is set).`,
    facts.nextMeeting
      ? `Next team meeting: ${facts.nextMeeting.event_date} (${daysBetween(facts.today, facts.nextMeeting.event_date)} days away).`
      : `No team meeting is on the calendar.`,
  ];

  const adminOnly = ctx.isAdmin
    ? [
      `Pending approvals waiting on a manager: ${facts.pendingApprovals}.`,
      facts.yesterdayVitals
        ? `Yesterday (${facts.yesterdayVitals.date}): production ${money(facts.yesterdayVitals.production_cents)}, collected ${money(facts.yesterdayVitals.collected_cents)}, ${facts.yesterdayVitals.cancellations} cancellations and ${facts.yesterdayVitals.no_shows} no-shows.`
        : `No deposit log was closed out yesterday.`,
      `Unresolved checklist bypasses: ${facts.unresolvedBypasses.length} (${facts.agingBypasses} of them 2+ days old).`,
    ]
    : [];

  const body = {
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          `You write "The Office Brief" for a dental practice's internal operations app. ` +
          `Write 2 to 3 sentences, maximum 65 words, addressed to ${ctx.displayName} (role: ${ctx.role}).\n` +
          `HARD RULES:\n` +
          `- Use ONLY the facts given. Every claim must carry the actual number or name from those facts.\n` +
          `- Never invent, round vaguely, or hedge. No "things look good" filler — generic writing is a failure.\n` +
          `- Never mention patients, patient names, or anything clinical about a patient.\n` +
          `- Calm colleague tone: plain, warm, factual. No exclamation marks, no cheerleading, no emoji.\n` +
          `- Do not give orders. State what's true; at most one gentle suggestion.\n` +
          `- The office's own rules below are authoritative — never contradict them.\n\n` +
          `OFFICE RULES:\n${rules || "(none recorded)"}`,
      },
      { role: "user", content: `FACTS:\n${[...shared, ...adminOnly].join("\n")}` },
    ],
  };

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  const out = await res.json();
  const text = out?.choices?.[0]?.message?.content?.trim();
  return typeof text === "string" && text.length > 0 ? text : null;
}

// ---------------------------------------------------------------- nudges

type Candidate = {
  surface: string;
  kind: string;
  content: string;
  data_refs: Record<string, unknown>;
  user_id: string | null;
};

/** Kinds a person has repeatedly dismissed go quiet for two weeks. */
async function quietKinds(ctx: Ctx): Promise<Set<string>> {
  const since = shiftDate(ctx.today, -14);
  const { data } = await ctx.db.from("office_nudges")
    .select("kind, status, user_id, resolved_at")
    .eq("org_id", ctx.orgId)
    .eq("status", "dismissed")
    .gte("resolved_at", `${since}T00:00:00Z`);
  const counts = new Map<string, number>();
  for (const n of data ?? []) {
    if (n.user_id && n.user_id !== ctx.userId) continue;
    counts.set(n.kind, (counts.get(n.kind) ?? 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, c]) => c >= 2).map(([k]) => k));
}

async function computeCandidates(
  ctx: Ctx,
  facts: Awaited<ReturnType<typeof gatherFacts>>,
): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const { db, orgId, today } = ctx;

  // --- goal stall: no task checked in 7+ days on an active goal.
  const activeGoals = facts.goals.filter((g) => g.status !== "completed");
  if (activeGoals.length) {
    const { data: tasks } = await db.from("goal_tasks")
      .select("goal_id, done, done_at, title")
      .in("goal_id", activeGoals.map((g) => g.id));
    for (const g of activeGoals) {
      const mine = (tasks ?? []).filter((t) => t.goal_id === g.id);
      if (!mine.length || mine.every((t) => t.done)) continue;
      const lastDone = mine.filter((t) => t.done_at).map((t) => t.done_at as string).sort().pop();
      const sinceDate = (lastDone ?? g.updated_at ?? "").slice(0, 10);
      if (!sinceDate) continue;
      const stalled = daysBetween(sinceDate, today);
      if (stalled >= 7) {
        out.push({
          surface: "goals",
          kind: "goal_stall",
          user_id: g.user_id,
          content: `No task checked off on "${g.title}" in ${stalled} days — ${mine.filter((t) => !t.done).length} still open. Worth picking the smallest one back up.`,
          data_refs: { goal_id: g.id, days_since_progress: stalled, open_tasks: mine.filter((t) => !t.done).length, last_progress: sinceDate },
        });
      }
    }
  }

  // --- early-month no-goal.
  const dayOfMonth = Number(today.slice(8, 10));
  if (dayOfMonth <= 8) {
    const month = today.slice(0, 7);
    const withGoal = new Set(facts.goals.filter((g) => g.month === month).map((g) => g.user_id));
    for (const e of facts.employees) {
      if (!e.user_id || withGoal.has(e.user_id)) continue;
      out.push({
        surface: "goals",
        kind: "no_goal_early_month",
        user_id: e.user_id,
        content: `${month} is ${dayOfMonth} days in and there's no goal set yet. One measurable target is enough to start.`,
        data_refs: { month, day_of_month: dayOfMonth },
      });
    }
  }

  // --- checklist timing pattern: closing items usually wrap by X.
  const dailyItems = facts.items.filter((i) => i.cadence === "daily");
  if (dailyItems.length) {
    const itemIds = new Set(dailyItems.map((i) => i.id));
    const times = facts.comps
      .filter((c) => itemIds.has(c.item_id) && c.period_key !== today && c.completed_at)
      .map((c) => new Date(c.completed_at as string).toLocaleTimeString("en-GB", { timeZone: TZ, hour12: false }))
      .filter((t) => t >= "15:00:00");
    if (times.length >= 5) {
      const mins = times.map((t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))).sort((a, b) => a - b);
      const typical = mins[Math.floor(mins.length / 2)];
      const nowLocal = new Date().toLocaleTimeString("en-GB", { timeZone: TZ, hour12: false });
      const nowMin = Number(nowLocal.slice(0, 2)) * 60 + Number(nowLocal.slice(3, 5));
      const openNow = dailyItems.filter(
        (i) => !facts.comps.some((c) => c.item_id === i.id && c.period_key === today),
      ).length;
      const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      if (openNow > 0 && nowMin > typical + 5 && nowMin < 22 * 60) {
        out.push({
          surface: "checklists",
          kind: "checklist_timing",
          user_id: null,
          content: `Closing items usually wrap by ${fmt(typical)} — it's ${fmt(nowMin)} and ${openNow} ${openNow === 1 ? "item is" : "items are"} still open.`,
          data_refs: { typical_time: fmt(typical), now: fmt(nowMin), open_items: openNow, sample_size: times.length },
        });
      }
    }
  }

  // --- PTO conflict prediction: overlapping pending requests, before approval.
  const pto = facts.ptoPending;
  for (let i = 0; i < pto.length; i++) {
    for (let j = i + 1; j < pto.length; j++) {
      const a = pto[i], b = pto[j];
      if (a.employee_id === b.employee_id) continue;
      if (a.start_date > b.end_date || b.start_date > a.end_date) continue;
      const nameOf = (id: string) => facts.employees.find((e) => e.id === id)?.display_name ?? "a team member";
      out.push({
        surface: "dashboard",
        kind: "pto_conflict",
        user_id: null,
        content: `${nameOf(a.employee_id)} and ${nameOf(b.employee_id)} both have pending time off covering ${a.start_date > b.start_date ? a.start_date : b.start_date}. Worth deciding together before either is approved.`,
        data_refs: { request_ids: [a.id, b.id], overlap_start: a.start_date > b.start_date ? a.start_date : b.start_date },
      });
    }
  }

  // --- deposit anomaly: production 30%+ under the trailing average for that weekday.
  const yRow = facts.depositRows.find((d) => d.deposit_date === facts.yesterday);
  if (yRow && (yRow.production_cents ?? 0) > 0) {
    const wd = weekdayOf(facts.yesterday);
    const peers = facts.depositRows.filter(
      (d) => d.deposit_date !== facts.yesterday && weekdayOf(d.deposit_date) === wd && (d.production_cents ?? 0) > 0,
    );
    if (peers.length >= 3) {
      const avg = peers.reduce((s, d) => s + (d.production_cents ?? 0), 0) / peers.length;
      const pctUnder = Math.round((1 - (yRow.production_cents ?? 0) / avg) * 100);
      if (pctUnder >= 30) {
        out.push({
          surface: "deposit",
          kind: "deposit_anomaly",
          user_id: null,
          content: `${facts.yesterday} production was ${money(yRow.production_cents ?? 0)} — ${pctUnder}% under the ${money(Math.round(avg))} average for that weekday across the last ${peers.length}. Worth a look at the schedule that day.`,
          data_refs: { date: facts.yesterday, production_cents: yRow.production_cents, weekday_avg_cents: Math.round(avg), pct_under: pctUnder, sample_size: peers.length },
        });
      }
    }
  }

  // --- incident follow-through: suggest to a MANAGER, never automatic.
  const { data: incidents } = await db.from("incident_reports")
    .select("id, category, incident_date, created_at")
    .eq("org_id", orgId).gte("incident_date", shiftDate(today, -14))
    .order("incident_date", { ascending: false }).limit(5);
  for (const inc of incidents ?? []) {
    const { data: admins } = await db.from("org_members")
      .select("user_id").eq("org_id", orgId).eq("status", "active").in("role", ["owner", "manager"]);
    for (const a of admins ?? []) {
      out.push({
        surface: "dashboard",
        kind: "incident_follow_through",
        user_id: a.user_id,
        content: `An incident report was filed ${inc.incident_date} (${inc.category}). Consider assigning a related training module or adding a checklist item — your call, nothing happens automatically.`,
        data_refs: { incident_id: inc.id, category: inc.category, incident_date: inc.incident_date },
      });
    }
    break; // one incident nudge at a time
  }

  // --- training recommendation tied to the member's active goal.
  if (facts.myActiveGoal) {
    const { data: linked } = await db.from("goal_tasks")
      .select("training_module_id").eq("goal_id", facts.myActiveGoal.id).not("training_module_id", "is", null);
    if (!linked?.length) {
      const { data: mods } = await db.from("training_modules")
        .select("id, title, summary").eq("org_id", orgId).eq("status", "published").limit(20);
      const words = `${facts.myActiveGoal.title} ${facts.myActiveGoal.smart_target ?? ""}`
        .toLowerCase().split(/\W+/).filter((w) => w.length > 4);
      const match = (mods ?? []).find((m) =>
        words.some((w) => `${m.title} ${m.summary ?? ""}`.toLowerCase().includes(w))
      );
      if (match) {
        out.push({
          surface: "training",
          kind: "training_for_goal",
          user_id: ctx.userId,
          content: `"${match.title}" lines up with your goal "${facts.myActiveGoal.title}". About 15 minutes, and it counts toward the plan.`,
          data_refs: { module_id: match.id, goal_id: facts.myActiveGoal.id },
        });
      }
    }
  }

  return out;
}

/** Insert candidates, honoring dedupe, the quiet list, and one-per-surface-per-day. */
async function persistNudges(ctx: Ctx, candidates: Candidate[]) {
  const quiet = await quietKinds(ctx);
  const { data: todays } = await ctx.db.from("office_nudges")
    .select("id, surface, kind, user_id, status")
    .eq("org_id", ctx.orgId)
    .gte("created_at", `${ctx.today}T00:00:00Z`);

  const seen = new Set((todays ?? []).map((n) => `${n.surface}|${n.user_id ?? "*"}`));
  const seenKind = new Set((todays ?? []).map((n) => `${n.kind}|${n.user_id ?? "*"}`));
  const rows: Candidate[] = [];

  for (const c of candidates) {
    if (c.kind !== "office_brief" && quiet.has(c.kind)) continue;
    const surfaceKey = `${c.surface}|${c.user_id ?? "*"}`;
    const kindKey = `${c.kind}|${c.user_id ?? "*"}`;
    if (seen.has(surfaceKey) || seenKind.has(kindKey)) continue;
    seen.add(surfaceKey);
    seenKind.add(kindKey);
    rows.push(c);
  }

  // A few per day, office-wide. Quiet is the point.
  const capped = rows.slice(0, 6);
  if (capped.length) {
    await ctx.db.from("office_nudges").insert(
      capped.map((c) => ({ ...c, org_id: ctx.orgId, status: "new" })),
    );
  }
  return capped.length;
}

// ---------------------------------------------------------------- huddle

function huddleContext(facts: Awaited<ReturnType<typeof gatherFacts>>) {
  const weekEnd = shiftDate(facts.today, 7);
  return {
    out_today: facts.outToday,
    scheduled_today: facts.scheduledToday,
    team_count: facts.teamCount,
    yesterday: facts.yesterdayVitals,
    closures_this_week: facts.closures
      .filter((c) => c.closure_date >= facts.today && c.closure_date <= weekEnd)
      .map((c) => ({ date: c.closure_date, name: c.name })),
    meetings_this_week: facts.events
      .filter((e) => e.category === "team_meeting" && e.event_date <= weekEnd)
      .map((e) => ({ date: e.event_date, title: e.title })),
    next_meeting: facts.nextMeeting
      ? {
        date: facts.nextMeeting.event_date,
        title: facts.nextMeeting.title,
        days_away: daysBetween(facts.today, facts.nextMeeting.event_date),
      }
      : null,
    collections_mtd_cents: facts.collectedMtd,
    collections_target_cents: facts.target,
    month_elapsed_pct: facts.monthElapsedPct,
  };
}

// ---------------------------------------------------------------- handler

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Fail open: nothing here may ever block a page from rendering.
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims, error: claimsErr } = await anon.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimsErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: member } = await db.from("org_members")
      .select("org_id, role").eq("user_id", userId).eq("status", "active").maybeSingle();
    if (!member) return json({ brief: null, nudges: [], context: null });

    const { data: emp } = await db.from("employees")
      .select("id, display_name").eq("org_id", member.org_id).eq("user_id", userId).maybeSingle();

    const ctx: Ctx = {
      db,
      orgId: member.org_id,
      userId,
      role: member.role,
      isAdmin: member.role === "owner" || member.role === "manager",
      employeeId: emp?.id ?? null,
      displayName: emp?.display_name ?? "there",
      today: officeToday(),
    };

    const payload = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = typeof payload.action === "string" ? payload.action : "brief";

    if (action === "huddle") {
      const facts = await gatherFacts(ctx);
      return json({ context: huddleContext(facts) });
    }

    if (action === "nudges") {
      const facts = await gatherFacts(ctx);
      const candidates = await computeCandidates(ctx, facts);
      await persistNudges(ctx, candidates);
      const { data: mine } = await db.from("office_nudges")
        .select("id, surface, kind, content, data_refs, status, created_at")
        .eq("org_id", ctx.orgId)
        .in("status", ["new", "shown"])
        .neq("kind", "office_brief")
        .or(`user_id.is.null,user_id.eq.${userId}`)
        .gte("created_at", `${shiftDate(ctx.today, -3)}T00:00:00Z`)
        .order("created_at", { ascending: false });
      return json({ nudges: mine ?? [] });
    }

    // action === "brief" — one per person per day, regenerated on first visit.
    const { data: cached } = await db.from("office_nudges")
      .select("id, content, data_refs, created_at")
      .eq("org_id", ctx.orgId).eq("user_id", userId).eq("kind", "office_brief")
      .gte("created_at", `${ctx.today}T00:00:00Z`)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (cached) return json({ brief: cached.content, data_refs: cached.data_refs, cached: true });

    const facts = await gatherFacts(ctx);
    const brief = await buildBrief(ctx, facts);
    if (!brief) return json({ brief: null });

    const data_refs = {
      scheduled_today: facts.scheduledToday,
      out_today: facts.outToday,
      my_open_checklist: facts.myOpenChecklist,
      next_task: facts.myNextTask,
      collections_mtd_cents: facts.collectedMtd,
      collections_target_cents: facts.target,
      collections_pace_pct: facts.collectionsPacePct,
      month_elapsed_pct: facts.monthElapsedPct,
      pending_approvals: ctx.isAdmin ? facts.pendingApprovals : undefined,
      yesterday: ctx.isAdmin ? facts.yesterdayVitals : undefined,
      aging_bypasses: ctx.isAdmin ? facts.agingBypasses : undefined,
    };
    await db.from("office_nudges").insert({
      org_id: ctx.orgId, user_id: userId, surface: "dashboard",
      kind: "office_brief", content: brief, data_refs, status: "shown",
    });
    return json({ brief, data_refs, cached: false });
  } catch (err) {
    console.error("office-insights failed open:", err);
    return json({ brief: null, nudges: [], context: null });
  }
});
