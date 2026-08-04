import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  CircleHelp,
  Clock3,
  Loader2,
  PauseCircle,
  PenLine,
  ShieldCheck,
  TimerReset,
  UserRoundSearch,
} from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import KnowledgeAcknowledgmentTimeline from '@/components/knowledge/KnowledgeAcknowledgmentTimeline';
import { useOrgEmployees } from '@/hooks/useEmployees';
import {
  useAcknowledgeKnowledgeVersion,
  useAskKnowledgeAcknowledgmentQuestion,
  useBlockKnowledgeAcknowledgment,
  useKnowledgeAcknowledgmentEscalationSettings,
  useMarkKnowledgeAcknowledgmentViewed,
  useSnoozeKnowledgeAcknowledgment,
  useUnblockKnowledgeAcknowledgment,
} from '@/hooks/useKnowledgeAcknowledgments';
import type { KnowledgeAcknowledgmentRow } from '@/integrations/supabase/knowledge-acknowledgment-client';
import { canUseKnowledgeSnooze, knowledgeEscalationLabel } from '@/lib/knowledge-acknowledgments';

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

function formatMoment(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function KnowledgeAcknowledgmentPanel({ assignment, versionTitle, versionNumber }: Props) {
  const { mutate: recordViewed } = useMarkKnowledgeAcknowledgmentViewed();
  const acknowledge = useAcknowledgeKnowledgeVersion();
  const block = useBlockKnowledgeAcknowledgment();
  const unblock = useUnblockKnowledgeAcknowledgment();
  const snooze = useSnoozeKnowledgeAcknowledgment();
  const ask = useAskKnowledgeAcknowledgmentQuestion();
  const { data: escalationSettings } = useKnowledgeAcknowledgmentEscalationSettings();
  const { data: employees = [] } = useOrgEmployees();

  const [typedName, setTypedName] = useState('');
  const [attested, setAttested] = useState(false);
  const [includeQuestion, setIncludeQuestion] = useState(false);
  const [signatureQuestion, setSignatureQuestion] = useState('');

  const [blockOpen, setBlockOpen] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [blockingUserId, setBlockingUserId] = useState('none');
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [snoozeReason, setSnoozeReason] = useState('');
  const [snoozeWorkdays, setSnoozeWorkdays] = useState('1');
  const [questionOpen, setQuestionOpen] = useState(false);
  const [question, setQuestion] = useState('');

  const assignmentId = assignment?.id;
  const firstViewedAt = assignment?.first_viewed_at;
  const acknowledgedAt = assignment?.acknowledged_at;
  const waivedAt = assignment?.waived_at;

  useEffect(() => {
    if (!assignmentId || firstViewedAt || acknowledgedAt || waivedAt) return;
    recordViewed(assignmentId);
  }, [assignmentId, firstViewedAt, acknowledgedAt, waivedAt, recordViewed]);

  const blockerOptions = useMemo(
    () => employees
      .filter(employee => employee.user_id && employee.user_id !== assignment?.user_id)
      .map(employee => ({ userId: employee.user_id as string, name: employee.display_name })),
    [employees, assignment?.user_id],
  );

  if (!assignment || assignment.waived_at) return null;

  if (assignment.acknowledged_at) {
    return (
      <div className="mt-8">
        <Alert className="border-emerald-200 bg-emerald-50">
          <CheckCircle2 className="h-4 w-4 text-emerald-700" />
          <AlertTitle>Acknowledged</AlertTitle>
          <AlertDescription>
            {assignment.signed_name} acknowledged version {versionNumber} on {formatDate(assignment.acknowledged_at)}.
            {assignment.question_asked_at && !assignment.question_resolved_at
              ? ' The acknowledgment is complete, and the clarification question remains open.'
              : ''}
          </AlertDescription>
        </Alert>
        <KnowledgeAcknowledgmentTimeline assignmentId={assignment.id} />
      </div>
    );
  }

  const overdue = new Date(assignment.due_at).getTime() < Date.now();
  const questionIsOpen = !!assignment.question_asked_at && !assignment.question_resolved_at;
  const snoozeIsActive = !!assignment.snoozed_until && new Date(assignment.snoozed_until).getTime() > Date.now();
  const maxSnoozes = escalationSettings?.max_snoozes ?? 2;
  const maxSnoozeWorkdays = escalationSettings?.max_snooze_workdays ?? 3;
  const canSnooze = canUseKnowledgeSnooze(assignment, maxSnoozes);
  const canSubmit =
    attested &&
    typedName.trim().length >= 2 &&
    (!includeQuestion || signatureQuestion.trim().length >= 5) &&
    !acknowledge.isPending;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      await acknowledge.mutateAsync({
        assignmentId: assignment.id,
        typedName,
        question: includeQuestion ? signatureQuestion : undefined,
      });
      toast.success(
        includeQuestion
          ? 'Acknowledgment recorded and your question was sent'
          : 'Acknowledgment recorded for this exact version',
      );
      setTypedName('');
      setAttested(false);
      setIncludeQuestion(false);
      setSignatureQuestion('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the acknowledgment');
    }
  };

  const handleBlock = async () => {
    try {
      await block.mutateAsync({
        assignmentId: assignment.id,
        reason: blockReason,
        blockingUserId: blockingUserId === 'none' ? null : blockingUserId,
      });
      toast.success('Block documented and escalation paused');
      setBlockOpen(false);
      setBlockReason('');
      setBlockingUserId('none');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not document the block');
    }
  };

  const handleUnblock = async () => {
    try {
      await unblock.mutateAsync({ assignmentId: assignment.id });
      toast.success('Block cleared and working-day escalation resumed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not clear the block');
    }
  };

  const handleSnooze = async () => {
    try {
      await snooze.mutateAsync({
        assignmentId: assignment.id,
        reason: snoozeReason,
        workdays: Number(snoozeWorkdays),
      });
      toast.success('Reasoned snooze saved in working days');
      setSnoozeOpen(false);
      setSnoozeReason('');
      setSnoozeWorkdays('1');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the snooze');
    }
  };

  const handleQuestion = async () => {
    try {
      await ask.mutateAsync({ assignmentId: assignment.id, question });
      toast.success('Question sent and escalation paused for an answer');
      setQuestionOpen(false);
      setQuestion('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send the question');
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
            Working-day deadline {formatDate(assignment.due_at)}{overdue ? ' · Overdue' : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{knowledgeEscalationLabel(assignment.escalation_level)}</Badge>
          <div className="flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs">
            <Clock3 className="h-3.5 w-3.5" /> Version {versionNumber}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-lg border bg-background/80 p-3 text-sm leading-6">
        {assignment.statement_snapshot}
      </div>

      {assignment.blocked_at && (
        <Alert className="mt-4 border-amber-300 bg-amber-50">
          <PauseCircle className="h-4 w-4 text-amber-700" />
          <AlertTitle>Blocked, not ignored</AlertTitle>
          <AlertDescription>
            <p>{assignment.blocked_reason}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={handleUnblock}
              disabled={unblock.isPending}
            >
              {unblock.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Clear block
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {snoozeIsActive && assignment.snoozed_until && (
        <Alert className="mt-4 border-blue-200 bg-blue-50">
          <TimerReset className="h-4 w-4 text-blue-700" />
          <AlertTitle>Reasoned snooze until {formatMoment(assignment.snoozed_until)}</AlertTitle>
          <AlertDescription>{assignment.snooze_reason}</AlertDescription>
        </Alert>
      )}

      {questionIsOpen && (
        <Alert className="mt-4 border-violet-200 bg-violet-50">
          <CircleHelp className="h-4 w-4 text-violet-700" />
          <AlertTitle>Clarification requested</AlertTitle>
          <AlertDescription>
            <p>{assignment.question_text}</p>
            <p className="mt-2 text-xs">You may still acknowledge receipt and reading while the question is open.</p>
          </AlertDescription>
        </Alert>
      )}

      {assignment.question_resolved_at && assignment.question_resolution && (
        <Alert className="mt-4 border-emerald-200 bg-emerald-50">
          <CircleHelp className="h-4 w-4 text-emerald-700" />
          <AlertTitle>Clarification answered</AlertTitle>
          <AlertDescription>{assignment.question_resolution}</AlertDescription>
        </Alert>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {!assignment.blocked_at && (
          <Button type="button" variant="outline" size="sm" onClick={() => setBlockOpen(true)}>
            <PauseCircle className="mr-2 h-4 w-4" /> I’m blocked
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setSnoozeOpen(true)}
          disabled={!canSnooze}
          title={!canSnooze ? 'Snooze limit reached or another pause is already active' : undefined}
        >
          <TimerReset className="mr-2 h-4 w-4" />
          Snooze ({assignment.snooze_count}/{maxSnoozes})
        </Button>
        {!questionIsOpen && (
          <Button type="button" variant="outline" size="sm" onClick={() => setQuestionOpen(true)}>
            <CircleHelp className="mr-2 h-4 w-4" /> Ask a question
          </Button>
        )}
      </div>

      <div className="mt-5 flex items-start gap-2">
        <Checkbox
          id={`ack-attest-${assignment.id}`}
          checked={attested}
          onCheckedChange={value => setAttested(value === true)}
          className="mt-0.5"
        />
        <Label htmlFor={`ack-attest-${assignment.id}`} className="font-normal leading-5">
          I am signing only for myself and for “{versionTitle},” version {versionNumber}. I understand this records receipt and reading, not automatic agreement, comprehension, or discipline.
        </Label>
      </div>

      {!questionIsOpen && (
        <div className="mt-4 rounded-lg border bg-background/60 p-3">
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <Checkbox
              checked={includeQuestion}
              onCheckedChange={value => setIncludeQuestion(value === true)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">I can acknowledge this and still need clarification.</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Your signature remains valid while the office answers the question.
              </span>
            </span>
          </label>
          {includeQuestion && (
            <Textarea
              className="mt-3"
              rows={3}
              value={signatureQuestion}
              onChange={event => setSignatureQuestion(event.target.value)}
              placeholder="What needs clarification?"
            />
          )}
        </div>
      )}

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

      <KnowledgeAcknowledgmentTimeline assignmentId={assignment.id} />

      <Dialog open={blockOpen} onOpenChange={setBlockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Document what is blocking this</DialogTitle>
            <DialogDescription>
              This pauses routine escalation. The reason and any named blocker become visible in the factual receipt.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`block-reason-${assignment.id}`}>What are you waiting on?</Label>
              <Textarea
                id={`block-reason-${assignment.id}`}
                rows={4}
                value={blockReason}
                onChange={event => setBlockReason(event.target.value)}
                placeholder="Example: I need the owner to clarify which schedule applies before I can acknowledge this version."
              />
            </div>
            <div className="space-y-2">
              <Label>Who is the blocker? Optional</Label>
              <Select value={blockingUserId} onValueChange={setBlockingUserId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">A document, decision, or outside dependency</SelectItem>
                  {blockerOptions.map(option => (
                    <SelectItem key={option.userId} value={option.userId}>{option.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockOpen(false)}>Cancel</Button>
            <Button onClick={handleBlock} disabled={blockReason.trim().length < 5 || block.isPending}>
              {block.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Pause as blocked
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={snoozeOpen} onOpenChange={setSnoozeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Use a reasoned working-day snooze</DialogTitle>
            <DialogDescription>
              This is visible and limited. Days off, call-outs, closures, and unscheduled days do not consume the snooze.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Working days</Label>
              <Select value={snoozeWorkdays} onValueChange={setSnoozeWorkdays}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: maxSnoozeWorkdays }, (_, index) => index + 1).map(day => (
                    <SelectItem key={day} value={String(day)}>
                      {day} working day{day === 1 ? '' : 's'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`snooze-reason-${assignment.id}`}>Why do you need the time?</Label>
              <Textarea
                id={`snooze-reason-${assignment.id}`}
                rows={4}
                value={snoozeReason}
                onChange={event => setSnoozeReason(event.target.value)}
                placeholder="Example: I need to review the updated closeout steps with the manager tomorrow morning."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSnoozeOpen(false)}>Cancel</Button>
            <Button onClick={handleSnooze} disabled={snoozeReason.trim().length < 5 || snooze.isPending}>
              {snooze.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save visible snooze
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={questionOpen} onOpenChange={setQuestionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ask for clarification</DialogTitle>
            <DialogDescription>
              The question is visible to owners and managers. Routine escalation pauses until a different leader answers it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`question-${assignment.id}`}>What needs clarification?</Label>
            <Textarea
              id={`question-${assignment.id}`}
              rows={5}
              value={question}
              onChange={event => setQuestion(event.target.value)}
              placeholder="Ask a specific question about this exact published version."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuestionOpen(false)}>Cancel</Button>
            <Button onClick={handleQuestion} disabled={question.trim().length < 5 || ask.isPending}>
              {ask.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserRoundSearch className="mr-2 h-4 w-4" />}
              Send question
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
