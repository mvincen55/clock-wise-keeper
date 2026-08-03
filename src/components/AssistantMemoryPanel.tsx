import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Brain,
  Check,
  Info,
  Loader2,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import {
  useApplyFinding,
  useAssistantMemories,
  useAuditFindings,
  useDismissFinding,
  useForgetMemory,
  useResolveMemoryConflict,
  useRunAudit,
  type AssistantMemory,
  type AuditFinding,
} from '@/hooks/useAssistantMemory';
import { useOrgContext } from '@/hooks/useOrgContext';

/**
 * What the assistant knows, and what the auditor thinks is wrong with it.
 *
 * Three sections, in the order they need attention:
 *   1. Conflicts  — a new fact contradicted an old one. It is held out of
 *                   every answer until an owner/manager picks a side.
 *   2. Findings   — the auditor's other observations (misfiled notes,
 *                   code knowledge kept as chat memory).
 *   3. Memory     — everything currently in effect.
 */
export default function AssistantMemoryPanel() {
  const { data: ctx } = useOrgContext();
  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';
  const { data: memories, isLoading } = useAssistantMemories();
  const { data: findings } = useAuditFindings();
  const runAudit = useRunAudit();

  const pending = (memories ?? []).filter(m => m.status === 'pending');
  const active = (memories ?? []).filter(m => m.status === 'active');
  const office = active.filter(m => m.kind === 'office');
  const site = active.filter(m => m.kind === 'site');
  // Conflicts already have their own section above; don't double-list them.
  const otherFindings = (findings ?? []).filter(f => f.kind !== 'memory_contradiction');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {active.length} thing{active.length === 1 ? '' : 's'} I know
          {pending.length > 0 && ` · ${pending.length} waiting on your decision`}
        </p>
        {isManager && (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              runAudit.mutate(undefined, {
                onSuccess: result =>
                  toast.success(
                    result.found === 0
                      ? 'Audit clean — nothing inconsistent or misfiled.'
                      : `Audit found ${result.found} thing${result.found === 1 ? '' : 's'} to look at (${result.recorded} new).`
                  ),
                onError: err => toast.error(err.message),
              })
            }
            disabled={runAudit.isPending}
          >
            {runAudit.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-4 w-4" />
            )}
            Run audit
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <section className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Needs your decision
              </h3>
              <p className="text-xs text-muted-foreground">
                I was told something that contradicts what I already knew, so I didn't just
                overwrite it. Nothing here is used in answers until you choose.
              </p>
              {pending.map(memory => (
                <ConflictCard key={memory.id} memory={memory} canDecide={isManager} />
              ))}
            </section>
          )}

          {otherFindings.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Auditor findings</h3>
              {otherFindings.map(finding => (
                <FindingCard key={finding.id} finding={finding} canAct={isManager} />
              ))}
            </section>
          )}

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">What I know</h3>
            {active.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Nothing yet. Tell me something about the office or the site in chat and I'll
                  remember it.
                </CardContent>
              </Card>
            ) : (
              <>
                <MemoryGroup title="The office" memories={office} canForget={isManager} />
                <MemoryGroup title="This site" memories={site} canForget={isManager} />
              </>
            )}
          </section>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Notes about a specific procedure code live on that code's fee-schedule row, not
              here — on the office schedule when they apply to every patient, or on an
              insurance's schedule when they only apply to billing that plan.
            </AlertDescription>
          </Alert>
        </>
      )}
    </div>
  );
}

function ConflictCard({ memory, canDecide }: { memory: AssistantMemory; canDecide: boolean }) {
  const resolve = useResolveMemoryConflict();

  return (
    <Card className="border-amber-300">
      <CardContent className="space-y-2 py-3">
        <p className="text-sm">{memory.content}</p>
        {memory.conflictNote && (
          <p className="rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
            {memory.conflictNote}
          </p>
        )}
        {canDecide ? (
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() =>
                resolve.mutate(
                  { memory, decision: 'accept' },
                  {
                    onSuccess: () => toast.success('Updated — the older version has been retired.'),
                    onError: err => toast.error(err.message),
                  }
                )
              }
              disabled={resolve.isPending}
            >
              <Check className="mr-1.5 h-3.5 w-3.5" />
              This one's right
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                resolve.mutate(
                  { memory, decision: 'reject' },
                  {
                    onSuccess: () => toast.success('Discarded — I kept what I had.'),
                    onError: err => toast.error(err.message),
                  }
                )
              }
              disabled={resolve.isPending}
            >
              <X className="mr-1.5 h-3.5 w-3.5" />
              Keep the old one
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">A manager needs to settle this one.</p>
        )}
      </CardContent>
    </Card>
  );
}

function FindingCard({ finding, canAct }: { finding: AuditFinding; canAct: boolean }) {
  const apply = useApplyFinding();
  const dismiss = useDismissFinding();
  const action = finding.suggestedAction as { type?: string } | null;
  const canApply = action?.type === 'move_note';

  return (
    <Card>
      <CardContent className="space-y-2 py-3">
        <div className="flex items-start gap-2">
          <Badge
            variant={finding.severity === 'high' ? 'destructive' : 'secondary'}
            className="mt-0.5 shrink-0 text-[10px] font-normal"
          >
            {finding.severity}
          </Badge>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{finding.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{finding.detail}</p>
          </div>
        </div>
        {canAct && (
          <div className="flex gap-2">
            {canApply && (
              <Button
                size="sm"
                onClick={() =>
                  apply.mutate(finding, {
                    onSuccess: () => toast.success('Moved to the office fee schedule.'),
                    onError: err => toast.error(err.message),
                  })
                }
                disabled={apply.isPending}
              >
                {apply.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Move to office schedule
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                dismiss.mutate(finding.id, {
                  onError: err => toast.error(err.message),
                })
              }
              disabled={dismiss.isPending}
            >
              Dismiss
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MemoryGroup({
  title,
  memories,
  canForget,
}: {
  title: string;
  memories: AssistantMemory[];
  canForget: boolean;
}) {
  const forget = useForgetMemory();
  if (memories.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title} · {memories.length}
      </div>
      {memories.map(memory => (
        <Card key={memory.id}>
          <CardContent className="flex items-center gap-2 py-2.5">
            <Brain className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <p className="min-w-0 flex-1 text-sm">{memory.content}</p>
            {canForget && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-destructive"
                aria-label="Forget this"
                onClick={() => {
                  if (confirm(`Forget this?\n\n"${memory.content}"`)) {
                    forget.mutate(memory.id, { onError: err => toast.error(err.message) });
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
