// training-roleplay — the conversational assessment next to the quiz.
//
// The trainee practices a real conversation with an AI persona (a patient with
// a situation, an insurance rep, a walk-in) grounded in how THIS office runs.
// After the conversation the STRONG model scores the transcript against a
// rubric derived from the module outcome and marks pass/fail at the 80% bar.
//
// Privacy rules that are not negotiable:
//   * transcripts belong to the trainee — admins see status and pass/fail only
//     (enforced in the DB by training_attempt_summary / _summaries).
//   * every member turn goes through the PHI scrubber before it reaches the
//     gateway, and through the jailbreak signature guard.
//   * the personas are fictional. No real patient ever appears here.
//
// Modes:
//   start  -> persona + opening line for a module (fast model)
//   reply  -> the persona's next turn (fast model)
//   score  -> rubric scoring of the finished transcript (strong model)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { guardAiInput, JAILBREAK_REFUSAL } from "../_shared/jailbreak-guard.ts";
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
/** Chatter is cheap and fast; judgement is expensive and strong. */
const FAST_MODEL = "google/gemini-3.6-flash";
const STRONG_MODEL = "openai/gpt-5.6-sol";

/** The bar, same as the quiz. Unlimited retakes. */
const PASS_MARK = 80;
/** Hard ceiling on a conversation before scoring kicks in. */
export const MAX_EXCHANGES = 8;

type Turn = { role: "member" | "persona"; content: string };
type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const bounded = (v: unknown, cap: number): string =>
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

async function callModel(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
) {
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
  });
  if (res.status === 429) return { error: "The AI is busy right now — try again in a moment.", status: 429 };
  if (res.status === 402) return { error: "AI credits are used up for now.", status: 402 };
  if (!res.ok) {
    console.error("training-roleplay: gateway", res.status);
    return { error: "The AI could not answer right now.", status: 502 };
  }
  const data = await res.json();
  return { text: (data?.choices?.[0]?.message?.content ?? "") as string, status: 200 };
}

/** Member text is the untrusted surface: scrub it, then hand it over. */
function safeMemberText(value: unknown, cap: number, where: string): string {
  const scrubbed = scrubFreeText(bounded(value, cap), cap);
  logScrub(`training-roleplay.${where}`, scrubbed);
  return scrubbed.text;
}

