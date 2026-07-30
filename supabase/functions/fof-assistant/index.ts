// FOF assistant widget: chat about treatment wording and FOF questions.
// Managers "train as we go" — wording preferences they state are
// distilled into standing rules (fof_ai_guidance) that every future AI
// pass follows. Non-managers get answers only; nothing they say is ever
// saved or trains anything.
//
// HIPAA note: the AI must NEVER see a patient's identity. The client
// sends ONLY code-derived procedure wording and AI-generated treatment
// text as context — no patient name, date, or dollar amounts — and chat
// messages are never stored. Saved guidance rules are general wording
// preferences written by the model under instruction to include no
// personal details. This function authenticates the caller, requires an
// active org membership, and hard-caps every input.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadProcedureNotes } from "../_shared/procedure-notes.ts";
import { guardAiInput, REFUSAL } from "../_shared/integrity.ts";

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

const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 1200;
const MAX_VISITS = 12;
const MAX_PROCEDURES_PER_VISIT = 12;
const MAX_LABEL_CHARS = 80;
const MAX_TREATMENT_CHARS = 500;

const bounded = (value: unknown, cap: number): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, cap) : "";

interface DocMatch {
  doc_id: string;
  title: string;
  category: string;
  chunk_index: number;
  content: string;
  rank: number;
}

/** Short FTS queries from the question (AI expansion, word-pair fallback). */
async function searchQueries(apiKey: string, question: string): Promise<string[]> {
  try {
    const response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        messages: [
          {
            role: "system",
            content:
              "Convert a dental office staff question into search queries for a keyword AND search over office documents (policies, HR, insurance manuals like Delta Dental). Return ONLY a JSON array of 3 to 5 query strings, each 1-3 precise words. Expand shorthand (DD MA -> Delta Dental, pt -> patient).",
          },
          { role: "user", content: question },
        ],
      }),
    });
    const data = await response.json();
    const raw: string = data?.choices?.[0]?.message?.content ?? "[]";
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    if (Array.isArray(parsed)) {
      const queries = parsed
        .filter((q): q is string => typeof q === "string" && q.trim() !== "")
        .map((q) => q.trim())
        .slice(0, 5);
      if (queries.length > 0) return queries;
    }
  } catch {
    /* fall through */
  }
  const words = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
  const fallback: string[] = [];
  for (let i = 0; i < words.length - 1 && fallback.length < 4; i += 2) {
    fallback.push(`${words[i]} ${words[i + 1]}`);
  }
  return fallback.length ? fallback : [question.slice(0, 60)];
}

