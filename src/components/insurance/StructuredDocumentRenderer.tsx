/**
 * StructuredDocumentRenderer — typed chunks in, clean reference pages out.
 *
 * Renders exactly what the parser stored: headings by level, real
 * paragraphs, bullet/numbered lists, styled tables (zebra rows, sticky
 * header, horizontal scroll), and restrained notice callouts. Page
 * provenance appears as quiet "p. N" markers wherever the source page
 * advances — each one opens the original PDF page. Carrier wording is
 * never rewritten; a low-confidence table says so and points at the
 * source instead of pretending.
 *
 * Memoized hard: scrollspy state changes many times per scroll and must
 * never re-render a few hundred chunks mid-read.
 */
import { memo } from 'react';
import { FileSearch } from 'lucide-react';
import { escapeRegExp } from '@/lib/doc-library';
import type { ManualChunk } from '@/lib/manual-parse';

export const chunkAnchorId = (chunkIndex: number): string => `manual-chunk-${chunkIndex}`;
export const sectionAnchor = (sectionId: string): string => `manual-sec-${sectionId}`;

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

/** Quiet, clickable source-page marker in the margin of a chunk. */
function PageMarker({
  page,
  onOpenPage,
}: {
  page: number;
  onOpenPage: ((page: number) => void) | null;
}) {
  if (!onOpenPage) {
    return (
      <span className="select-none text-[10px] font-medium tabular-nums text-muted-foreground/60">
        p. {page}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onOpenPage(page)}
      title={`View original page ${page}`}
      className="select-none rounded px-1 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground/60 transition-colors hover:bg-primary/10 hover:text-primary"
    >
      p. {page}
    </button>
  );
}

