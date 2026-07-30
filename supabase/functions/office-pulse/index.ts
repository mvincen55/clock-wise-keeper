// office-pulse — the scheduled heartbeat of the office AI.
//
// Runs a few times a day (cron). Three jobs, all fail-open:
//   1. Reminder hooks  — schedule and fire quiet AI follow-ups.
//   2. Team sprints    — announce, nudge mid-period, and call the result.
//   3. Sprint ideas    — once a week, offer each manager ONE sprint suggestion.
//
// Rules it will not break: max one reminder per person per day, dismissal
// learning (kinds a person keeps dismissing go quiet), never blocks anything,
// never mentions patients.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { OFFICE_DOCTRINE } from "../_shared/office-doctrine.ts";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.6-flash";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Eastern-local calendar day — the office's clock. */
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

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000,
  );
}

function easternWeekday(): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  }).format(new Date());
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

type Client = ReturnType<typeof createClient>;

/** One short line from the office AI. Falls back to the template on any failure. */
async function say(apiKey: string | undefined, brief: string, fallback: string): Promise<string> {
  if (!apiKey) return fallback;
  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 160,
        messages: [
          {
            role: "system",
            content:
              `${OFFICE_DOCTRINE}\n\n---\n\nYou are writing ONE short reminder or announcement for the office app. ` +
              `1-2 plain sentences, max 240 characters. Use only the facts given — no invented numbers. No greeting, no sign-off, no emoji, no exclamation marks.`,
          },
          { role: "user", content: brief },
        ],
      }),
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    const text = String(data?.choices?.[0]?.message?.content ?? "").trim();
    return text ? text.slice(0, 280) : fallback;
  } catch {
    return fallback;
  }
}

/** Has this person already heard from the AI today? One nudge per day, per person. */
async function alreadyNudgedToday(db: Client, userId: string): Promise<boolean> {
  const since = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
  const { data } = await db
    .from("notifications")
    .select("id")
    .eq("recipient_user_id", userId)
    .like("notification_type", "ai_%")
    .gte("created_at", since)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

/** Dismissal learning: three dismissals of a kind buys a month of quiet. */
async function isMuted(db: Client, userId: string, kind: string): Promise<boolean> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data } = await db
    .from("office_nudges")
    .select("id")
    .eq("user_id", userId)
    .eq("kind", kind)
    .eq("status", "dismissed")
    .gte("created_at", since);
  return (data?.length ?? 0) >= 3;
}

async function deliver(
  db: Client,
  opts: {
    org_id: string;
    user_id: string;
    kind: string;
    title: string;
    message: string;
    related_table?: string | null;
    related_id?: string | null;
    data_refs?: Record<string, unknown>;
  },
) {
  await db.from("notifications").insert({
    org_id: opts.org_id,
    recipient_user_id: opts.user_id,
    actor_user_id: null,
    notification_type: `ai_${opts.kind}`,
    title: opts.title,
    message: opts.message,
    related_table: opts.related_table ?? null,
    related_id: opts.related_id ?? null,
  });
  // Mirrored as a nudge so dismissals teach the system.
  await db.from("office_nudges").insert({
    org_id: opts.org_id,
    user_id: opts.user_id,
    surface: "reminder",
    kind: opts.kind,
    content: opts.message,
    data_refs: opts.data_refs ?? {},
    status: "open",
  });
}

