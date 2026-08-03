/**
 * Search results inside the insurance library: every hit names its
 * manual, section, and source page, shows the matching passage with the
 * term marked, and offers both "open the section" and "view the original
 * page". Ordered by relevance (synonym variants already merged upstream).
 */
import { ArrowLeft, ArrowRight, ChevronRight, FileSearch, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { snippetAround } from '@/lib/doc-library';
import { escapeRegExp } from '@/lib/doc-library';
import type { ManualSearchHit } from '@/hooks/useInsuranceManuals';
import type { OfficeDoc } from '@/hooks/useOfficeDocs';

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

export default function ManualSearchResults({
  query,
  hits,
  loading,
  manuals,
  scopeLabel,
  onScopeAll,
  scopedToManual,
  onOpenHit,
  onOpenPage,
  onClear,
}: {
  query: string;
  hits: ManualSearchHit[];
  loading: boolean;
  manuals: OfficeDoc[];
  /** e.g. "This manual" or "All manuals" — whichever is active. */
  scopeLabel: string;
  /** Offer widening the search when scoped to one manual. */
  onScopeAll: (() => void) | null;
  scopedToManual: boolean;
  onOpenHit: (hit: ManualSearchHit) => void;
  onOpenPage: (hit: ManualSearchHit) => void;
  onClear: () => void;
}) {
  const titleOf = (docId: string) => manuals.find(m => m.id === docId)?.title ?? 'Manual';

  return (
    <div className="space-y-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:pr-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          Results for “{query}”
          {!loading && <span className="ml-1.5 text-muted-foreground">· {hits.length} match{hits.length === 1 ? '' : 'es'}</span>}
          <span className="ml-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            {scopeLabel}
          </span>
        </p>
        <Button variant="ghost" size="sm" onClick={onClear}>
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          Back to reading
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : hits.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <p>
              No match for “{query}” in {scopedToManual ? 'this manual' : 'the insurance library'}.
            </p>
            {onScopeAll && (
              <Button variant="outline" size="sm" className="mt-3" onClick={onScopeAll}>
                Search all manuals instead
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        hits.map(hit => (
          <div
            key={`${hit.doc_id}:${hit.chunk_index}`}
            className="rounded-xl border border-border bg-card p-3.5 transition-all hover:border-primary/40 hover:shadow-sm"
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="font-medium text-foreground">{titleOf(hit.doc_id)}</span>
              {hit.section_title && (
                <>
                  <ChevronRight className="h-3 w-3 shrink-0" />
                  <span className="max-w-[18rem] truncate">{hit.section_title}</span>
                </>
              )}
              {hit.page_number && (
                <span className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 font-medium tabular-nums">
                  p. {hit.page_number}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {highlighted(snippetAround(hit.content, query), query)}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onOpenHit(hit)}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Open this section
                <ArrowRight className="h-3 w-3" />
              </button>
              {hit.page_number && (
                <button
                  type="button"
                  onClick={() => onOpenPage(hit)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary"
                >
                  <FileSearch className="h-3 w-3" />
                  View original page
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
