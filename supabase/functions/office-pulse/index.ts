// office-pulse — the scheduled heartbeat of the office AI.
//
// Runs a few times a day (cron). Four jobs, all fail-open:
//   1. Reminder hooks  — schedule and fire quiet AI follow-ups.
//   2. Team sprints    — announce, nudge mid-period, and call the result.
//   3. Sprint ideas    — once a week, offer each manager ONE sprint suggestion.
//   4. Close the Day   — one grounded coaching note from yesterday's closeout
//                        (sanitized schedule aggregates + the human staffing
//                        read; never revenue at the cost of safe workloads).
//
// Rules it will not break: max one reminder per person per day, dismissal
// learning (kinds a person keeps dismissing go quiet), never blocks anything,
// never mentions patients.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ReturnType<typeof createClient> resolves the parameterless overload,
// whose tables type as never; alias the real call's inferred client type.
const makeDbClient = (url: string, key: string) => createClient(url, key);
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { OFFICE_DOCTRINE } from "../_shared/office-doctrine.ts";
import { logScrub, scrubFreeText } from "../_shared/phi-scrub.ts";

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

type Client = ReturnType<typeof makeDbClient>;

/**
 * One short line from the office AI. Falls back to the template on any failure.
 * Every brief passes through the PHI scrub first — goal, sprint and checklist
 * titles are office-typed free text and this is the only door to the gateway.
 */
