import { useState, useMemo, useEffect } from 'react';
import { AlertTriangle, Check, Minus, Plus, ShieldCheck } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import type { TrainingModule } from '@/hooks/useTraining';
import { usePublishModule, useRecordAuditReview } from '@/hooks/useTraining';
import { describeDiff, diffAudit, type DiffFinding } from '@/lib/audit-diff';

const SEVERITY_VARIANT: Record<string, 'destructive' | 'secondary' | 'outline'> = {
  high: 'destructive',
  medium: 'secondary',
  low: 'outline',
};

function FindingRow({
  finding,
  tone,
}: {
  finding: DiffFinding;
  tone: 'added' | 'resolved' | 'unchanged';
}) {
  const Icon = tone === 'added' ? Plus : tone === 'resolved' ? Minus : Check;
  return (
    <li className="rounded-md border border-border bg-background p-2.5 text-sm">
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <Icon
          className={
            tone === 'added'
              ? 'h-3.5 w-3.5 text-destructive'
              : tone === 'resolved'
                ? 'h-3.5 w-3.5 text-primary'
                : 'h-3.5 w-3.5 text-muted-foreground'
          }
        />
        <Badge variant={SEVERITY_VARIANT[finding.severity] ?? 'secondary'}>
          {finding.severity}
        </Badge>
        {finding.where && <span className="text-xs text-muted-foreground">{finding.where}</span>}
      </div>
      <p className={tone === 'resolved' ? 'text-muted-foreground line-through' : ''}>
        {finding.issue}
      </p>
      {finding.fix && tone !== 'resolved' && (
        <p className="mt-1 text-xs text-muted-foreground">
          <span className="font-medium">Fix: </span>
          {finding.fix}
        </p>
      )}
    </li>
  );
}

/**
 * The step between "I want to publish this" and it going live: a before/after
 * of what the auditor flagged, and a fresh sign-off whenever findings change.
 */
export default function AuditPreviewDialog({
  module,
  open,
  onOpenChange,
}: {
  module: TrainingModule | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const publish = usePublishModule();
  const recordReview = useRecordAuditReview();
  const [acknowledged, setAcknowledged] = useState(false);

  const audit = module?.audit ?? null;
  const diff = useMemo(() => diffAudit(audit, audit?.review ?? null), [audit]);

  // A stale sign-off never carries over to a changed set of findings.
  useEffect(() => {
    setAcknowledged(false);
  }, [module?.id, open]);

  if (!module) return null;

  const previous = audit?.review ?? null;
  const canPublish = acknowledged && !publish.isPending;

  const handlePublish = async () => {
    try {
      await publish.mutateAsync({ module });
      toast.success('Module published');
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not publish');
    }
  };

  const handleReviewOnly = async () => {
    try {
      await recordReview.mutateAsync({ module });
      toast.success('Review recorded — the module stays a draft');
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not record the review');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review before publishing</DialogTitle>
          <DialogDescription>{module.title}</DialogDescription>
        </DialogHeader>

        <div
          className={
            diff.needsReview
              ? 'flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm'
              : 'flex items-start gap-2 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm'
          }
        >
          {diff.needsReview ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          ) : (
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          )}
          <div>
            <p className="font-medium">{describeDiff(diff)}</p>
            <p className="text-muted-foreground">
              Auditor verdict: {audit?.verdict ?? 'unreviewed'}
              {previous?.reviewed_at &&
                ` · last reviewed ${new Date(previous.reviewed_at).toLocaleDateString()} (verdict ${previous.verdict ?? 'unknown'})`}
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Before — last reviewed ({previous?.findings?.length ?? 0})
            </p>
            {previous?.findings?.length ? (
              <ul className="space-y-2">
                {previous.findings.map((f, i) => (
                  <FindingRow key={`b-${i}`} finding={f} tone="unchanged" />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No prior review on record.</p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              After — current ({audit?.findings?.length ?? 0})
            </p>
            {audit?.findings?.length ? (
              <ul className="space-y-2">
                {audit.findings.map((f, i) => (
                  <FindingRow
                    key={`a-${i}`}
                    finding={f}
                    tone={diff.added.includes(f) ? 'added' : 'unchanged'}
                  />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing flagged right now.</p>
            )}
          </div>
        </div>

        {diff.resolved.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Resolved since last review ({diff.resolved.length})
            </p>
            <ul className="space-y-2">
              {diff.resolved.map((f, i) => (
                <FindingRow key={`r-${i}`} finding={f} tone="resolved" />
              ))}
            </ul>
          </div>
        )}

        <label className="flex items-start gap-2 rounded-md border border-border p-3 text-sm">
          <Checkbox
            checked={acknowledged}
            onCheckedChange={v => setAcknowledged(v === true)}
            className="mt-0.5"
          />
          <span>
            I have read the current findings
            {diff.needsReview && !diff.firstReview ? ' again, after they changed' : ''}, and I'm
            taking responsibility for publishing this module.
          </span>
        </label>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={handleReviewOnly}
            disabled={!acknowledged || recordReview.isPending}
          >
            Record review only
          </Button>
          <Button onClick={handlePublish} disabled={!canPublish}>
            {publish.isPending ? 'Publishing…' : 'Publish module'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
