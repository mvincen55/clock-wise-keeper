import { useState } from 'react';
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
import { GripVertical, Loader2, Plus, StickyNote, Trash2 } from 'lucide-react';
import {
  NOTE_COLORS,
  UserNote,
  useCreateNote,
  useDeleteNote,
  useReorderNotes,
  useUpdateNote,
  useUserNotes,
} from '@/hooks/useUserNotes';

const COLOR_CLASS: Record<string, string> = {
  amber: 'bg-warning/15 border-warning/40',
  purple: 'bg-primary/10 border-primary/40',
  green: 'bg-success/10 border-success/40',
  blue: 'bg-accent/10 border-accent/40',
  pink: 'bg-destructive/10 border-destructive/40',
};

function SortableNote({
  note,
  onChange,
  onDelete,
}: {
  note: UserNote;
  onChange: (content: string) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: note.id,
  });
  const [draft, setDraft] = useState(note.content);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-lg border p-2 ${COLOR_CLASS[note.color] ?? COLOR_CLASS.amber} ${
        isDragging ? 'opacity-70 shadow-lg z-10' : ''
      }`}
    >
      <div className="flex items-start gap-1">
        <button
          type="button"
          className="mt-1 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
          aria-label="Drag to reorder note"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <Textarea
          value={draft}
          rows={4}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => draft !== note.content && onChange(draft)}
          className="min-h-[80px] resize-none border-0 bg-transparent p-0 text-sm focus-visible:ring-0"
          placeholder="Write it down…"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground"
          aria-label="Delete note"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/** Private sticky-note board — drag the grip handle to rearrange. */
export default function UserNotesBoard() {
  const { data: notes, isLoading } = useUserNotes();
  const create = useCreateNote();
  const update = useUpdateNote();
  const remove = useDeleteNote();
  const reorder = useReorderNotes();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const list = notes ?? [];

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = list.findIndex(n => n.id === active.id);
    const newIndex = list.findIndex(n => n.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    reorder.mutate(arrayMove(list, oldIndex, newIndex).map(n => n.id));
  }

  return (
    <Card className="card-elevated">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-primary" />
          My Notes
        </CardTitle>
        <Button
          size="sm"
          variant="outline"
          disabled={create.isPending}
          onClick={() =>
            create.mutate({
              content: '',
              color: NOTE_COLORS[list.length % NOTE_COLORS.length],
              sortOrder: list.length,
            })
          }
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Note
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : list.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Private to you. Add a note to keep today's reminders in one place.
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={list.map(n => n.id)} strategy={rectSortingStrategy}>
              <div className="grid gap-3 sm:grid-cols-2">
                {list.map(note => (
                  <SortableNote
                    key={note.id}
                    note={note}
                    onChange={content => update.mutate({ id: note.id, content })}
                    onDelete={() => remove.mutate(note.id)}
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
