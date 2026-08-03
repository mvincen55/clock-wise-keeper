/**
 * DocumentLibraryReader — the shared reader behind the Office Handbook and
 * the Insurance Desk (and future SOP/training libraries).
 *
 * One configuration in, one working reference tool out:
 *   - opens the primary document immediately (no cover-card shelf)
 *   - desktop is a LOCKED two-pane layout: the page never scrolls — the
 *     sections column keeps its place while the document scrolls inside
 *     its own reading pane (with a thin purple reading-progress line)
 *   - left navigation: compact document switcher (only when there is more
 *     than one document), searchable table of contents, active-section
 *     indicator that follows the reading position
 *   - reading pane: comfortable width, heading hierarchy, section anchors,
 *     previous/next section navigation, match highlighting
 *   - full-text search scoped to the surface's library areas/collections,
 *     with passage + document + section on every result
 *   - mobile: search up top, sections in a bottom sheet, no chip rows
 *
 * Scroll behavior notes (the details that keep it glitch-free):
 *   - the document body is memoized, so scrollspy updates never re-render
 *     hundreds of blocks mid-scroll
 *   - the TOC keeps its active item visible by adjusting ONLY its own
 *     list's scrollTop — never scrollIntoView, which can chain upward and
 *     yank the page while someone is reading
 *
 * All staff read; management lives in Ask AI → Documents. The office purple
 * (design-token `primary`) marks active navigation, focus, and progress.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronRight,
  FileText,
  List,
  ListTree,
  Loader2,
  Pencil,
  Search,
  Settings2,
  Sparkles,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  useDocLibrarySettings,
  useEditOfficeDocContent,
  useOfficeDocs,
  useUpdateDocLibrarySettings,
  type OfficeDoc,
} from '@/hooks/useOfficeDocs';
import { useOrgContext } from '@/hooks/useOrgContext';
import { parseDocBlocks, type DocBlock } from '@/lib/doc-format';
import {
  DOC_COLLECTION_LABELS,
  canEditLibraryDocs,
  escapeRegExp,
  locateQueryBlock,
  outlineAncestors,
  outlineFromBlocks,
  outlineTree,
  readerDocsFor,
  resolveDocPlacement,
  sectionAnchorId,
  sectionHeadingForBlock,
  snippetAround,
  stitchChunks,
  type AiScope,
  type LibraryScope,
  type OutlineItem,
  type OutlineTreeNode,
} from '@/lib/doc-library';

export interface LibraryQuickLink {
  label: string;
  query: string;
  icon?: LucideIcon;
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
  // Anchor offset: below the sticky bars when the window scrolls (mobile),
  // just inside the pane when the pane scrolls (desktop).
  const anchor = 'scroll-mt-28 lg:scroll-mt-6';
  switch (block.type) {
    case 'heading':
      return block.level <= 2 ? (
        <h2
          id={id}
          className={`${anchor} mb-3 mt-10 flex items-center gap-2.5 border-b border-border/70 pb-2 text-xl font-bold tracking-tight text-foreground first:mt-0`}
        >
          <span aria-hidden className="h-4 w-1 shrink-0 rounded-full bg-primary/60" />
          <span className="min-w-0">{highlighted(block.text, query)}</span>
        </h2>
      ) : (
        <h3 id={id} className={`${anchor} mb-2 mt-6 text-base font-semibold text-foreground first:mt-0`}>
          {highlighted(block.text, query)}
        </h3>
      );
    case 'bullets':
      return (
        <ul id={id} className={`${anchor} mb-4 list-disc space-y-1.5 pl-5 text-[15px] leading-7 marker:text-primary/50`}>
          {block.items.map((item, j) => (
            <li key={j}>{highlighted(item, query)}</li>
          ))}
        </ul>
      );
    case 'numbered':
      return (
        <ol id={id} className={`${anchor} mb-4 list-decimal space-y-1.5 pl-5 text-[15px] leading-7 marker:font-medium marker:text-primary/70`}>
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

/**
 * The document body, memoized hard: scrollspy state changes many times per
 * scroll, and re-rendering a 67-section handbook on every tick is exactly
 * the jank this avoids.
 */
