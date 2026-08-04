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
//   role_ideas   -> goal starters for a role, grounded ONLY in the office's
//                   actual policy material (org config, assistant memories,
//                   published knowledge) — never invented examples.
//
// Tone rule: encouraging, never competitive, never ranked.
// Privacy rule: a member's work-style profile may quietly shape the plan, but
// the model must NEVER mention it, allude to "your answers", or explain why a
// task was scheduled a certain way based on it.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { OFFICE_DOCTRINE } from "../_shared/office-doctrine.ts";
import { logScrub, scrubFreeText } from "../_shared/phi-scrub.ts";


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

function easternToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

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
  // Every Pathfinder call speaks with the office's one voice.
  const withDoctrine: ChatMessage[] = messages.map((m, i) =>
    i === 0 && m.role === "system"
      ? { ...m, content: `${OFFICE_DOCTRINE}\n\n---\n\n${m.content}` }
      : m,
  );
  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      reasoning_effort: "none",
      max_tokens: maxTokens,
      messages: withDoctrine,
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

    // The next team meeting on the office calendar — plans are built around it.
    const todayIso = easternToday();
    const { data: meetings } = await supabase
      .from("office_events")
      .select("event_date, title")
      .eq("org_id", membership.org_id)
      .eq("category", "team_meeting")
      .gte("event_date", todayIso)
      .order("event_date")
      .limit(1);
    const nextMeeting = (meetings ?? [])[0] ?? null;
    const meetingLine = nextMeeting
      ? `The next team meeting is ${nextMeeting.event_date}.`
      : "There is no team meeting on the calendar right now.";

    const body = (await req.json()) as {
      mode?: string;
      goalId?: string;
      month?: string;
      quickNotes?: string;
      title?: string;
      description?: string;
      message?: string;
      role?: string;
    };
    const allowed = ["breakdown", "draft_update", "polish_goal", "chat", "role_ideas"];
    const mode = allowed.includes(body.mode ?? "") ? body.mode! : "breakdown";

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
            content: `Raw goal: ${rawTitle}\nExtra context: ${bounded(body.description, 600) || "(none)"}\nMonth: ${bounded(body.month, 7) || "(this month)"}\n${meetingLine} Choose a target the person could show real movement on by then.`,
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

    // ---- role_ideas: goal starters grounded in the office's own policies ----
    if (mode === "role_ideas") {
      const ROLE_LABELS: Record<string, string> = {
        front_desk: "Front desk",
        assistant: "Dental assistant",
        hygienist: "Hygienist",
        provider: "Doctor / provider",
        billing: "Billing / insurance",
        manager: "Office manager",
      };
      const roleLabel = ROLE_LABELS[bounded(body.role, 20)];
      if (!roleLabel) return json({ error: "Bad request" }, 400);

      // Everything office-authored is staff free text, so it gets scrubbed.
      const safe = (v: unknown, n: number) => scrubFreeText(bounded(v, n), n).text;

      // The office's actual policy material, in the app's grounding order
      // (org config, assistant memories, published knowledge), read under the
      // caller's JWT so RLS scopes everything to their org.
      const [practiceRes, baRes, memoriesRes, itemsRes] = await Promise.all([
        supabase
          .from("org_practice_settings")
          .select("confirmation_lead_days")
          .eq("org_id", membership.org_id)
          .maybeSingle(),
        supabase
          .from("broken_appt_settings")
          .select("notice_business_hours, fee_amount")
          .eq("org_id", membership.org_id)
          .maybeSingle(),
        supabase
          .from("assistant_memories")
          .select("content")
          .eq("org_id", membership.org_id)
          .eq("kind", "office")
          .eq("is_active", true)
          .eq("status", "active")
          .order("created_at", { ascending: true })
          .limit(40),
        supabase
          .from("knowledge_items")
          .select("current_published_version_id")
          .eq("org_id", membership.org_id)
          .is("archived_at", null)
          .not("current_published_version_id", "is", null)
          .limit(40),
      ]);

      const confirmationLeadDays = practiceRes.data?.confirmation_lead_days ?? 2;
      const configLines = [
        `Org setting — appointment confirmation window: the team confirms appointments ${confirmationLeadDays} day(s) before the visit.`,
        baRes.data
          ? `Org setting — broken-appointment policy: at least ${baRes.data.notice_business_hours} business hours' notice to cancel or reschedule; $${Number(baRes.data.fee_amount)} scheduling fee.`
          : "",
      ].filter(Boolean);

      const memoryLines = (memoriesRes.data ?? []).map(
        (m) => `Office memory: ${safe(m.content, 300)}`,
      );

      const versionIds = (itemsRes.data ?? [])
        .map((i) => i.current_published_version_id as string | null)
        .filter((id): id is string => !!id);
      const policyLines: string[] = [];
      if (versionIds.length > 0) {
        const [versionsRes, blocksRes] = await Promise.all([
          supabase
            .from("knowledge_versions")
            .select("id, title, summary")
            .in("id", versionIds)
            .eq("status", "published"),
          supabase
            .from("knowledge_blocks")
            .select("version_id, plain_text")
            .in("version_id", versionIds)
            .order("sort_order")
            .limit(400),
        ]);
        const textByVersion = new Map<string, string>();
        for (const b of blocksRes.data ?? []) {
          const prior = textByVersion.get(b.version_id as string) ?? "";
          if (prior.length < 500) {
            textByVersion.set(
              b.version_id as string,
              `${prior} ${(b.plain_text as string) ?? ""}`.trim(),
            );
          }
        }
        for (const v of versionsRes.data ?? []) {
          const bodyText = safe(textByVersion.get(v.id as string), 500);
          policyLines.push(
            `Published policy "${safe(v.title, 120)}": ${safe(v.summary, 200)}${
              bodyText ? ` — ${bodyText}` : ""
            }`,
          );
        }
      }

      const material = [...configLines, ...memoryLines, ...policyLines];

      const raw = await callModel(
        apiKey,
        [
          {
            role: "system",
            content:
              "You suggest monthly goal starters for one role in a dental practice's team app. The office's OWN policy material (provided below) is the only source of office-specific facts. " +
              "Rules: 1) Ground every idea in a specific line of the material and name that source in a short 'basis' (e.g. 'Confirmation window setting', 'Published policy: Recall'). 2) NEVER invent an office-specific number, time window, fee, or rule that is not in the material — that is the whole point of this mode. 3) If the material does not cover this role's work, return at most ONE generally-good-practice idea that asserts no office-specific specifics, with basis exactly 'No office policy on file'. Fewer well-grounded ideas beat padding — zero ideas is an acceptable answer. " +
              "4) Each idea is one encouraging sentence (max 140 chars) phrased as a personal monthly goal for this role, with a measurable target (max 40 chars) consistent with the material. 5) Also give up to 4 one-tap measurable target chips (max 32 chars each) consistent with the ideas. 6) Calm, professional, never gamified. " +
              'Reply with ONLY JSON: {"ideas":[{"title":string,"target":string,"basis":string}],"targets":[string]}',
          },
          {
            role: "user",
            content: `Role: ${roleLabel}\n\nOFFICE POLICY MATERIAL:\n${
              material.length > 0
                ? material.join("\n")
                : "(the office has no recorded policies yet)"
            }`,
          },
        ],
        700,
      );
      if (raw === null) return json({ error: "AI request failed" }, 502);
      const parsed = parseJsonBlock<{ ideas?: unknown; targets?: unknown }>(raw);
      if (!parsed) return json({ error: "Pathfinder could not suggest ideas" }, 502);
      const ideas = (Array.isArray(parsed.ideas) ? parsed.ideas : [])
        .map((i: Record<string, unknown>) => ({
          title: bounded(i?.title, 160),
          target: bounded(i?.target, 60),
          basis: bounded(i?.basis, 80),
        }))
        .filter((i) => i.title !== "")
        .slice(0, 4);
      const targets = (Array.isArray(parsed.targets) ? parsed.targets : [])
        .map((t: unknown) => bounded(t, 40))
        .filter((t) => t !== "")
        .slice(0, 4);
      return json({ ideas, targets });
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
      const today = easternToday();
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
        meetingLine,
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
              "MEETING AWARENESS: when a team meeting date is given, front-load real, visible progress before it so the person has something genuine to share, and write a one-sentence 'intro' that mentions the meeting naturally (e.g. 'Your next team meeting is Aug 12 — this plan gets you something real to share'). If there is no meeting on the calendar, write a warm one-sentence intro without inventing a date. " +
              "LEARNING RESOURCE: decide honestly whether a short training module built for this office would genuinely help. Say yes when the goal needs skill or language the person does not have yet (explaining treatment, handling objections, phone scripts, insurance conversations). Say no for simple habit or count goals. When yes, give a specific topic phrased for this office and the index of the plan step it belongs to. " +
              "NEVER explain your scheduling reasoning, never reference any profile, answers, questionnaire, preferences, or 'based on…' anything. " +
              'Reply with ONLY JSON: {"intro":string,"tasks":[{"title":string,"due_date":"YYYY-MM-DD"}],"resource":{"needed":boolean,"topic":string,"audience":[string],"attach_to_task":number}}',
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
        1200
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
          training_module_id: null as string | null,
        }))
        .filter((t) => t.title !== "")
        .slice(0, 8);
      if (tasks.length === 0) return json({ error: "Pathfinder could not build a plan" }, 502);

      const intro = bounded(parsed.intro, 300);

      // A learning resource lives in the central Training Library like any
      // other module — we just tag it with the goal it was written for.
      let module: { id: string; title: string } | null = null;
      const resource = parsed.resource ?? {};
      const wantsResource = resource.needed === true && bounded(resource.topic, 160) !== "";
      if (wantsResource) {
        try {
          const built = await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/training-builder`,
            {
              method: "POST",
              headers: {
                Authorization: authHeader,
                "Content-Type": "application/json",
                apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
              },
              body: JSON.stringify({
                topic: bounded(resource.topic, 160),
                audience: Array.isArray(resource.audience)
                  ? resource.audience.map((a: unknown) => bounded(a, 60)).filter(Boolean).slice(0, 4)
                  : [],
                origin_goal_id: goal.id,
              }),
            }
          );
          if (built.ok) {
            const payload = await built.json();
            if (payload?.module?.id) {
              module = { id: payload.module.id, title: payload.module.title };
              const idx = Number(resource.attach_to_task);
              const at = Number.isInteger(idx) && idx >= 0 && idx < tasks.length ? idx : 0;
              tasks[at].training_module_id = module.id;
            }
          } else {
            console.error("training-builder failed", built.status, await built.text());
          }
        } catch (e) {
          console.error("training-builder call failed", e);
        }
      }

      return json({ tasks, intro, module });
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
      // Person-level detail never leaves for the gateway, whatever was typed.
      const scrubbed = scrubFreeText(bounded(body.message, 2000), 2000);
      logScrub("goal-assistant.chat", scrubbed);
      const message = scrubbed.text;
      if (!message) return json({ error: "Bad request" }, 400);


      const { data: recentUpdates } = await supabase
        .from("goal_updates")
        .select("status, content, created_at")
        .eq("goal_id", goal.id)
        .order("created_at", { ascending: false })
        .limit(5);

      // Everything below is staff free text, so everything below gets scrubbed.
      const safe = (v: unknown, n: number) => scrubFreeText(bounded(v, n), n).text;

      const context = [
        `Goal: ${safe(goal.title, 200)}`,
        `Measurable target: ${safe(goal.smart_target, 80) || "(none set yet)"}`,
        `Description: ${safe(goal.description, 800) || "(none)"}`,
        `Month: ${month}`,
        `Steps: ${
          (goalTasks ?? [])
            .map((t) => `${t.done ? "[done] " : "[open] "}${safe(t.title, 90)}${t.due_date ? ` (due ${t.due_date})` : ""}`)
            .join("; ") || "(no plan yet)"
        }`,
        `Recent team updates: ${
          (recentUpdates ?? [])
            .map((u) => `${u.status}: ${safe(u.content, 300)}`)
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
          content: safe(m.content, 2000),
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

    // Checklist titles are office-authored free text and can name people or
    // procedures. Pathfinder only needs the volume, so it only gets the count.
    const checkoffCount = (checkoffs ?? []).length;

    // Everything below is staff free text, so everything below gets scrubbed.
    const safe = (v: unknown, n: number) => scrubFreeText(bounded(v, n), n).text;

    const conversation = (thread ?? [])
      .slice(-20)
      .map((m) => `${m.author === "pathfinder" ? "Pathfinder" : "Member"}: ${safe(m.content, 400)}`)
      .join("\n");

    const raw = await callModel(
      apiKey,
      [
        {
          role: "system",
          content:
            "You are Pathfinder, helping one person write the short progress update they will read aloud at their next team meeting — write it as if the meeting is the moment it will be shared. Write 3 to 5 sentences in the person's own first-person voice — plain, warm, honest, specific about what actually got done and what is next. No hype, no scoring, no comparison to teammates, no bullet points. " +
            "When the goal has a measurable target, frame the update against it — say where they are versus that target in their own words. " +
            "Also pick a status: on_track, at_risk, or done. " +
            "NEVER reference any profile, questionnaire, answers, or 'based on…' anything, and never mention that you talked with them. " +
            'Reply with ONLY JSON: {"content":string,"status":"on_track"|"at_risk"|"done"}',
        },
        {
          role: "user",
          content: [
            `Goal: ${safe(goal.title, 200)}`,
            `Measurable target: ${safe(goal.smart_target, 80) || "(none set)"}`,
            `Description: ${safe(goal.description, 600) || "(none)"}`,
            `Finished since the last update: ${
              doneSince.map((t) => safe(t.title, 90)).join("; ") || "(nothing recorded)"
            }`,
            `Still open: ${open.map((t) => safe(t.title, 90)).join("; ") || "(none)"}`,
            `Checklist items checked off since the last update: ${checkoffCount}`,
            meetingLine,
            `Their private coaching conversation (background only, never quote it):\n${conversation || "(none)"}`,
            `The member's own quick notes: ${safe(body.quickNotes, 800) || "(none)"}`,
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
