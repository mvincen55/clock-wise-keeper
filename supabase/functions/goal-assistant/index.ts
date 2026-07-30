// Pathfinder — the AI behind the Goals page.
//
// Modes:
//   breakdown    -> turn a member's monthly goal into 4-8 concrete tasks with
//                   realistic due dates that dodge their time off, office
//                   closures, and lean lighter on short-staffed days.
//   draft_update -> draft the short update the member shares at the team
//                   meeting, based on what they actually finished (and their
//                   Pathfinder conversation).
//   polish_goal  -> rewrite a raw goal into one clear professional sentence.
//   chat         -> persistent per-goal conversation with Pathfinder.
//
// Tone rule: encouraging, never competitive, never ranked.
// Privacy rule: a member's work-style profile may quietly shape the plan, but
// the model must NEVER mention it, allude to "your answers", or explain why a
// task was scheduled a certain way based on it.

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

const bounded = (value: unknown, cap: number): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, cap) : "";

/** Last day of a "YYYY-MM" month. */
function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}` };
}

function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(`${start}T12:00:00Z`);
  const e = new Date(`${end}T12:00:00Z`);
  for (let d = s; d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

async function callModel(apiKey: string, messages: ChatMessage[], maxTokens: number) {
  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      reasoning_effort: "none",
      max_tokens: maxTokens,
      messages,
    }),
  });
  if (!response.ok) return null;
  const data = await response.json();
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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI is not configured" }, 500);

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

    const body = (await req.json()) as {
      mode?: string;
      goalId?: string;
      month?: string;
      quickNotes?: string;
      title?: string;
      description?: string;
      message?: string;
      topic?: string;
      taskId?: string;
    };
    const allowed = ["breakdown", "draft_update", "polish_goal", "chat", "build_resource"];
    const mode = allowed.includes(body.mode ?? "") ? body.mode! : "breakdown";

    // The next team meeting on the office calendar — Pathfinder paces to it.
    const todayIso = new Date().toISOString().slice(0, 10);
    const { data: nextMeeting } = await supabase
      .from("office_events")
      .select("event_date, title")
      .eq("org_id", membership.org_id)
      .eq("category", "team_meeting")
      .gte("event_date", todayIso)
      .order("event_date", { ascending: true })
      .limit(1)
      .maybeSingle();
    const meetingDate = (nextMeeting?.event_date as string | undefined) ?? null;
    const meetingLabel = meetingDate
      ? new Date(`${meetingDate}T12:00:00Z`).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        })
      : null;
    const daysToMeeting = meetingDate
      ? Math.round(
          (new Date(`${meetingDate}T12:00:00Z`).getTime() -
            new Date(`${todayIso}T12:00:00Z`).getTime()) /
            86400000
        )
      : null;
    const meetingContext = meetingDate
      ? `The next team meeting is ${meetingLabel} (${meetingDate}), ${daysToMeeting} day(s) away. Front-load meaningful, visible progress BEFORE that date so the member has something real to share, then keep going after it.`
      : "No team meeting is scheduled yet — pace the plan evenly across the remaining month.";

    // ---- polish_goal: no goal row exists yet ----
    if (mode === "polish_goal") {
      const rawTitle = bounded(body.title, 300);
      if (!rawTitle) return json({ error: "Bad request" }, 400);
      const raw = await callModel(
        apiKey,
        [
          {
            role: "system",
            content:
              "You turn a dental practice team member's rough monthly self-improvement goal into a genuine SMART goal for a ONE-MONTH horizon: Specific, Measurable, Achievable, Relevant to their role, Time-bound to this month. " +
              "Preserve their intent and scope — never swap the subject of the goal. If their words have no measure, INFER a reasonable, modest one from the goal and a dental-practice role (e.g. 'work on explaining treatment to patients' -> 'Use the teach-back method at every treatment presentation this month and ask a teammate for feedback at least 4 times'). Keep it to ONE first-person sentence, max 180 characters, no quotes, no trailing period. " +
              "Also return the measurable target as a very short phrase (max 40 chars, e.g. '4 feedback asks', '10 same-day reappointments'), and a one-line SMART read-out: for each of specific, measurable, achievable, relevant, time_bound, a few words (max 40 chars) saying how the polished goal satisfies it. If an element is genuinely missing, write a gentle nudge instead (e.g. 'add a number to make this measurable'). Never scold. " +
              'Reply with ONLY JSON: {"title":string,"target":string,"smart":{"specific":string,"measurable":string,"achievable":string,"relevant":string,"time_bound":string}}',
          },
          {
            role: "user",
            content: `Raw goal: ${rawTitle}\nExtra context: ${bounded(body.description, 600) || "(none)"}\nMonth: ${bounded(body.month, 7) || "(this month)"}\nCalendar: ${meetingContext}`,
          },
        ],
        400
      );
      const parsed = raw
        ? parseJsonBlock<{ title?: unknown; target?: unknown; smart?: Record<string, unknown> }>(raw)
        : null;
      const title = bounded(parsed?.title, 220) || rawTitle;
      const target = bounded(parsed?.target, 60) || null;
      const sm = parsed?.smart ?? {};
      const smart = {
        specific: bounded(sm.specific, 60),
        measurable: bounded(sm.measurable, 60),
        achievable: bounded(sm.achievable, 60),
        relevant: bounded(sm.relevant, 60),
        time_bound: bounded(sm.time_bound, 60),
      };
      return json({ title, original: rawTitle, target, smart });
    }

    const goalId = bounded(body.goalId, 60);
    if (!goalId) return json({ error: "Bad request" }, 400);

    const { data: goal } = await supabase
      .from("goals")
      .select("id, org_id, user_id, title, description, month, smart_target")
      .eq("id", goalId)
      .maybeSingle();
    if (!goal) return json({ error: "Goal not found" }, 404);
    if (goal.user_id !== user.id) return json({ error: "Unauthorized" }, 403);

    const month = /^\d{4}-\d{2}$/.test(goal.month) ? goal.month : bounded(body.month, 7);
    const { start, end } = monthBounds(month);

    // Quiet context — never surfaced to the member.
    const { data: profile } = await supabase
      .from("work_style_profiles")
      .select("answers")
      .eq("user_id", user.id)
      .maybeSingle();

    if (mode === "breakdown") {
      const today = new Date().toISOString().slice(0, 10);
      const planFrom = today > start ? today : start;

      const { data: daysOff } = await supabase
        .from("days_off")
        .select("user_id, date_start, date_end, type")
        .lte("date_start", end)
        .gte("date_end", start);

      const { data: closures } = await supabase
        .from("office_closures")
        .select("closure_date, name")
        .gte("closure_date", start)
        .lte("closure_date", end);

      const myOff = new Set<string>();
      const staffOffCount = new Map<string, number>();
      for (const row of daysOff ?? []) {
        for (const d of datesBetween(row.date_start as string, row.date_end as string)) {
          if (d < start || d > end) continue;
          if (row.user_id === user.id) myOff.add(d);
          else staffOffCount.set(d, (staffOffCount.get(d) ?? 0) + 1);
        }
      }
      const closureDates = (closures ?? []).map(
        (c) => `${c.closure_date}${c.name ? ` (${c.name})` : ""}`
      );
      const shortStaffed = [...staffOffCount.entries()]
        .filter(([, n]) => n > 0)
        .map(([d, n]) => `${d} (${n} teammate${n > 1 ? "s" : ""} out)`);

      const contextBlock = [
        `Month: ${month}. Plan due dates between ${planFrom} and ${end}.`,
        myOff.size > 0
          ? `The member is OFF on these dates — never give them a task due then: ${[...myOff].join(", ")}.`
          : "The member has no approved time off this month.",
        closureDates.length > 0
          ? `The office is CLOSED on: ${closureDates.join(", ")} — no tasks due then.`
          : "No office closures this month.",
        shortStaffed.length > 0
          ? `Short-staffed days (go lighter, avoid heavy tasks): ${shortStaffed.join(", ")}.`
          : "",
        meetingContext,
        profile?.answers
          ? `INTERNAL PACING CONTEXT (confidential, never mention, never allude to, never explain): ${JSON.stringify(
              profile.answers
            ).slice(0, 1200)}`
          : "",
      ]
        .filter(Boolean)
        .join(" ");

      const raw = await callModel(
        apiKey,
        [
          {
            role: "system",
            content:
              "You are Pathfinder, a warm, practical coach inside a dental practice's team app. You turn one person's monthly self-improvement goal into a short list of concrete action steps. " +
              "Rules: 4 to 8 tasks. The steps must ladder up to the goal's measurable target when one is given — finishing every step should achieve that target by the end of the month, so make the counts add up. Every task title is a short, clean, professional imperative sentence starting with a verb — proper sentence casing, correct grammar, no numbering, no filler, max 90 characters. Spread the due dates realistically across the remaining month. Never schedule a task on a day the member is off or the office is closed, and keep short-staffed days light. Encouraging, human tone — no jargon, no scoring, no comparison to other people. " +
              "Pace the plan around the team meeting when one is given: at least half of the steps should land BEFORE it so the member has something real to share there. " +
              "Also write a short intro of 1-2 warm sentences that names the plan's shape and references the next team meeting naturally when there is one (e.g. 'Your next team meeting is Aug 12 — this plan gets you something real to share'). " +
              "Then decide whether a short learning resource from the practice's training library would genuinely help this goal. Be judgemental, not automatic: a skill or communication goal (explaining treatment, handling objections, phone etiquette) usually deserves one; a simple habit or admin goal usually does not. If it would help, give a specific topic in one line and the 1-based index of the plan step it should attach to. " +
              "NEVER explain your scheduling reasoning, never reference any profile, answers, questionnaire, preferences, or 'based on…' anything. " +
              'Reply with ONLY JSON: {"intro":string,"tasks":[{"title":string,"due_date":"YYYY-MM-DD"}],"resource":{"needed":boolean,"topic":string,"attach_to_step":number}}',
          },
          {
            role: "user",
            content: `Goal: ${bounded(goal.title, 200)}\nMeasurable target: ${
              bounded(goal.smart_target, 80) || "(none stated — infer a sensible one from the goal)"
            }\nDescription: ${
              bounded(goal.description, 800) || "(none given)"
            }\n${contextBlock}`,
          },
        ],
        900
      );
      if (raw === null) return json({ error: "AI request failed" }, 502);
      const parsed = parseJsonBlock<{ tasks?: unknown; intro?: unknown; resource?: Record<string, unknown> }>(raw);
      if (!parsed) return json({ error: "Pathfinder could not build a plan" }, 502);
      const tasks = (Array.isArray(parsed.tasks) ? parsed.tasks : [])
        .map((t: Record<string, unknown>) => ({
          title: bounded(t?.title, 120),
          due_date:
            typeof t?.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.due_date)
              ? t.due_date
              : null,
        }))
        .filter((t) => t.title !== "")
        .slice(0, 8);
      if (tasks.length === 0) return json({ error: "Pathfinder could not build a plan" }, 502);

      const res = parsed.resource ?? {};
      const resourceTopic = bounded(res.topic, 200);
      const attachStep = Number(res.attach_to_step);
      const resource =
        res.needed === true && resourceTopic
          ? {
              topic: resourceTopic,
              attach_to_step:
                Number.isInteger(attachStep) && attachStep >= 1 && attachStep <= tasks.length
                  ? attachStep
                  : 1,
            }
          : null;

      return json({
        tasks,
        intro: bounded(parsed.intro, 400),
        meeting_date: meetingDate,
        resource,
      });
    }

    // ---- build_resource: Pathfinder commissions a training module ----------
    // The Training Library is the single source of truth. We call
    // training-builder with the goal's context, then link the module back to
    // the goal (origin_goal_id) and, when asked, to a specific plan step.
    if (mode === "build_resource") {
      const topic = bounded(body.topic, 300);
      if (!topic) return json({ error: "Bad request" }, 400);

      const builderResponse = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/training-builder`,
        {
          method: "POST",
          headers: {
            Authorization: authHeader,
            apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            topic: `${topic} — supporting a team member's monthly goal: ${bounded(goal.title, 200)}${
              goal.smart_target ? ` (target: ${bounded(goal.smart_target, 80)})` : ""
            }`,
            audience: ["all"],
            origin_goal_id: goal.id,
          }),
        }
      );

      const builderBody = await builderResponse.json().catch(() => null);
      if (!builderResponse.ok || !builderBody?.module) {
        return json(
          { error: builderBody?.error ?? "Could not build the training resource." },
          builderResponse.status === 429 || builderResponse.status === 402
            ? builderResponse.status
            : 502
        );
      }

      const moduleRow = builderBody.module as { id: string; title: string };

      // Make sure the module is linked to this goal even if the builder
      // could not set it (older deployments).
      await supabase
        .from("training_modules")
        .update({ origin_goal_id: goal.id })
        .eq("id", moduleRow.id)
        .is("origin_goal_id", null);

      // Assign it to the goal's owner so their state is tracked.
      await supabase.from("training_assignments").upsert(
        {
          org_id: goal.org_id,
          module_id: moduleRow.id,
          assigned_to: goal.user_id,
          assigned_by: user.id,
        },
        { onConflict: "module_id,assigned_to" }
      );

      const taskId = bounded(body.taskId, 60);
      if (taskId) {
        await supabase
          .from("goal_tasks")
          .update({ training_module_id: moduleRow.id })
          .eq("id", taskId)
          .eq("goal_id", goal.id);
      }

      return json({ module: { id: moduleRow.id, title: moduleRow.title } });
    }

    // Shared: the persistent Pathfinder thread for this goal.
    const { data: thread } = await supabase
      .from("goal_messages")
      .select("author, content, created_at")
      .eq("goal_id", goal.id)
      .order("created_at", { ascending: true })
      .limit(200);

    const { data: goalTasks } = await supabase
      .from("goal_tasks")
      .select("title, due_date, done, done_at")
      .eq("goal_id", goal.id)
      .order("sort_order");

    if (mode === "chat") {
      const message = bounded(body.message, 2000);
      if (!message) return json({ error: "Bad request" }, 400);

      const { data: recentUpdates } = await supabase
        .from("goal_updates")
        .select("status, content, created_at")
        .eq("goal_id", goal.id)
        .order("created_at", { ascending: false })
        .limit(5);

      const context = [
        `Goal: ${bounded(goal.title, 200)}`,
        `Measurable target: ${bounded(goal.smart_target, 80) || "(none set yet)"}`,
        `Description: ${bounded(goal.description, 800) || "(none)"}`,
        `Month: ${month}`,
        `Steps: ${
          (goalTasks ?? [])
            .map((t) => `${t.done ? "[done] " : "[open] "}${bounded(t.title, 90)}${t.due_date ? ` (due ${t.due_date})` : ""}`)
            .join("; ") || "(no plan yet)"
        }`,
        `Recent team updates: ${
          (recentUpdates ?? [])
            .map((u) => `${u.status}: ${bounded(u.content, 300)}`)
            .join(" | ") || "(none)"
        }`,
        profile?.answers
          ? `INTERNAL PACING CONTEXT (confidential, never mention, never allude to, never explain): ${JSON.stringify(profile.answers).slice(0, 1200)}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      const messages: ChatMessage[] = [
        {
          role: "system",
          content:
            "You are Pathfinder, a warm, practical coach inside a dental practice's team app, talking privately with one team member about their monthly goal. When they ask for help shaping, tightening or adjusting the goal, coach them toward SMART naturally in conversation — specific, measurable, achievable, relevant to their role, time-bound to this month — by suggesting a concrete number or timeframe rather than lecturing them about the framework or listing the letters. Be calm, encouraging, concrete and brief (1-4 short paragraphs max, plain sentences, no bullet spam, no hype, no scoring, no comparison to teammates). You remember the whole conversation. " +
            "NEVER reference any profile, questionnaire, answers, or 'based on…' anything.\n\n" +
            context,
        },
        ...(thread ?? []).map((m) => ({
          role: (m.author === "pathfinder" ? "assistant" : "user") as "assistant" | "user",
          content: bounded(m.content, 2000),
        })),
        { role: "user", content: message },
      ];

      const raw = await callModel(apiKey, messages, 700);
      if (raw === null) return json({ error: "AI request failed" }, 502);
      const reply = bounded(raw, 3000);
      if (!reply) return json({ error: "Pathfinder had nothing to say" }, 502);

      const { error: insertError } = await supabase.from("goal_messages").insert([
        { org_id: goal.org_id, goal_id: goal.id, author: "member", content: message },
        { org_id: goal.org_id, goal_id: goal.id, author: "pathfinder", content: reply },
      ]);
      if (insertError) return json({ error: "Could not save the conversation" }, 500);

      return json({ reply });
    }

    // mode === "draft_update"
    const { data: lastUpdate } = await supabase
      .from("goal_updates")
      .select("created_at")
      .eq("goal_id", goal.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const since = (lastUpdate?.created_at as string | undefined) ?? `${start}T00:00:00Z`;

    const doneSince = (goalTasks ?? []).filter(
      (t) => t.done && (!t.done_at || (t.done_at as string) >= since)
    );
    const open = (goalTasks ?? []).filter((t) => !t.done);

    const { data: checkoffs } = await supabase
      .from("checklist_completions")
      .select("completed_at, item_id, checklist_items(title)")
      .eq("completed_by", user.id)
      .gte("completed_at", since)
      .limit(40);

    const checklistTitles = (checkoffs ?? [])
      .map((c) => bounded((c as { checklist_items?: { title?: string } }).checklist_items?.title, 90))
      .filter(Boolean);

    // Changes the member made to this goal since their last update — they own
    // it at the meeting, so the drafted update mentions it naturally.
    const { data: changeEvents } = await supabase
      .from("goal_events")
      .select("type, reason, old_title, new_title, created_at")
      .eq("goal_id", goal.id)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(10);

    const changeLines = (changeEvents ?? []).map((e) => {
      const verb =
        e.type === "edited"
          ? "reworded the goal"
          : e.type === "replaced"
            ? "dropped the previous goal and replaced it"
            : "dropped the previous goal";
      return `${verb}: from "${bounded(e.old_title, 140)}"${
        e.new_title ? ` to "${bounded(e.new_title, 140)}"` : ""
      } — their reason: ${bounded(e.reason, 300)}`;
    });

    const conversation = (thread ?? [])
      .slice(-20)
      .map((m) => `${m.author === "pathfinder" ? "Pathfinder" : "Member"}: ${bounded(m.content, 400)}`)
      .join("\n");

    const raw = await callModel(
      apiKey,
      [
        {
          role: "system",
          content:
            "You are Pathfinder, helping one person write the short progress update they will read aloud at their team meeting. " +
            (meetingDate
              ? `Frame it for the upcoming team meeting on ${meetingLabel}: what they will be able to say there, and what they are doing next. Do not print the raw date. `
              : "") +
            " Write 3 to 5 sentences in the person's own first-person voice — plain, warm, honest, specific about what actually got done and what is next. No hype, no scoring, no comparison to teammates, no bullet points. " +
            (changeLines.length
              ? "IMPORTANT: they changed this goal since their last update. Work that into the update naturally and without apology — say plainly what changed and why, in their own voice, as part of what they are reporting. "
              : "") +
            "When the goal has a measurable target, frame the update against it — say where they are versus that target in their own words. " +
            "Also pick a status: on_track, at_risk, or done. " +
            "NEVER reference any profile, questionnaire, answers, or 'based on…' anything, and never mention that you talked with them. " +
            'Reply with ONLY JSON: {"content":string,"status":"on_track"|"at_risk"|"done"}',
        },
        {
          role: "user",
          content: [
            `Goal: ${bounded(goal.title, 200)}`,
            `Measurable target: ${bounded(goal.smart_target, 80) || "(none set)"}`,
            `Description: ${bounded(goal.description, 600) || "(none)"}`,
            `Finished since the last update: ${
              doneSince.map((t) => bounded(t.title, 90)).join("; ") || "(nothing recorded)"
            }`,
            `Still open: ${open.map((t) => bounded(t.title, 90)).join("; ") || "(none)"}`,
            `Checklist items checked off: ${checklistTitles.join("; ") || "(none)"}`,
            `Changes they made to the goal since the last update: ${
              changeLines.join(" | ") || "(none)"
            }`,
            `Their private coaching conversation (background only, never quote it):\n${conversation || "(none)"}`,
            `The member's own quick notes: ${bounded(body.quickNotes, 800) || "(none)"}`,
          ].join("\n"),
        },
      ],
      500
    );
    if (raw === null) return json({ error: "AI request failed" }, 502);
    const parsed = parseJsonBlock<{ content?: unknown; status?: unknown }>(raw);
    if (!parsed) return json({ error: "Pathfinder could not draft an update" }, 502);
    const content = bounded(parsed.content, 1500);
    if (!content) return json({ error: "Pathfinder could not draft an update" }, 502);
    const status =
      parsed.status === "at_risk" || parsed.status === "done" ? parsed.status : "on_track";
    return json({ content, status });
  } catch (_err) {
    return json({ error: "Unexpected error" }, 500);
  }
});
