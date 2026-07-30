import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import {
  NOTE_COLORS,
  NOTE_COLOR_CLASS,
  useAddNote,
  useDeleteNote,
  useUpdateNote,
  useUserNotes,
  type UserNote,
} from '@/hooks/useUserNotes';
import { cn } from '@/lib/utils';

/** One sticky. Click to edit, blur to save. Nothing to submit. */
function Sticky({ note, index, count }: { note: UserNote; index: number; count: number }) {
  const update = useUpdateNote();
  const remove = useDeleteNote();
  const [value, setValue] = useState(note.content);
  const [editing, setEditing] = useState(false);

  const commit = () => {
    setEditing(false);
    if (value !== note.content) update.mutate({ id: note.id, content: value });
  };

  const cycleColor = () => {
    const next = NOTE_COLORS[(NOTE_COLORS.indexOf(note.color as any) + 1) % NOTE_COLORS.length];
    update.mutate({ id: note.id, color: next });
  };

  const move = (dir: -1 | 1) => {
    update.mutate({ id: note.id, sort_order: note.sort_order + dir * 1.5 });
  };

  return (
    <div
      className={cn(
        'rounded-lg border p-3 min-h-28 flex flex-col gap-2 transition-colors',
        NOTE_COLOR_CLASS[note.color] ?? NOTE_COLOR_CLASS.plum
      )}
    >
      {editing ? (
        <Textarea
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          onBlur={commit}
          placeholder="Jot something down…"
          className="flex-1 resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex-1 text-left text-sm whitespace-pre-wrap break-words"
        >
          {note.content || <span className="text-muted-foreground">Jot something down…</span>}
        </button>
      )}

      <div className="flex items-center justify-between opacity-70">
        <button
          type="button"
          onClick={cycleColor}
          aria-label="Change note colour"
          className="h-4 w-4 rounded-full border border-foreground/20 bg-foreground/10"
        />
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-6 w-6" disabled={index === 0} onClick={() => move(-1)} aria-label="Move up">
            <ChevronUp className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" disabled={index === count - 1} onClick={() => move(1)} aria-label="Move down">
            <ChevronDown className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => remove.mutate(note.id)} aria-label="Delete note">
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/** My notes — private to me, always here when I come back. */
export default function UserNotesBoard() {
  const { data: notes } = useUserNotes();
  const add = useAddNote();
  const list = notes ?? [];

  const addNote = () =>
    add.mutate({ sortOrder: (list[list.length - 1]?.sort_order ?? 0) + 1 });

  return (
    <Card className="card-elevated">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">My notes</p>
            <p className="text-xs text-muted-foreground">Private to you — nobody else can see these.</p>
          </div>
          <Button variant="outline" size="sm" onClick={addNote} disabled={add.isPending}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Note
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((n, i) => (
            <Sticky key={n.id} note={n} index={i} count={list.length} />
          ))}
          {list.length === 0 && (
            <button
              type="button"
              onClick={addNote}
              className="rounded-lg border border-dashed p-3 min-h-28 flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            >
              <Plus className="h-5 w-5" />
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