async function say(apiKey: string | undefined, rawBrief: string, fallback: string): Promise<string> {
  if (!apiKey) return fallback;
  const scrubbed = scrubFreeText(rawBrief, 2000);
  logScrub("office-pulse.brief", scrubbed);
  const brief = scrubbed.text;
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
    surface: "dashboard",
    kind: opts.kind,
    content: opts.message,
    data_refs: opts.data_refs ?? {},
    status: "new",
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
    const goal = t.goals as unknown as
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
    const mod = a.training_modules as unknown as
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
      } else if (hook.kind === "sprint_verify") {
        title = "A sprint is waiting on you";
        fallback = payload.verification === "document"
          ? `"${payload.title}" finished at ${payload.progress} of ${payload.target}. When you get a minute, upload the outside report so the result can be verified.`
          : `"${payload.title}" finished at ${payload.progress} of ${payload.target}. It needs your approve or decline to close out.`;
        brief = `A sprint "${payload.title}" ended at ${payload.progress} of ${payload.target} ${payload.metric}. The verifier needs to ${
          payload.verification === "document"
            ? "upload the office's outside report so the AI can check the number"
            : "approve or decline the result"
        }. Ask calmly, no pressure — this person may be the manager or the owner.`;
      } else {

        title = "Following up";
        fallback = payload.message ?? "You asked to be reminded about this.";
        brief = `Follow up on: ${payload.message ?? payload.title ?? "an earlier commitment"}.`;
      }

      const message = await say(apiKey, brief, fallback);
      // Name the table ref_id points into, so the notification can link
      // straight to the record it is about.
      const refTable: Record<string, string> = {
        goal_task_due: "goal_tasks",
        training_due: "training_assignments",
        plan_stall: "goals",
        sprint_verify: "team_goals",
      };
      await deliver(db, {
        org_id: orgId,
        user_id: hook.user_id,
        kind: hook.kind,
        title,
        message,
        related_table: refTable[hook.kind] ?? null,
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

/** Who hears about this sprint: the whole office, one department, or one person. */
async function sprintAudience(
  db: Client,
  orgId: string,
  sprint: Record<string, unknown>,
): Promise<string[]> {
  const members = await orgMembers(db, orgId);
  const all = members.map(m => String(m.user_id));
  const admins = members
    .filter(m => m.role === "owner" || m.role === "manager")
    .map(m => String(m.user_id));

  if (sprint.scope === "individual") {
    const target = sprint.scope_user_id ? [String(sprint.scope_user_id)] : [];
    return [...new Set([...target, ...admins])];
  }
  if (sprint.scope === "department") {
    const { data: staff } = await db
      .from("employees")
      .select("user_id, team")
      .eq("org_id", orgId)
      .not("user_id", "is", null);
    const dept = String(sprint.scope_department ?? "").toLowerCase();
    const inDept = (staff ?? [])
      .filter(e => String(e.team ?? "").toLowerCase() === dept)
      .map(e => String(e.user_id));
    return [...new Set([...inDept, ...admins])];
  }
  return all;
}

/** The verifier is the manager; if the office has no manager, the owner. */
async function sprintVerifier(db: Client, orgId: string): Promise<string | null> {
  const members = await orgMembers(db, orgId);
  const manager = members.find(m => m.role === "manager");
  const owner = members.find(m => m.role === "owner");
  const chosen = manager ?? owner;
  return chosen ? String(chosen.user_id) : null;
}

/** 2. The AI runs the sprints: announce, nudge, push verification, and call the result. */
async function runSprints(db: Client, apiKey: string | undefined, orgId: string, today: string) {
  const { data: sprints } = await db
    .from("team_goals")
    .select("*")
    .eq("org_id", orgId)
    .in("status", ["active", "pending_verification"]);
  if (!sprints?.length) return 0;

  let handled = 0;

  for (const s of sprints) {
    const pct = Math.min(100, Math.round((s.progress / Math.max(1, s.target_count)) * 100));
    const daysLeft = daysBetween(today, s.ends_on);
    const hitTarget = s.progress >= s.target_count;
    const verification = String(s.verification ?? "honor");
    const scopeLabel = s.scope === "department"
      ? `the ${s.scope_department} team`
      : s.scope === "individual"
      ? "one team member"
      : "the whole office";

    // A sprint waiting on a human: push the verifier, and only the verifier.
    if (s.status === "pending_verification") {
      const verifier = await sprintVerifier(db, orgId);
      if (!verifier) continue;
      const { data: openHook } = await db
        .from("reminder_hooks")
        .select("id")
        .eq("org_id", orgId)
        .eq("kind", "sprint_verify")
        .eq("ref_id", s.id)
        .eq("status", "pending")
        .limit(1);
      if ((openHook?.length ?? 0) > 0) continue;
      await db.from("reminder_hooks").insert({
        org_id: orgId,
        user_id: verifier,
        kind: "sprint_verify",
        ref_id: s.id,
        fire_at: new Date().toISOString(),
        payload: {
          title: s.title,
          metric: s.metric,
          progress: s.progress,
          target: s.target_count,
          verification,
        },
      });
      handled++;
      continue;
    }

    const announced = (s as Record<string, unknown>).created_at as string;
    const isNew = Date.parse(announced) > Date.now() - 6 * 60 * 60 * 1000;

    let kind: string | null = null;
    let title = "";
    let brief = "";
    let fallback = "";

    if (isNew) {
      kind = "sprint_announced";
      title = "New team sprint";
      fallback = `${scopeLabel} is going for ${s.target_count} ${s.metric} by ${s.ends_on}. Hit it and it's ${s.reward}.`;
      brief = `Announce a new sprint for ${scopeLabel}. Title: "${s.title}". Counting: ${s.metric}. Target: ${s.target_count} by ${s.ends_on}. Reward: ${s.reward}. ${
        verification === "honor"
          ? "The tally is on the honour system — people tap +1 on the dashboard as they go."
          : verification === "manager_approval"
          ? "The result gets confirmed by a manager at the end."
          : "The result gets checked against the office's outside report at the end."
      } No rankings.`;
    } else if (daysLeft < 0 || hitTarget) {
      // Period over, or target reached early.
      if (verification === "honor") {
        const won = hitTarget;
        await db.from("team_goals").update({ status: won ? "won" : "missed" }).eq("id", s.id);
        kind = won ? "sprint_won" : "sprint_missed";
        title = won ? "Sprint won" : "Sprint wrapped";
        fallback = won
          ? `${s.progress} ${s.metric} against a target of ${s.target_count}. That's ${s.reward}.`
          : `${s.progress} of ${s.target_count} ${s.metric} — so close. Worth another run when the time is right.`;
        brief = won
          ? `A sprint was WON: ${s.progress} ${s.metric} against a target of ${s.target_count}. The reward is ${s.reward}. Celebrate warmly and briefly, no hype.`
          : `A sprint fell short: ${s.progress} of ${s.target_count} ${s.metric} by ${s.ends_on}. Be gracious and genuinely kind — no shame, no lecture.`;
      } else {
        await db.from("team_goals").update({ status: "pending_verification" }).eq("id", s.id);
        kind = "sprint_pending_verification";
        title = "Sprint is up for verification";
        fallback = `${s.progress} of ${s.target_count} ${s.metric} recorded. The result is with the verifier now.`;
        brief = `A sprint reached the end of its run: ${s.progress} of ${s.target_count} ${s.metric}. It now waits on ${
          verification === "document"
            ? "the outside report being uploaded"
            : "a manager's confirmation"
        }. State it plainly, no verdict yet.`;
      }
    } else if (daysLeft > 0 && pct < 100 && easternWeekday() === 3) {
      // Midweek check-in with the real number.
      kind = "sprint_progress";
      title = "Sprint check-in";
      fallback = `${daysLeft} day${daysLeft === 1 ? "" : "s"} left and ${scopeLabel} is ${pct}% of the way to ${s.target_count} ${s.metric}. A push gets ${s.reward}.`;
      brief = `Mid-sprint check-in for ${scopeLabel}. ${s.progress} of ${s.target_count} ${s.metric} so far (${pct}%), ${daysLeft} day${daysLeft === 1 ? "" : "s"} left, reward is ${s.reward}. Use the real numbers. Encouraging, not pushy.`;
    }

    if (!kind) continue;
    const message = await say(apiKey, brief, fallback);
    const audience = await sprintAudience(db, orgId, s as Record<string, unknown>);
    for (const uid of audience) {
      try {
        await deliver(db, {
          org_id: orgId,
          user_id: uid,
          kind,
          title,
          message,
          related_table: "team_goals",
          related_id: s.id,
          data_refs: { progress: s.progress, target: s.target_count, ends_on: s.ends_on, scope: s.scope },
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
        .in("status", ["new", "shown"])
        .limit(1);
      if ((open?.length ?? 0) > 0) continue;
      await db.from("office_nudges").insert({
        org_id: orgId,
        user_id: a.user_id as string,
        surface: "dashboard",
        kind: "sprint_suggestion",
        content,
        data_refs: { generated_on: today },
        status: "new",
      });
      made++;
    } catch (e) {
      console.warn("suggestion skipped:", (e as Error).message);
    }
  }
  return made;
}

/**
 * 4. Close the Day coaching — one grounded observation per day, to managers,
 * on the Close the Day surface.
 *
 * Inputs are sanitized aggregates only: minute totals, counts, ratios, and
 * the closer's staffing assessment. No screenshots, no schedule notes, no
 * patient anything — those never reach this database at all. The coach's
 * charter is the whole office doing well: it must never buy revenue with
 * unsafe workloads, skipped lunches, chronic understaffing, or overbooking,
 * and a human "stretched/unsafe" answer outranks a healthy-looking schedule.
 */
async function coachCloseDay(db: Client, apiKey: string | undefined, orgId: string, today: string) {
  const yesterday = addDays(today, -1);

  const { data: log } = await db
    .from("deposit_logs")
    .select("id, deposit_date, production_cents, staffing_assessment, staffing_pressure, schedule_capture_status")
    .eq("org_id", orgId)
    .eq("deposit_date", yesterday)
    .maybeSingle();
  if (!log) return 0; // No closeout, nothing to say.

  const { data: metrics } = await db
    .from("provider_day_metrics")
    .select(
      "provider_label, department, net_bookable_minutes, scheduled_minutes, true_open_minutes, cancellation_count, cancellation_open_minutes, no_show_count, no_show_open_minutes, unclassified_minutes, automated_workload_class, continuous_without_buffer_minutes",
    )
    .eq("org_id", orgId)
    .eq("closeout_id", log.id as string);

  const trueOpen = (metrics ?? []).reduce((s, m) => s + Number(m.true_open_minutes ?? 0), 0);
  const noShowOpen = (metrics ?? []).reduce((s, m) => s + Number(m.no_show_open_minutes ?? 0), 0);
  const cancelOpen = (metrics ?? []).reduce((s, m) => s + Number(m.cancellation_open_minutes ?? 0), 0);
  const overloaded = (metrics ?? []).filter(m =>
    m.automated_workload_class === "overloaded" || m.automated_workload_class === "compressed"
  );
  const humanStrain =
    log.staffing_assessment === "stretched" ||
    log.staffing_assessment === "understaffed" ||
    log.staffing_assessment === "unsafe";

  // Quiet unless there is something real: meaningful lost time, an
  // overloaded provider, or the humans saying the day hurt.
  if (trueOpen < 90 && overloaded.length === 0 && !humanStrain) return 0;

  const facts = [
    `Yesterday (${yesterday}) closeout for this dental office.`,
    `Provider schedule aggregates: ${(metrics ?? [])
      .map(m =>
        `${m.provider_label} (${m.department}): ${m.scheduled_minutes}m booked of ${m.net_bookable_minutes}m bookable, ` +
        `${m.true_open_minutes}m true open (${m.cancellation_open_minutes}m from ${m.cancellation_count} cancellations, ` +
        `${m.no_show_open_minutes}m from ${m.no_show_count} no-shows), workload ${m.automated_workload_class ?? "n/a"}`)
      .join("; ") || "no schedule capture"}`,
    `Front desk's own read of staffing: ${log.staffing_assessment ?? "not answered"}` +
      `${Array.isArray(log.staffing_pressure) && log.staffing_pressure.length ? `, pressure on ${log.staffing_pressure.join(", ")}` : ""}.`,
  ].join("\n");

  const content = await say(
    apiKey,
    `Write ONE observation for the office managers from yesterday's closeout, using only these facts:\n${facts}\n` +
      `Cite the real minutes or counts. If the front desk said the day was stretched/understaffed/unsafe, treat that as the headline even if the schedule looked fine — the disagreement is the finding. ` +
      `HARD RULES: never suggest overbooking, double-booking, skipping lunch or admin blocks, adding patients to an overloaded provider, or running with less staff. Recovering cancelled/no-show time, confirmation habits, and staffing adjustments are the levers. ` +
      `"Might not be a bad idea to…" register, one or two sentences.`,
    "",
  );
  if (!content) return 0;

  const members = await orgMembers(db, orgId);
  const admins = members.filter(m => m.role === "owner" || m.role === "manager");
  let made = 0;
  for (const a of admins) {
    try {
      if (await isMuted(db, a.user_id as string, "close_day_insight")) continue;
      const { data: open } = await db
        .from("office_nudges")
        .select("id")
        .eq("user_id", a.user_id as string)
        .eq("kind", "close_day_insight")
        .in("status", ["new", "shown"])
        .limit(1);
      if ((open?.length ?? 0) > 0) continue;
      await db.from("office_nudges").insert({
        org_id: orgId,
        user_id: a.user_id as string,
        surface: "deposit",
        kind: "close_day_insight",
        content,
        data_refs: {
          business_date: yesterday,
          true_open_minutes: trueOpen,
          cancellation_open_minutes: cancelOpen,
          no_show_open_minutes: noShowOpen,
          staffing_assessment: log.staffing_assessment ?? null,
        },
        status: "new",
      });
      made++;
    } catch (e) {
      console.warn("close-day insight skipped:", (e as Error).message);
    }
  }
  return made;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Cron-only. This runs every office in the system with the service-role key,
  // so nothing but the scheduler may reach it.
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const bearer = req.headers.get("Authorization")?.replace("Bearer ", "").trim();
  if (!bearer || bearer !== serviceKey) {
    return json({ error: "Not authorized" }, 401);
  }

  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceKey,
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
        const closeDay = await coachCloseDay(db, apiKey, orgId, today);
        summary.push({ org_id: orgId, scheduled, sent, sprints, suggestions, closeDay });
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