/** 1a. Look at real work and schedule the hooks that are worth firing. */
async function scheduleHooks(db: Client, orgId: string, today: string) {
  const hooks: Record<string, unknown>[] = [];
  const fireAt = new Date().toISOString();

  // Goal tasks due today or tomorrow.
  const { data: tasks } = await db
    .from("goal_tasks")
    .select("id, org_id, title, due_date, goal_id, goals!inner(user_id, status)")
    .eq("org_id", orgId)
    .eq("done", false)
    .gte("due_date", today)
    .lte("due_date", addDays(today, 1));
  for (const t of tasks ?? []) {
    const goal = (t as Record<string, never>).goals as unknown as
      | { user_id: string; status: string }
      | null;
    if (!goal || goal.status !== "active") continue;
    hooks.push({
      org_id: orgId,
      user_id: goal.user_id,
      kind: "goal_task_due",
      ref_id: t.id,
      fire_at: fireAt,
      payload: { title: t.title, due_date: t.due_date, goal_id: t.goal_id },
    });
  }

  // Training assignments coming due.
  const { data: assignments } = await db
    .from("training_assignments")
    .select("id, assigned_to, due_date, module_id, status, training_modules(title)")
    .eq("org_id", orgId)
    .neq("status", "completed")
    .not("due_date", "is", null)
    .gte("due_date", today)
    .lte("due_date", addDays(today, 2));
  for (const a of assignments ?? []) {
    const mod = (a as Record<string, never>).training_modules as unknown as
      | { title: string }
      | null;
    hooks.push({
      org_id: orgId,
      user_id: a.assigned_to,
      kind: "training_due",
      ref_id: a.id,
      fire_at: fireAt,
      payload: { title: mod?.title ?? "a training module", due_date: a.due_date },
    });
  }

  // Plans that have gone quiet for a week.
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: goals } = await db
    .from("goals")
    .select("id, user_id, title, created_at")
    .eq("org_id", orgId)
    .eq("status", "active")
    .is("archived_at", null)
    .lte("created_at", weekAgo);
  for (const g of goals ?? []) {
    const { data: recent } = await db
      .from("goal_tasks")
      .select("id")
      .eq("goal_id", g.id)
      .eq("done", true)
      .gte("done_at", weekAgo)
      .limit(1);
    if ((recent?.length ?? 0) > 0) continue;
    const { data: open } = await db
      .from("goal_tasks")
      .select("id")
      .eq("goal_id", g.id)
      .eq("done", false)
      .limit(1);
    if ((open?.length ?? 0) === 0) continue;
    hooks.push({
      org_id: orgId,
      user_id: g.user_id,
      kind: "plan_stall",
      ref_id: g.id,
      fire_at: fireAt,
      payload: { title: g.title },
    });
  }

  if (hooks.length === 0) return 0;
  // Don't re-schedule anything already waiting to fire.
  const { data: pending } = await db
    .from("reminder_hooks")
    .select("user_id, kind, ref_id")
    .eq("org_id", orgId)
    .eq("status", "pending");
  const seen = new Set((pending ?? []).map(h => `${h.user_id}|${h.kind}|${h.ref_id}`));
  const fresh = hooks.filter(h => !seen.has(`${h.user_id}|${h.kind}|${h.ref_id}`));
  if (fresh.length === 0) return 0;
  const { error } = await db.from("reminder_hooks").insert(fresh);
  if (error) console.warn("hook scheduling skipped:", error.message);
  return fresh.length;
}

/** 1b. Fire whatever is due, one per person per day. */
async function fireHooks(db: Client, apiKey: string | undefined, orgId: string, today: string) {
  const { data: due } = await db
    .from("reminder_hooks")
    .select("*")
    .eq("org_id", orgId)
    .eq("status", "pending")
    .lte("fire_at", new Date().toISOString())
    .order("fire_at")
    .limit(100);

  let sent = 0;
  const spokenTo = new Set<string>();

  for (const hook of due ?? []) {
    const payload = (hook.payload ?? {}) as Record<string, string>;
    try {
      if (spokenTo.has(hook.user_id) || (await alreadyNudgedToday(db, hook.user_id))) continue;
      if (await isMuted(db, hook.user_id, hook.kind)) {
        await db.from("reminder_hooks").update({ status: "cancelled" }).eq("id", hook.id);
        continue;
      }

      let title = "A quiet reminder";
      let fallback = "";
      let brief = "";
      if (hook.kind === "goal_task_due") {
        const left = daysBetween(today, payload.due_date ?? today);
        title = left <= 0 ? "A step is due today" : "A step is due tomorrow";
        fallback = `"${payload.title}" is due ${left <= 0 ? "today" : "tomorrow"}. Might not be a bad idea to knock it out.`;
        brief = `A team member has a goal step "${payload.title}" due ${payload.due_date} (today is ${today}). Nudge them gently.`;
      } else if (hook.kind === "training_due") {
        const left = daysBetween(today, payload.due_date ?? today);
        title = "Training coming due";
        fallback = `"${payload.title}" is due ${payload.due_date}${left > 0 ? ` — ${left} day${left === 1 ? "" : "s"} away` : " today"}.`;
        brief = `A team member has training "${payload.title}" due ${payload.due_date} (today is ${today}). Nudge them gently.`;
      } else if (hook.kind === "plan_stall") {
        title = "Your plan has gone quiet";
        fallback = `Nothing has been checked off on "${payload.title}" this week — want to rescope it or shrink the next step?`;
        brief = `A team member's goal "${payload.title}" has had nothing checked off in the last 7 days. Offer to rescope or shrink the next step. No shame.`;
      } else {
        title = "Following up";
        fallback = payload.message ?? "You asked to be reminded about this.";
        brief = `Follow up on: ${payload.message ?? payload.title ?? "an earlier commitment"}.`;
      }

      const message = await say(apiKey, brief, fallback);
      await deliver(db, {
        org_id: orgId,
        user_id: hook.user_id,
        kind: hook.kind,
        title,
        message,
        related_id: hook.ref_id,
        data_refs: payload,
      });
      await db.from("reminder_hooks").update({ status: "sent" }).eq("id", hook.id);
      spokenTo.add(hook.user_id);
      sent++;
    } catch (e) {
      console.warn("hook failed, moving on:", (e as Error).message);
    }
  }
  return sent;
}

