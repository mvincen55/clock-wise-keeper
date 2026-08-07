import { useEffect, useMemo, useState } from 'react';
import { useConsumedSearchParam, useScrollIntoView, DEEP_LINK_HIGHLIGHT } from '@/hooks/useDeepLink';
import {
  CheckCircle2,
  CircleHelp,
  Clock3,
  FileCheck2,
  Loader2,
  PauseCircle,
  ShieldCheck,
  TimerReset,
  UserCheck,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import KnowledgeAcknowledgmentPanel from '@/components/knowledge/KnowledgeAcknowledgmentPanel';
import KnowledgeAcknowledgmentTimeline from '@/components/knowledge/KnowledgeAcknowledgmentTimeline';
import KnowledgeBlocks from '@/components/knowledge/KnowledgeBlocks';
import {
  useKnowledgeAcknowledgmentDocument,
  useKnowledgeAcknowledgmentRoster,
  useMyKnowledgeAcknowledgments,
  useResolveKnowledgeAcknowledgmentQuestion,
} from '@/hooks/useKnowledgeAcknowledgments';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { KnowledgeAcknowledgmentRow } from '@/integrations/supabase/knowledge-acknowledgment-client';
import {
  knowledgeAcknowledgmentCounts,
  knowledgeAcknowledgmentState,
  knowledgeEscalationLabel,
} from '@/lib/knowledge-acknowledgments';

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

function StateBadge({ assignment }: { assignment: KnowledgeAcknowledgmentRow }) {
  const state = knowledgeAcknowledgmentState(assignment);
  if (state === 'complete') return <Badge className="bg-emerald-600">Acknowledged</Badge>;
  if (state === 'blocked') return <Badge className="bg-amber-700">Blocked</Badge>;
  if (state === 'question') return <Badge className="bg-violet-700">Question open</Badge>;
  if (state === 'snoozed') return <Badge className="bg-blue-700">Snoozed</Badge>;
  if (state === 'overdue') return <Badge variant="destructive">Overdue</Badge>;
  if (state === 'viewed') return <Badge className="bg-orange-600">Viewed, not signed</Badge>;
  if (state === 'waived') return <Badge variant="secondary">No longer required</Badge>;
  return <Badge variant="outline">Not opened</Badge>;
}

export default function KnowledgeAcknowledgments() {
  const { data: ctx } = useOrgContext();
  const { data: myAssignments = [], isLoading: myLoading } = useMyKnowledgeAcknowledgments();
  const { data: roster = [], isLoading: rosterLoading } = useKnowledgeAcknowledgmentRoster();
  const resolveQuestion = useResolveKnowledgeAcknowledgmentQuestion();
  const isAdmin = ctx?.role === 'owner' || ctx?.role === 'manager';

  const activeAssignments = useMemo(
    () => myAssignments.filter(assignment => !assignment.acknowledged_at && !assignment.waived_at),
    [myAssignments],
  );
  const completedAssignments = useMemo(
    () => myAssignments.filter(assignment => !!assignment.acknowledged_at),
    [myAssignments],
  );
  const [selectedId, setSelectedId] = useState('');
  const [expandedRosterId, setExpandedRosterId] = useState('');
  const [answerAssignment, setAnswerAssignment] = useState<KnowledgeAcknowledgmentRow | null>(null);
  const [answer, setAnswer] = useState('');

  // A notification names the exact assignment: the assignee lands with it
  // selected for reading and signing; a manager lands on the roster entry.
  const linkedAssignmentId = useConsumedSearchParam('assignment');
  const [linkApplied, setLinkApplied] = useState(false);
  const linkedRosterRef = useScrollIntoView<HTMLDivElement>(
    !!linkedAssignmentId && expandedRosterId === linkedAssignmentId
  );

  useEffect(() => {
    if (!linkedAssignmentId || linkApplied || myLoading) return;
    if (activeAssignments.some(assignment => assignment.id === linkedAssignmentId)) {
      setSelectedId(linkedAssignmentId);
      setLinkApplied(true);
      return;
    }
    if (isAdmin && rosterLoading) return;
    if (isAdmin && roster.some(assignment => assignment.id === linkedAssignmentId)) {
      setExpandedRosterId(linkedAssignmentId);
    }
    setLinkApplied(true);
  }, [linkedAssignmentId, linkApplied, myLoading, rosterLoading, isAdmin, activeAssignments, roster]);

  useEffect(() => {
    if (activeAssignments.length === 0) {
      setSelectedId('');
      return;
    }
    if (!activeAssignments.some(assignment => assignment.id === selectedId)) {
      setSelectedId(activeAssignments[0].id);
    }
  }, [activeAssignments, selectedId]);

  const selected = activeAssignments.find(assignment => assignment.id === selectedId) ?? null;
  const { data: document, isLoading: documentLoading, error: documentError } =
    useKnowledgeAcknowledgmentDocument(selected?.version_id);

  const personalCounts = useMemo(
    () => knowledgeAcknowledgmentCounts(myAssignments),
    [myAssignments],
  );
  const rosterCounts = useMemo(
    () => knowledgeAcknowledgmentCounts(roster),
    [roster],
  );

  const handleAnswer = async () => {
    if (!answerAssignment) return;
    try {
      await resolveQuestion.mutateAsync({ assignmentId: answerAssignment.id, resolution: answer });
      toast.success('Clarification answered and working-day escalation resumed');
      setAnswerAssignment(null);
      setAnswer('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the answer');
    }
  };

  if (myLoading || (isAdmin && rosterLoading)) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <header>
        <div className="flex items-center gap-2">
          <FileCheck2 className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold md:text-3xl">Office Acknowledgments</h1>
        </div>
        <p className="mt-1 max-w-3xl text-muted-foreground">
          Read and acknowledge the exact published office versions assigned to you. Nobody else can sign for you.
        </p>
      </header>

      <Alert className="border-primary/25 bg-primary/5">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <AlertTitle>Receipt and reading, not forced agreement</AlertTitle>
        <AlertDescription>
          An acknowledgment records which version you received and read. It is not an automatic disciplinary finding and does not prove agreement or comprehension. Routine deadlines follow your actual working days.
        </AlertDescription>
      </Alert>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-amber-700">{activeAssignments.length}</p>
            <p className="text-xs text-muted-foreground">Need your acknowledgment</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-destructive">{personalCounts.overdue}</p>
            <p className="text-xs text-muted-foreground">Your overdue work</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-blue-700">
              {personalCounts.blocked + personalCounts.question + personalCounts.snoozed}
            </p>
            <p className="text-xs text-muted-foreground">Paused with a visible reason</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-emerald-700">{completedAssignments.length}</p>
            <p className="text-xs text-muted-foreground">You acknowledged</p>
          </CardContent>
        </Card>
      </section>

      {activeAssignments.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center">
            <CheckCircle2 className="mx-auto h-11 w-11 text-emerald-600" />
            <h2 className="mt-3 text-lg font-semibold">You are caught up</h2>
            <p className="mt-1 text-sm text-muted-foreground">No published office version is waiting for your acknowledgment.</p>
          </CardContent>
        </Card>
      ) : (
        <section className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="space-y-2 lg:sticky lg:top-20">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Assigned to you</h2>
            {activeAssignments.map(assignment => (
              <button
                key={assignment.id}
                type="button"
                onClick={() => setSelectedId(assignment.id)}
                className={`w-full rounded-xl border p-3 text-left transition-colors ${
                  assignment.id === selectedId ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium leading-5">{assignment.title_snapshot}</p>
                  <StateBadge assignment={assignment} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Version {assignment.version_number_snapshot} · Working-day deadline {formatDate(assignment.due_at)}
                </p>
                {assignment.escalation_level > 0 && (
                  <p className="mt-1 text-xs font-medium text-primary">
                    {knowledgeEscalationLabel(assignment.escalation_level)}
                  </p>
                )}
              </button>
            ))}
          </div>

          <div>
            {documentLoading ? (
              <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : documentError || !document || !selected ? (
              <Alert variant="destructive">
                <AlertTitle>This published version could not be opened</AlertTitle>
                <AlertDescription>
                  Do not sign it from memory. Ask a manager to confirm that the current published version is still available.
                </AlertDescription>
              </Alert>
            ) : (
              <article className="rounded-2xl border bg-card shadow-sm">
                <div className="border-b px-5 py-5 md:px-8 md:py-7">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{document.item.kind === 'policy' ? 'Office Handbook' : 'Practice Playbook'}</span>
                    <span aria-hidden="true">•</span>
                    <span>Version {document.version.version_number}</span>
                    <span aria-hidden="true">•</span>
                    <span>Working-day deadline {formatDate(selected.due_at)}</span>
                  </div>
                  <h2 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">{document.version.title}</h2>
                  {document.version.summary && (
                    <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground">{document.version.summary}</p>
                  )}
                </div>
                <div className="px-5 py-6 md:px-8 md:py-8">
                  <KnowledgeBlocks blocks={document.blocks} />
                  <KnowledgeAcknowledgmentPanel
                    assignment={selected}
                    versionTitle={document.version.title}
                    versionNumber={document.version.version_number}
                  />
                </div>
              </article>
            )}
          </div>
        </section>
      )}

      {completedAssignments.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Your acknowledgment history</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {completedAssignments.map(assignment => (
              <Card key={assignment.id}>
                <CardContent className="flex items-start justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium">{assignment.title_snapshot}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Version {assignment.version_number_snapshot} · Signed {formatDate(assignment.acknowledged_at as string)}
                    </p>
                    {assignment.question_asked_at && !assignment.question_resolved_at && (
                      <p className="mt-1 text-xs font-medium text-violet-700">Clarification question remains open</p>
                    )}
                  </div>
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {isAdmin && (
        <section className="space-y-3">
          <div>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Office completion status</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Factual status and escalation receipts only. Each person signs for themselves.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Card><CardContent className="p-4"><p className="text-2xl font-bold text-destructive">{rosterCounts.overdue}</p><p className="text-xs text-muted-foreground">Overdue</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-2xl font-bold text-amber-700">{rosterCounts.blocked}</p><p className="text-xs text-muted-foreground">Blocked</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-2xl font-bold text-violet-700">{rosterCounts.question}</p><p className="text-xs text-muted-foreground">Questions</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-2xl font-bold text-blue-700">{rosterCounts.snoozed}</p><p className="text-xs text-muted-foreground">Snoozed</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-2xl font-bold text-orange-700">{rosterCounts.pending + rosterCounts.viewed}</p><p className="text-xs text-muted-foreground">Pending</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-2xl font-bold text-emerald-700">{rosterCounts.complete}</p><p className="text-xs text-muted-foreground">Acknowledged</p></CardContent></Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><UserCheck className="h-4 w-4" /> Assignment roster</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {roster.length === 0 ? (
                <p className="py-5 text-center text-sm text-muted-foreground">No acknowledgment assignments exist yet.</p>
              ) : (
                roster.map(assignment => {
                  const openQuestion = !!assignment.question_asked_at && !assignment.question_resolved_at;
                  const linked = assignment.id === linkedAssignmentId;
                  return (
                    <div
                      key={assignment.id}
                      ref={linked ? linkedRosterRef : undefined}
                      className={`rounded-lg border px-3 py-3 text-sm ${linked ? DEEP_LINK_HIGHLIGHT : ''}`}
                    >
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.35fr)_auto] sm:items-center">
                        <div>
                          <p className="font-medium">{assignment.displayName}</p>
                          <p className="text-xs capitalize text-muted-foreground">{assignment.role_at_assignment}</p>
                        </div>
                        <div>
                          <p>{assignment.title_snapshot}</p>
                          <p className="text-xs text-muted-foreground">
                            Version {assignment.version_number_snapshot} · Due {formatDate(assignment.due_at)}
                          </p>
                          <p className="mt-0.5 text-xs font-medium text-primary">
                            {knowledgeEscalationLabel(assignment.escalation_level)}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <StateBadge assignment={assignment} />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setExpandedRosterId(current => current === assignment.id ? '' : assignment.id)}
                          >
                            <Clock3 className="mr-1.5 h-3.5 w-3.5" />
                            {expandedRosterId === assignment.id ? 'Hide receipt' : 'View receipt'}
                          </Button>
                          {openQuestion && assignment.user_id !== ctx?.user_id && (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => {
                                setAnswerAssignment(assignment);
                                setAnswer('');
                              }}
                            >
                              <CircleHelp className="mr-1.5 h-3.5 w-3.5" /> Answer
                            </Button>
                          )}
                        </div>
                      </div>

                      {assignment.blocked_at && (
                        <div className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                          <p className="flex items-center gap-1.5 font-semibold"><PauseCircle className="h-3.5 w-3.5" /> Blocked</p>
                          <p className="mt-1">{assignment.blocked_reason}</p>
                        </div>
                      )}
                      {assignment.snoozed_until && new Date(assignment.snoozed_until) > new Date() && (
                        <div className="mt-3 rounded-lg bg-blue-50 p-3 text-xs text-blue-900">
                          <p className="flex items-center gap-1.5 font-semibold"><TimerReset className="h-3.5 w-3.5" /> Snoozed until {formatMoment(assignment.snoozed_until)}</p>
                          <p className="mt-1">{assignment.snooze_reason}</p>
                        </div>
                      )}
                      {openQuestion && (
                        <div className="mt-3 rounded-lg bg-violet-50 p-3 text-xs text-violet-900">
                          <p className="flex items-center gap-1.5 font-semibold"><CircleHelp className="h-3.5 w-3.5" /> Clarification requested</p>
                          <p className="mt-1">{assignment.question_text}</p>
                        </div>
                      )}
                      {expandedRosterId === assignment.id && (
                        <KnowledgeAcknowledgmentTimeline assignmentId={assignment.id} />
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </section>
      )}

      <Dialog
        open={!!answerAssignment}
        onOpenChange={open => {
          if (!open) {
            setAnswerAssignment(null);
            setAnswer('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Answer the clarification question</DialogTitle>
            <DialogDescription>
              A different owner or manager must answer. The answer becomes part of the factual receipt and routine escalation resumes.
            </DialogDescription>
          </DialogHeader>
          {answerAssignment && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="font-medium">Question about “{answerAssignment.title_snapshot}”</p>
                <p className="mt-2 text-muted-foreground">{answerAssignment.question_text}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ack-question-answer">Document the answer</Label>
                <Textarea
                  id="ack-question-answer"
                  rows={6}
                  value={answer}
                  onChange={event => setAnswer(event.target.value)}
                  placeholder="Give a clear answer that the assigned person can rely on."
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnswerAssignment(null)}>Cancel</Button>
            <Button onClick={handleAnswer} disabled={answer.trim().length < 3 || resolveQuestion.isPending}>
              {resolveQuestion.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save answer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
