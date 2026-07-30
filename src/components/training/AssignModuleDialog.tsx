import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAssignModule, type TrainingModule } from '@/hooks/useTraining';
import { toast } from 'sonner';

export type Assignee = { user_id: string; display_name: string };

type Props = {
  module: TrainingModule | null;
  team: Assignee[];
  onClose: () => void;
};

/** Owners and managers assign to anyone in the practice, themselves included. */
export default function AssignModuleDialog({ module, team, onClose }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState('');
  const assign = useAssignModule();

  function toggle(userId: string) {
    setSelected(s => (s.includes(userId) ? s.filter(id => id !== userId) : [...s, userId]));
  }

  async function submit() {
    if (!module || selected.length === 0) return;
    try {
      await assign.mutateAsync({
        module: { id: module.id, title: module.title },
        userIds: selected,
        dueDate: dueDate || null,
      });
      toast.success(`Assigned to ${selected.length} ${selected.length === 1 ? 'person' : 'people'}.`);
      setSelected([]);
      setDueDate('');
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not assign this module.');
    }
  }

  return (
    <Dialog open={!!module} onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign training</DialogTitle>
          <DialogDescription>{module?.title}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Who should take it?</Label>
            <ScrollArea className="h-56 rounded-md border p-2">
              {team.length === 0 && (
                <p className="p-2 text-sm text-muted-foreground">No active team members yet.</p>
              )}
              {team.map(member => (
                <label
                  key={member.user_id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-md p-2 hover:bg-muted"
                >
                  <Checkbox
                    checked={selected.includes(member.user_id)}
                    onCheckedChange={() => toggle(member.user_id)}
                  />
                  <span className="text-sm">{member.display_name}</span>
                </label>
              ))}
            </ScrollArea>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="training-due">Due date (optional)</Label>
            <Input
              id="training-due"
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={selected.length === 0 || assign.isPending}>
            {assign.isPending ? 'Assigning…' : 'Assign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