const POLICY_SUMMARY =
  "Office FOF policy facts you may explain: prepay-in-full earns the prepay discount (10% standard; Illumitrac seniors +5%); patient portions under $1,000 are simply paid at the visit (nothing due at scheduling); larger plans collect a full visit ahead so the patient never carries a balance, with the final visit split half ahead / half at the visit; work-up procedures and surgical guides are billed at their visit, never prepaid; most plans pay composite rates — downgrades are off by default and only turned on for plans like Altus, which pay on the amalgam fee with the patient responsible up to the office fee; finished lab work is always 'delivered' (Crown Delivery, Denture Delivery, Implant Crown Delivery — never 'seating'); fillings are described without surfaces; D4265, D4268, D5982, and D7953 are never insurance-covered.";

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
    const isManager = membership.role === "owner" || membership.role === "manager";

    const body = (await req.json()) as {
      messages?: { role?: string; content?: string }[];
      context?: { visits?: { procedures?: string[] }[]; treatment?: string };
      /** Managers can pause training from the widget badge. */
      trainingEnabled?: boolean;
    };
    const rawMessages = Array.isArray(body.messages) ? body.messages.slice(-MAX_MESSAGES) : [];
    const chat = rawMessages
      .map((m) => ({
        role: m?.role === "assistant" ? "assistant" : "user",
        content: bounded(m?.content, MAX_MESSAGE_CHARS),
      }))
      .filter((m) => m.content !== "");
    if (chat.length === 0 || chat[chat.length - 1].role !== "user") {
      return json({ error: "Bad request" }, 400);
    }

    if (
      await guardAiInput({
        orgId: membership.org_id,
        userId: user.id,
        surface: "fof-assistant",
        inputs: [chat[chat.length - 1]?.content],
      })
    ) {
      return json({ reply: REFUSAL, saveRule: null });
    }

    const visits = (Array.isArray(body.context?.visits) ? body.context!.visits! : [])
      .slice(0, MAX_VISITS)
      .map(
        (v, i) =>
          `Visit ${i + 1}: ${(Array.isArray(v?.procedures) ? v.procedures! : [])
            .slice(0, MAX_PROCEDURES_PER_VISIT)
            .map((p) => bounded(p, MAX_LABEL_CHARS))
            .filter(Boolean)
            .join(", ") || "—"}`
      )
      .join("\n");
    const treatment = bounded(body.context?.treatment, MAX_TREATMENT_CHARS);

    // Standing wording rules — what past manager chats have taught.
    const { data: guidanceRows } = await supabase
      .from("fof_ai_guidance")
      .select("content")
      .eq("org_id", membership.org_id)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(30);
    const guidance = (guidanceRows ?? [])
      .map((g) => bounded(g.content, 240))
      .filter(Boolean);

    // Per-procedure notes managers set on the office fee schedule.
    const procedureNotes = await loadProcedureNotes(supabase);

    // Office knowledge base: search the uploaded docs (office policies,
    // Delta Dental manuals, etc.) for the latest question — same
    // RLS-scoped retrieval as the Ask AI page.
    let docsBlock = "";
    try {
      const question = chat[chat.length - 1].content;
      const queries = await searchQueries(apiKey, question);
      const results = await Promise.all(
        queries.map((q) => supabase.rpc("search_office_doc_chunks", { p_query: q, p_limit: 6 }))
      );
      const byKey = new Map<string, DocMatch>();
      for (const result of results) {
        for (const match of (result.data ?? []) as DocMatch[]) {
          const key = `${match.doc_id}:${match.chunk_index}`;
          const existing = byKey.get(key);
          if (!existing || match.rank > existing.rank) byKey.set(key, match);
        }
      }
      const matches = [...byKey.values()].sort((a, b) => b.rank - a.rank).slice(0, 10);
      if (matches.length > 0) {
        let budget = 10_000;
        const excerpts: string[] = [];
        for (const m of matches) {
          const text = `[${m.title} — ${m.category}] ${m.content}`.slice(0, 1600);
          if (budget - text.length < 0) break;
          budget -= text.length;
          excerpts.push(text);
        }
        docsBlock = ` OFFICE DOCUMENT EXCERPTS relevant to the question (the office's uploaded policies and insurance manuals). Use them to answer, but do NOT announce which document the answer comes from — no "Based on the manual..." — the staff already know where policy lives. Only name the source document if the user asks where the information is from: ${excerpts.join(" ||| ")}`;
      }
    } catch {
      /* docs are a bonus — never fail the chat over retrieval */
    }

    const training = isManager && body.trainingEnabled !== false;
    const trainingRule = training
      ? "The user is a MANAGER with training ON. When they state a wording preference, correction, or standing policy for how treatment summaries or payment names should read (e.g. \"never say X, say Y\", \"the doctor prefers...\"), distill it into ONE short, general, imperative rule (max 200 characters, no names of patients or staff other than doctor titles, no case-specific details) and put it in saveRule. Confirm in your reply what was saved. If the message is just a question or discussion with no durable preference, saveRule is null."
      : isManager
        ? "The user is a MANAGER but has training PAUSED. Answer normally, but saveRule must ALWAYS be null — mention they can turn training back on if they clearly want something saved."
        : "The user is a TEAM MEMBER (not a manager). Answer their questions helpfully, but saveRule must ALWAYS be null — nothing they say may change standing guidance. If they state a preference, suggest they raise it with the office manager.";

    const response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are the FOF Assistant inside a dental office's Financial Options Form builder — a sharp, friendly treatment-coordination colleague. You help staff with the form's wording, payment schedules, and office policy questions, and you help refine how AI-written treatment summaries read. " +
              "CAPABILITIES — BE HONEST ABOUT THEM: the only things you can actually do are (a) answer questions and (b) save standing WORDING rules when training is on. You CANNOT change the app itself — fee schedules, prices, which procedures a membership includes at no charge, templates, discounts, and calculations are configuration you have no access to. NEVER claim you fixed, removed, updated, or changed any of those; if asked to, say plainly that you can't, and point them to the right place (managers: the Fee Schedules page for codes/fees/notes, the Templates page for form wording — or the app's developer for membership-inclusion rules). Only say a rule was saved when you actually set saveRule, and be clear a saved rule shapes AI wording only — it never changes pricing or what's included. " +
              POLICY_SUMMARY +
              " " +
              (guidance.length > 0
                ? `STANDING WORDING RULES already in effect (from past training): ${guidance.map((g, i) => `(${i + 1}) ${g}`).join(" ")} `
                : "") +
              (procedureNotes.length > 0
                ? `PER-PROCEDURE OFFICE NOTES (wording/policy managers set per procedure on the fee schedule — authoritative for those procedures): ${procedureNotes.map((n, i) => `(${i + 1}) ${n}`).join(" ")} `
                : "") +
              (visits ? `The current form's procedures (de-identified, by visit):\n${visits}\n` : "") +
              (treatment ? `The current AI-written treatment summary: "${treatment}" ` : "") +
              docsBlock +
              " " +
              "PRIVACY: you never know who the patient is, and you must keep it that way. If a message appears to contain a patient's name or personal details, do NOT repeat them and gently remind the user not to share patient information here. " +
              trainingRule +
              ' Reply with ONLY a JSON object: {"reply": string, "saveRule": string|null}. Keep replies concise and concrete — suggest exact wording when discussing phrasing.',
          },
          ...chat,
        ],
        max_tokens: 700,
      }),
    });
    if (!response.ok) return json({ error: "AI request failed" }, 502);
    const data = await response.json();
    const raw: string = data?.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return json({ error: "AI returned no reply" }, 502);
    let parsed: { reply?: unknown; saveRule?: unknown };
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return json({ error: "AI returned no reply" }, 502);
    }
    const reply = bounded(parsed.reply, 2000);
    if (!reply) return json({ error: "AI returned no reply" }, 502);

    let savedRule: string | null = null;
    // Server-side gate mirrors the prompt: only managers with training ON
    // ever save, and RLS (admin-write) enforces it again in the DB.
    if (training && typeof parsed.saveRule === "string" && parsed.saveRule.trim() !== "") {
      const rule = bounded(parsed.saveRule, 220);
      const { error: insertError } = await supabase.from("fof_ai_guidance").insert({
        org_id: membership.org_id,
        content: rule,
        created_by: user.id,
      });
      if (!insertError) savedRule = rule;
    }

    return json({ reply, savedRule });
  } catch (_err) {
    return json({ error: "Unexpected error" }, 500);
  }
});
