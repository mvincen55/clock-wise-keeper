// training-roleplay — a live practice conversation for a training module, then a
// rubric-scored debrief.
//
// Two modes:
//   chat  — the AI plays a patient/caller persona grounded in office policy.
//   score — a strong model grades the transcript against a rubric and returns an
//           item-by-item breakdown. The transcript is NEVER echoed back and the
//           feedback must not quote the trainee: only patterns and next steps.

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
const CHAT_MODEL = "openai/gpt-5.6-terra";
const SCORE_MODEL = "openai/gpt-5.6-sol";
const PASS_MARK = 80;

const text = (v: unknown, cap: number): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, cap) : "";

function parseJsonBlock<T>(raw: string): T | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

type RubricItem = {
  criterion: string;
  what_good_looks_like: string;
  weight: number;
  earned: number;
  verdict: "met" | "partial" | "missed";
  feedback: string;
  next_time: string;
};

/** Shape-guard the grader output so the UI always renders something sane. */
function normalizeRubric(raw: unknown): RubricItem[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Record<string, unknown>[])
    .map((r) => {
      const weight = Math.max(1, Math.min(100, Math.round(Number(r?.weight) || 0)));
      const earned = Math.max(0, Math.min(weight, Math.round(Number(r?.earned) || 0)));
      const verdictRaw = text(r?.verdict, 20).toLowerCase();
      const verdict: RubricItem["verdict"] =
        verdictRaw === "met" || verdictRaw === "partial" || verdictRaw === "missed"
          ? (verdictRaw as RubricItem["verdict"])
          : earned >= weight
            ? "met"
            : earned > 0
              ? "partial"
              : "missed";
      return {
        criterion: text(r?.criterion, 160),
        what_good_looks_like: text(r?.what_good_looks_like, 400),
        weight,
        earned,
        verdict,
        feedback: text(r?.feedback, 600),
        next_time: text(r?.next_time, 400),
      };
    })
    .filter((r) => r.criterion && r.feedback)
    .slice(0, 8);
}

