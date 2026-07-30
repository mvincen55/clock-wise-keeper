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
import {
  useBuildModule,
  useDiscardDraft,
  usePublishModule,
  type LearningStyle,
  type ModuleAudit,
  type TrainingModule,
} from '@/hooks/useTraining';
import ModuleAuditPanel from '@/components/training/ModuleAuditPanel';
import { toast } from 'sonner';

const SUGGESTED = ['all', 'front desk', 'assistant', 'hygiene', 'manager'];

const STYLES: { value: LearningStyle; label: string; hint: string }[] = [
  { value: 'visual', label: 'Visual', hint: 'Diagrams, boards, storyboards' },
  { value: 'auditory', label: 'Auditory', hint: 'Scripts and spoken practice' },
  { value: 'reading', label: 'Reading / writing', hint: 'Rules, notes, templates' },
  { value: 'kinesthetic', label: 'Hands-on', hint: 'Walkthroughs and rehearsals' },
  { value: 'mixed', label: 'Mixed', hint: 'A bit of each' },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Pathfinder writes the module from the office's own standing rules, policy
 * documents, and setup — tailored to how the learner learns. An auditor pass
 * always runs before anything reaches the library.
 */
export default function BuildModuleDialog({ open, onOpenChange }: Props) {
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState<string[]>(['all']);
  const [style, setStyle] = useState<LearningStyle>('visual');
  const [flagged, setFlagged] = useState<{ module: TrainingModule; audit: ModuleAudit } | null>(
    null
  );
  const build = useBuildModule();
  const publish = usePublishModule();
  const discard = useDiscardDraft();

  function toggleTag(tag: string) {
    setAudience(a => (a.includes(tag) ? a.filter(t => t !== tag) : [...a, tag]));
  }

  function reset() {
    setTopic('');
    setFlagged(null);
  }

  async function submit() {
    if (!topic.trim()) return;
    try {
      const { module, audit } = await build.mutateAsync({
        topic: topic.trim(),
        audience: audience.length ? audience : ['all'],
        learningStyle: style,
      });
      if (audit && audit.verdict !== 'clear') {
        setFlagged({ module, audit });
        toast.warning('The auditor held this one back for review.');
        return;
      }
      toast.success(`"${module.title}" is in the library.`);
      reset();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The module builder could not finish.');
    }
  }

  const busy = build.isPending || publish.isPending || discard.isPending;

  return (
    <Dialog open={open} onOpenChange={o => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Build with AI
          </DialogTitle>
          <DialogDescription>
            Pathfinder writes it from this office's own rules, policies, and setup — then an auditor
            checks it before it publishes.
          </DialogDescription>
        </DialogHeader>

        {flagged ? (
          <div className="space-y-4">
            <p className="text-sm">
              <span className="font-medium">{flagged.module.title}</span> is saved as a draft. It
              will not appear in the library until you publish it.
            </p>
            <ModuleAuditPanel audit={flagged.audit} />
            <DialogFooter className="gap-2">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={async () => {
                  await discard.mutateAsync(flagged.module.id);
                  toast.success('Draft discarded.');
                  reset();
                }}
              >
                Discard it
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setFlagged(null);
                }}
              >
                Rewrite it
              </Button>
              <Button
                disabled={busy}
                onClick={() => setPreviewModule({ ...flagged.module, audit: flagged.audit })}
              >
                Review &amp; publish
              </Button>
            </DialogFooter>
          </div>
        ) : (

          <>
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
                <Label>How does this person learn best?</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {STYLES.map(s => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setStyle(s.value)}
                      className={`rounded-md border p-2 text-left text-xs transition-colors ${
                        style === s.value
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-muted'
                      }`}
                    >
                      <span className="block font-medium">{s.label}</span>
                      <span className="text-muted-foreground">{s.hint}</span>
                    </button>
                  ))}
                </div>
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
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={!topic.trim() || busy}>
                {build.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {build.isPending ? 'Writing and auditing…' : 'Build it'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
