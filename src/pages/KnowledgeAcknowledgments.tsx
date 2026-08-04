import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock3,
  FileCheck2,
  Loader2,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import KnowledgeAcknowledgmentPanel from '@/components/knowledge/KnowledgeAcknowledgmentPanel';
import KnowledgeBlocks from '@/components/knowledge/KnowledgeBlocks';
import {
  useKnowledgeAcknowledgmentDocument,
  useKnowledgeAcknowledgmentRoster,
  useMyKnowledgeAcknowledgments,
} from '@/hooks/useKnowledgeAcknowledgments';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { KnowledgeAcknowledgmentRow } from '@/integrations/supabase/knowledge-acknowledgment-client';

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function assignmentState(assignment: KnowledgeAcknowledgmentRow): 'waived' | 'complete' | 'overdue' | 'viewed' | 'pending' {
  if (assignment.waived_at) return 'waived';
  if (assignment.acknowledged_at) return 'complete';
  if (new Date(assignment.due_at).getTime() < Date.now()) return 'overdue';
  if (assignment.first_viewed_at) return 'viewed';
  return 'pending';
}

function StateBadge({ assignment }: { assignment: KnowledgeAcknowledgmentRow }) {
  const state = assignmentState(assignment);
  if (state === 'complete') return <Badge className="bg-emerald-600">Acknowledged</Badge>;
  if (state === 'overdue') return <Badge variant="destructive">Overdue</Badge>;
  if (state === 'viewed') return <Badge className="bg-amber-600">Viewed, not signed</Badge>;
  if (state === 'waived') return <Badge variant="secondary">No longer required</Badge>;
  return <Badge variant="outline">Not opened</Badge>;
}

export default function KnowledgeAcknowledgments() {
  const { data: ctx } = useOrgContext();
  const { data: myAssignments = [], isLoading: myLoading } = useMyKnowledgeAcknowledgments();
  const { data: roster = [], isLoading: rosterLoading } = useKnowledgeAcknowledgmentRoster();
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

  const rosterCounts = useMemo(() => {
    const counts = { pending: 0, viewed: 0, overdue: 0, complete: 0, waived: 0 };
    for (const assignment of roster) counts[assignmentState(assignment)] += 1;
    return counts;
  }, [roster]);

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
          An acknowledgment records which version you received and read. It is not an automatic disciplinary finding and does not prove agreement or comprehension.
        </AlertDescription>
      </Alert>

      <section className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-amber-700">{activeAssignments.length}</p>
            <p className="text-xs text-muted-foreground">Need your acknowledgment</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-emerald-700">{completedAssignments.length}</p>
            <p className="text-xs text-muted-foreground">You acknowledged</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">
              {activeAssignments.filter(assignment => assignmentState(assignment) === 'overdue').length}
            </p>
            <p className="text-xs text-muted-foreground">Overdue</p>
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
                  Version {assignment.version_number_snapshot} · Due {formatDate(assignment.due_at)}
                </p>
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
                    <span>Due {formatDate(selected.due_at)}</span>
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
            <p className="text-sm text-muted-foreground">Status only. Each person signs for themselves.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Card><CardContent className="p-4"><p className="text-2xl font-bold text-destructive">{rosterCounts.overdue}</p><p className="text-xs text-muted-foreground">Overdue</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-2xl font-bold text-amber-700">{rosterCounts.pending + rosterCounts.viewed}</p><p className="text-xs text-muted-foreground">Still pending</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-2xl font-bold text-emerald-700">{rosterCounts.complete}</p><p className="text-xs text-muted-foreground">Acknowledged</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-2xl font-bold text-muted-foreground">{rosterCounts.waived}</p><p className="text-xs text-muted-foreground">No longer required</p></CardContent></Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><UserCheck className="h-4 w-4" /> Assignment roster</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {roster.length === 0 ? (
                <p className="py-5 text-center text-sm text-muted-foreground">No acknowledgment assignments exist yet.</p>
              ) : (
                roster.map(assignment => (
                  <div key={assignment.id} className="grid gap-2 rounded-lg border px-3 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] sm:items-center">
                    <div>
                      <p className="font-medium">{assignment.displayName}</p>
                      <p className="text-xs text-muted-foreground capitalize">{assignment.role_at_assignment}</p>
                    </div>
                    <div>
                      <p>{assignment.title_snapshot}</p>
                      <p className="text-xs text-muted-foreground">Version {assignment.version_number_snapshot} · Due {formatDate(assignment.due_at)}</p>
                    </div>
                    <StateBadge assignment={assignment} />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