async function callGateway(apiKey: string, model: string, messages: unknown[]) {
  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, reasoning_effort: "none", messages }),
  });
  return response;
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

    const { data: auth, error: authError } = await supabase.auth.getUser();
    const user = auth?.user;
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const mode = text(body?.mode, 20) || "chat";
    const moduleId = text(body?.module_id, 64);
    if (!moduleId) return json({ error: "A module is required" }, 400);

    const messages: { role: string; content: string }[] = Array.isArray(body?.messages)
      ? body.messages
          .map((m: Record<string, unknown>) => ({
            role: m?.role === "assistant" ? "assistant" : "user",
            content: text(m?.content, 2000),
          }))
          .filter((m: { content: string }) => m.content)
          .slice(-40)
      : [];

    const { data: membership } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (!membership) return json({ error: "No active organization" }, 403);
    const orgId = membership.org_id as string;

    const { data: moduleRow } = await supabase
      .from("training_modules")
      .select("id, title, summary, content")
      .eq("id", moduleId)
      .maybeSingle();
    if (!moduleRow) return json({ error: "Module not found" }, 404);

    const content = (moduleRow.content ?? {}) as {
      outcome?: string;
      sections?: { heading?: string; body?: string }[];
      recap?: string;
    };
    const moduleBlock = [
      `TITLE: ${text(moduleRow.title, 200)}`,
      `OUTCOME: ${text(content.outcome, 600)}`,
      ...(content.sections ?? [])
        .slice(0, 8)
        .map((s) => `SECTION — ${text(s?.heading, 160)}: ${text(s?.body, 1200)}`),
      `RECAP: ${text(content.recap, 1200)}`,
    ].join("\n");

    // Standing office rules — how THIS office answers, especially on insurance.
    const { data: memories } = await supabase
      .from("assistant_memories")
      .select("content")
      .eq("org_id", orgId)
      .eq("kind", "office")
      .eq("status", "active")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(80);
    const { data: practice } = await supabase
      .from("org_practice_settings")
      .select("roleplay_persona_style, roleplay_policy_tone, roleplay_notes")
      .eq("org_id", orgId)
      .maybeSingle();

    const PERSONA: Record<string, string> = {
      gentle: "Cooperative and easygoing. Ask your questions plainly and accept a clear answer.",
      balanced: "A realistic mix — mostly reasonable, with one or two awkward moments.",
      challenging: "Interrupt, push back, and ask the hard follow-up more than once.",
      skeptical: "Price-sensitive and distrustful. Test every answer and hint you may go elsewhere.",
    };
    const TONE: Record<string, string> = {
      warm_professional: "warm, reassuring, and still precise",
      plainspoken: "direct and simple, with no jargon",
      formal: "careful, clinical, and buttoned-up",
      concierge: "high-touch and boutique, anticipating the next need",
    };
    const personaStyle = text(practice?.roleplay_persona_style, 40) || "balanced";
    const policyTone = text(practice?.roleplay_policy_tone, 40) || "warm_professional";
    const officeNotes = text(practice?.roleplay_notes, 1500);

    const officeConfig = `OFFICE CONFIGURATION
- Persona style (${personaStyle}): ${PERSONA[personaStyle] ?? PERSONA.balanced}
- Expected policy tone from the trainee: ${TONE[policyTone] ?? TONE.warm_professional}
${officeNotes ? `- Office notes: ${officeNotes}` : ""}`;

    const memoryBlock = (memories ?? [])
      .map((m: { content: string }) => `- ${text(m.content, 500)}`)
      .join("\n");

    const grounding = `${officeConfig}

MODULE BEING PRACTICED:
${moduleBlock}

STANDING OFFICE RULES (authoritative — this office answers this way):
${memoryBlock || "(none recorded yet)"}`;

    // ---------------- chat mode ----------------
    if (mode === "chat") {
      const system = `You play a realistic but fictional patient or caller so a dental front-office team member can practice the skill in the module below.

RULES
- Stay in character. One short, natural turn at a time (1-4 sentences). Never coach, never break character, never grade.
- Be realistically imperfect: interrupt, be unsure, push back mildly, ask the awkward follow-up a real patient asks.
- Insurance and policy questions: the correct answer is how THIS office answers, per the standing office rules. You may ask about them; you never state office policy as fact yourself.
- Fictional details only. Never reference real patients or real data.
- If the trainee ends the conversation, close it naturally in one line.`;

      const response = await callGateway(apiKey, CHAT_MODEL, [
        { role: "system", content: `${system}\n\n${grounding}` },
        ...(messages.length
          ? messages
          : [{ role: "user", content: "(the trainee has just picked up the phone)" }]),
      ]);

      if (response.status === 429) return json({ error: "The AI is busy — try again in a moment." }, 429);
      if (response.status === 402) return json({ error: "AI credits are exhausted." }, 402);
      if (!response.ok) {
        console.error("chat gateway error", response.status, await response.text());
        return json({ error: "The roleplay could not continue. Try again." }, 502);
      }
      const data = await response.json();
      const reply = text(data?.choices?.[0]?.message?.content, 1500);
      return json({ reply: reply || "…" });
    }

    // ---------------- score mode ----------------
    if (mode !== "score") return json({ error: "Unknown mode" }, 400);
    if (messages.filter((m) => m.role === "user").length < 2) {
      return json({ error: "Have a bit more of the conversation before scoring." }, 400);
    }

    const system = `You grade a training roleplay for a dental practice against a rubric and write a coaching debrief.

BUILD THE RUBRIC from the module: 4-6 criteria that together define doing this well in a live conversation. Weights are integers that sum to exactly 100.

SCORING
- For each criterion give: earned points (0..weight), a verdict ("met" | "partial" | "missed"), feedback, and one concrete "next_time" action.
- Grade what actually happened, judged against how THIS office does it. Office rules and the configured policy tone beat generic best practice.
- Be fair and specific, warm and direct. This is coaching, not a verdict on the person.
- ${PASS_MARK}% is the pass mark. In "gap_to_pass" say plainly which criteria would most efficiently close the gap.

PRIVACY — CRITICAL
- NEVER quote, paraphrase closely, or reconstruct anything either party said. No transcript excerpts, no "you said…".
- Describe patterns and behaviors only ("the cost question was answered before the concern behind it was acknowledged").

Return ONLY JSON in exactly this shape:
{"rubric":[{"criterion":"...","what_good_looks_like":"...","weight":25,"earned":18,"verdict":"partial","feedback":"...","next_time":"..."}],"headline":"one encouraging sentence","strength":"the single strongest behavior","focus":"the single highest-leverage thing to improve","gap_to_pass":"what to change to clear ${PASS_MARK}%"}`;

    const transcript = messages
      .map((m) => `${m.role === "user" ? "TRAINEE" : "PATIENT"}: ${m.content}`)
      .join("\n");

    const response = await callGateway(apiKey, SCORE_MODEL, [
      { role: "system", content: system },
      { role: "user", content: `${grounding}\n\nTRANSCRIPT TO GRADE:\n${transcript}` },
    ]);

    if (response.status === 429) return json({ error: "The AI is busy — try again in a moment." }, 429);
    if (response.status === 402) return json({ error: "AI credits are exhausted." }, 402);
    if (!response.ok) {
      console.error("score gateway error", response.status, await response.text());
      return json({ error: "The debrief could not be generated. Try again." }, 502);
    }

    const data = await response.json();
    const parsed = parseJsonBlock<Record<string, unknown>>(
      (data?.choices?.[0]?.message?.content as string | undefined) ?? ""
    );
    const rubric = normalizeRubric(parsed?.rubric);
    if (rubric.length === 0) return json({ error: "The debrief came back unusable. Try again." }, 502);

    const totalWeight = rubric.reduce((sum, r) => sum + r.weight, 0) || 1;
    const totalEarned = rubric.reduce((sum, r) => sum + r.earned, 0);
    const score = Math.max(0, Math.min(100, Math.round((totalEarned / totalWeight) * 100)));
    const passed = score >= PASS_MARK;

    const result = {
      rubric,
      headline: text(parsed?.headline, 300),
      strength: text(parsed?.strength, 400),
      focus: text(parsed?.focus, 400),
      gap_to_pass: text(parsed?.gap_to_pass, 500),
      pass_mark: PASS_MARK,
    };

    // Store the breakdown only — the transcript is never persisted.
    const { error: insertError } = await supabase.from("training_attempts").insert({
      org_id: orgId,
      module_id: moduleId,
      user_id: user.id,
      score,
      passed,
      type: "roleplay",
      answers: result,
    });
    if (insertError) console.error("attempt insert failed", insertError.message);

    return json({ ...result, score, passed });
  } catch (error) {
    console.error("training-roleplay failed:", error);
    return json({ error: "Something went wrong with the roleplay." }, 500);
  }
});
