import { useEffect, useState, type ReactNode } from 'react';
import {
  useTardyApprovalRequests, useDecideTardyApprovalRequest,
  type TardyApprovalRequestRow, type TardyRequestStatusFilter,
} from '@/hooks/useTardyApprovalRequests';
import { useScrollIntoView, DEEP_LINK_HIGHLIGHT } from '@/hooks/useDeepLink';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { formatDate, formatClock, formatInstantClock } from '@/lib/time-utils';
import { Loader2, CheckCircle, XCircle, Inbox, Clock } from 'lucide-react';

const statusBadge: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-warning/20 text-warning' },
  approved: { label: 'Approved', className: 'bg-success/20 text-success' },
  denied: { label: 'Denied', className: 'bg-destructive/20 text-destructive' },
};

/** When a notification names one request, land with it in view. */
function HighlightableCard({ highlighted, children }: { highlighted: boolean; children: ReactNode }) {
  const ref = useScrollIntoView<HTMLDivElement>(highlighted);
  return (
    <Card ref={ref} className={`card-elevated ${highlighted ? DEEP_LINK_HIGHLIGHT : ''}`}>
      {children}
    </Card>
  );
}

/** The lateness the request is about, from the joined tardy. */
function latenessLine(r: TardyApprovalRequestRow): string {
  if (!r.tardy) return formatDate(r.entry_date);
  return `${formatDate(r.entry_date)} · ${r.tardy.minutes_late} min late (expected ${formatClock(r.tardy.expected_start_time)}, arrived ${formatInstantClock(r.tardy.actual_start_time)})`;
}

/**
 * The manager's queue of tardy approval requests. Approving excuses the
 * tardy; denying keeps it unapproved and needs a note for the employee.
 */
export function TardyApprovalQueue({ highlightId }: { highlightId?: string | null }) {
  // Deep links start on "all" so the request is findable whatever its status.
  const [filter, setFilter] = useState<TardyRequestStatusFilter>(highlightId ? 'all' : 'pending');
  useEffect(() => {
    if (highlightId) setFilter('all');
  }, [highlightId]);
  const { data: requests, isLoading } = useTardyApprovalRequests(filter);
  const decide = useDecideTardyApprovalRequest();
  const { toast } = useToast();

  const [target, setTarget] = useState<TardyApprovalRequestRow | null>(null);
  const [decision, setDecision] = useState<'approved' | 'denied'>('approved');
  const [note, setNote] = useState('');
  const needsNote = decision === 'denied' && note.trim().length === 0;

  const openDecision = (r: TardyApprovalRequestRow, d: 'approved' | 'denied') => {
    setTarget(r);
    setDecision(d);
    setNote('');
  };

  const handleDecide = async () => {
    if (!target || needsNote) return;
    try {
      await decide.mutateAsync({ id: target.id, approve: decision === 'approved', note: note.trim() || undefined });
      toast({ title: decision === 'approved' ? 'Late arrival excused' : 'Request denied' });
      setTarget(null);
      setNote('');
    } catch (err) {
      toast({ title: 'Could not save the decision', description: (err as Error).message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Select value={filter} onValueChange={v => setFilter(v as TardyRequestStatusFilter)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="denied">Denied</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !requests?.length ? (
        <Card className="card-elevated">
          <CardContent className="p-8 text-center">
            <Inbox className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No {filter !== 'all' ? filter : ''} tardy approval requests</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map(r => {
            const badge = statusBadge[r.status] || statusBadge.pending;
            return (
              <HighlightableCard key={r.id} highlighted={r.id === highlightId}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{r.employee_name}</span>
                      <Badge variant="outline" className="text-xs">Late arrival</Badge>
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${badge.className}`}>{badge.label}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatDate(r.created_at)}</span>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    <span>{latenessLine(r)}</span>
                  </div>

                  <div className="rounded bg-muted p-2">
                    <p className="text-xs font-medium text-muted-foreground mb-1">What happened:</p>
                    <p className="text-sm">{r.reason}</p>
                  </div>

                  {r.status === 'pending' && (
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="default" onClick={() => openDecision(r, 'approved')}>
                        <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openDecision(r, 'denied')}>
                        <XCircle className="h-3.5 w-3.5 mr-1" /> Deny
                      </Button>
                    </div>
                  )}

                  {r.review_note && (
                    <div className="pt-2 border-t text-xs text-muted-foreground">
                      <span className="font-medium">Manager note:</span> {r.review_note}
                    </div>
                  )}
                </CardContent>
              </HighlightableCard>
            );
          })}
        </div>
      )}

      <Dialog open={!!target} onOpenChange={v => !v && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{decision === 'approved' ? 'Excuse this late arrival?' : 'Deny this request?'}</DialogTitle>
            {target && <DialogDescription>{target.employee_name} · {latenessLine(target)}</DialogDescription>}
          </DialogHeader>
          {target && (
            <div className="space-y-4">
              <p className="text-sm">{target.reason}</p>
              <div className="space-y-1">
                <Label>Note {decision === 'denied' ? <span className="text-destructive">*</span> : '(optional)'}</Label>
                <Textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder={decision === 'denied' ? 'Required: tell them why' : 'Anything to add for the employee'}
                  rows={3}
                />
              </div>
              <Button
                onClick={handleDecide}
                disabled={needsNote || decide.isPending}
                variant={decision === 'denied' ? 'destructive' : 'default'}
                className="w-full"
              >
                {decide.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {decision === 'approved' ? 'Approve' : 'Deny'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
