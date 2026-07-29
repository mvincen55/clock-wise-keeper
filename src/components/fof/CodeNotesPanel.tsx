import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, Search } from 'lucide-react';
import { useCodeNotes, type CodeNote } from '@/hooks/useAssistantMemory';

/**
 * Everything the office has written about its procedure codes, visible
 * while training the assistant. Two homes, shown distinctly because the
 * difference decides when a note applies:
 *
 *   Universal (office schedule) — every patient, whatever their insurance
 *   Insurance-specific (carrier) — only when billing that code to that plan
 *
 * Read-only: notes are edited on the Fee Schedules page, or by asking the
 * assistant to file one.
 */
export default function CodeNotesPanel() {
  const { data: notes, isLoading } = useCodeNotes();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes ?? [];
    return (notes ?? []).filter(
      n =>
        n.code.toLowerCase().includes(q) ||
        n.description.toLowerCase().includes(q) ||
        n.notes.toLowerCase().includes(q) ||
        n.scheduleName.toLowerCase().includes(q)
    );
  }, [notes, query]);

  const universal = filtered.filter(n => n.isUniversal);
  const perCarrier = filtered.filter(n => !n.isUniversal);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-8 pl-7 text-xs"
          placeholder="Search codes and notes…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          {(notes ?? []).length === 0
            ? 'Nothing written about any code yet. Tell me something about a code and I\'ll file it on the fee schedule.'
            : 'No notes match that search.'}
        </p>
      ) : (
        <>
          <NoteGroup
            title="Applies to every patient"
            hint="On the office fee schedule — used no matter which insurance the patient has."
            notes={universal}
          />
          <NoteGroup
            title="Insurance-specific"
            hint="Used only when billing that code to that plan."
            notes={perCarrier}
          />
        </>
      )}
    </div>
  );
}

function NoteGroup({
  title,
  hint,
  notes,
}: {
  title: string;
  hint: string;
  notes: CodeNote[];
}) {
  if (notes.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title} · {notes.length}
        </div>
        <div className="text-[11px] text-muted-foreground/80">{hint}</div>
      </div>
      {notes.map(note => (
        <div key={note.itemId} className="rounded-md border bg-card px-2 py-1.5">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs font-semibold">{note.code}</span>
            {note.description && (
              <span className="truncate text-[11px] text-muted-foreground">{note.description}</span>
            )}
            <Badge
              variant={note.isUniversal ? 'default' : 'secondary'}
              className="ml-auto shrink-0 text-[10px] font-normal"
            >
              {note.isUniversal ? 'All patients' : note.scheduleName}
            </Badge>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-xs text-foreground/80">{note.notes}</p>
        </div>
      ))}
    </div>
  );
}
