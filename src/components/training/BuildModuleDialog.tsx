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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles } from 'lucide-react';
import { useBuildModule } from '@/hooks/useTraining';
import { toast } from 'sonner';

const SUGGESTED = ['all', 'front desk', 'assistant', 'hygiene', 'manager'];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Pathfinder writes the module from the office's own standing rules, policy
 * documents, and setup — so it teaches how THIS practice runs.
 */
export default function BuildModuleDialog({ open, onOpenChange }: Props) {
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState<string[]>(['all']);
  const build = useBuildModule();

  function toggleTag(tag: string) {
    setAudience(a => (a.includes(tag) ? a.filter(t => t !== tag) : [...a, tag]));
  }

  async function submit() {
    if (!topic.trim()) return;
    try {
      const created = await build.mutateAsync({
        topic: topic.trim(),
        audience: audience.length ? audience : ['all'],
      });
      toast.success(`"${created.title}" is in the library.`);
      setTopic('');
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The module builder could not finish.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => !build.isPending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Build with AI
          </DialogTitle>
          <DialogDescription>
            Pathfinder writes it from this office's own rules, policies, and setup.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="training-topic">What should it teach?</Label>
            <Textarea
              id="training-topic"
              rows={3}
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="e.g. Presenting treatment plans and payment options at checkout"
            />
          </div>

          <div className="space-y-2">
            <Label>Who is it for?</Label>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED.map(tag => (
                <button key={tag} type="button" onClick={() => toggleTag(tag)}>
                  <Badge variant={audience.includes(tag) ? 'default' : 'outline'}>{tag}</Badge>
                </button>
              ))}
            </div>
            <Input
              placeholder="Add another position, then press Enter"
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const value = e.currentTarget.value.trim().toLowerCase();
                  if (value && !audience.includes(value)) setAudience(a => [...a, value]);
                  e.currentTarget.value = '';
                }
              }}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={build.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!topic.trim() || build.isPending}>
            {build.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {build.isPending ? 'Writing the module…' : 'Build it'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