async function orgMembers(db: Client, orgId: string) {
  const { data } = await db
    .from("org_members")
    .select("user_id, role")
    .eq("org_id", orgId)
    .eq("status", "active");
  return data ?? [];
}

/** 2. The AI runs the sprints: announce, nudge, and call the result. */
async function runSprints(db: Client, apiKey: string | undefined, orgId: string, today: string) {
  const { data: sprints } = await db
    .from("team_goals")
    .select("*")
    .eq("org_id", orgId)
    .eq("status", "active");
  if (!sprints?.length) return 0;

  const members = await orgMembers(db, orgId);
  let handled = 0;

  for (const s of sprints) {
    const pct = Math.min(100, Math.round((s.progress / Math.max(1, s.target_count)) * 100));
    const daysLeft = daysBetween(today, s.ends_on);
    const announced = (s as Record<string, unknown>).created_at as string;
    const isNew = Date.parse(announced) > Date.now() - 6 * 60 * 60 * 1000;

    let kind: string | null = null;
    let title = "";
    let brief = "";
    let fallback = "";

    if (isNew) {
      kind = "sprint_announced";
      title = "New team sprint";
      fallback = `The office is going for ${s.target_count} ${s.metric} by ${s.ends_on}. Hit it and it's ${s.reward}. Everyone's tally counts — tap +1 as you go.`;
      brief = `Announce a new team sprint to the whole office. Title: "${s.title}". Counting: ${s.metric}. Target: ${s.target_count} by ${s.ends_on}. Reward if the team hits it: ${s.reward}. It's the whole team against the number — no rankings. Mention that people tap +1 on the dashboard as they go.`;
    } else if (daysLeft < 0) {
      const won = s.progress >= s.target_count;
      await db.from("team_goals").update({ status: won ? "won" : "missed" }).eq("id", s.id);
      kind = won ? "sprint_won" : "sprint_missed";
      title = won ? "Sprint won" : "Sprint wrapped";
      fallback = won
        ? `${s.progress} ${s.metric} against a target of ${s.target_count}. That's ${s.reward}.`
        : `${s.progress} of ${s.target_count} ${s.metric} — so close. Worth another run when the time is right.`;
      brief = won
        ? `The office WON a sprint: ${s.progress} ${s.metric} against a target of ${s.target_count}. The reward is ${s.reward}. Celebrate the team, warmly and briefly, no hype.`
        : `The office fell short of a sprint: ${s.progress} of ${s.target_count} ${s.metric} by ${s.ends_on}. Be gracious and genuinely kind — "so close", no shame, no lecture.`;
    } else if (daysLeft > 0 && pct < 100 && easternWeekday() === 3) {
      // Midweek check-in with the real number.
      kind = "sprint_progress";
      title = "Sprint check-in";
      fallback = `${daysLeft} day${daysLeft === 1 ? "" : "s"} left and the team is ${pct}% of the way to ${s.target_count} ${s.metric}. A push gets ${s.reward}.`;
      brief = `Mid-sprint check-in for the whole office. ${s.progress} of ${s.target_count} ${s.metric} so far (${pct}%), ${daysLeft} day${daysLeft === 1 ? "" : "s"} left, reward is ${s.reward}. Use the real numbers. Encouraging, not pushy.`;
    }

    if (!kind) continue;
    const message = await say(apiKey, brief, fallback);
    for (const m of members) {
      try {
        await deliver(db, {
          org_id: orgId,
          user_id: m.user_id as string,
          kind,
          title,
          message,
          related_table: "team_goals",
          related_id: s.id,
          data_refs: { progress: s.progress, target: s.target_count, ends_on: s.ends_on },
        });
      } catch (e) {
        console.warn("sprint delivery skipped:", (e as Error).message);
      }
    }
    handled++;
  }
  return handled;
}

