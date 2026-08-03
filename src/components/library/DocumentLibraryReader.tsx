/**
 * DocumentLibraryReader — the shared reader behind the Office Handbook and
 * the Insurance Desk (and future SOP/training libraries).
 *
 * One configuration in, one working reference tool out:
 *   - opens the primary document immediately (no cover-card shelf)
 *   - sticky left navigation: compact document switcher (only when there is
 *     more than one document), searchable table of contents, active-section
 *     indicator
 *   - reading pane: comfortable width, heading hierarchy, section anchors,
 *     previous/next section navigation, match highlighting
 *   - full-text search scoped to the surface's library areas/collections,
 *     with passage + document + section on every result
 *   - mobile: search up top, sections in a bottom sheet, no chip rows
 *
 * All staff read; management lives in Ask AI → Documents. The office purple
 * (design-token `primary`) marks active navigation, focus, and actions only.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  FileText,
  List,
  Loader2,
  Search,
  Sparkles,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useOfficeDocs, type OfficeDoc } from '@/hooks/useOfficeDocs';
import { parseDocBlocks, type DocBlock } from '@/lib/doc-format';
import {
  DOC_COLLECTION_LABELS,
  escapeRegExp,
  isImportantNumbersTitle,
  locateQueryBlock,
  outlineFromBlocks,
  readerDocsFor,
  resolveDocPlacement,
  sectionAnchorId,
  sectionHeadingForBlock,
  snippetAround,
  type AiScope,
  type LibraryScope,
  type OutlineItem,
} from '@/lib/doc-library';

export interface LibraryQuickLink {
  label: string;
  query: string;
}

export interface DocumentLibraryReaderProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  /** Which library areas/collections this surface shows and searches. */
  scope: LibraryScope;
  /** Contextual Ask AI scope forwarded to the assistant. */
  aiScope: AiScope;
  askAiLabel: string;
  searchPlaceholder: string;
  /** Frequently used topics — each fires a scoped search. Keep it to 4–6. */
  quickLinks: LibraryQuickLink[];
  emptyState: { title: string; body: string };
  /** Kicker above the document switcher, e.g. "Documents" or "Manuals". */
  documentsLabel?: string;
}

interface SearchHit {
  doc_id: string;
  title: string;
  chunk_index: number;
  content: string;
  rank: number;
}

/** Render text with every occurrence of the query marked. */
function highlighted(text: string, query: string) {
  const q = query.trim();
  if (!q) return text;
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, 'ig'));
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <mark key={i} className="rounded-sm bg-primary/20 px-0.5 text-foreground">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

function BlockView({ block, id, query }: { block: DocBlock; id: string; query: string }) {
  const anchor = 'scroll-mt-28 lg:scroll-mt-20';
  switch (block.type) {
    case 'heading':
      return block.level <= 2 ? (
        <h2
          id={id}
          className={`${anchor} mb-3 mt-9 border-b border-border pb-2 text-xl font-bold tracking-tight text-foreground first:mt-0`}
        >
          {highlighted(block.text, query)}
        </h2>
      ) : (
        <h3 id={id} className={`${anchor} mb-2 mt-6 text-base font-semibold text-foreground first:mt-0`}>
          {highlighted(block.text, query)}
        </h3>
      );
    case 'bullets':
      return (
        <ul id={id} className={`${anchor} mb-4 list-disc space-y-1.5 pl-5 text-[15px] leading-7`}>
          {block.items.map((item, j) => (
            <li key={j}>{highlighted(item, query)}</li>
          ))}
        </ul>
      );
    case 'numbered':
      return (
        <ol id={id} className={`${anchor} mb-4 list-decimal space-y-1.5 pl-5 text-[15px] leading-7`}>
          {block.items.map((item, j) => (
            <li key={j}>{highlighted(item, query)}</li>
          ))}
        </ol>
      );
    default:
      return (
        <p id={id} className={`${anchor} mb-4 text-[15px] leading-7 text-foreground/90`}>
          {highlighted(block.text, query)}
        </p>
      );
  }
}