function ChunkView({
  chunk,
  showPage,
  highlight,
  onOpenPage,
}: {
  chunk: ManualChunk;
  /** Render the page marker (only where the page advances). */
  showPage: boolean;
  highlight: string;
  onOpenPage: ((page: number) => void) | null;
}) {
  const anchor = 'scroll-mt-32 lg:scroll-mt-8';
  const id = chunkAnchorId(chunk.chunkIndex);
  const marker =
    showPage && chunk.page ? <PageMarker page={chunk.page} onOpenPage={onOpenPage} /> : null;

  switch (chunk.chunkType) {
    case 'heading': {
      const level = chunk.headingLevel ?? 1;
      const sectionId = chunk.sectionId ? sectionAnchor(chunk.sectionId) : undefined;
      if (level <= 1) {
        return (
          <h2
            id={sectionId ?? id}
            className={`${anchor} mb-3 mt-10 flex items-baseline gap-2.5 border-b border-border/70 pb-2 text-xl font-bold tracking-tight text-foreground first:mt-0`}
          >
            <span aria-hidden className="relative top-0.5 h-4 w-1 shrink-0 self-start rounded-full bg-primary/60" />
            <span className="min-w-0 flex-1">{highlighted(chunk.content, highlight)}</span>
            {marker}
          </h2>
        );
      }
      if (level === 2) {
        return (
          <h3
            id={sectionId ?? id}
            className={`${anchor} mb-2 mt-8 flex items-baseline gap-2 text-base font-semibold text-foreground first:mt-0`}
          >
            <span className="min-w-0 flex-1">{highlighted(chunk.content, highlight)}</span>
            {marker}
          </h3>
        );
      }
      return (
        <h4
          id={sectionId ?? id}
          className={`${anchor} mb-1.5 mt-6 flex items-baseline gap-2 text-sm font-semibold text-foreground/90 first:mt-0`}
        >
          <span className="min-w-0 flex-1">{highlighted(chunk.content, highlight)}</span>
          {marker}
        </h4>
      );
    }

    case 'bullet_list': {
      const items = chunk.meta?.items ?? chunk.content.split('\n');
      return (
        <div id={id} className={`${anchor} relative mb-4`}>
          {marker && <span className="absolute -top-4 right-0">{marker}</span>}
          <ul className="list-disc space-y-1.5 pl-5 text-[15px] leading-7 marker:text-primary/50">
            {items.map((item, j) => (
              <li key={j}>{highlighted(item, highlight)}</li>
            ))}
          </ul>
        </div>
      );
    }

    case 'numbered_list': {
      const items = chunk.meta?.items ?? chunk.content.split('\n');
      return (
        <div id={id} className={`${anchor} relative mb-4`}>
          {marker && <span className="absolute -top-4 right-0">{marker}</span>}
          <ol className="list-decimal space-y-1.5 pl-5 text-[15px] leading-7 marker:font-medium marker:text-primary/70">
            {items.map((item, j) => (
              <li key={j}>{highlighted(item, highlight)}</li>
            ))}
          </ol>
        </div>
      );
    }

    case 'table': {
      const rows = chunk.meta?.rows ?? chunk.content.split('\n').map(line => line.split(' | '));
      if (rows.length === 0) return null;
      const headerRow = chunk.meta?.headerRow ?? false;
      const header = headerRow ? rows[0] : null;
      const body = headerRow ? rows.slice(1) : rows;
      const lowConfidence = chunk.meta?.confidence === 'low';
      const columns = Math.max(...rows.map(r => r.length));
      return (
        <figure id={id} className={`${anchor} mb-5`}>
          <div className="flex items-center justify-between gap-2 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Table{chunk.page ? ` — page ${chunk.page}` : ''}
            </span>
            {marker}
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[28rem] border-collapse text-[13px] leading-6">
              {header && (
                <thead>
                  <tr className="bg-muted/70 text-left">
                    {Array.from({ length: columns }, (_, c) => (
                      <th
                        key={c}
                        className="whitespace-nowrap border-b border-border px-3 py-2 font-semibold text-foreground"
                      >
                        {highlighted(header[c] ?? '', highlight)}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {body.map((row, r) => (
                  <tr key={r} className={r % 2 === 1 ? 'bg-muted/30' : undefined}>
                    {Array.from({ length: columns }, (_, c) => (
                      <td key={c} className="border-b border-border/50 px-3 py-1.5 align-top">
                        {highlighted(row[c] ?? '', highlight)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {lowConfidence && (
            <figcaption className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              This table's layout may not have been captured accurately.
              {onOpenPage && chunk.page && (
                <button
                  type="button"
                  onClick={() => onOpenPage(chunk.page!)}
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  <FileSearch className="h-3 w-3" />
                  View original page {chunk.page}
                </button>
              )}
            </figcaption>
          )}
        </figure>
      );
    }

    case 'notice':
      return (
        <div id={id} className={`${anchor} relative mb-4`}>
          {marker && <span className="absolute right-0 top-1.5">{marker}</span>}
          <div className="rounded-r-lg border-l-2 border-primary/50 bg-primary/5 py-2 pl-3.5 pr-14 text-[14px] leading-6 text-foreground/90">
            {highlighted(chunk.content, highlight)}
          </div>
        </div>
      );

    default:
      return (
        <div id={id} className={`${anchor} relative mb-4`}>
          {marker && <span className="absolute -top-3.5 right-0">{marker}</span>}
          {chunk.content.split('\n\n').map((paragraph, j) => (
            <p key={j} className="mb-3 text-[15px] leading-7 text-foreground/90 last:mb-0">
              {highlighted(paragraph, highlight)}
            </p>
          ))}
        </div>
      );
  }
}

const StructuredDocumentRenderer = memo(function StructuredDocumentRenderer({
  chunks,
  highlight,
  showPages,
  onOpenPage,
}: {
  chunks: ManualChunk[];
  highlight: string;
  /** Structured parses show source-page markers; legacy text has none. */
  showPages: boolean;
  onOpenPage: ((page: number) => void) | null;
}) {
  let lastPage: number | null = null;
  return (
    <div className="max-w-[46rem]">
      {chunks.map(chunk => {
        const pageAdvanced = chunk.page !== null && chunk.page !== lastPage;
        if (chunk.page !== null) lastPage = chunk.page;
        return (
          <ChunkView
            key={chunk.chunkIndex}
            chunk={chunk}
            showPage={showPages && pageAdvanced}
            highlight={highlight}
            onOpenPage={onOpenPage}
          />
        );
      })}
    </div>
  );
});

export default StructuredDocumentRenderer;
