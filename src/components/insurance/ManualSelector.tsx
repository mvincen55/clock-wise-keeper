/**
 * Compact manual switcher — title, carrier, manual type, effective year,
 * and status, as a quiet list. The active manual is marked with the
 * office purple accent (border + tint), never a giant filled block.
 * Archived versions collapse behind a toggle so the everyday list stays
 * short.
 */
import { useState } from 'react';
import { Archive, BookOpenCheck, ChevronDown, ChevronRight, FileText } from 'lucide-react';
import type { OfficeDoc } from '@/hooks/useOfficeDocs';
import { effectiveYear, manualTypeLabel } from '@/lib/insurance-desk';

function ManualRow({
  doc,
  active,
  onSelect,
}: {
  doc: OfficeDoc;
  active: boolean;
  onSelect: (doc: OfficeDoc) => void;
}) {
  const year = effectiveYear(doc);
  const archived = doc.doc_status === 'archived';
  return (
    <button
      type="button"
      onClick={() => onSelect(doc)}
      aria-current={active ? 'true' : undefined}
      className={`flex w-full items-start gap-2.5 rounded-lg border-l-2 px-2.5 py-2 text-left transition-colors ${
        active
          ? 'border-primary bg-primary/10'
          : 'border-transparent hover:bg-muted'
      }`}
    >
      <FileText
        className={`mt-0.5 h-4 w-4 shrink-0 ${active ? 'text-primary' : 'text-muted-foreground/70'}`}
      />
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-[13px] leading-snug ${
            active ? 'font-semibold text-foreground' : 'font-medium text-foreground/85'
          }`}
        >
          {doc.title}
        </span>
        {doc.carrier && (
          <span className="block truncate text-[11px] text-muted-foreground">{doc.carrier}</span>
        )}
        <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
          <span>{manualTypeLabel(doc)}</span>
          {year && (
            <>
              <span aria-hidden>·</span>
              <span>{year}</span>
            </>
          )}
          <span
            className={`ml-auto inline-flex items-center gap-0.5 rounded-full px-1.5 py-px font-medium ${
              archived
                ? 'bg-muted text-muted-foreground'
                : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
            }`}
          >
            {archived ? <Archive className="h-2.5 w-2.5" /> : <BookOpenCheck className="h-2.5 w-2.5" />}
            {archived ? 'Archived' : 'Current'}
          </span>
        </span>
      </span>
    </button>
  );
}

export default function ManualSelector({
  manuals,
  activeId,
  onSelect,
  label = 'Manuals',
}: {
  manuals: OfficeDoc[];
  activeId: string;
  onSelect: (doc: OfficeDoc) => void;
  label?: string;
}) {
  const [showArchived, setShowArchived] = useState(false);
  const current = manuals.filter(m => m.doc_status !== 'archived');
  const archived = manuals.filter(m => m.doc_status === 'archived');
  // An archived manual being read keeps the archive open.
  const archivedActive = archived.some(m => m.id === activeId);

  if (manuals.length <= 1 && archived.length === 0) return null;

  return (
    <div className="shrink-0 space-y-1">
      <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {current.map(doc => (
        <ManualRow key={doc.id} doc={doc} active={doc.id === activeId} onSelect={onSelect} />
      ))}
      {archived.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowArchived(v => !v)}
            className="flex w-full items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            {showArchived || archivedActive ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            Archived versions ({archived.length})
          </button>
          {(showArchived || archivedActive) &&
            archived.map(doc => (
              <ManualRow key={doc.id} doc={doc} active={doc.id === activeId} onSelect={onSelect} />
            ))}
        </>
      )}
    </div>
  );
}
