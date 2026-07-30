import { useEffect, useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import { LEARNING_STYLES, LearningStyle, useBuildModule } from '@/hooks/useTraining';
import { useOrgEmployees, useSetLearningStyle } from '@/hooks/useEmployees';
import { toast } from 'sonner';

const SUGGESTED = ['all', 'front desk', 'assistant', 'hygiene', 'manager'];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Pathfinder writes the module from the office's own standing rules, policy
 * documents, and setup — tailored to how the person learns — then an auditor
 * reads it back before anyone is taught from it.
 */
export default function BuildModuleDialog({ open, onOpenChange }: Props) {
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState<string[]>(['all']);
  const [style, setStyle] = useState<LearningStyle>('mixed');
  const [employeeId, setEmployeeId] = useState<string>('none');
  const build = useBuildModule();
  const { data: employees } = useOrgEmployees();
  const setLearningStyle = useSetLearningStyle();

  const selected = (employees ?? []).find((e: any) => e.id === employeeId);

  // Picking a person adopts the style already recorded for them.
  useEffect(() => {
    if (selected?.learning_style) setStyle(selected.learning_style as LearningStyle);
  }, [employeeId]);

  function toggleTag(tag: string) {
    setAudience(a => (a.includes(tag) ? a.filter(t => t !== tag) : [...a, tag]));
  }

  async function submit() {
    if (!topic.trim()) return;
    try {
      const created = await build.mutateAsync({
        topic: topic.trim(),
        audience: audience.length ? audience : ['all'],
        learning_style: style,
      });
      // Remember the style for this person so future modules match them too.
      if (selected && selected.learning_style !== style) {
        setLearningStyle.mutate({ employeeId: selected.id, style });
      }
      const audit = (created as any)?.audit;
      if (audit?.verdict === 'blocked') {
        toast.warning(`"${created.title}" was held for review — the auditor flagged something.`);
      } else if (audit?.verdict === 'needs_review') {
        toast.success(`"${created.title}" is in the library, with auditor notes to look at.`);
      } else {
        toast.success(`"${created.title}" is in the library — auditor found no issues.`);
      }
      setTopic('');
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The module builder could not finish.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => !build.isPending && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
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

          <div className="space-y-1.5">
            <Label>Tailor it for someone (optional)</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger>
                <SelectValue placeholder="Anyone on the team" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Anyone on the team</SelectItem>
                {(employees ?? []).map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>How do they learn best?</Label>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {LEARNING_STYLES.map(s => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStyle(s.value)}
                  className={`rounded-lg border p-2 text-left text-sm transition-colors ${
                    style === s.value
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <span className="font-medium">{s.label}</span>
                  <span className="block text-xs text-muted-foreground">{s.hint}</span>
                </button>
              ))}
            </div>
            {selected && (
              <p className="text-xs text-muted-foreground">
                Saved to {selected.display_name}'s profile for next time.
              </p>
            )}
          </div>

          <p className="flex items-start gap-1.5 rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            An AI auditor reads the finished module against your office rules and flags anything
            that contradicts them, looks incorrect, or is inappropriate.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={build.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!topic.trim() || build.isPending}>
            {build.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {build.isPending ? 'Writing and auditing…' : 'Build it'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
