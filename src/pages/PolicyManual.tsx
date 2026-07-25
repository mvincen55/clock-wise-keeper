/**
 * Policy Manual — the office handbook, built to be USED, not scrolled.
 *
 * Anatomy: a sticky left navigator (search, categories, documents, and —
 * for the open document — its section outline) beside a reader pane.
 * Search goes INSIDE the documents (same full-text search Ask AI uses):
 * results show the matching passage, and clicking one opens the document
 * scrolled to that spot with the match highlighted. Styled after the
 * printed FOF: deep purple accents, kicker headings, quiet lavender
 * borders.
 *
 * Same library that powers Ask AI (one source of truth) — internal
 * business documents only, never patient records.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  FileText,
  Loader2,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import {
  DOC_CATEGORY_LABELS,
  useOfficeDocContent,
  useOfficeDocs,
  type OfficeDoc,
  type OfficeDocCategory,
} from '@/hooks/useOfficeDocs';
import { parseDocBlocks, type DocBlock } from '@/lib/doc-format';

const CATEGORY_ORDER: OfficeDocCategory[] = ['policy', 'hr', 'insurance', 'other'];
const CATEGORY_ICONS: Record<OfficeDocCategory, typeof FileText> = {
  policy: BookOpen,
  hr: Users,
  insurance: ShieldCheck,
  other: FileText,
};

// The FOF print palette, carried onto the screen.
const INK = 'text-[#53406e]';
const KICKER = `text-[11px] font-bold uppercase tracking-[0.14em] ${INK}`;
const CARD = 'rounded-xl border-[#e2dcec] shadow-sm';

interface SearchHit {
  doc_id: string;
  title: string;
  category: string;
  chunk_index: number;
  content: string;
  rank: number;
}

/** Render text with the query highlighted. */
function highlighted(text: string, query: string) {
  const q = query.trim();
  if (!q) return text;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'ig'));
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <mark key={i} className="rounded-sm bg-[#ead9ff] px-0.5 text-[#3d2d54]">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

function snippetAround(content: string, query: string, radius = 130): string {
  const idx = content.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return content.slice(0, radius * 2) + (content.length > radius * 2 ? '…' : '');
  const start = Math.max(0, idx - radius);
  const end = Math.min(content.length, idx + query.length + radius);
  return (start > 0 ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '');
}

function BlockView({ block, id, query }: { block: DocBlock; id: string; query: string }) {
  switch (block.type) {
    case 'heading':
      return block.level <= 2 ? (
        <h2 id={id} className={`mb-2 mt-8 flex items-center gap-3 text-lg font-bold first:mt-0 ${INK}`}>
          <span>{highlighted(block.text, query)}</span>
          <span className="h-px flex-1 bg-[#e2dcec]" />
        </h2>
      ) : (
        <h3 id={id} className={`mb-1.5 mt-6 text-base font-semibold first:mt-0 ${INK}`}>
          {highlighted(block.text, query)}
        </h3>
      );
    case 'bullets':
      return (
        <ul id={id} className="mb-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
          {block.items.map((item, j) => (
            <li key={j}>{highlighted(item, query)}</li>
          ))}
        </ul>
      );
    case 'numbered':
      return (
        <ol id={id} className="mb-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed">
          {block.items.map((item, j) => (
            <li key={j}>{highlighted(item, query)}</li>
          ))}
        </ol>
      );
    default:
      return (
        <p id={id} className="mb-3 text-sm leading-relaxed">
          {highlighted(block.text, query)}
        </p>
      );
  }
}

const blockText = (b: DocBlock): string =>
  b.type === 'bullets' || b.type === 'numbered' ? b.items.join(' ') : b.text;

