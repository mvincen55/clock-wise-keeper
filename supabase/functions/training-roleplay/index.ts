// training-roleplay — the conversational assessment behind a training module.
//
// Two modes:
//   turn  -> the AI persona (a named patient, or an insurance rep) replies in
//            character. Fast model: this is a live conversation.
//   score -> the STRONG model grades the whole transcript against the module's
//            rubric, gives per-line feedback, and marks pass/fail at 80%.
//
// Grounding is the same as training-builder: the standing office rules and the
// office corpus are the rules of the world. Insurance questions must be
// answered the way THIS office answers them.

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
const FAST_MODEL = "google/gemini-3.6-flash"; // live persona conversation
const STRONG_MODEL = "openai/gpt-5.6-sol"; // rubric scoring
const PASS_MARK = 80;
const MAX_EXCHANGES = 8;

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

type Msg = { role: "system" | "user" | "assistant"; content: string };

async function callModel(apiKey: string, model: string, messages: Msg[], maxTokens: number) {
  const body: Record<string, unknown> = { model, messages };
  if (model.startsWith("openai/gpt-5")) {
    body.max_completion_tokens = maxTokens;
    if (model.startsWith("openai/gpt-5.6")) body.reasoning_effort = "none";
  } else {
    body.max_tokens = maxTokens;
  }
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 429) return { error: 429 as const };
  if (res.status === 402) return { error: 402 as const };
  if (!res.ok) {
    console.error("gateway error", res.status, await res.text());
    return { error: 502 as const };
  }
  const data = await res.json();
  return { content: (data?.choices?.[0]?.message?.content as string | undefined) ?? "" };
}

