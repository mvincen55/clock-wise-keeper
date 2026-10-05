/**
 * Office document retrieval — the one search every AI chat surface shares.
 *
 * Full-text search over the org's uploaded documents (handbook, HR, carrier
 * manuals) through the `search_office_doc_chunks` RPC, run under the CALLER's
 * JWT so RLS decides what they may see, then widened with neighbouring chunks
 * so a rule that spans a chunk boundary arrives intact.
 *
 * kimi-agent (Ask AI, FOF Assistant, Ask-this-manual) and office-ai-chat (the
 * Office AI conversation in Messages) both call this, so a fix to retrieval
 * lands on every surface at once.
 */

const bounded = (value: unknown, cap: number): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, cap) : "";

export const MAX_DOC_CONTEXT_CHARS = 24_000;

export interface DocMatch {
  doc_id: string;
  title: string;
  category: string;
  chunk_index: number;
  content: string;
  rank: number;
  // Structured-parse provenance (null on legacy extractions).
  section_title?: string | null;
  page_number?: number | null;
  parse_version?: number;
}

export interface AgentSource {
  id: string;
  title: string;
  category: string;
  /** Best-ranked citation into the document, when known. */
  section_title?: string | null;
  page_number?: number | null;
}

// Contextual search scopes. Mirrors AI_SCOPES in src/lib/doc-library.ts —
// edge functions cannot import from src/. Global Ask AI (no scope) still
// searches every approved document.
export interface SearchScope {
  label: string;
  areas: string[];
  collections: string[];
}

export const SEARCH_SCOPES: Record<string, SearchScope> = {
  handbook: {
    label: "Office Handbook (Workplace handbook + HR documents)",
    areas: ["workplace"],
    collections: ["handbook", "hr"],
  },
  insurance: {
    label: "Insurance Desk (carrier manuals and insurance references)",
    areas: ["playbook"],
    collections: ["insurance"],
  },
};

/** OpenAI-style tool schema, identical on every surface that offers search. */
export const SEARCH_OFFICE_DOCS_TOOL = {
  type: "function",
  function: {
    name: "search_office_docs",
    description:
      "Full-text search over the office's uploaded documents (policies, HR, insurance carrier manuals). Provide 1-5 short keyword queries (1-3 words each); returns the best-matching excerpts with the document, section and page they came from.",
    parameters: {
      type: "object",
      properties: {
        queries: {
          type: "array",
          items: { type: "string" },
          description: '1-5 short keyword queries, e.g. ["PTO accrual", "crown replacement", "timely filing"]',
        },
      },
      required: ["queries"],
    },
  },
};

/** One human-readable citation for a document source, for plain-text replies. */
export function describeSource(source: AgentSource): string {
  const where = source.section_title
    ? ` — ${source.section_title}${source.page_number ? `, p. ${source.page_number}` : ""}`
    : "";
  return `${source.title}${where}`;
}

// deno-lint-ignore no-explicit-any
export async function searchOfficeDocs(
  supabase: any,
  queries: string[],
  sources: Map<string, AgentSource>,
  scope: SearchScope | null = null,
  scopeDocIds: string[] | null = null,
): Promise<string> {
  const cleaned = queries
    .map((q) => bounded(q, 60))
    .filter(Boolean)
    .slice(0, 5);
  if (cleaned.length === 0) return "ERROR: provide 1-5 short keyword queries.";

  const results = await Promise.all(
    cleaned.map((q) =>
      supabase.rpc("search_office_doc_chunks", {
        p_query: q,
        p_limit: 8,
        ...(scope
          ? { p_library_areas: scope.areas, p_collections: scope.collections }
          : {}),
        ...(scopeDocIds && scopeDocIds.length > 0 ? { p_doc_ids: scopeDocIds } : {}),
      })
    )
  );
  const byKey = new Map<string, DocMatch>();
  for (const result of results) {
    for (const match of (result?.data ?? []) as DocMatch[]) {
      const key = `${match.doc_id}:${match.chunk_index}`;
      const existing = byKey.get(key);
      if (!existing || match.rank > existing.rank) byKey.set(key, match);
    }
  }
  const matches = [...byKey.values()].sort((a, b) => b.rank - a.rank).slice(0, 14);
  if (matches.length === 0) {
    return "No document sections matched those queries. Try different keywords, or the answer may not be in the knowledge base.";
  }

  // Pull neighboring chunks for the strongest hits so rules that span a
  // chunk boundary arrive intact. Neighbors stay within the SAME parse
  // version and skip furniture (headers/footers/TOC rows are provenance,
  // not content).
  const docMeta = new Map<string, { title: string; category: string; version: number }>();
  const wanted = new Map<string, Set<number>>();
  for (const match of matches.slice(0, 5)) {
    docMeta.set(match.doc_id, {
      title: match.title,
      category: match.category,
      version: match.parse_version ?? 1,
    });
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
          .select("doc_id, chunk_index, content, section_title, page_number, chunk_type")
          .eq("doc_id", docId)
          .eq("parse_version", docMeta.get(docId)?.version ?? 1)
          .in("chunk_index", [...set])
      )
  );
  for (const result of neighborResults) {
    for (const chunk of result?.data ?? []) {
      const meta = docMeta.get(chunk.doc_id);
      if (!meta) continue;
      if (["header", "footer", "table_of_contents"].includes(chunk.chunk_type ?? "")) continue;
      matches.push({
        doc_id: chunk.doc_id,
        title: meta.title,
        category: meta.category,
        chunk_index: chunk.chunk_index,
        content: chunk.content,
        rank: 0,
        section_title: chunk.section_title,
        page_number: chunk.page_number,
      });
    }
  }

  let budget = MAX_DOC_CONTEXT_CHARS;
  const kept: DocMatch[] = [];
  for (const match of [...matches].sort((a, b) => b.rank - a.rank)) {
    if (match.content.length > budget) continue;
    budget -= match.content.length;
    kept.push(match);
  }
  kept.sort((a, b) => a.title.localeCompare(b.title) || a.chunk_index - b.chunk_index);
  for (const m of kept) {
    // The best-ranked hit per document supplies the citation shown in the
    // UI (kept is rank-ordered before the sort above rearranged it, so
    // fill section/page only if missing or this match has better info).
    const existing = sources.get(m.doc_id);
    if (!existing) {
      sources.set(m.doc_id, {
        id: m.doc_id,
        title: m.title,
        category: m.category,
        section_title: m.section_title ?? null,
        page_number: m.page_number ?? null,
      });
    } else if (!existing.section_title && m.section_title) {
      existing.section_title = m.section_title;
      existing.page_number = m.page_number ?? existing.page_number ?? null;
    }
  }
  return kept
    .map((m) => {
      const where = m.section_title
        ? `${m.section_title}${m.page_number ? `, page ${m.page_number}` : ""}`
        : `section ${m.chunk_index}`;
      return `[${m.title} — ${where}] (${m.category})\n${m.content}`;
    })
    .join("\n\n---\n\n");
}