/** Searchable, grouped table of contents with the active section marked. */
function TableOfContents({
  outline,
  activeId,
  onJump,
}: {
  outline: OutlineItem[];
  activeId: string;
  onJump: (item: OutlineItem) => void;
}) {
  const [filter, setFilter] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const topLevel = Math.min(...outline.map(o => o.level));
  const shown = filter.trim()
    ? outline.filter(o => o.text.toLowerCase().includes(filter.trim().toLowerCase()))
    : outline;

  // Keep the active section visible inside the (long) list.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-toc-id="${CSS.escape(activeId)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  if (outline.length === 0) {
    return <p className="px-2 py-1 text-xs text-muted-foreground">No sections detected.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter sections…"
          className="h-8 rounded-lg pl-8 text-xs"
        />
      </div>
      <div ref={listRef} className="space-y-0.5">
        {shown.length === 0 && (
          <p className="px-2 py-1 text-xs text-muted-foreground">No section matches.</p>
        )}
        {shown.map(item => {
          const active = item.id === activeId;
          return (
            <button
              key={item.id}
              type="button"
              data-toc-id={item.id}
              onClick={() => onJump(item)}
              className={`block w-full rounded-md px-2.5 py-1.5 text-left text-[13px] leading-snug transition-colors ${
                item.level > topLevel ? 'pl-5' : ''
              } ${
                active
                  ? 'border-l-2 border-primary bg-primary/10 font-medium text-primary'
                  : 'border-l-2 border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {item.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Compact document switcher — a quiet list, never a card shelf. */
function DocSwitcher({
  docs,
  activeId,
  label,
  onSelect,
}: {
  docs: OfficeDoc[];
  activeId: string;
  label: string;
  onSelect: (doc: OfficeDoc) => void;
}) {
  if (docs.length <= 1) return null;
  return (
    <div className="space-y-1">
      <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {docs.map(doc => {
        const active = doc.id === activeId;
        return (
          <button
            key={doc.id}
            type="button"
            onClick={() => onSelect(doc)}
            className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-sm leading-snug transition-colors ${
              active
                ? 'bg-primary font-medium text-primary-foreground'
                : 'text-foreground/80 hover:bg-muted'
            }`}
          >
            <span className="block">{doc.title}</span>
            <span className={`block text-[11px] ${active ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
              {DOC_COLLECTION_LABELS[resolveDocPlacement(doc).collection]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function DocumentLibraryReader({
  title,
  subtitle,
  icon: Icon,
  scope,
  aiScope,
  askAiLabel,
  searchPlaceholder,
  quickLinks,
  emptyState,
  documentsLabel = 'Documents',
}: DocumentLibraryReaderProps) {
  const { data: allDocs, isLoading } = useOfficeDocs();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [readerHighlight, setReaderHighlight] = useState('');
  const [pendingJump, setPendingJump] = useState<{ docId: string; blockIndex: number } | null>(null);
  const [activeSectionId, setActiveSectionId] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const scrollRaf = useRef(0);

  const docs = useMemo(() => readerDocsFor(allDocs ?? [], scope), [allDocs, scope]);
  const activeDoc = docs.find(d => d.id === selectedId) ?? docs[0] ?? null;
  const docIds = useMemo(() => docs.map(d => d.id), [docs]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);
  const searching = debounced.length >= 3;

  // One fetch of every chunk in scope: feeds the reader, the outlines, and
  // search-result section resolution. Refreshes only when the library changes.
  const { data: contents, isLoading: contentsLoading } = useQuery({
    queryKey: ['library-doc-contents', docIds.join(',')],
    enabled: docIds.length > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase
        .from('office_doc_chunks')
        .select('doc_id, chunk_index, content')
        .in('doc_id', docIds)
        .order('doc_id')
        .order('chunk_index');
      if (error) throw error;
      const parts = new Map<string, string[]>();
      for (const chunk of data ?? []) {
        parts.set(chunk.doc_id, [...(parts.get(chunk.doc_id) ?? []), chunk.content]);
      }
      return new Map([...parts.entries()].map(([id, list]) => [id, list.join('\n\n')]));
    },
  });

  const blocksByDoc = useMemo(() => {
    const map = new Map<string, DocBlock[]>();
    if (!contents) return map;
    for (const id of docIds) map.set(id, parseDocBlocks(contents.get(id) ?? ''));
    return map;
  }, [contents, docIds]);

  const blocks = useMemo(
    () => (activeDoc ? blocksByDoc.get(activeDoc.id) ?? [] : []),
    [activeDoc, blocksByDoc]
  );
  const outline = useMemo(() => outlineFromBlocks(blocks), [blocks]);

  // Scoped full-text search — the same index Ask AI uses, filtered to this
  // surface's areas/collections (plus a client-side guard on scope doc ids).
  const { data: hits, isLoading: searchLoading } = useQuery({
    queryKey: ['library-search', aiScope, debounced],
    enabled: searching,
    queryFn: async (): Promise<SearchHit[]> => {
      const { data, error } = await supabase.rpc('search_office_doc_chunks', {
        p_query: debounced,
        p_limit: 24,
        p_library_areas: scope.areas,
        ...(scope.collections ? { p_collections: scope.collections } : {}),
      });
      if (error) throw error;
      const byKey = new Map<string, SearchHit>();
      for (const hit of (data ?? []) as SearchHit[]) {
        const key = `${hit.doc_id}:${hit.chunk_index}`;
        const existing = byKey.get(key);
        if (!existing || hit.rank > existing.rank) byKey.set(key, hit);
      }
      return [...byKey.values()].sort((a, b) => b.rank - a.rank);
    },
  });

  const scopedHits = useMemo(
    () => (hits ?? []).filter(h => docIds.includes(h.doc_id)).slice(0, 12),
    [hits, docIds]
  );
  const titleHits = useMemo(
    () =>
      searching
        ? docs.filter(
            d =>
              d.title.toLowerCase().includes(debounced.toLowerCase()) &&
              !scopedHits.some(h => h.doc_id === d.id)
          )
        : [],
    [docs, debounced, searching, scopedHits]
  );

  /** Where a hit lands in its document, with its section heading. */
  const hitTarget = (hit: SearchHit) => {
    const docBlocks = blocksByDoc.get(hit.doc_id) ?? [];
    const blockIndex = locateQueryBlock(docBlocks, debounced, hit.content);
    return {
      blockIndex,
      heading: blockIndex >= 0 ? sectionHeadingForBlock(docBlocks, blockIndex) : null,
    };
  };

  const jumpToSection = (item: OutlineItem) => {
    setActiveSectionId(item.id);
    const scroll = () =>
      document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (sheetOpen) {
      // Wait out the sheet's exit animation — the body scroll lock releases
      // only once it unmounts, and a scroll during the lock is swallowed.
      setSheetOpen(false);
      setTimeout(scroll, 400);
    } else {
      scroll();
    }
  };

  const openDoc = (doc: OfficeDoc) => {
    setSelectedId(doc.id);
    setReaderHighlight('');
    setActiveSectionId('');
    setSheetOpen(false);
    window.scrollTo({ top: 0 });
  };

  const openFromSearch = (hit: SearchHit) => {
    const { blockIndex } = hitTarget(hit);
    setSelectedId(hit.doc_id);
    setReaderHighlight(debounced);
    setPendingJump({ docId: hit.doc_id, blockIndex });
    setQuery('');
    setDebounced('');
  };

  // Once the target document's blocks are on screen, finish the jump.
  useEffect(() => {
    if (!pendingJump || !activeDoc || activeDoc.id !== pendingJump.docId || blocks.length === 0) {
      return;
    }
    const { blockIndex } = pendingJump;
    setPendingJump(null);
    if (blockIndex < 0) return;
    const enclosing = outline.filter(o => o.blockIndex <= blockIndex);
    setActiveSectionId(
      enclosing.length > 0 ? enclosing[enclosing.length - 1].id : sectionAnchorId(blockIndex)
    );
    setTimeout(
      () =>
        document
          .getElementById(sectionAnchorId(blockIndex))
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      120
    );
  }, [pendingJump, activeDoc, blocks, outline]);

  // Scrollspy: the last heading above the reading line is the active section.
  useEffect(() => {
    if (outline.length === 0) return;
    const onScroll = () => {
      if (scrollRaf.current) return;
      scrollRaf.current = requestAnimationFrame(() => {
        scrollRaf.current = 0;
        let current = outline[0].id;
        for (const item of outline) {
          const el = document.getElementById(item.id);
          if (!el) continue;
          if (el.getBoundingClientRect().top <= 140) current = item.id;
          else break;
        }
        setActiveSectionId(prev => (prev === current ? prev : current));
      });
    };
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current);
    };
  }, [outline]);

  const activeIndex = Math.max(
    0,
    outline.findIndex(o => o.id === activeSectionId)
  );
  const prevSection = outline[activeIndex - 1];
  const nextSection = outline[activeIndex + 1];
  const activeSection = outline[activeIndex];

  const updatedAt = activeDoc ? new Date(activeDoc.updated_at ?? activeDoc.created_at) : null;

  const sidebar = (
    <div className="space-y-4">
      <DocSwitcher docs={docs} activeId={activeDoc?.id ?? ''} label={documentsLabel} onSelect={openDoc} />
      <div className="space-y-1">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Contents
        </p>
        <TableOfContents outline={outline} activeId={activeSectionId} onJump={jumpToSection} />
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      {/* Compact header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight md:text-2xl">{title}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/assistant?scope=${aiScope}`}>
            <Sparkles className="mr-1.5 h-4 w-4 text-primary" />
            {askAiLabel}
          </Link>
        </Button>
      </div>

      {/* Search across this library */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-11 rounded-xl pl-9 pr-9 focus-visible:ring-primary"
          placeholder={searchPlaceholder}
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Quick access — a handful of real searches, nothing more */}
      {!searching && docs.length > 0 && quickLinks.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Quick access
          </span>
          {quickLinks.slice(0, 6).map(link => (
            <button
              key={link.label}
              type="button"
              onClick={() => setQuery(link.query)}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              {link.label}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : searching ? (
        /* ---------------- Search results ---------------- */
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              Results for “{debounced}”
              {!searchLoading && (
                <span className="ml-1.5 text-muted-foreground">
                  · {scopedHits.length + titleHits.length} match
                  {scopedHits.length + titleHits.length === 1 ? '' : 'es'}
                </span>
              )}
            </p>
            <Button variant="ghost" size="sm" onClick={() => setQuery('')}>
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Back to reading
            </Button>
          </div>
          {searchLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : scopedHits.length === 0 && titleHits.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Nothing here matches “{debounced}”. Try different words, or ask the AI — it
                searches with synonyms.
              </CardContent>
            </Card>
          ) : (
            <>
              {scopedHits.map(hit => {
                const target = hitTarget(hit);
                const doc = docs.find(d => d.id === hit.doc_id);
                const collection = doc ? resolveDocPlacement(doc).collection : 'other';
                return (
                  <button
                    key={`${hit.doc_id}:${hit.chunk_index}`}
                    type="button"
                    onClick={() => openFromSearch(hit)}
                    className="block w-full rounded-xl border border-border bg-card p-3.5 text-left transition-colors hover:border-primary/40"
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="font-medium text-foreground">{hit.title}</span>
                      {target.heading && (
                        <>
                          <ChevronRight className="h-3 w-3 shrink-0" />
                          <span className="truncate">{target.heading}</span>
                        </>
                      )}
                      <Badge variant="outline" className="ml-auto shrink-0 font-normal">
                        {DOC_COLLECTION_LABELS[collection]}
                      </Badge>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {highlighted(snippetAround(hit.content, debounced), debounced)}
                    </p>
                    <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary">
                      Open this section
                      <ArrowRight className="h-3 w-3" />
                    </span>
                  </button>
                );
              })}
              {titleHits.map(doc => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => {
                    openDoc(doc);
                    setQuery('');
                  }}
                  className="flex w-full items-center gap-2 rounded-xl border border-border bg-card p-3.5 text-left transition-colors hover:border-primary/40"
                >
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <span className="text-sm font-medium">{highlighted(doc.title, debounced)}</span>
                  <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </>
          )}
        </div>
      ) : docs.length === 0 ? (
        /* ---------------- Empty library ---------------- */
        <Card>
          <CardContent className="py-14 text-center">
            <Icon className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-3 font-medium">{emptyState.title}</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{emptyState.body}</p>
          </CardContent>
        </Card>
      ) : (
        /* ---------------- Reader ---------------- */
        <>
          {/* Mobile: current section + sections sheet */}
          <div className="sticky top-14 z-20 -mx-4 flex items-center gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur md:top-12 md:-mx-6 md:px-6 lg:hidden">
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {activeSection?.text ?? activeDoc?.title}
            </span>
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="shrink-0">
                  <List className="mr-1.5 h-4 w-4" />
                  Sections
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="flex max-h-[80vh] flex-col rounded-t-2xl">
                <SheetHeader className="text-left">
                  <SheetTitle className="text-base">{activeDoc?.title}</SheetTitle>
                </SheetHeader>
                <div className="mt-2 flex-1 overflow-y-auto pb-4">{sidebar}</div>
              </SheetContent>
            </Sheet>
          </div>

          <div className="grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
            {/* Sticky desktop navigation */}
            <aside className="sticky top-16 hidden max-h-[calc(100vh-5rem)] overflow-y-auto pb-6 pr-1 lg:block">
              {sidebar}
            </aside>

            <main className="min-w-0">
              {contentsLoading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : activeDoc ? (
                <article>
                  <header className="mb-6 border-b border-border pb-4">
                    <h2 className="text-2xl font-bold tracking-tight">{activeDoc.title}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {updatedAt &&
                        `Updated ${updatedAt.toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}`}
                      {outline.length > 0 && ` · ${outline.length} sections`}
                    </p>
                    {readerHighlight && (
                      <button
                        type="button"
                        onClick={() => setReaderHighlight('')}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/15"
                      >
                        Highlighting “{readerHighlight}”
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </header>

                  {blocks.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      This document has no readable text.
                    </p>
                  ) : (
                    <div className="max-w-[46rem]">
                      {blocks.map((block, i) => (
                        <BlockView key={i} id={sectionAnchorId(i)} block={block} query={readerHighlight} />
                      ))}
                    </div>
                  )}

                  {/* Previous / next section */}
                  {outline.length > 1 && (
                    <nav className="mt-10 flex max-w-[46rem] items-stretch gap-3 border-t border-border pt-4">
                      {prevSection ? (
                        <button
                          type="button"
                          onClick={() => jumpToSection(prevSection)}
                          className="flex-1 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/40"
                        >
                          <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            <ArrowLeft className="h-3 w-3" />
                            Previous
                          </span>
                          <span className="mt-1 line-clamp-2 block text-sm font-medium">
                            {prevSection.text}
                          </span>
                        </button>
                      ) : (
                        <div className="flex-1" />
                      )}
                      {nextSection ? (
                        <button
                          type="button"
                          onClick={() => jumpToSection(nextSection)}
                          className="flex-1 rounded-xl border border-border bg-card p-3 text-right transition-colors hover:border-primary/40"
                        >
                          <span className="flex items-center justify-end gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Next
                            <ArrowRight className="h-3 w-3" />
                          </span>
                          <span className="mt-1 line-clamp-2 block text-sm font-medium">
                            {nextSection.text}
                          </span>
                        </button>
                      ) : (
                        <div className="flex-1" />
                      )}
                    </nav>
                  )}
                </article>
              ) : null}
            </main>
          </div>
        </>
      )}
    </div>
  );
}
