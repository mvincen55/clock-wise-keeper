import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// AI assistant over the office knowledge base (policies, HR info,
// insurance handbooks). Retrieves the best-matching document chunks via
// Postgres full-text search (RLS-scoped to the caller's org) and answers
// through the Lovable AI gateway, citing source documents.

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

interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
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

    // Catalog of available docs (RLS scopes to the caller's org).
    const { data: docs } = await supabase
      .from("office_docs")
      .select("id, title, category")
      .order("created_at", { ascending: false })
      .limit(100);
    if (!docs || docs.length === 0) {
      return json({
        answer:
          "There are no documents in the office knowledge base yet. Upload your policies, HR documents, and insurance handbooks in the Documents section below, then ask me again.",
        sources: [],
      });
    }

    const { data: matches, error: searchError } = await supabase.rpc(
      "search_office_doc_chunks",
      { p_query: question, p_limit: 12 }
    );
    if (searchError) console.error("search error:", searchError.message);

    const excerpts = (matches ?? [])
      .map(
        (m: { title: string; category: string; content: string }, i: number) =>
          `[${i + 1}] From "${m.title}" (${m.category}):\n${m.content}`
      )
      .join("\n\n---\n\n");

    const catalog = docs
      .map((d) => `- ${d.title} (${d.category})`)
      .join("\n");

    const systemPrompt = `You are the office assistant for a dental practice's staff. You answer questions using ONLY the office's own documents (policies, HR information, insurance handbooks) provided below.

Documents in the knowledge base:
${catalog}

Rules:
- Answer from the excerpts below. Quote or closely paraphrase the relevant wording and name the document it came from.
- If the excerpts don't contain the answer, say so plainly and mention which document(s) in the catalog might cover it, or that the office may need to upload the relevant document. Never invent policy details.
- Be concise and practical. Staff are asking during their workday.

${excerpts ? `Relevant excerpts:\n\n${excerpts}` : "No excerpts matched this question."}`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("Server configuration error");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...history,
          { role: "user", content: question },
        ],
      }),
    });

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

    // De-duplicated source list from the retrieved excerpts.
    const seen = new Set<string>();
    const sources = (matches ?? [])
      .filter((m: { doc_id: string }) => {
        if (seen.has(m.doc_id)) return false;
        seen.add(m.doc_id);
        return true;
      })
      .map((m: { doc_id: string; title: string; category: string }) => ({
        id: m.doc_id,
        title: m.title,
        category: m.category,
      }));

    return json({ answer, sources });
  } catch (error) {
    console.error("ask-docs error:", error);
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});