function transcriptFor(turns: Turn[]): ChatMessage[] {
  return turns.map((t) => ({
    role: t.role === "member" ? "user" : "assistant",
    content: t.content,
  }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI is not configured" }, 500);

    // ---- Auth: a real signed-in member of a real org, or nothing ------------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    );
    const { data: auth, error: authError } = await supabase.auth.getUser();
    const user = auth?.user;
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const { data: membership } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (!membership) return json({ error: "Unauthorized" }, 403);
    const orgId = membership.org_id as string;

    const body = await req.json().catch(() => ({}));
    const mode = bounded(body?.mode, 20) || "start";
    const moduleId = bounded(body?.module_id, 64);
    if (!moduleId) return json({ error: "Unauthorized" }, 401);

    // The module is read through the member's own session: RLS decides.
    const { data: module } = await supabase
      .from("training_modules")
      .select("id, title, summary, content")
      .eq("id", moduleId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (!module) return json({ error: "Not found" }, 404);

    const content = (module.content ?? {}) as Record<string, unknown>;
    const roleplay = (content.roleplay ?? {}) as Record<string, unknown>;
    const persona = bounded(roleplay.persona, 300) || "Dana Reyes, a patient calling the front desk";
    const scenario = bounded(roleplay.scenario, 900) ||
      `A realistic front-office conversation about: ${bounded(module.title, 160)}`;
    const rubric: string[] = Array.isArray(roleplay.rubric)
      ? (roleplay.rubric as unknown[]).map((r) => bounded(r, 200)).filter(Boolean).slice(0, 8)
      : [
        "Explained it in plain language, no jargon",
        "Checked that the other person understood",
        "Answered correctly for how this office actually works",
        "Warm, unhurried tone",
      ];
    const outcome = bounded(content.outcome, 600);

    // ---- Grounding: how this office actually answers ------------------------
    const { data: memories } = await supabase
      .from("assistant_memories")
      .select("content")
      .eq("org_id", orgId)
      .eq("kind", "office")
      .eq("status", "active")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(40);
    const officeRules = (memories ?? [])
      .map((m) => `- ${bounded(m.content, 400)}`)
      .join("\n")
      .slice(0, 6000);

    const groundLines = [
      OFFICE_DOCTRINE,
      "You are running a practice conversation for a dental-office training module.",
      `Module: ${bounded(module.title, 160)}`,
      outcome ? `What the trainee should be able to do: ${outcome}` : "",
      officeRules ? `How this office actually operates (authoritative — never contradict):\n${officeRules}` : "",
      "Everyone and everything in this scenario is fictional. Never invent or request real patient information.",
    ].filter(Boolean).join("\n\n");

    // ---- Member turns: scrub + integrity signature --------------------------
    const rawTurns: Turn[] = Array.isArray(body?.turns) ? (body.turns as Turn[]) : [];
    const turns: Turn[] = rawTurns
      .slice(-2 * MAX_EXCHANGES)
      .map((t) => ({
        role: t?.role === "member" ? "member" : "persona",
        content: t?.role === "member"
          ? safeMemberText(t?.content, 1200, mode)
          : bounded(t?.content, 1200),
      }))
      .filter((t) => t.content.length > 0);

    const memberTurns = turns.filter((t) => t.role === "member");
    if (memberTurns.length > 0) {
      const flagged = await guardAiInput({
        orgId,
        actorUserId: user.id,
        surface: "training-roleplay",
        input: memberTurns[memberTurns.length - 1].content,
      });
      if (flagged) return json({ error: JAILBREAK_REFUSAL }, 200);
    }

    // ---- start / reply: the persona speaks (fast model) ---------------------
    if (mode === "start" || mode === "reply") {
      const system = [
        groundLines,
        `You ARE the other person in this conversation — stay in character the whole time: ${persona}.`,
        `Situation: ${scenario}`,
        "Behave like a real person: if the trainee explains something well, react warmly and ask a natural follow-up. If the answer is vague, wrong for this office, or full of jargon, push back the way a real patient would — confused, skeptical, or worried — without being cruel.",
        "Speak only as the persona. One to three sentences per turn. Never coach, never break character, never mention scoring, rubrics, or that this is a test.",
      ].join("\n\n");

      const messages: ChatMessage[] = [{ role: "system", content: system }];
      if (mode === "start" || turns.length === 0) {
        messages.push({ role: "user", content: "Open the conversation with your first line." });
      } else {
        messages.push(...transcriptFor(turns));
      }

      const out = await callModel(apiKey, FAST_MODEL, messages, 400);
      if (out.error) return json({ error: out.error }, out.status);

      const reply = bounded(out.text, 900) ||
        "Sorry — could you say that again?";
      const exchanges = memberTurns.length;
      return json({
        persona,
        scenario,
        reply,
        exchanges,
        should_score: exchanges >= MAX_EXCHANGES,
      });
    }

    // ---- score: the strong model grades the transcript ----------------------
    if (mode === "score") {
      if (memberTurns.length === 0) {
        return json({ error: "There is nothing to score yet." }, 400);
      }

      const system = [
        groundLines,
        `You are scoring a trainee's practice conversation with: ${persona}.`,
        `Rubric (each item is worth an equal share of 100):\n${rubric.map((r, i) => `${i + 1}. ${r}`).join("\n")}`,
        `A score of ${PASS_MARK} or above passes. Be fair and specific, never harsh — this is practice, and retakes are unlimited.`,
        'Reply with JSON only: {"score": 0-100, "passed": true|false, "summary": "2-3 encouraging sentences", "rubric": [{"item": "...", "met": true|false, "note": "..."}], "line_feedback": [{"quote": "a short quote of the trainee\'s words", "note": "what worked or what to try instead"}]}',
      ].join("\n\n");

      const transcript = turns
        .map((t) => `${t.role === "member" ? "TRAINEE" : "PERSONA"}: ${t.content}`)
        .join("\n");

      const out = await callModel(apiKey, STRONG_MODEL, [
        { role: "system", content: system },
        { role: "user", content: `Transcript:\n${transcript}` },
      ], 1400);
      if (out.error) return json({ error: out.error }, out.status);

      const parsed = parseJsonBlock<{
        score?: unknown;
        summary?: unknown;
        rubric?: unknown;
        line_feedback?: unknown;
      }>(out.text ?? "");
      if (!parsed) return json({ error: "Scoring came back unreadable — try again." }, 502);

      const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
      const rubricOut = Array.isArray(parsed.rubric)
        ? (parsed.rubric as Record<string, unknown>[]).slice(0, 8).map((r) => ({
          item: bounded(r?.item, 200),
          met: Boolean(r?.met),
          note: bounded(r?.note, 400),
        }))
        : [];
      const lineFeedback = Array.isArray(parsed.line_feedback)
        ? (parsed.line_feedback as Record<string, unknown>[]).slice(0, 10).map((r) => ({
          quote: bounded(r?.quote, 300),
          note: bounded(r?.note, 400),
        }))
        : [];

      return json({
        score,
        passed: score >= PASS_MARK,
        summary: bounded(parsed.summary, 900),
        rubric: rubricOut,
        line_feedback: lineFeedback,
      });
    }

    return json({ error: "Unknown mode" }, 400);
  } catch (err) {
    console.error("training-roleplay: failed", (err as Error)?.message);
    return json({ error: "Something went wrong." }, 500);
  }
});
