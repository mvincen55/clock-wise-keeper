import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadProcedureNotes } from "../_shared/procedure-notes.ts";

// AI assistant over the office knowledge base (policies, HR info,
// insurance handbooks). Two-step retrieval: an AI call first turns the
// staff question into several short search queries (expanding dental and
// insurance shorthand), then Postgres full-text search runs them all and
// the merged excerpts (plus neighboring chunks for continuity) go to the
// answering model. All queries are RLS-scoped to the caller's org.

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
const MAX_CONTEXT_CHARS = 45000;

interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

interface Match {
  doc_id: string;
  title: string;
  category: string;
  chunk_index: number;
  content: string;
  rank: number;
}

async function callGateway(apiKey: string, messages: unknown[], maxTokens?: number) {
  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages, ...(maxTokens ? { max_tokens: maxTokens } : {}) }),
  });
  return response;
}

/** Turn the staff question into short FTS-friendly queries. */
async function generateSearchQueries(
  apiKey: string,
  question: string,
  history: HistoryMessage[]
): Promise<string[]> {
  const recentContext = history
    .slice(-4)
    .map((m) => `${m.role}: ${m.content.slice(0, 300)}`)
    .join("\n");
  try {
    const response = await callGateway(apiKey, [
      {
        role: "system",
        content: `You convert a dental office staff question into search queries for a full-text (keyword AND) search over office documents: policies, HR materials, and insurance carrier processing/provider manuals.

Return ONLY a JSON array of 4 to 6 query strings. Each query must be 1 to 3 words. Rules:
- Use precise terms likely to appear in formal documents, not conversational phrasing.
- Expand shorthand: "pt" → patient, "perio" → periodontal; spell out carrier-name abbreviations in full; tooth numbers stay as-is.
- Include the underlying policy/insurance concepts, e.g. "crown replacement", "frequency limitation", "missing tooth", "implant coverage", "prior authorization", "PTO accrual".
- No duplicates, no filler words.`,
      },
      {
        role: "user",
        content: (recentContext ? `Recent conversation:\n${recentContext}\n\n` : "") + `Question: ${question}`,
      },
    ], 500);
    if (!response.ok) throw new Error(`gateway ${response.status}`);
    const data = await response.json();
    const raw: string = data.choices?.[0]?.message?.content ?? "[]";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      const queries = parsed
        .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
        .map((q) => q.trim())
        .slice(0, 6);
      if (queries.length > 0) return queries;
    }
    throw new Error("no queries parsed");
  } catch (error) {
    console.error("query generation fallback:", error);
    // Fallback: pairs of significant words from the question.
    const words = question
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3);
    const fallback: string[] = [];
    for (let i = 0; i < words.length - 1 && fallback.length < 5; i += 2) {
      fallback.push(`${words[i]} ${words[i + 1]}`);
    }
    return fallback.length ? fallback : [question];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const question = String(body.question ?? "").trim();
    if (!question) return json({ error: "Missing question" }, 400);
    const history: HistoryMessage[] = Array.isArray(body.history)
      ? body.history
          .filter((m: HistoryMessage) => m && (m.role === "user" || m.role === "assistant"))
          .slice(-10)
          .map((m: HistoryMessage) => ({ role: m.role, content: String(m.content).slice(0, 4000) }))
      : [];

    const { data: docs } = await supabase
      .from("office_docs")
      .select("id, title, category")
      .order("created_at", { ascending: false })
      .limit(100);
    if (!docs || docs.length === 0) {
      return json({
        answer:
          "There are no documents in the office knowledge base yet. A manager can upload policies, HR documents, and insurance handbooks in the Documents section, then ask me again.",
        sources: [],
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("Server configuration error");

    // Step 1: expand the question into several short searches and run all.
    const queries = await generateSearchQueries(LOVABLE_API_KEY, question, history);
    const searchResults = await Promise.all(
      queries.map((q) => supabase.rpc("search_office_doc_chunks", { p_query: q, p_limit: 8 }))
    );

    const byKey = new Map<string, Match>();
    for (const result of searchResults) {
      for (const match of (result.data ?? []) as Match[]) {
        const key = `${match.doc_id}:${match.chunk_index}`;
        const existing = byKey.get(key);
        if (!existing || match.rank > existing.rank) byKey.set(key, match);
      }
    }
    let matches = [...byKey.values()].sort((a, b) => b.rank - a.rank).slice(0, 18);

    // Step 2: pull neighboring chunks for the strongest hits so rules that
    // span a chunk boundary arrive intact.
    const docMeta = new Map<string, { title: string; category: string }>();
    const wanted = new Map<string, Set<number>>();
    for (const match of matches.slice(0, 6)) {
      docMeta.set(match.doc_id, { title: match.title, category: match.category });
      const set = wanted.get(match.doc_id) ?? new Set<number>();
      if (match.chunk_index > 0) set.add(match.chunk_index - 1);
      set.add(match.chunk_index + 1);
      wanted.set(match.doc_id, set);
    }
    for (const match of matches) wanted.get(match.doc_id)?.delete(match.chunk_index);
    const neighborResults = await Promise.all(
      [...wanted.entries()]
        .filter(([, set]) => set.size > 0)
        .map(([docId, set]) =>
          supabase
            .from("office_doc_chunks")
            .select("doc_id, chunk_index, content")
            .eq("doc_id", docId)
            .in("chunk_index", [...set])
        )
    );
    for (const result of neighborResults) {
      for (const chunk of result.data ?? []) {
        const meta = docMeta.get(chunk.doc_id);
        if (!meta) continue;
        matches.push({
          doc_id: chunk.doc_id,
          title: meta.title,
          category: meta.category,
          chunk_index: chunk.chunk_index,
          content: chunk.content,
          rank: 0,
        });
      }
    }

    // Budget the context by rank, then order by document position for
    // readability.
    let totalChars = 0;
    const kept: Match[] = [];
    for (const match of [...matches].sort((a, b) => b.rank - a.rank)) {
      if (totalChars + match.content.length > MAX_CONTEXT_CHARS) continue;
      totalChars += match.content.length;
      kept.push(match);
    }
    kept.sort((a, b) => a.title.localeCompare(b.title) || a.chunk_index - b.chunk_index);

    let excerpts = kept
      .map((m) => `[${m.title} — section ${m.chunk_index}] (${m.category})\n${m.content}`)
      .join("\n\n---\n\n");

    // Per-procedure notes managers keep on the office fee schedule count
    // as office policy too — always in scope, they're small and bounded.
    const procedureNotes = await loadProcedureNotes(supabase);
    if (procedureNotes.length > 0) {
      const notesExcerpt = `[Procedure guidance — office fee schedule] (policy)\n${procedureNotes.join("\n")}`;
      excerpts = excerpts ? `${excerpts}\n\n---\n\n${notesExcerpt}` : notesExcerpt;
    }

    const catalog = docs.map((d) => `- ${d.title} (${d.category})`).join("\n");

    const systemPrompt = `You are the office assistant for a dental practice's staff. You answer questions using ONLY the office's own documents (policies, HR information, insurance manuals) provided below.

Documents in the knowledge base:
${catalog}

Voice — this matters as much as accuracy:
- Talk like a helpful coworker, not a policy lawyer. Plain everyday words, short sentences.
- Lead with the answer. First sentence = the bottom line ("Yes, that should be covered because..." / "You've got about 55 hours left").
- Keep it SHORT: a few sentences for most questions. Use a brief list only when it genuinely helps. No headings, no bold-heavy structure, no restating the question, no section numbers unless asked.
- Mention where it came from casually, once ("per the DD MA manual", "the handbook says") — not formal citations for every claim.
- Skip caveats unless one actually matters. One good caveat ("worth getting a pre-treatment estimate to be sure") beats three defensive ones.

Rules:
- Answer only from the excerpts below. Never invent policy details or rates that aren't in them.
- For scenario questions (e.g. will insurance cover this patient's situation), apply the rules in the excerpts — frequency limits, replacement clauses, exclusions — to the scenario and give your read. If the rules don't fully settle it, say what they do establish and what to check.
- If the excerpts have a formula or rate and the user gave you numbers, do the math and give the result with a one-line calculation. Note the official record (like the PTO page or payroll) wins over your estimate.
- If the excerpts don't contain the answer, say so in one sentence and point to which document might, or suggest uploading it.

${excerpts ? `Relevant excerpts:\n\n${excerpts}` : "No excerpts matched this question."}`;

    const aiResponse = await callGateway(LOVABLE_API_KEY, [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: question },
    ]);

    if (aiResponse.status === 429) {
      return json({ error: "The AI is receiving too many requests. Try again in a moment." }, 429);
    }
    if (aiResponse.status === 402) {
      return json({ error: "AI usage credits are exhausted. Add credits in Lovable settings." }, 402);
    }
    if (!aiResponse.ok) {
      const detail = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, detail);
      return json({ error: "AI request failed. Try again." }, 502);
    }

    const completion = await aiResponse.json();
    const answer: string = completion.choices?.[0]?.message?.content ?? "";

    const seen = new Set<string>();
    const sources = kept
      .filter((m) => {
        if (seen.has(m.doc_id)) return false;
        seen.add(m.doc_id);
        return true;
      })
      .map((m) => ({ id: m.doc_id, title: m.title, category: m.category }));

    return json({ answer, sources });
  } catch (error) {
    console.error("ask-docs error:", error);
    return json({ error: "Unexpected error" }, 500);
  }
});
