import { useEffect, useState } from 'react';
import { CheckCircle2, Clock3, Loader2, PenLine, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useAcknowledgeKnowledgeVersion,
  useMarkKnowledgeAcknowledgmentViewed,
} from '@/hooks/useKnowledgeAcknowledgments';
import type { KnowledgeAcknowledgmentRow } from '@/integrations/supabase/knowledge-acknowledgment-client';

type Props = {
  assignment: KnowledgeAcknowledgmentRow | null;
  versionTitle: string;
  versionNumber: number;
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function KnowledgeAcknowledgmentPanel({ assignment, versionTitle, versionNumber }: Props) {
  const markViewed = useMarkKnowledgeAcknowledgmentViewed();
  const acknowledge = useAcknowledgeKnowledgeVersion();
  const [typedName, setTypedName] = useState('');
  const [attested, setAttested] = useState(false);

  useEffect(() => {
    if (!assignment || assignment.first_viewed_at || assignment.acknowledged_at || assignment.waived_at) return;
    markViewed.mutate(assignment.id);
  }, [assignment, markViewed]);

  if (!assignment || assignment.waived_at) return null;

  if (assignment.acknowledged_at) {
    return (
      <Alert className="mt-8 border-emerald-200 bg-emerald-50">
        <CheckCircle2 className="h-4 w-4 text-emerald-700" />
        <AlertTitle>Acknowledged</AlertTitle>
        <AlertDescription>
          {assignment.signed_name} acknowledged version {versionNumber} on {formatDate(assignment.acknowledged_at)}.
        </AlertDescription>
      </Alert>
    );
  }

  const overdue = new Date(assignment.due_at).getTime() < Date.now();
  const canSubmit = attested && typedName.trim().length >= 2 && !acknowledge.isPending;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      await acknowledge.mutateAsync({ assignmentId: assignment.id, typedName });
      toast.success('Acknowledgment recorded for this exact version');
      setTypedName('');
      setAttested(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the acknowledgment');
    }
  };

  return (
    <section className={`mt-8 rounded-2xl border p-5 ${overdue ? 'border-destructive/35 bg-destructive/5' : 'border-primary/25 bg-primary/5'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <PenLine className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Acknowledge this published version</h3>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Due {formatDate(assignment.due_at)}{overdue ? ' · Overdue' : ''}
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs">
          <Clock3 className="h-3.5 w-3.5" /> Version {versionNumber}
        </div>
      </div>

      <div className="mt-4 rounded-lg border bg-background/80 p-3 text-sm leading-6">
        {assignment.statement_snapshot}
      </div>

      <div className="mt-4 flex items-start gap-2">
        <Checkbox
          id={`ack-attest-${assignment.id}`}
          checked={attested}
          onCheckedChange={value => setAttested(value === true)}
          className="mt-0.5"
        />
        <Label htmlFor={`ack-attest-${assignment.id}`} className="font-normal leading-5">
          I am signing only for myself and for “{versionTitle},” version {versionNumber}. I understand this records receipt and reading, not automatic agreement or discipline.
        </Label>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor={`ack-name-${assignment.id}`}>Type your full name</Label>
          <Input
            id={`ack-name-${assignment.id}`}
            value={typedName}
            onChange={event => setTypedName(event.target.value)}
            placeholder="Your full name"
            autoComplete="name"
          />
        </div>
        <Button onClick={handleSubmit} disabled={!canSubmit}>
          {acknowledge.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="mr-2 h-4 w-4" />
          )}
          Sign acknowledgment
        </Button>
      </div>
    </section>
  );
}
