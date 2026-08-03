import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CloudOff, GripVertical, Plus, StickyNote, Trash2 } from 'lucide-react';
import {
  useCreateNote,
  useDeleteNote,
  useOfflineReorderSync,
  useReorderNotes,
  useUpdateNote,
  useUserNotes,
  type UserNote,
} from '@/hooks/useUserNotes';

const COLORS: Record<string, string> = {
  amber: 'bg-amber-100 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800',
  purple: 'bg-primary/10 border-primary/30',
  green: 'bg-emerald-100 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800',
  blue: 'bg-sky-100 dark:bg-sky-950/40 border-sky-300 dark:border-sky-800',
};
const COLOR_KEYS = Object.keys(COLORS);

function SortableNote({
  note,
  onSave,
  onDelete,
  onCycleColor,
}: {
  note: UserNote;
  onSave: (content: string) => void;
  onDelete: () => void;
  onCycleColor: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: note.id,
  });
  const [draft, setDraft] = useState(note.content);

  useEffect(() => {
    setDraft(note.content);
  }, [note.content]);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-md border p-2 ${COLORS[note.color] ?? COLORS.amber} ${
        isDragging ? 'z-10 opacity-80 shadow-lg' : ''
      }`}
    >
      <div className="mb-1 flex items-center justify-between">
        <button
          type="button"
          className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label="Reorder note"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onCycleColor}
            aria-label="Change note colour"
            className="h-4 w-4 rounded-full border border-foreground/20 bg-background/60"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            aria-label="Delete note"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <Textarea
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => draft !== note.content && onSave(draft)}
        placeholder="Write it down…"
        rows={4}
        className="resize-none border-0 bg-transparent p-1 text-sm shadow-none focus-visible:ring-0"
      />
    </div>
  );
}

/**
 * Private notes board. Drag to rearrange — the order is written back to the
 * note rows, so it looks the same tomorrow and on any other device.
 */
export default function UserNotesBoard() {
  const { data: notes, isLoading } = useUserNotes();
  const create = useCreateNote();
  const update = useUpdateNote();
  const remove = useDeleteNote();
  const reorder = useReorderNotes();
  const { pending: pendingOrder, refresh: refreshPendingOrder } = useOfflineReorderSync();

  const items = useMemo(() => (notes ?? []).map(n => n.id), [notes]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.indexOf(String(active.id));
    const newIndex = items.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    reorder.mutate(arrayMove(items, oldIndex, newIndex), { onSettled: () => refreshPendingOrder() });
  }

  return (
    <Card className="card-elevated">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-lg">
          <StickyNote className="h-4 w-4 text-primary" />
          My Notes
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          disabled={create.isPending}
          onClick={() => create.mutate({ sort_order: notes?.length ?? 0 })}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add note
        </Button>
      </CardHeader>
      <CardContent>
        {pendingOrder && (
          <p className="mb-3 flex items-center gap-2 rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <CloudOff className="h-3.5 w-3.5 shrink-0" />
            Your new order is saved on this device and will sync when you're back online.
          </p>
        )}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading your notes…</p>
        ) : !notes?.length ? (
          <p className="text-sm text-muted-foreground">
            Nothing here yet. Add a note — only you can see these.
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items} strategy={rectSortingStrategy}>
              <div className="grid gap-3 sm:grid-cols-2">
                {notes.map(note => (
                  <SortableNote
                    key={note.id}
                    note={note}
                    onSave={content => update.mutate({ id: note.id, content })}
                    onDelete={() => remove.mutate(note.id)}
                    onCycleColor={() => {
                      const next =
                        COLOR_KEYS[(COLOR_KEYS.indexOf(note.color) + 1) % COLOR_KEYS.length];
                      update.mutate({ id: note.id, color: next });
                    }}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </CardContent>
    </Card>
  );
}