/** 3. Once a week, offer each manager ONE sprint idea grounded in office data. */
async function suggestSprints(db: Client, apiKey: string | undefined, orgId: string, today: string) {
  if (easternWeekday() !== 1) return 0; // Mondays only.

  const { data: active } = await db
    .from("team_goals")
    .select("id")
    .eq("org_id", orgId)
    .eq("status", "active")
    .limit(1);
  if ((active?.length ?? 0) > 0) return 0; // A sprint is already running — stay quiet.

  const members = await orgMembers(db, orgId);
  const admins = members.filter(m => m.role === "owner" || m.role === "manager");
  if (admins.length === 0) return 0;

  // Receipts: the last 30 days of deposits and the last few closed sprints.
  const { data: deposits } = await db
    .from("deposit_logs")
    .select("deposit_date, production_cents, hygiene_cancellations, hygiene_no_shows, doctor_cancellations, doctor_no_shows")
    .eq("org_id", orgId)
    .gte("deposit_date", addDays(today, -30))
    .order("deposit_date", { ascending: false })
    .limit(30);
  const { data: past } = await db
    .from("team_goals")
    .select("title, metric, target_count, progress, status")
    .eq("org_id", orgId)
    .neq("status", "active")
    .order("created_at", { ascending: false })
    .limit(3);

  const facts = [
    `Recent daily logs (date, production in dollars, cancellations + no-shows): ${(deposits ?? [])
      .map(d => {
        const prod = d.production_cents == null ? "n/a" : `$${Math.round(Number(d.production_cents) / 100)}`;
        const disruptions =
          Number(d.hygiene_cancellations ?? 0) + Number(d.hygiene_no_shows ?? 0) +
          Number(d.doctor_cancellations ?? 0) + Number(d.doctor_no_shows ?? 0);
        return `${d.deposit_date}: ${prod}, ${disruptions}`;
      })
      .join("; ") || "none recorded"}`,
    `Past sprints: ${(past ?? [])
      .map(p => `"${p.title}" ${p.progress}/${p.target_count} ${p.status}`)
      .join("; ") || "none yet"}`,
  ].join("\n");

  const content = await say(
    apiKey,
    `Suggest ONE optional team sprint for this dental office, based only on these facts:\n${facts}\n` +
      `Say what you noticed (cite the real number or say the data is thin), then suggest the sprint in the "might not be a bad idea to…" register. One or two sentences. Name what would be counted and a realistic target for one month.`,
    "",
  );
  if (!content) return 0;

  let made = 0;
  for (const a of admins) {
    try {
      if (await isMuted(db, a.user_id as string, "sprint_suggestion")) continue;
      const { data: open } = await db
        .from("office_nudges")
        .select("id")
        .eq("user_id", a.user_id as string)
        .eq("kind", "sprint_suggestion")
        .eq("status", "open")
        .limit(1);
      if ((open?.length ?? 0) > 0) continue;
      await db.from("office_nudges").insert({
        org_id: orgId,
        user_id: a.user_id as string,
        surface: "dashboard",
        kind: "sprint_suggestion",
        content,
        data_refs: { generated_on: today },
        status: "open",
      });
      made++;
    } catch (e) {
      console.warn("suggestion skipped:", (e as Error).message);
    }
  }
  return made;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const apiKey = Deno.env.get("LOVABLE_API_KEY") ?? undefined;
    const today = easternToday();

    const { data: orgs } = await db.from("orgs").select("id");
    const summary: Record<string, unknown>[] = [];

    for (const org of orgs ?? []) {
      const orgId = org.id as string;
      try {
        const scheduled = await scheduleHooks(db, orgId, today);
        const sent = await fireHooks(db, apiKey, orgId, today);
        const sprints = await runSprints(db, apiKey, orgId, today);
        const suggestions = await suggestSprints(db, apiKey, orgId, today);
        summary.push({ org_id: orgId, scheduled, sent, sprints, suggestions });
      } catch (e) {
        // Fail open — one office's bad day never stops the rest.
        console.error("office-pulse org failed:", orgId, (e as Error).message);
        summary.push({ org_id: orgId, error: true });
      }
    }

    return json({ ok: true, today, summary });
  } catch (e) {
    console.error("office-pulse failed:", (e as Error).message);
    return json({ ok: false, error: "office-pulse could not run" }, 200);
  }
});
