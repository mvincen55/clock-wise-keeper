import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Lock, Megaphone } from 'lucide-react';
import {
  useCreateAnnouncement,
  useCreateGroup,
  useMessageableTeam,
  useStartDm,
  type Audience,
} from '@/hooks/useMessaging';

export function NewConversationDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const { data: team } = useMessageableTeam();
  const startDm = useStartDm();
  const createGroup = useCreateGroup();
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState('');

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const reset = () => {
    setSelected([]);
    setTitle('');
  };

  const submit = async () => {
    if (!selected.length) return;
    const id =
      selected.length === 1
        ? await startDm.mutateAsync(selected[0])
        : await createGroup.mutateAsync({ title, userIds: selected });
    reset();
    onOpenChange(false);
    onCreated(id);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New message</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            <Lock className="h-3 w-3" /> Messages stay between the people in them.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
          {(team || []).map((m) => (
            <label
              key={m.user_id}
              className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted"
            >
              <Checkbox
                checked={selected.includes(m.user_id!)}
                onCheckedChange={() => toggle(m.user_id!)}
              />
              <span className="text-sm">{m.display_name}</span>
            </label>
          ))}
          {!team?.length && (
            <p className="px-2 py-3 text-sm text-muted-foreground">No teammates to message yet.</p>
          )}
        </div>

        {selected.length > 1 && (
          <div className="space-y-1.5">
            <Label htmlFor="group-title">Group name (optional)</Label>
            <Input
              id="group-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Front desk crew"
            />
          </div>
        )}

        <DialogFooter>
          <Button
            onClick={submit}
            disabled={!selected.length || startDm.isPending || createGroup.isPending}
          >
            {selected.length > 1 ? 'Create group' : 'Start chat'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NewAnnouncementDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const create = useCreateAnnouncement();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [audience, setAudience] = useState<Audience>('all');

  const submit = async () => {
    if (!title.trim() || !content.trim()) return;
    const id = await create.mutateAsync({ title, audience, content });
    setTitle('');
    setContent('');
    setAudience('all');
    onOpenChange(false);
    onCreated(id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-primary" /> New announcement
          </DialogTitle>
          <DialogDescription>
            Everyone in the audience sees it. Replies are off — it's a notice, not a thread.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="a-title">Title</Label>
            <Input
              id="a-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Office closed Friday"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Audience</Label>
            <RadioGroup value={audience} onValueChange={(v) => setAudience(v as Audience)}>
              {(
                [
                  ['all', 'Entire team'],
                  ['clinical', 'Clinical only'],
                  ['clerical', 'Clerical only'],
                ] as const
              ).map(([value, label]) => (
                <div key={value} className="flex items-center gap-2">
                  <RadioGroupItem value={value} id={`aud-${value}`} />
                  <Label htmlFor={`aud-${value}`} className="font-normal">
                    {label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            <p className="text-[11px] text-muted-foreground">
              People with no team set only receive "Entire team" announcements.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a-body">Message</Label>
            <Textarea
              id="a-body"
              rows={5}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What does everyone need to know?"
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={submit} disabled={!title.trim() || !content.trim() || create.isPending}>
            Post announcement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
