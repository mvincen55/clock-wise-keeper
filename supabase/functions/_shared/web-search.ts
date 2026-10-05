/**
 * Web search for the office chat surfaces.
 *
 * There is no separate search-engine subscription to manage: the search runs
 * through OpenRouter's `web` plugin (the same OPENROUTER_API_KEY the Ask AI
 * page already uses), which fetches live results and hands them to a small
 * model that condenses them into a short, cited brief. The chat model only
 * ever sees that brief, as a tool result, so a page's text can never become
 * an instruction — and the search only happens when the model decides it
 * needs the outside world (a CDT code's current definition, a carrier's
 * public policy page, a date, a regulation), not on every message.
 *
 * Privacy: the query is model-written search terms, never the raw chat; it
 * still goes through the PHI scrubber on the way out, like every other
 * outbound string.
 */

import { scrubFreeText } from "./phi-scrub.ts";
import { scrubMessages } from "./ai-safe.ts";

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
/** Small, cheap model for condensing results. Override with OPENROUTER_WEB_MODEL. */
export const DEFAULT_WEB_MODEL = "moonshotai/kimi-k2.6";
const MAX_RESULTS = 5;
const MAX_QUERY_CHARS = 200;
const MAX_BRIEF_CHARS = 3000;

export interface WebSource {
  url: string;
  title: string;
}

/** OpenAI-style tool schema, identical on every surface that offers it. */
export const SEARCH_WEB_TOOL = {
  type: "function",
  function: {
    name: "search_web",
    description:
      "Search the public internet and get back a short, cited brief of what current web pages say. Use it for anything outside the office's own documents: what a CDT/dental code means or when it changed, a carrier's public policies, clinical or regulatory facts, dates, definitions, current events. Never put patient details in the query.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: 'A focused search query, e.g. "CDT D0140 limited oral evaluation definition 2026".',
        },
      },
      required: ["query"],
    },
  },
};

interface Annotation {
  type?: string;
  url_citation?: { url?: unknown; title?: unknown };
}

export interface SearchWebOptions {
  apiKey: string;
  model: string;
  query: string;
  /** Allowlisted surface name, so ai-safe can verify the caller. */
  surface: string;
  /** Collected across a conversation turn so the reply can cite them. */
  sources: Map<string, WebSource>;
  /** Override for tests. */
  fetchImpl?: typeof fetch;
}

/** Run one web search and return a brief the chat model can quote. */
export async function searchWeb(opts: SearchWebOptions): Promise<string> {
  const query = scrubFreeText(opts.query, MAX_QUERY_CHARS).text.replace(/\s+/g, " ").trim();
  if (!query) return "ERROR: search_web needs a query.";
  const doFetch = opts.fetchImpl ?? fetch;

  const messages = scrubMessages(
    [
      {
        role: "system",
        content:
          "You are a web research tool for a dental office's staff assistant. Using ONLY the web search results provided to you, write a concise, factual brief (under 250 words) that answers the query. Report what the pages say, note when they disagree or do not cover it, and never add facts from memory. After each fact, put its source URL in parentheses. Plain text, no headings.",
      },
      { role: "user", content: query },
    ],
    opts.surface,
  );

  let response: Response;
  try {
    response = await doFetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/mvincen55/clock-wise-keeper",
        "X-Title": "Purple Envelope Office Assistant",
      },
      body: JSON.stringify({
        model: opts.model,
        messages,
        plugins: [{ id: "web", max_results: MAX_RESULTS }],
        max_tokens: 800,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (err) {
    return `ERROR: web search failed (${err instanceof Error ? err.message : "network"}). Answer from what you already know and say the web could not be checked.`;
  }
  if (response.status === 402) return "ERROR: web search is unavailable — OpenRouter credits are exhausted.";
  if (!response.ok) return `ERROR: web search failed (HTTP ${response.status}). Say the web could not be checked.`;

  // deno-lint-ignore no-explicit-any
  let data: any = null;
  try {
    data = await response.json();
  } catch {
    return "ERROR: web search returned an unreadable response.";
  }
  const message = data?.choices?.[0]?.message ?? {};
  const brief = typeof message.content === "string" ? message.content.trim().slice(0, MAX_BRIEF_CHARS) : "";
  const found: WebSource[] = [];
  for (const a of (Array.isArray(message.annotations) ? message.annotations : []) as Annotation[]) {
    const url = typeof a?.url_citation?.url === "string" ? a.url_citation.url.trim() : "";
    if (!a || a.type !== "url_citation" || !/^https?:\/\//i.test(url)) continue;
    if (opts.sources.has(url)) continue;
    const title = typeof a.url_citation?.title === "string" ? a.url_citation.title.replace(/\s+/g, " ").trim().slice(0, 120) : "";
    const source = { url: url.slice(0, 500), title: title || url };
    opts.sources.set(url, source);
    found.push(source);
  }
  if (!brief && found.length === 0) {
    return "No useful web results for that query. Try different wording, or say the web had nothing on it.";
  }
  const list = found.length
    ? `\n\nWeb sources:\n${found.map((s) => `- ${s.title} — ${s.url}`).join("\n")}`
    : "";
  return `${brief || "(no summary returned — see sources)"}${list}`;
}