function errorResponse(code: 429 | 402 | 502) {
  if (code === 429) return json({ error: "The AI is busy right now — try again in a moment." }, 429);
  if (code === 402) return json({ error: "AI credits are exhausted." }, 402);
  return json({ error: "The conversation could not continue. Try again." }, 502);
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
    const mode = body?.mode === "score" ? "score" : "turn";
    const moduleId = text(body?.module_id, 60);
    if (!moduleId) return json({ error: "A module is required" }, 400);

    const transcript: { role: string; content: string }[] = Array.isArray(body?.transcript)
      ? body.transcript
          .map((m: Record<string, unknown>) => ({
            role: m?.role === "persona" ? "persona" : "trainee",
            content: text(m?.content, 2000),
          }))
          .filter((m: { content: string }) => m.content)
          .slice(-40)
      : [];

    // Module + its roleplay definition (RLS-scoped).
    const { data: module } = await supabase
      .from("training_modules")
      .select("id, org_id, title, summary, content")
      .eq("id", moduleId)
      .maybeSingle();
    if (!module) return json({ error: "Module not found" }, 404);

    const content = (module.content ?? {}) as Record<string, unknown>;
    const roleplay = (content.roleplay ?? null) as Record<string, unknown> | null;
    if (!roleplay) return json({ error: "This module has no conversation practice." }, 400);

    const persona = (roleplay.persona ?? {}) as Record<string, unknown>;
    const personaName = text(persona.name, 80) || "the patient";
    const personaRole = text(persona.role, 120) || "patient";
    const situation = text(persona.situation, 900);
    const style = text(persona.style, 400);
    const scenario = text(roleplay.scenario, 1200);
    const officeAnswers = text(roleplay.office_answers, 3000);
    const outcome = text(content.outcome, 600);
    const rubric = Array.isArray(roleplay.rubric) ? roleplay.rubric : [];
    const rubricText = rubric
      .map((r: Record<string, unknown>, i: number) => {
        return `${i + 1}. ${text(r?.criterion, 200)} (weight ${Number(r?.weight) || 25}) — good looks like: ${text(r?.what_good_looks_like, 400)}`;
      })
      .join("\n");

    const groundBlock = `MODULE: ${text(module.title, 200)}
LEARNING OUTCOME: ${outcome}
SCENARIO: ${scenario}
HOW THIS OFFICE ACTUALLY ANSWERS (authoritative): ${officeAnswers || "(nothing specific on record — the trainee should offer to check with the office manager rather than guess)"}`;

    if (mode === "turn") {
      const system = `You are role-playing as ${personaName}, ${personaRole}, talking with a member of a dental practice team who is practising this conversation.

${groundBlock}

YOUR SITUATION: ${situation}
YOUR MANNER: ${style || "natural, a little unsure, polite"}

HOW TO PLAY IT
- Stay fully in character. Never break role, never coach, never mention training, scoring, or that you are an AI.
- Speak like a real person: 1-4 short sentences, plain words, natural reactions.
- When their answer is clear and correct, react like a real person would — relieved, reassured — and ask a natural follow-up that goes a bit deeper.
- When their answer is vague, jargon-heavy, or wrong for this office, push back the way a real person pushes back: "I still don't get why...", "But my insurance said...", "That sounds expensive — why?".
- Never state the office's policy for them. You are the one asking.
- Never invent facts about this office's fees or policies; ask about them instead.

Reply with ONLY your next line of dialogue — no labels, no quotes, no stage directions.`;

      const messages: Msg[] = [{ role: "system", content: system }];
      for (const m of transcript) {
        messages.push({
          role: m.role === "persona" ? "assistant" : "user",
          content: m.content,
        });
      }
      if (transcript.length === 0) {
        messages.push({ role: "user", content: "(the team member greets you — open the conversation)" });
      }

      const result = await callModel(apiKey, FAST_MODEL, messages, 300);
      if ("error" in result) return errorResponse(result.error);
      const reply = text(result.content, 1200) || "Sorry — could you say that again?";
      const traineeTurns = transcript.filter((m) => m.role === "trainee").length;
      return json({ reply, should_wrap_up: traineeTurns >= MAX_EXCHANGES });
    }

    // ---- score: strong model, rubric derived from the module outcome -------
    const traineeLines = transcript.filter((m) => m.role === "trainee");
    if (traineeLines.length === 0) return json({ error: "Nothing to score yet." }, 400);

    const convo = transcript
      .map((m, i) => `${i + 1}. ${m.role === "persona" ? personaName : "TRAINEE"}: ${m.content}`)
      .join("\n");

    const system = `You assess a dental team member's practice conversation against a rubric. Be fair, specific, and encouraging — this is coaching, not a gate to shame anyone.

${groundBlock}

RUBRIC (score each 0-100, then weight):
${rubricText || `1. Plain-language explanation (weight 30)
2. Checked the person's understanding (weight 25)
3. Correct per this office's policy (weight 30)
4. Warm, respectful tone (weight 15)`}

SCORING RULES
- Judge ONLY the TRAINEE lines.
- Anything that contradicts how this office actually operates is a serious deduction on the policy criterion.
- Saying "let me check with the office manager" instead of guessing is a GOOD answer, not a weak one.
- Overall score is the weighted average, rounded to a whole number. ${PASS_MARK} or above passes.
- Give 2-5 pieces of per-line feedback pointing at specific TRAINEE line numbers: what landed, and what to say instead.

Return ONLY JSON:
{"score":number,"passed":boolean,"summary":"2-3 encouraging sentences","criteria":[{"criterion":"...","score":number,"note":"..."}],"line_feedback":[{"line":number,"quote":"short quote","note":"...","good":boolean}],"do_next_time":["...","..."]}`;

    const result = await callModel(
      apiKey,
      STRONG_MODEL,
      [
        { role: "system", content: system },
        { role: "user", content: `TRANSCRIPT:\n${convo}` },
      ],
      2500
    );
    if ("error" in result) return errorResponse(result.error);

    const parsed = parseJsonBlock<Record<string, unknown>>(result.content ?? "");
    if (!parsed) {
      console.error("unparseable score output", (result.content ?? "").slice(0, 400));
      return json({ error: "The assessment could not be graded. Try again." }, 502);
    }

    const rawScore = Number(parsed.score);
    const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, Math.round(rawScore))) : 0;
    const passed = score >= PASS_MARK;

    const criteria = Array.isArray(parsed.criteria)
      ? (parsed.criteria as Record<string, unknown>[])
          .map((c) => ({
            criterion: text(c?.criterion, 200),
            score: Math.max(0, Math.min(100, Math.round(Number(c?.score) || 0))),
            note: text(c?.note, 600),
          }))
          .filter((c) => c.criterion)
          .slice(0, 8)
      : [];

    const lineFeedback = Array.isArray(parsed.line_feedback)
      ? (parsed.line_feedback as Record<string, unknown>[])
          .map((l) => ({
            line: Number(l?.line) || 0,
            quote: text(l?.quote, 300),
            note: text(l?.note, 700),
            good: l?.good === true,
          }))
          .filter((l) => l.note)
          .slice(0, 8)
      : [];

    const doNext = Array.isArray(parsed.do_next_time)
      ? (parsed.do_next_time as unknown[]).map((s) => text(s, 300)).filter(Boolean).slice(0, 5)
      : [];

    return json({
      score,
      passed,
      pass_mark: PASS_MARK,
      summary: text(parsed.summary, 1200),
      criteria,
      line_feedback: lineFeedback,
      do_next_time: doNext,
    });
  } catch (error) {
    console.error("training-roleplay failed:", error);
    return json({ error: "Something went wrong with the practice conversation." }, 500);
  }
});