export default function PolicyManual() {
  const { data: docs, isLoading } = useOfficeDocs();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [openDoc, setOpenDoc] = useState<OfficeDoc | null>(null);
  const [jumpTo, setJumpTo] = useState<string>('');
  const { data: content, isLoading: contentLoading } = useOfficeDocContent(openDoc?.id ?? null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  const searching = debounced.length >= 3;

  // Full-text search inside the documents (same index Ask AI uses).
  const { data: hits, isLoading: searchLoading } = useQuery({
    queryKey: ['policy-manual-search', debounced],
    enabled: searching,
    queryFn: async (): Promise<SearchHit[]> => {
      const { data, error } = await supabase.rpc('search_office_doc_chunks', {
        p_query: debounced,
        p_limit: 12,
      });
      if (error) throw error;
      const byKey = new Map<string, SearchHit>();
      for (const hit of (data ?? []) as SearchHit[]) {
        const existing = byKey.get(hit.doc_id);
        if (!existing || hit.rank > existing.rank) byKey.set(hit.doc_id, hit);
      }
      return [...byKey.values()].sort((a, b) => b.rank - a.rank);
    },
  });

  const titleHits = useMemo(
    () =>
      searching
        ? (docs ?? []).filter(
            d =>
              d.title.toLowerCase().includes(debounced.toLowerCase()) &&
              !(hits ?? []).some(h => h.doc_id === d.id)
          )
        : [],
    [docs, debounced, searching, hits]
  );

  const blocks = useMemo(() => (content ? parseDocBlocks(content) : []), [content]);
  const outline = useMemo(
    () =>
      blocks
        .map((b, i) => ({ block: b, i }))
        .filter(({ block }) => block.type === 'heading')
        .map(({ block, i }) => ({ text: (block as { text: string }).text, id: `pm-block-${i}` })),
    [blocks]
  );

  // After opening from a search hit, scroll to the first matching block.
  useEffect(() => {
    if (!jumpTo || blocks.length === 0) return;
    const idx = blocks.findIndex(b => blockText(b).toLowerCase().includes(jumpTo.toLowerCase()));
    if (idx >= 0) {
      setTimeout(
        () =>
          document
            .getElementById(`pm-block-${idx}`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
        150
      );
    }
  }, [jumpTo, blocks]);

  const openFromSearch = (docId: string) => {
    const doc = (docs ?? []).find(d => d.id === docId);
    if (!doc) return;
    setOpenDoc(doc);
    setJumpTo(debounced);
    setQuery('');
    setDebounced('');
  };

  const openPlain = (doc: OfficeDoc) => {
    setOpenDoc(doc);
    setJumpTo('');
    setQuery('');
    setDebounced('');
    window.scrollTo({ top: 0 });
  };

  const grouped = useMemo(
    () =>
      CATEGORY_ORDER.map(category => ({
        category,
        docs: (docs ?? []).filter(d => d.category === category),
      })).filter(g => g.docs.length > 0),
    [docs]
  );

  const readerHighlight = jumpTo;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <BookOpen className={`h-6 w-6 ${INK}`} />
            Policy Manual
          </h1>
          <p className="text-sm text-muted-foreground">
            The office handbook — search inside every document, or browse by section.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/assistant">
            <Sparkles className="mr-2 h-4 w-4" />
            Ask AI about these
          </Link>
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="rounded-full border-[#e2dcec] pl-9"
          placeholder="Search inside the manual — “late arrival”, “crown remake”, “PTO accrual”…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      {searching ? (
        /* ---- Search results: matching passages across the whole manual ---- */
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className={KICKER}>Results</span>
            <span className="h-px flex-1 bg-[#ddd5e6]" />
          </div>
          {searchLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className={`h-6 w-6 animate-spin ${INK}`} />
            </div>
          ) : (hits ?? []).length === 0 && titleHits.length === 0 ? (
            <Card className={CARD}>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Nothing in the manual matches “{debounced}”. Try different words, or ask the AI —
                it searches with synonyms.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {(hits ?? []).map(hit => (
                <Card
                  key={`${hit.doc_id}:${hit.chunk_index}`}
                  className={`${CARD} cursor-pointer transition-colors hover:border-[#c9bedb]`}
                  onClick={() => openFromSearch(hit.doc_id)}
                >
                  <CardContent className="space-y-1 py-3">
                    <div className="flex items-center gap-2">
                      <FileText className={`h-4 w-4 shrink-0 ${INK}`} />
                      <span className="text-sm font-semibold">{hit.title}</span>
                      <Badge variant="outline" className="border-[#e2dcec] text-[10px]">
                        {DOC_CATEGORY_LABELS[(hit.category as OfficeDocCategory) ?? 'other'] ??
                          hit.category}
                      </Badge>
                      <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="pl-6 text-xs leading-relaxed text-muted-foreground">
                      {highlighted(snippetAround(hit.content, debounced), debounced)}
                    </p>
                  </CardContent>
                </Card>
              ))}
              {titleHits.map(doc => (
                <Card
                  key={doc.id}
                  className={`${CARD} cursor-pointer transition-colors hover:border-[#c9bedb]`}
                  onClick={() => openPlain(doc)}
                >
                  <CardContent className="flex items-center gap-2 py-3">
                    <FileText className={`h-4 w-4 shrink-0 ${INK}`} />
                    <span className="text-sm font-semibold">{highlighted(doc.title, debounced)}</span>
                    <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[270px_1fr]">
          {/* ---- Navigator ---- */}
          <aside className="sticky top-6 hidden max-h-[calc(100vh-6rem)] space-y-4 overflow-y-auto pr-1 lg:block">
            {grouped.map(group => (
              <div key={group.category} className="space-y-1">
                <div className={`${KICKER} px-2`}>{DOC_CATEGORY_LABELS[group.category]}</div>
                {group.docs.map(doc => {
                  const active = openDoc?.id === doc.id;
                  return (
                    <div key={doc.id}>
                      <button
                        type="button"
                        onClick={() => openPlain(doc)}
                        className={
                          active
                            ? 'w-full rounded-lg bg-[#53406e] px-3 py-1.5 text-left text-sm font-medium text-white'
                            : 'w-full rounded-lg px-3 py-1.5 text-left text-sm text-foreground/80 hover:bg-[#f6f3fa] hover:text-[#53406e]'
                        }
                      >
                        {doc.title}
                      </button>
                      {active && outline.length > 0 && (
                        <div className="ml-3 mt-1 space-y-0.5 border-l border-[#e2dcec] pl-3">
                          {outline.map(item => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() =>
                                document
                                  .getElementById(item.id)
                                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                              }
                              className="block w-full truncate rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-[#f6f3fa] hover:text-[#53406e]"
                            >
                              {item.text}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </aside>

          {/* ---- Reader / landing ---- */}
          <main className="min-w-0">
            {isLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className={`h-6 w-6 animate-spin ${INK}`} />
              </div>
            ) : openDoc ? (
              <Card className={CARD}>
                <CardContent className="p-5 md:p-7">
                  <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-[#e2dcec] pb-4">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="lg:hidden"
                      onClick={() => setOpenDoc(null)}
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <h2 className={`min-w-48 flex-1 text-lg font-bold ${INK}`}>{openDoc.title}</h2>
                    <Badge variant="outline" className="border-[#e2dcec]">
                      {DOC_CATEGORY_LABELS[(openDoc.category as OfficeDocCategory) ?? 'other'] ??
                        openDoc.category}
                    </Badge>
                  </div>
                  {/* Mobile outline chips */}
                  {outline.length > 0 && (
                    <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1 lg:hidden">
                      {outline.map(item => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() =>
                            document
                              .getElementById(item.id)
                              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                          }
                          className="shrink-0 rounded-full border border-[#e2dcec] px-3 py-1 text-xs text-muted-foreground"
                        >
                          {item.text}
                        </button>
                      ))}
                    </div>
                  )}
                  {contentLoading ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className={`h-6 w-6 animate-spin ${INK}`} />
                    </div>
                  ) : blocks.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      This document has no readable text.
                    </p>
                  ) : (
                    <div className="max-w-prose">
                      {blocks.map((block, i) => (
                        <BlockView key={i} id={`pm-block-${i}`} block={block} query={readerHighlight} />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : grouped.length === 0 ? (
              <Card className={CARD}>
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  No documents yet. A manager can upload the policy manual and other office
                  documents in the Ask AI → Documents tab.
                </CardContent>
              </Card>
            ) : (
              /* Landing: category overview cards */
              <div className="space-y-4">
                <Card className="rounded-xl border-[1.5px] border-[#53406e]/30 bg-[#f6f3fa] shadow-sm">
                  <CardContent className="flex items-center gap-4 py-5">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#53406e] text-white">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <div>
                      <div className={`text-sm font-bold ${INK}`}>How to use the manual</div>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        Search finds passages <em>inside</em> the documents — try “late arrival” or
                        “crown remake”. Or pick a document from the left and jump around with its
                        section outline.
                      </p>
                    </div>
                  </CardContent>
                </Card>
                <div className="grid gap-4 sm:grid-cols-2">
                  {grouped.map(group => {
                    const Icon = CATEGORY_ICONS[group.category];
                    return (
                      <Card key={group.category} className={CARD}>
                        <CardContent className="space-y-2 py-4">
                          <div className="flex items-center gap-2">
                            <Icon className={`h-4 w-4 ${INK}`} />
                            <span className={KICKER}>{DOC_CATEGORY_LABELS[group.category]}</span>
                            <span className="ml-auto text-xs text-muted-foreground">
                              {group.docs.length}
                            </span>
                          </div>
                          <div className="space-y-0.5">
                            {group.docs.map(doc => (
                              <button
                                key={doc.id}
                                type="button"
                                onClick={() => openPlain(doc)}
                                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[#f6f3fa] hover:text-[#53406e]"
                              >
                                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                <span className="min-w-0 flex-1 truncate">{doc.title}</span>
                                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                              </button>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
