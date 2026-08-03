import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, Trash2 } from 'lucide-react';

export type DraftTask = {
  title: string;
  due_date: string | null;
  toChecklist: boolean;
  training_module_id?: string | null;
};

/**
 * The editable Pathfinder draft plan. Rows stack on mobile so task titles
 * never truncate; compact single-line rows only on desktop.
 */
export default function PathfinderPlanEditor({
  tasks,
  onChange,
  onAccept,
  onDiscard,
  saving,
}: {
  tasks: DraftTask[];
  onChange: (tasks: DraftTask[]) => void;
  onAccept: () => void;
  onDiscard: () => void;
  saving: boolean;
}) {
  const patch = (i: number, next: Partial<DraftTask>) =>
    onChange(tasks.map((t, idx) => (idx === i ? { ...t, ...next } : t)));

  return (
    <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/[0.03] p-3">
      <p className="text-sm text-muted-foreground">
        Edit anything that doesn't fit, then accept the plan.
      </p>

      {tasks.map((task, i) => (
        <div key={i} className="rounded-lg border bg-background p-3 space-y-2">
          <Input
            value={task.title}
            onChange={e => patch(i, { title: e.target.value })}
            className="w-full"
            aria-label={`Step ${i + 1} title`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              value={task.due_date ?? ''}
              onChange={e => patch(i, { due_date: e.target.value || null })}
              className="w-40"
              aria-label={`Step ${i + 1} due date`}
            />
            <div className="ml-auto flex items-center gap-2">
              <Switch
                id={`chk-${i}`}
                checked={task.toChecklist}
                onCheckedChange={v => patch(i, { toChecklist: v })}
              />
              <Label htmlFor={`chk-${i}`} className="text-xs text-muted-foreground">
                Add to checklist
              </Label>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove step"
                onClick={() => onChange(tasks.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onAccept} disabled={saving || tasks.length === 0}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Accept plan
        </Button>
        <Button size="sm" variant="ghost" onClick={onDiscard}>
          Discard
        </Button>
      </div>
    </div>
  );
}