const ReaderBody = memo(function ReaderBody({
  blocks,
  highlight,
}: {
  blocks: DocBlock[];
  highlight: string;
}) {
  return (
    <div className="max-w-[46rem]">
      {blocks.map((block, i) => (
        <BlockView key={i} id={sectionAnchorId(i)} block={block} query={highlight} />
      ))}
    </div>
  );
});

function tocLabelClass(active: boolean): string {
  return `min-w-0 flex-1 rounded-md px-2 py-1.5 text-left text-[13px] leading-snug transition-colors ${
    active
      ? 'bg-primary/10 font-medium text-primary'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
  }`;
}

/** One row of the contents tree — a fold chevron when it has children. */
function TocRow({
  node,
  activeId,
  expanded,
  onToggle,
  onJump,
}: {
  node: OutlineTreeNode;
  activeId: string;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onJump: (item: OutlineItem) => void;
}) {
  const { item, children } = node;
  const isOpen = expanded.has(item.id);
  return (
    <div>
      <div className="flex items-start">
        {children.length > 0 ? (
          <button
            type="button"
            aria-label={isOpen ? 'Collapse section' : 'Expand section'}
            aria-expanded={isOpen}
            onClick={() => onToggle(item.id)}
            className="mt-1 flex h-6 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-primary"
          >
            <ChevronRight
              className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`}
            />
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <button
          type="button"
          data-toc-id={item.id}
          onClick={() => onJump(item)}
          className={tocLabelClass(item.id === activeId)}
        >
          {item.text}
        </button>
      </div>
      {children.length > 0 && isOpen && (
        <div className="ml-[9px] border-l border-border pl-1.5">
          {children.map(child => (
            <TocRow
              key={child.item.id}
              node={child}
              activeId={activeId}
              expanded={expanded}
              onToggle={onToggle}
              onJump={onJump}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Searchable table of contents. Headings nest by level and fold under
 * their parent category; the path to the active section unfolds itself as
 * you read. Filtering searches every section as a flat list.
 */
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);
  const tree = useMemo(() => outlineTree(outline), [outline]);
  const ancestors = useMemo(() => outlineAncestors(tree), [tree]);
  const hasTree = useMemo(() => tree.some(n => n.children.length > 0), [tree]);
  const filtering = filter.trim().length > 0;
  const shown = filtering
    ? outline.filter(o => o.text.toLowerCase().includes(filter.trim().toLowerCase()))
    : outline;

  // The active section's ancestors unfold so its row is always reachable.
  useEffect(() => {
    if (!activeId) return;
    const chain = ancestors.get(activeId);
    if (!chain || chain.length === 0) return;
    setExpanded(prev => {
      if (chain.every(id => prev.has(id))) return prev;
      const next = new Set(prev);
      for (const id of chain) next.add(id);
      return next;
    });
  }, [activeId, ancestors]);

  const toggle = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Jumping to a category also unfolds it.
  const jump = (item: OutlineItem) => {
    setExpanded(prev => (prev.has(item.id) ? prev : new Set(prev).add(item.id)));
    onJump(item);
  };

  // Keep the active section visible by moving ONLY this list's scrollTop.
  // scrollIntoView is deliberately avoided: it can chain to outer scrollers
  // and shove the page around while the user is reading.
  useEffect(() => {
    const box = listRef.current;
    if (!box || !activeId || box.scrollHeight <= box.clientHeight) return;
    const el = box.querySelector<HTMLElement>(`[data-toc-id="${CSS.escape(activeId)}"]`);
    if (!el) return;
    const boxRect = box.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    if (elRect.top < boxRect.top + 8 || elRect.bottom > boxRect.bottom - 8) {
      box.scrollTop += elRect.top - boxRect.top - box.clientHeight / 2 + el.clientHeight / 2;
    }
  }, [activeId, expanded]);

  if (outline.length === 0) {
    return <p className="px-2 py-1 text-xs text-muted-foreground">No sections detected.</p>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="relative shrink-0">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter sections…"
          className="h-8 rounded-lg pl-8 text-xs focus-visible:ring-primary"
        />
      </div>
      <div
        ref={listRef}
        className="min-h-0 flex-1 space-y-0.5 overscroll-contain pr-1 lg:overflow-y-auto"
      >
        {filtering ? (
          shown.length === 0 ? (
            <p className="px-2 py-1 text-xs text-muted-foreground">No section matches.</p>
          ) : (
            shown.map(item => (
              <button
                key={item.id}
                type="button"
                data-toc-id={item.id}
                onClick={() => jump(item)}
                className={`block w-full ${tocLabelClass(item.id === activeId)}`}
              >
                {item.text}
              </button>
            ))
          )
        ) : hasTree ? (
          tree.map(node => (
            <TocRow
              key={node.item.id}
              node={node}
              activeId={activeId}
              expanded={expanded}
              onToggle={toggle}
              onJump={jump}
            />
          ))
        ) : (
          outline.map(item => (
            <button
              key={item.id}
              type="button"
              data-toc-id={item.id}
              onClick={() => onJump(item)}
              className={`block w-full ${tocLabelClass(item.id === activeId)}`}
            >
              {item.text}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/** Edit a document's text in place — markdown headings become the fold structure. */
function EditDocDialog({
  doc,
  content,
  open,
  onClose,
}: {
  doc: OfficeDoc | null;
  content: string;
  open: boolean;
  onClose: () => void;
}) {
  const edit = useEditOfficeDocContent();
  const [text, setText] = useState('');
  const [seededFor, setSeededFor] = useState<string | null>(null);

  // Seed the editor from the current document each time it opens.
  if (open && doc && seededFor !== doc.id) {
    setSeededFor(doc.id);
    setText(content);
  }
  if (!open && seededFor !== null) {
    setSeededFor(null);
  }

  const save = () => {
    if (!doc) return;
    edit.mutate(
      { docId: doc.id, text },
      {
        onSuccess: result => {
          toast.success(`Saved — ${result.chunks} sections re-indexed`);
          onClose();
        },
        onError: err => toast.error(err.message),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={isOpen => !isOpen && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit — {doc?.title}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Markdown headings shape the contents list: <code className="rounded bg-muted px-1"># title</code>,{' '}
          <code className="rounded bg-muted px-1">## category</code>,{' '}
          <code className="rounded bg-muted px-1">### policy</code> — deeper headings fold under
          their category. Use <code className="rounded bg-muted px-1">-</code> for bullets and{' '}
          <code className="rounded bg-muted px-1">1.</code> for steps. Internal business documents
          only — never patient information.
        </p>
        <Textarea
          value={text}
          onChange={e => setText(e.target.value)}
          spellCheck={false}
          className="min-h-[55vh] font-mono text-[13px] leading-relaxed focus-visible:ring-primary"
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={edit.isPending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={edit.isPending || !text.trim()}>
            {edit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Owner-only: decide whether managers may edit documents here too. */
function EditingSettingsPopover() {
  const { data: settings } = useDocLibrarySettings();
  const update = useUpdateDocLibrarySettings();
  const managersCanEdit = settings?.managers_can_edit ?? false;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Editing settings">
          <Settings2 className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-2.5">
        <p className="text-sm font-medium">Editing</p>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="managers-can-edit" className="text-sm font-normal leading-snug">
            Managers can edit documents
          </Label>
          <Switch
            id="managers-can-edit"
            checked={managersCanEdit}
            disabled={update.isPending}
            onCheckedChange={value =>
              update.mutate(value, { onError: err => toast.error(err.message) })
            }
          />
        </div>
        <p className="text-xs text-muted-foreground">
          As the owner you can always edit. This also lets managers change document text from
          the reader.
        </p>
      </PopoverContent>
    </Popover>
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
    <div className="shrink-0 space-y-1">
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
            className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm leading-snug transition-colors ${
              active
                ? 'bg-primary font-medium text-primary-foreground shadow-sm'
                : 'text-foreground/80 hover:bg-muted'
            }`}
          >
            <FileText
              className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${active ? 'text-primary-foreground/80' : 'text-primary/60'}`}
            />
            <span className="min-w-0">
              <span className="block">{doc.title}</span>
              <span
                className={`block text-[11px] ${active ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}
              >
                {DOC_COLLECTION_LABELS[resolveDocPlacement(doc).collection]}
              </span>
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
  const { data: ctx } = useOrgContext();
  const { data: librarySettings } = useDocLibrarySettings();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [readerHighlight, setReaderHighlight] = useState('');
  const [pendingJump, setPendingJump] = useState<{ docId: string; blockIndex: number } | null>(null);
  const [activeSectionId, setActiveSectionId] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const scrollRaf = useRef(0);
  const paneRef = useRef<HTMLElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);

  const isOwner = ctx?.role === 'owner';
  const canEdit = canEditLibraryDocs(ctx?.role, librarySettings?.managers_can_edit ?? false);

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
  // Re-parsed documents keep multiple parse versions side by side and type
  // their furniture (headers/footers/TOC rows) — read only the current
  // version's actual content.
  const versionByDoc = useMemo(
    () => new Map(docs.map(d => [d.id, d.current_parse_version ?? 1])),
    [docs]
  );
  const { data: contents, isLoading: contentsLoading } = useQuery({
    queryKey: ['library-doc-contents', docIds.join(','), [...versionByDoc.values()].join(',')],
    enabled: docIds.length > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase
        .from('office_doc_chunks')
        .select('doc_id, chunk_index, content, chunk_type, parse_version')
        .in('doc_id', docIds)
        .not('chunk_type', 'in', '("header","footer","table_of_contents")')
        .order('doc_id')
        .order('chunk_index');
      if (error) throw error;
      const parts = new Map<string, string[]>();
      for (const chunk of data ?? []) {
        if (chunk.parse_version !== (versionByDoc.get(chunk.doc_id) ?? 1)) continue;
        parts.set(chunk.doc_id, [...(parts.get(chunk.doc_id) ?? []), chunk.content]);
      }
      // Stitch, don't join: chunks overlap by design for retrieval, and a
      // naive join repeats every overlap in the reading pane.
      return new Map([...parts.entries()].map(([id, list]) => [id, stitchChunks(list)]));
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
    paneRef.current?.scrollTo({ top: 0 });
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

  // Scrollspy + reading progress, one rAF-throttled listener. Captured on
  // window so it hears both the desktop reading pane and mobile page scroll.
  // The reading line sits just inside the pane (desktop) or just below the
  // sticky bars (mobile) — the last heading above it is the active section.
  useEffect(() => {
    if (outline.length === 0) return;
    const onScroll = () => {
      if (scrollRaf.current) return;
      scrollRaf.current = requestAnimationFrame(() => {
        scrollRaf.current = 0;
        const pane = paneRef.current;
        if (pane && progressRef.current) {
          const max = pane.scrollHeight - pane.clientHeight;
          progressRef.current.style.width =
            max > 0 ? `${Math.min(100, (pane.scrollTop / max) * 100)}%` : '0%';
        }
        const paneTop = pane ? Math.max(pane.getBoundingClientRect().top, 0) : 0;
        const threshold = paneTop + 120;
        let current = outline[0].id;
        for (const item of outline) {
          const el = document.getElementById(item.id);
          if (!el) continue;
          if (el.getBoundingClientRect().top <= threshold) current = item.id;
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
    <div className="flex min-h-0 flex-col gap-4 lg:h-full">
      <DocSwitcher docs={docs} activeId={activeDoc?.id ?? ''} label={documentsLabel} onSelect={openDoc} />
      <div className="flex min-h-0 flex-col gap-1 lg:flex-1">
        <p className="shrink-0 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Contents
        </p>
        <TableOfContents outline={outline} activeId={activeSectionId} onJump={jumpToSection} />
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6 lg:flex lg:h-[calc(100vh-3.75rem)] lg:flex-col lg:overflow-hidden">
      {/* Compact header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/15">
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
      <div className="relative shrink-0">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-11 rounded-xl border-border bg-card pl-9 pr-9 shadow-sm focus-visible:ring-primary"
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
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Quick access
          </span>
          {quickLinks.slice(0, 6).map(link => {
            const LinkIcon = link.icon;
            return (
              <button
                key={link.label}
                type="button"
                onClick={() => setQuery(link.query)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-primary"
              >
                {LinkIcon && <LinkIcon className="h-3.5 w-3.5 text-primary/70" />}
                {link.label}
              </button>
            );
          })}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : searching ? (
        /* ---------------- Search results ---------------- */
        <div className="space-y-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:pr-1">
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
                    className="block w-full rounded-xl border border-border bg-card p-3.5 text-left transition-all hover:border-primary/40 hover:shadow-sm"
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
                  className="flex w-full items-center gap-2 rounded-xl border border-border bg-card p-3.5 text-left transition-all hover:border-primary/40 hover:shadow-sm"
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
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/5">
              <Icon className="h-6 w-6 text-muted-foreground/60" />
            </div>
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
                <div className="mt-2 min-h-0 flex-1 overflow-y-auto pb-2">{sidebar}</div>
              </SheetContent>
            </Sheet>
          </div>

          {/* Desktop: locked two-pane layout — the page itself never
              scrolls; the sections column holds its place and the document
              scrolls inside the reading pane. */}
          <div className="grid items-start gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-stretch">
            <aside className="hidden lg:block lg:h-full lg:min-h-0">{sidebar}</aside>

            <main
              ref={paneRef}
              className="min-w-0 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:rounded-2xl lg:border lg:border-border lg:bg-card lg:shadow-sm"
            >
              {/* Reading progress — a quiet purple line along the pane's top */}
              <div className="pointer-events-none sticky top-0 z-10 hidden lg:block">
                <div ref={progressRef} className="h-[3px] w-0 rounded-r-full bg-primary/60" />
              </div>

              <div className="lg:px-8 lg:pb-10 lg:pt-5 xl:px-10">
                {contentsLoading ? (
                  <div className="flex justify-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : activeDoc ? (
                  <article>
                    <header className="mb-7">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="mt-1 hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 sm:flex">
                            <Icon className="h-4 w-4 text-primary" />
                          </span>
                          <div className="min-w-0">
                            <h2 className="text-2xl font-bold tracking-tight">{activeDoc.title}</h2>
                            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              {updatedAt && (
                                <span className="inline-flex items-center gap-1">
                                  <CalendarDays className="h-3.5 w-3.5" />
                                  Updated{' '}
                                  {updatedAt.toLocaleDateString(undefined, {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric',
                                  })}
                                </span>
                              )}
                              {outline.length > 0 && (
                                <span className="inline-flex items-center gap-1">
                                  <ListTree className="h-3.5 w-3.5" />
                                  {outline.length} sections
                                </span>
                              )}
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
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {canEdit && (
                            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                              <Pencil className="mr-1.5 h-3.5 w-3.5" />
                              Edit
                            </Button>
                          )}
                          {isOwner && <EditingSettingsPopover />}
                        </div>
                      </div>
                      <div className="mt-4 h-1 w-12 rounded-full bg-primary/60" />
                    </header>

                    {blocks.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        This document has no readable text.
                      </p>
                    ) : (
                      <ReaderBody blocks={blocks} highlight={readerHighlight} />
                    )}

                    {/* Previous / next section */}
                    {outline.length > 1 && (
                      <nav className="mt-10 flex max-w-[46rem] items-stretch gap-3 border-t border-border pt-4">
                        {prevSection ? (
                          <button
                            type="button"
                            onClick={() => jumpToSection(prevSection)}
                            className="group flex-1 rounded-xl border border-border bg-card p-3 text-left transition-all hover:border-primary/40 hover:shadow-sm"
                          >
                            <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                              <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-0.5" />
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
                            className="group flex-1 rounded-xl border border-border bg-card p-3 text-right transition-all hover:border-primary/40 hover:shadow-sm"
                          >
                            <span className="flex items-center justify-end gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Next
                              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
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
              </div>
            </main>
          </div>

          <EditDocDialog
            doc={activeDoc}
            content={activeDoc ? contents?.get(activeDoc.id) ?? '' : ''}
            open={editOpen}
            onClose={() => setEditOpen(false)}
          />
        </>
      )}
    </div>
  );
}
