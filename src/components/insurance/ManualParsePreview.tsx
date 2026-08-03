/**
 * What the parser found, before anything is published. Managers review
 * the detected structure — section count and titles, page count, TOC
 * match rate, removed headers/footers, confidence — and only then
 * publish. A long document that fell back to page navigation says so
 * here in plain words.
 */
import { BookOpenText, FileWarning, Layers, ListTree } from 'lucide-react';
import { ConfidenceBadge } from '@/components/insurance/ParsingConfidenceNotice';
import type { ParsedManual } from '@/lib/manual-parse';

export default function ManualParsePreview({ parsed }: { parsed: ParsedManual }) {
  const { meta, sections } = parsed;
  const topLevel = sections.filter(s => s.level === 1);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3.5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">Parse result</span>
        <ConfidenceBadge confidence={meta.confidence} />
        {meta.navMode === 'pages' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-500/20 dark:text-amber-400">
            <FileWarning className="h-3 w-3" />
            Page-based navigation (structure not detected)
          </span>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Pages</dt>
          <dd className="font-medium tabular-nums">{meta.pageCount}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Sections</dt>
          <dd className="font-medium tabular-nums">{meta.sectionCount}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Contents entries</dt>
          <dd className="font-medium tabular-nums">
            {parsed.toc.length > 0
              ? `${parsed.toc.length} (${Math.round((meta.tocMatchRate ?? 0) * 100)}% matched)`
              : 'None found'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Removed furniture</dt>
          <dd className="font-medium tabular-nums">
            {meta.removedHeaders.length + meta.removedFooters.length} repeated lines
          </dd>
        </div>
      </dl>

      {(meta.detectedCarrier || meta.detectedManualType || meta.detectedEffectiveDate) && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <BookOpenText className="h-3.5 w-3.5 text-primary/70" />
          {meta.detectedCarrier && <span>Carrier: {meta.detectedCarrier}</span>}
          {meta.detectedManualType && <span>Type: {meta.detectedManualType} manual</span>}
          {meta.detectedEffectiveDate && <span>Effective: {meta.detectedEffectiveDate}</span>}
        </p>
      )}

      {topLevel.length > 0 && meta.navMode === 'sections' && (
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground/80">
            <ListTree className="h-3.5 w-3.5 text-primary/70" />
            Detected sections
          </p>
          <ul className="max-h-44 space-y-0.5 overflow-y-auto rounded-lg border border-border bg-card p-2 text-xs">
            {topLevel.slice(0, 40).map(section => (
              <li key={section.id} className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate">{section.title}</span>
                {section.page > 0 && (
                  <span className="shrink-0 tabular-nums text-muted-foreground">p.{section.page}</span>
                )}
              </li>
            ))}
            {topLevel.length > 40 && (
              <li className="text-muted-foreground">…and {topLevel.length - 40} more</li>
            )}
          </ul>
        </div>
      )}

      {(meta.removedHeaders.length > 0 || meta.removedFooters.length > 0) && (
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground/80">
            <Layers className="h-3.5 w-3.5 text-primary/70" />
            Removed from reading view (kept in the original PDF)
          </p>
          <ul className="max-h-24 space-y-0.5 overflow-y-auto text-[11px] text-muted-foreground">
            {[...meta.removedHeaders, ...meta.removedFooters].slice(0, 12).map((line, i) => (
              <li key={i} className="truncate">
                “{line}”
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
