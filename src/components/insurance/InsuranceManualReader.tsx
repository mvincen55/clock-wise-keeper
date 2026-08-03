/**
 * InsuranceManualReader — the Insurance Desk's working surface.
 *
 * Three functional areas on desktop, locked so the page itself never
 * scrolls: a left panel (manual selector + hierarchical contents), the
 * center reading pane (structured content with page provenance), and a
 * right utility drawer (Ask AI scoped to this manual, source tools).
 * Search runs inside the selected manual by default — one toggle widens
 * it to every insurance manual — and results always carry section + page.
 * The original PDF is one click away everywhere; when parsing confidence
 * is low the reader leads with it instead of pretending.
 *
 * Mobile: sections and manuals live in a bottom sheet, search stays on
 * top, the PDF viewer goes full screen, Ask AI opens as a drawer.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  FileSearch,
  Link as LinkIcon,
  List,
  ListTree,
  Loader2,
  Printer,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import AskManualPanel from '@/components/insurance/AskManualPanel';
import InsuranceQuickAccess from '@/components/insurance/InsuranceQuickAccess';
import ManageManualsDialog from '@/components/insurance/ManageManualsDialog';
import ManualSearchResults from '@/components/insurance/ManualSearchResults';
import ManualSelector from '@/components/insurance/ManualSelector';
import ManualTableOfContents from '@/components/insurance/ManualTableOfContents';
import ParsingConfidenceNotice from '@/components/insurance/ParsingConfidenceNotice';
import SourcePageViewer from '@/components/insurance/SourcePageViewer';
import StructuredDocumentRenderer, {
  chunkAnchorId,
  sectionAnchor,
} from '@/components/insurance/StructuredDocumentRenderer';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { OfficeDoc } from '@/hooks/useOfficeDocs';
import {
  useInsuranceManuals,
  useManualPdf,
  useManualSearch,
  useReaderManual,
  type ManualSearchHit,
} from '@/hooks/useInsuranceManuals';
import { formatEffectiveDate, type ReaderManual } from '@/lib/insurance-desk';
import type { ManualSection } from '@/lib/manual-parse';

/** Where a section starts in the DOM: its heading anchor or first chunk. */
function sectionTargets(reader: ReaderManual | undefined) {
  const targets: { section: ManualSection; elementId: string }[] = [];
  if (!reader) return targets;
  for (const section of reader.sections) {
    const heading = reader.chunks.find(
      c => c.sectionId === section.id && c.chunkType === 'heading'
    );
    const first = heading ?? reader.chunks.find(c => c.sectionId === section.id);
    if (!first) continue;
    targets.push({
      section,
      elementId:
        first.chunkType === 'heading' && first.sectionId
          ? sectionAnchor(first.sectionId)
          : chunkAnchorId(first.chunkIndex),
    });
  }
  return targets;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export default function InsuranceManualReader() {
  const { manuals, isLoading } = useInsuranceManuals();
  const { data: ctx } = useOrgContext();
  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('manual'));
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [searchAll, setSearchAll] = useState(false);
  const [readerHighlight, setReaderHighlight] = useState('');
  const [activeSectionId, setActiveSectionId] = useState('');
  const [pendingJump, setPendingJump] = useState<{
    docId: string;
    sectionId: string | null;
    chunkIndex: number | null;
  } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [viewer, setViewer] = useState<{ open: boolean; page: number }>({ open: false, page: 1 });
  const scrollRaf = useRef(0);
  const paneRef = useRef<HTMLElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);

  const activeDoc = manuals.find(m => m.id === selectedId) ?? manuals[0] ?? null;
  const { data: reader, isLoading: readerLoading } = useReaderManual(activeDoc);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);
  const searching = debounced.length >= 3;

  const scopeIds = searchAll ? null : activeDoc ? [activeDoc.id] : null;
  const { data: hits, isLoading: searchLoading } = useManualSearch(debounced, scopeIds, searching);

  // The original PDF is fetched when the viewer opens, or up-front when
  // confidence is low enough that the PDF leads.
  const wantPdf =
    viewer.open || (reader ? reader.confidence === 'low' && !!activeDoc?.file_path : false);
  const { data: pdf } = useManualPdf(activeDoc, wantPdf);

  const targets = useMemo(() => sectionTargets(reader), [reader]);
  const showPages = reader?.structured ?? false;

  // ------------------------------------------------------------------
  // Navigation
  // ------------------------------------------------------------------

  const scrollToElement = useCallback((elementId: string, center = false) => {
    document
      .getElementById(elementId)
      ?.scrollIntoView({ behavior: 'smooth', block: center ? 'center' : 'start' });
  }, []);

  const jumpToSection = (section: ManualSection) => {
    setActiveSectionId(section.id);
    const target = targets.find(t => t.section.id === section.id);
    const scroll = () => target && scrollToElement(target.elementId);
    if (sheetOpen) {
      // Wait out the sheet's exit animation — scrolling during its body
      // scroll lock is swallowed.
      setSheetOpen(false);
      setTimeout(scroll, 400);
    } else {
      scroll();
    }
  };

  const openManual = (doc: OfficeDoc) => {
    setSelectedId(doc.id);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('manual', doc.id);
      next.delete('section');
      return next;
    }, { replace: true });
    setReaderHighlight('');
    setActiveSectionId('');
    setSheetOpen(false);
    window.scrollTo({ top: 0 });
    paneRef.current?.scrollTo({ top: 0 });
  };

  const openFromSearch = (hit: ManualSearchHit) => {
    setSelectedId(hit.doc_id);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('manual', hit.doc_id);
      next.delete('section');
      return next;
    }, { replace: true });
    setReaderHighlight(debounced);
    setPendingJump({
      docId: hit.doc_id,
      sectionId: hit.section_id,
      chunkIndex: hit.chunk_index,
    });
    setQuery('');
    setDebounced('');
  };

  const openViewerAt = useCallback((page: number) => {
    setViewer({ open: true, page: Math.max(1, page) });
  }, []);

  // Deep link (?section=) once the reader is up.
  const deepLinkSection = searchParams.get('section');
  useEffect(() => {
    if (!deepLinkSection || !reader || !activeDoc) return;
    if (reader.sections.some(s => s.id === deepLinkSection)) {
      setPendingJump({ docId: activeDoc.id, sectionId: deepLinkSection, chunkIndex: null });
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete('section');
        return next;
      }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkSection, reader?.doc.id]);

  // Finish a pending jump once the target document's chunks are rendered.
  useEffect(() => {
    if (!pendingJump || !reader || reader.doc.id !== pendingJump.docId) return;
    setPendingJump(null);
    const { sectionId, chunkIndex } = pendingJump;
    const finish = (elementId: string, section: ManualSection | null) => {
      if (section) setActiveSectionId(section.id);
      setTimeout(() => scrollToElement(elementId, true), 120);
    };
    if (chunkIndex !== null && reader.structured) {
      const chunk = reader.chunks.find(c => c.chunkIndex === chunkIndex);
      if (chunk) {
        const section = reader.sections.find(s => s.id === chunk.sectionId) ?? null;
        finish(chunkAnchorId(chunk.chunkIndex), section);
        return;
      }
    }
    if (sectionId) {
      const target = targets.find(t => t.section.id === sectionId);
      if (target) {
        finish(target.elementId, target.section);
        return;
      }
    }
    // Legacy documents: anchor by text match, the old reader's behavior.
    if (chunkIndex !== null && !reader.structured && readerHighlight) {
      const q = readerHighlight.toLowerCase();
      const chunk = reader.chunks.find(c => c.content.toLowerCase().includes(q));
      if (chunk) {
        const section = reader.sections.find(s => s.id === chunk.sectionId) ?? null;
        finish(chunkAnchorId(chunk.chunkIndex), section);
      }
    }
  }, [pendingJump, reader, targets, readerHighlight, scrollToElement]);

  // Scrollspy + reading progress, one rAF-throttled listener on window
  // capture (hears the desktop pane and the mobile page alike).
  useEffect(() => {
    if (targets.length === 0) return;
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
        const threshold = paneTop + 130;
        let current = targets[0].section.id;
        for (const target of targets) {
          const el = document.getElementById(target.elementId);
          if (!el) continue;
          if (el.getBoundingClientRect().top <= threshold) current = target.section.id;
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
  }, [targets]);

  const activeIndex = Math.max(0, reader?.sections.findIndex(s => s.id === activeSectionId) ?? 0);
  const activeSection = reader?.sections[activeIndex] ?? null;
  const prevSection = reader?.sections[activeIndex - 1];
  const nextSection = reader?.sections[activeIndex + 1];

  // ------------------------------------------------------------------
  // Utilities: copy a section link, print the open section
  // ------------------------------------------------------------------

  const copySectionLink = () => {
    if (!activeDoc) return;
    const url = new URL(window.location.href);
    url.searchParams.set('manual', activeDoc.id);
    if (activeSection) url.searchParams.set('section', activeSection.id);
    navigator.clipboard
      .writeText(url.toString())
      .then(() => toast.success('Section link copied.'))
      .catch(() => toast.error('Could not copy the link.'));
  };

  const printSection = () => {
    if (!reader || !activeSection) return;
    const chunks = reader.chunks.filter(c => c.sectionId === activeSection.id);
    const body = chunks
      .map(chunk => {
        const items = chunk.meta?.items ?? chunk.content.split('\n');
        switch (chunk.chunkType) {
          case 'heading':
            return `<h2>${escapeHtml(chunk.content)}</h2>`;
          case 'bullet_list':
            return `<ul>${items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`;
          case 'numbered_list':
            return `<ol>${items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ol>`;
          case 'table': {
            const rows = chunk.meta?.rows ?? chunk.content.split('\n').map(l => l.split(' | '));
            return `<table border="1" cellspacing="0" cellpadding="4">${rows
              .map(r => `<tr>${r.map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`)
              .join('')}</table>`;
          }
          default:
            return chunk.content
              .split('\n\n')
              .map(p => `<p>${escapeHtml(p)}</p>`)
              .join('');
        }
      })
      .join('\n');
    const pageNote = activeSection.page > 0 ? ` — source page ${activeSection.page}` : '';
    const w = window.open('', '_blank', 'noopener,width=800,height=900');
    if (!w) {
      toast.error('Allow pop-ups to print a section.');
      return;
    }
    w.document.write(
      `<!doctype html><html><head><title>${escapeHtml(activeSection.title)}</title>` +
        `<style>body{font:14px/1.6 system-ui,sans-serif;max-width:44rem;margin:2rem auto;padding:0 1rem;color:#111}h1{font-size:1.3rem}h2{font-size:1.1rem}table{border-collapse:collapse;font-size:12px}small{color:#666}</style>` +
        `</head><body><h1>${escapeHtml(activeSection.title)}</h1>` +
        `<small>${escapeHtml(reader.doc.title)}${escapeHtml(pageNote)} — printed from Insurance Desk. The original PDF is authoritative.</small>` +
        body +
        `</body></html>`
    );
    w.document.close();
    w.focus();
    w.print();
  };

  // ------------------------------------------------------------------
  // Layout pieces
  // ------------------------------------------------------------------

  const updatedAt = activeDoc ? new Date(activeDoc.updated_at ?? activeDoc.created_at) : null;
  const effective = activeDoc ? formatEffectiveDate(activeDoc) : null;

  const sidebar = (
    <div className="flex min-h-0 flex-col gap-4 lg:h-full">
      <ManualSelector
        manuals={manuals}
        activeId={activeDoc?.id ?? ''}
        onSelect={openManual}
        label="Manuals"
      />
      <div className="flex min-h-0 flex-col gap-1 lg:flex-1">
        <p className="shrink-0 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Contents
        </p>
        <ManualTableOfContents
          sections={reader?.sections ?? []}
          activeSectionId={activeSectionId}
          showPages={showPages}
          onJump={jumpToSection}
        />
      </div>
    </div>
  );

  const emptyState = (
    <Card>
      <CardContent className="py-14 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/5">
          <ShieldCheck className="h-6 w-6 text-muted-foreground/60" />
        </div>
        <p className="mt-3 font-medium">No carrier manuals yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          {isManager
            ? 'Upload the first carrier manual to build the Insurance Desk — parsing detects its sections, contents, and page structure automatically.'
            : 'A manager can add insurance carrier manuals from Manage manuals on this page.'}
        </p>
        {isManager && (
          <Button className="mt-4" onClick={() => setManageOpen(true)}>
            <Settings2 className="mr-1.5 h-4 w-4" />
            Manage manuals
          </Button>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6 lg:flex lg:h-[calc(100vh-3.75rem)] lg:flex-col lg:overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/15">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight md:text-2xl">Insurance Desk</h1>
            <p className="text-sm text-muted-foreground">
              Carrier manuals, structured for verification-grade lookup.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isManager && (
            <Button variant="outline" size="sm" onClick={() => setManageOpen(true)}>
              <Settings2 className="mr-1.5 h-4 w-4" />
              Manage manuals
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setAskOpen(true)} disabled={!activeDoc}>
            <Sparkles className="mr-1.5 h-4 w-4 text-primary" />
            Ask AI
          </Button>
        </div>
      </div>

      {/* Search + scope */}
      <div className="flex shrink-0 items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 rounded-xl border-border bg-card pl-9 pr-9 shadow-sm focus-visible:ring-primary"
            placeholder={
              activeDoc && !searchAll
                ? `Search ${activeDoc.title} — “crown frequency”, “timely filing”…`
                : 'Search all insurance manuals…'
            }
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
        {manuals.length > 1 && (
          <div className="flex shrink-0 overflow-hidden rounded-lg border border-border text-xs font-medium shadow-sm">
            <button
              type="button"
              onClick={() => setSearchAll(false)}
              className={`px-2.5 py-2 transition-colors ${
                !searchAll ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              This manual
            </button>
            <button
              type="button"
              onClick={() => setSearchAll(true)}
              className={`px-2.5 py-2 transition-colors ${
                searchAll ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              All manuals
            </button>
          </div>
        )}
      </div>

      {/* Quick access */}
      {!searching && manuals.length > 0 && (
        <InsuranceQuickAccess onSearch={shortcut => setQuery(shortcut.query)} />
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : searching ? (
        <ManualSearchResults
          query={debounced}
          hits={hits ?? []}
          loading={searchLoading}
          manuals={manuals}
          scopeLabel={searchAll || !activeDoc ? 'All manuals' : 'This manual'}
          scopedToManual={!searchAll && !!activeDoc}
          onScopeAll={!searchAll && manuals.length > 1 ? () => setSearchAll(true) : null}
          onOpenHit={openFromSearch}
          onOpenPage={hit => {
            if (hit.doc_id === activeDoc?.id && hit.page_number) openViewerAt(hit.page_number);
            else {
              setSelectedId(hit.doc_id);
              if (hit.page_number) setViewer({ open: true, page: hit.page_number });
            }
          }}
          onClear={() => setQuery('')}
        />
      ) : manuals.length === 0 ? (
        emptyState
      ) : (
        <>
          {/* Mobile: current section + sheet */}
          <div className="sticky top-14 z-20 -mx-4 flex items-center gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur md:top-12 md:-mx-6 md:px-6 lg:hidden">
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {activeSection?.title ?? activeDoc?.title}
              {activeSection && activeSection.page > 0 && showPages && (
                <span className="ml-1.5 tabular-nums">· p.{activeSection.page}</span>
              )}
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

          {/* Desktop: locked two-pane layout + utility drawer */}
          <div className="grid items-start gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-[290px_minmax(0,1fr)] lg:items-stretch">
            <aside className="hidden lg:block lg:h-full lg:min-h-0">{sidebar}</aside>

            <main
              ref={paneRef}
              className="min-w-0 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:rounded-2xl lg:border lg:border-border lg:bg-card lg:shadow-sm"
            >
              <div className="pointer-events-none sticky top-0 z-10 hidden lg:block">
                <div ref={progressRef} className="h-[3px] w-0 rounded-r-full bg-primary/60" />
              </div>

              <div className="lg:px-8 lg:pb-10 lg:pt-5 xl:px-10">
                {readerLoading || !reader ? (
                  <div className="flex justify-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : (
                  <article>
                    <header className="mb-6">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="text-2xl font-bold tracking-tight">{reader.doc.title}</h2>
                          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {reader.doc.carrier && (
                              <span className="font-medium text-foreground/75">
                                {reader.doc.carrier}
                              </span>
                            )}
                            {effective && (
                              <span className="inline-flex items-center gap-1">
                                <CalendarDays className="h-3.5 w-3.5" />
                                Effective {effective}
                              </span>
                            )}
                            {updatedAt && (
                              <span>
                                Updated{' '}
                                {updatedAt.toLocaleDateString(undefined, {
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric',
                                })}
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1">
                              <ListTree className="h-3.5 w-3.5" />
                              {reader.sections.length} section
                              {reader.sections.length === 1 ? '' : 's'}
                              {reader.doc.page_count ? ` · ${reader.doc.page_count} pages` : ''}
                            </span>
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {activeDoc?.file_path && activeDoc.mime_type === 'application/pdf' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openViewerAt(activeSection?.page || 1)}
                            >
                              <FileSearch className="mr-1.5 h-3.5 w-3.5" />
                              Original PDF
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Copy link to this section"
                            onClick={copySectionLink}
                          >
                            <LinkIcon className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Print this section"
                            onClick={printSection}
                            disabled={!activeSection}
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
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
                      <div className="mt-4 h-1 w-12 rounded-full bg-primary/60" />
                    </header>

                    <ParsingConfidenceNotice
                      confidence={reader.confidence}
                      structured={reader.structured}
                      onViewOriginal={
                        activeDoc?.file_path && activeDoc.mime_type === 'application/pdf'
                          ? () => openViewerAt(activeSection?.page || 1)
                          : null
                      }
                    />

                    {reader.chunks.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        This document has no readable text.
                      </p>
                    ) : (
                      <StructuredDocumentRenderer
                        chunks={reader.chunks}
                        highlight={readerHighlight}
                        showPages={showPages}
                        onOpenPage={
                          activeDoc?.file_path && activeDoc.mime_type === 'application/pdf'
                            ? openViewerAt
                            : null
                        }
                      />
                    )}

                    {/* Previous / next section */}
                    {reader.sections.length > 1 && (
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
                              {prevSection.title}
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
                              {nextSection.title}
                            </span>
                          </button>
                        ) : (
                          <div className="flex-1" />
                        )}
                      </nav>
                    )}
                  </article>
                )}
              </div>
            </main>
          </div>
        </>
      )}

      {/* Ask AI drawer, scoped to the open manual */}
      <Sheet open={askOpen} onOpenChange={setAskOpen}>
        <SheetContent side="right" className="flex w-full flex-col p-4 sm:max-w-md">
          <SheetHeader className="shrink-0 text-left">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Ask about this manual
            </SheetTitle>
          </SheetHeader>
          <div className="mt-2 min-h-0 flex-1">
            <AskManualPanel
              doc={activeDoc}
              sectionTitle={activeSection?.title ?? null}
              sectionPage={activeSection && activeSection.page > 0 ? activeSection.page : null}
              onOpenPage={
                activeDoc?.file_path && activeDoc.mime_type === 'application/pdf'
                  ? page => {
                      setAskOpen(false);
                      openViewerAt(page);
                    }
                  : null
              }
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Original PDF viewer */}
      <SourcePageViewer
        open={viewer.open}
        onClose={() => setViewer(v => ({ ...v, open: false }))}
        pdfBlob={pdf?.blob ?? null}
        pdfUrl={pdf?.url ?? null}
        title={activeDoc?.title ?? 'Manual'}
        page={viewer.page}
        onPageChange={page => setViewer({ open: true, page })}
      />

      <ManageManualsDialog open={manageOpen} onClose={() => setManageOpen(false)} manuals={manuals} />

      <p className="hidden shrink-0 text-center text-[11px] text-muted-foreground lg:block">
        Clean reader formatting is generated from the carrier's PDF — wording is never
        rewritten, and the original PDF remains the authoritative source.
      </p>
    </div>
  );
}
