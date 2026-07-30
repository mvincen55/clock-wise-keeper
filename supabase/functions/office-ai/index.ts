// Office AI — the private channel between the office and one person.
//
// Actions:
//   reply     -> answer the member's latest message in their AI conversation.
//   proactive -> deliver at most ONE unprompted message per day (brief/nudge),
//                grounded in that person's real numbers.
//
// House rules baked into the prompt:
//   - receipts: every claim cites the real number behind it
//   - office rules (assistant_memories) are authoritative
//   - NO patient data, ever
//   - calm colleague tone, never a dashboard
//   - the member's work-style profile shapes the delivery but is NEVER revealed
//   - fails open: any error returns ok:false without breaking the app

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

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

async function callModel(apiKey: string, messages: ChatMessage[], maxTokens = 700) {
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return (data?.choices?.[0]?.message?.content as string | undefined)?.trim() ?? null;
}

const HOUSE_RULES = `You are the office AI for a dental practice. You speak to ONE person, privately.

How you write:
- Calm colleague, never a dashboard and never a cheerleader. Short paragraphs, no bullet spam.
- Receipts: every claim you make cites the real number or date behind it. If you do not have the number, do not make the claim.
- Never mention patients or any patient information. Never invent data.
- The office rules given to you are authoritative. If something conflicts with them, the rules win.
- Never reveal, hint at, or explain the person's work-style profile or that one exists. It only shapes your delivery.
- Never share anything about other people's private messages.
- Keep it to 120 words unless they asked for detail.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, error: "Missing authorization" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ ok: false, error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const action = body?.action === "proactive" ? "proactive" : "reply";
    if (!apiKey) return json({ ok: false, error: "AI is not configured" });

    const { data: membership } = await supabase
      .from("org_members")
      .select("org_id, role")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (!membership) return json({ ok: false, error: "No organization" }, 403);
    const orgId = membership.org_id as string;

    // The private AI conversation for this person (created on demand).
    const { data: convId, error: convErr } = await supabase.rpc("ensure_ai_conversation");
    if (convErr || !convId) return json({ ok: false, error: "No channel" });
    const conversationId = convId as string;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const today = new Date().toISOString().slice(0, 10);
    const since14 = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);

    // ---- one proactive message per day, unless they replied ----
    if (action === "proactive") {
      const startOfDay = `${today}T00:00:00.000Z`;
      const { count: todayCount } = await admin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conversationId)
        .eq("sender_kind", "pathfinder")
        .gte("created_at", startOfDay);
      if ((todayCount ?? 0) > 0) return json({ ok: true, skipped: "already_today", conversationId });
    }

    // ---------------- grounding ----------------
    const [
      employeeRes, goalsRes, trainingRes, attendanceRes, checklistRes,
      rulesRes, styleRes, nudgeRes, historyRes, ptoRes,
    ] = await Promise.all([
      supabase.from("employees").select("id, display_name, team, learning_style, hire_date")
        .eq("user_id", user.id).eq("org_id", orgId).maybeSingle(),
      supabase.from("goals").select("id, title, smart_target, status, month, progress_percent, archived_at")
        .eq("user_id", user.id).is("archived_at", null).order("created_at", { ascending: false }).limit(3),
      supabase.from("training_assignments").select("id, status, due_date, module_id, training_modules(title)")
        .eq("user_id", user.id).neq("status", "completed").order("due_date").limit(5),
      supabase.from("attendance_day_status").select("entry_date, status_code, minutes_late")
        .eq("user_id", user.id).gte("entry_date", since14).order("entry_date", { ascending: false }).limit(14),
      supabase.from("checklist_bypasses").select("checklist_date, incomplete_count, resolved_at")
        .eq("user_id", user.id).gte("checklist_date", since14).limit(10),
      supabase.from("assistant_memories").select("kind, content")
        .eq("org_id", orgId).eq("status", "active").limit(25),
      supabase.from("work_style_profiles").select("answers").eq("user_id", user.id).maybeSingle(),
      supabase.from("office_nudges").select("kind, status, created_at")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
      admin.from("messages").select("sender_kind, content, created_at")
        .eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(14),
      supabase.from("pto_requests").select("start_date, end_date, status")
        .eq("user_id", user.id).gte("start_date", today).limit(5),
    ]);

    const employee = employeeRes.data;
    const goals = goalsRes.data ?? [];
    const training = trainingRes.data ?? [];
    const attendance = attendanceRes.data ?? [];
    const bypasses = checklistRes.data ?? [];
    const rules = rulesRes.data ?? [];
    const style = styleRes.data?.answers ?? null;
    const nudges = nudgeRes.data ?? [];
    const history = (historyRes.data ?? []).slice().reverse();
    const pto = ptoRes.data ?? [];

    // dismissal learning: kinds turned down twice in 14 days go quiet
    const cutoff = Date.now() - 14 * 864e5;
    const dismissed = new Map<string, number>();
    for (const n of nudges) {
      if (n.status === "dismissed" && new Date(n.created_at).getTime() > cutoff) {
        dismissed.set(n.kind, (dismissed.get(n.kind) ?? 0) + 1);
      }
    }
    const silenced = [...dismissed.entries()].filter(([, c]) => c >= 2).map(([k]) => k);

    const lateDays = attendance.filter((a) => a.status_code === "late").length;
    const openBypasses = bypasses.filter((b) => !b.resolved_at).length;

    const facts = [
      `Person: ${employee?.display_name ?? "teammate"}${employee?.team ? ` (${employee.team})` : ""}.`,
      `Today: ${today}.`,
      goals.length
        ? `Goals: ${goals.map((g) => `"${g.title}" — target: ${g.smart_target ?? "not set"}, ${g.progress_percent ?? 0}% done, month ${g.month}`).join("; ")}.`
        : "Goals: none set for this month.",
      training.length
        ? `Open training: ${training.map((t: Record<string, unknown>) => `${(t.training_modules as { title?: string } | null)?.title ?? "module"} due ${t.due_date ?? "no date"}`).join("; ")}.`
        : "Open training: none.",
      `Attendance last 14 days: ${attendance.length} recorded days, ${lateDays} late.`,
      `Checklist bypasses last 14 days: ${bypasses.length} (${openBypasses} still unresolved).`,
      pto.length ? `Upcoming time off: ${pto.map((p) => `${p.start_date}→${p.end_date} (${p.status})`).join("; ")}.` : "Upcoming time off: none on the books.",
      rules.length ? `Office rules (authoritative):\n${rules.map((r) => `- [${r.kind}] ${r.content}`).join("\n")}` : "Office rules: none recorded.",
      style ? `Delivery hints (NEVER mention these): ${JSON.stringify(style).slice(0, 600)}` : "",
      silenced.length ? `Topics this person has turned down twice — do not raise them: ${silenced.join(", ")}.` : "",
    ].filter(Boolean).join("\n");

    const messages: ChatMessage[] = [
      { role: "system", content: `${HOUSE_RULES}\n\nWhat you actually know:\n${facts}` },
      ...history.map((m): ChatMessage => ({
        role: m.sender_kind === "member" ? "user" : "assistant",
        content: String(m.content).slice(0, 2000),
      })),
    ];

    if (action === "proactive") {
      messages.push({
        role: "user",
        content:
          "Write one short unprompted message to this person for today. Pick the single most useful thing: a goal that has stalled, training coming due, an unresolved checklist bypass, or a genuine well-done. Cite the real number or date. If nothing is worth saying, reply with exactly: SKIP",
      });
    } else {
      const latest = history.filter((m) => m.sender_kind === "member").slice(-1)[0];
      if (!latest) return json({ ok: true, skipped: "nothing_to_answer", conversationId });
    }

    const reply = await callModel(apiKey, messages, action === "proactive" ? 320 : 700);
    if (!reply || reply.trim().toUpperCase().startsWith("SKIP")) {
      return json({ ok: true, skipped: "nothing_to_say", conversationId });
    }

    const { error: insertErr } = await admin.from("messages").insert({
      org_id: orgId,
      conversation_id: conversationId,
      sender_id: null,
      sender_kind: "pathfinder",
      content: reply,
    });
    if (insertErr) return json({ ok: false, error: "Could not deliver" });

    if (action === "proactive") {
      await admin.from("office_nudges").insert({
        org_id: orgId,
        user_id: user.id,
        surface: "messages",
        kind: "daily_brief",
        content: reply.slice(0, 500),
        data_refs: { goals: goals.length, training: training.length, late_days: lateDays, open_bypasses: openBypasses },
      });
    }

    return json({ ok: true, conversationId, content: reply });
  } catch (_e) {
    // fail open — the app keeps working without the office AI
    return json({ ok: false, error: "The office AI is quiet right now." });
  }
});
