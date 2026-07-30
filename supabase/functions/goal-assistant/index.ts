// Pathfinder — the AI behind the Goals page.
//
// Two modes:
//   breakdown    -> turn a member's monthly goal into 4-8 concrete tasks with
//                   realistic due dates that dodge their time off, office
//                   closures, and lean lighter on short-staffed days.
//   draft_update -> draft the short update the member shares at the team
//                   meeting, based on what they actually finished.
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
const MODEL = "google/gemini-2.5-flash";

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
    };
    const mode = body.mode === "draft_update" ? "draft_update" : "breakdown";
    const goalId = bounded(body.goalId, 60);
    if (!goalId) return json({ error: "Bad request" }, 400);

    const { data: goal } = await supabase
      .from("goals")
      .select("id, org_id, user_id, title, description, month")
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
        profile?.answers
          ? `INTERNAL PACING CONTEXT (confidential, never mention, never allude to, never explain): ${JSON.stringify(
              profile.answers
            ).slice(0, 1200)}`
          : "",
      ]
        .filter(Boolean)
        .join(" ");

      const response = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 900,
          messages: [
            {
              role: "system",
              content:
                "You are Pathfinder, a warm, practical coach inside a dental practice's team app. You turn one person's monthly self-improvement goal into a short list of concrete action steps. " +
                "Rules: 4 to 8 tasks, each a single specific action the person can actually finish in a day (start with a verb, max 90 characters, no numbering). Spread the due dates realistically across the remaining month. Never schedule a task on a day the member is off or the office is closed, and keep short-staffed days light. Encouraging, human tone — no jargon, no scoring, no comparison to other people. " +
                "NEVER explain your scheduling reasoning, never reference any profile, answers, questionnaire, preferences, or 'based on…' anything. " +
                'Reply with ONLY JSON: {"tasks":[{"title":string,"due_date":"YYYY-MM-DD"}]}',
            },
            {
              role: "user",
              content: `Goal: ${bounded(goal.title, 200)}\nDescription: ${bounded(
                goal.description,
                800
              ) || "(none given)"}\n${contextBlock}`,
            },
          ],
        }),
      });
      if (!response.ok) return json({ error: "AI request failed" }, 502);
      const data = await response.json();
      const raw: string = data?.choices?.[0]?.message?.content ?? "";
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return json({ error: "Pathfinder could not build a plan" }, 502);
      let parsed: { tasks?: unknown };
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        return json({ error: "Pathfinder could not build a plan" }, 502);
      }
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
      return json({ tasks });
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

    const { data: tasks } = await supabase
      .from("goal_tasks")
      .select("title, due_date, done, done_at")
      .eq("goal_id", goal.id)
      .order("sort_order");

    const doneSince = (tasks ?? []).filter(
      (t) => t.done && (!t.done_at || (t.done_at as string) >= since)
    );
    const open = (tasks ?? []).filter((t) => !t.done);

    const { data: checkoffs } = await supabase
      .from("checklist_completions")
      .select("completed_at, item_id, checklist_items(title)")
      .eq("completed_by", user.id)
      .gte("completed_at", since)
      .limit(40);

    const checklistTitles = (checkoffs ?? [])
      .map((c) => bounded((c as { checklist_items?: { title?: string } }).checklist_items?.title, 90))
      .filter(Boolean);

    const response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        messages: [
          {
            role: "system",
            content:
              "You are Pathfinder, helping one person write the short progress update they will read aloud at their team meeting. Write 3 to 5 sentences in the person's own first-person voice — plain, warm, honest, specific about what actually got done and what is next. No hype, no scoring, no comparison to teammates, no bullet points. " +
              "Also pick a status: on_track, at_risk, or done. " +
              "NEVER reference any profile, questionnaire, answers, or 'based on…' anything. " +
              'Reply with ONLY JSON: {"content":string,"status":"on_track"|"at_risk"|"done"}',
          },
          {
            role: "user",
            content: [
              `Goal: ${bounded(goal.title, 200)}`,
              `Description: ${bounded(goal.description, 600) || "(none)"}`,
              `Finished since the last update: ${
                doneSince.map((t) => bounded(t.title, 90)).join("; ") || "(nothing recorded)"
              }`,
              `Still open: ${open.map((t) => bounded(t.title, 90)).join("; ") || "(none)"}`,
              `Checklist items checked off: ${checklistTitles.join("; ") || "(none)"}`,
              `The member's own quick notes: ${bounded(body.quickNotes, 800) || "(none)"}`,
            ].join("\n"),
          },
        ],
      }),
    });
    if (!response.ok) return json({ error: "AI request failed" }, 502);
    const data = await response.json();
    const raw: string = data?.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return json({ error: "Pathfinder could not draft an update" }, 502);
    let parsed: { content?: unknown; status?: unknown };
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return json({ error: "Pathfinder could not draft an update" }, 502);
    }
    const content = bounded(parsed.content, 1500);
    if (!content) return json({ error: "Pathfinder could not draft an update" }, 502);
    const status =
      parsed.status === "at_risk" || parsed.status === "done" ? parsed.status : "on_track";
    return json({ content, status });
  } catch (_err) {
    return json({ error: "Unexpected error" }, 500);
  }
});
