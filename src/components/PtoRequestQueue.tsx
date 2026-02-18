import { useState } from 'react';
import { useOrgPtoRequests, useReviewPtoRequest, PtoRequest } from '@/hooks/usePtoRequests';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatDate } from '@/lib/time-utils';
import { Loader2, CheckCircle, XCircle, Inbox, CalendarDays } from 'lucide-react';

const statusBadge: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-warning/20 text-warning' },
  approved: { label: 'Approved', className: 'bg-success/20 text-success' },
  denied: { label: 'Denied', className: 'bg-destructive/20 text-destructive' },
  cancelled: { label: 'Cancelled', className: 'bg-muted text-muted-foreground' },
};

const typeLabels: Record<string, string> = {
  pto: 'PTO',
  sick: 'Sick',
  unpaid: 'Unpaid',
  other: 'Other',
};

export function PtoRequestQueue() {
  const [filter, setFilter] = useState('pending');
  const { data: requests, isLoading } = useOrgPtoRequests(filter);
  const reviewMutation = useReviewPtoRequest();

  const [reviewTarget, setReviewTarget] = useState<PtoRequest | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'approved' | 'denied'>('approved');
  const [managerNote, setManagerNote] = useState('');

  const handleReview = async () => {
    if (!reviewTarget) return;
    if (reviewDecision === 'denied' && managerNote.trim().length < 5) return;
    await reviewMutation.mutateAsync({
      id: reviewTarget.id,
      status: reviewDecision,
      manager_note: managerNote.trim() || undefined,
    });
    setReviewTarget(null);
    setManagerNote('');
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="denied">Denied</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
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
            <p className="text-muted-foreground">No {filter !== 'all' ? filter : ''} PTO requests</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map(r => {
            const badge = statusBadge[r.status] || statusBadge.pending;
            return (
              <Card key={r.id} className="card-elevated">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{r.employee_name}</span>
                      <Badge variant="outline" className="text-xs">{typeLabels[r.pto_type]}</Badge>
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${badge.className}`}>{badge.label}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatDate(r.created_at)}</span>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {formatDate(r.start_date)}
                    {r.start_date !== r.end_date && ` — ${formatDate(r.end_date)}`}
                    {r.hours_requested && <span className="ml-2 font-medium">({r.hours_requested}h)</span>}
                  </div>

                  <p className="text-sm">{r.note}</p>

                  {r.status === 'pending' && (
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="default" onClick={() => { setReviewTarget(r); setReviewDecision('approved'); }}>
                        <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setReviewTarget(r); setReviewDecision('denied'); }}>
                        <XCircle className="h-3.5 w-3.5 mr-1" /> Deny
                      </Button>
                    </div>
                  )}

                  {r.manager_note && (
                    <div className="pt-2 border-t text-xs text-muted-foreground">
                      <span className="font-medium">Manager note:</span> {r.manager_note}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Review Dialog */}
      <Dialog open={!!reviewTarget} onOpenChange={v => !v && setReviewTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reviewDecision === 'approved' ? 'Approve' : 'Deny'} PTO Request</DialogTitle>
          </DialogHeader>
          {reviewTarget && (
            <div className="space-y-4">
              <div className="text-sm space-y-1">
                <p><span className="font-medium">Employee:</span> {reviewTarget.employee_name}</p>
                <p><span className="font-medium">Dates:</span> {formatDate(reviewTarget.start_date)} — {formatDate(reviewTarget.end_date)}</p>
                <p><span className="font-medium">Type:</span> {typeLabels[reviewTarget.pto_type]}</p>
                <p><span className="font-medium">Reason:</span> {reviewTarget.note}</p>
              </div>

              <div className="flex gap-2">
                <Button
                  variant={reviewDecision === 'approved' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setReviewDecision('approved')}
                >
                  <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve
                </Button>
                <Button
                  variant={reviewDecision === 'denied' ? 'destructive' : 'outline'}
                  size="sm"
                  onClick={() => setReviewDecision('denied')}
                >
                  <XCircle className="h-3.5 w-3.5 mr-1" /> Deny
                </Button>
              </div>

              <div className="space-y-1">
                <Label>
                  Manager Note {reviewDecision === 'denied' && <span className="text-destructive">* (required)</span>}
                </Label>
                <Textarea
                  value={managerNote}
                  onChange={e => setManagerNote(e.target.value)}
                  placeholder={reviewDecision === 'denied' ? 'Explain why this is denied (min 5 chars)' : 'Optional note'}
                  rows={3}
                />
              </div>

              <Button
                onClick={handleReview}
                disabled={
                  reviewMutation.isPending ||
                  (reviewDecision === 'denied' && managerNote.trim().length < 5)
                }
                className="w-full"
                variant={reviewDecision === 'denied' ? 'destructive' : 'default'}
              >
                {reviewMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm {reviewDecision === 'approved' ? 'Approval' : 'Denial'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
