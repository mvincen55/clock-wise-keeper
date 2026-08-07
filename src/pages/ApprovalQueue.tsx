import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useOrgChangeRequests, useReviewChangeRequest, ChangeRequestRow } from '@/hooks/useChangeRequests';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useConsumedSearchParam, useScrollIntoView, DEEP_LINK_HIGHLIGHT } from '@/hooks/useDeepLink';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/time-utils';
import { Loader2, CheckCircle, XCircle, Clock, Inbox } from 'lucide-react';
import { CorrectionQueuePanel } from '@/components/CorrectionQueuePanel';
import { PtoRequestQueue } from '@/components/PtoRequestQueue';
import { useApprovalCounts } from '@/hooks/useApprovalCounts';

const statusBadge: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-warning/20 text-warning' },
  approved: { label: 'Approved', className: 'bg-success/20 text-success' },
  denied: { label: 'Denied', className: 'bg-destructive/20 text-destructive' },
};

const typeLabels: Record<string, string> = {
  punch_edit: 'Punch Edit',
  day_off: 'Day Off',
  schedule_change: 'Schedule Change',
  other: 'Other',
};

function RequestCard({ request, onReview, highlighted }: { request: ChangeRequestRow; onReview: (r: ChangeRequestRow) => void; highlighted?: boolean }) {
  const badge = statusBadge[request.status] || statusBadge.pending;
  const payload = request.payload || {};
  const ref = useScrollIntoView<HTMLDivElement>(!!highlighted);

  return (
    <Card ref={ref} className={`card-elevated ${highlighted ? DEEP_LINK_HIGHLIGHT : ''}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">{typeLabels[request.request_type] || request.request_type}</Badge>
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${badge.className}`}>{badge.label}</span>
          </div>
          <span className="text-xs text-muted-foreground">{formatDate(request.created_at)}</span>
        </div>

        {payload.entry_date && (
          <p className="text-sm text-muted-foreground">Date: <span className="font-medium text-foreground">{payload.entry_date}</span></p>
        )}
        {payload.description && (
          <p className="text-sm">{payload.description}</p>
        )}
        {payload.details && (
          <p className="text-xs text-muted-foreground italic">{payload.details}</p>
        )}

        {request.status === 'pending' && (
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="default" onClick={() => onReview(request)}>
              <CheckCircle className="h-3.5 w-3.5 mr-1" /> Review
            </Button>
          </div>
        )}

        {request.review_reason && (
          <div className="pt-2 border-t text-xs text-muted-foreground">
            <span className="font-medium">Manager note:</span> {request.review_reason}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const TAB_VALUES = ['change-requests', 'pto-requests', 'corrections'] as const;

export default function ApprovalQueue() {
  const { data: ctx } = useOrgContext();
  // A notification lands on the right tab with the right card in view.
  const [searchParams] = useSearchParams();
  const linkedTab = searchParams.get('tab');
  const linkedId = useConsumedSearchParam('request');
  const [filter, setFilter] = useState(linkedId ? 'all' : 'pending');
  const { data: requests, isLoading } = useOrgChangeRequests(filter);
  const reviewMutation = useReviewChangeRequest();
  const { toast } = useToast();

  const [reviewTarget, setReviewTarget] = useState<ChangeRequestRow | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'approved' | 'denied'>('approved');
  const [reviewReason, setReviewReason] = useState('');
  const [activeTab, setActiveTab] = useState(
    TAB_VALUES.includes(linkedTab as (typeof TAB_VALUES)[number]) ? (linkedTab as string) : 'change-requests'
  );
  const { data: counts } = useApprovalCounts();

  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';

  const handleReview = async () => {
    if (!reviewTarget || !reviewReason.trim()) return;
    try {
      await reviewMutation.mutateAsync({
        id: reviewTarget.id,
        status: reviewDecision,
        review_reason: reviewReason.trim(),
      });
      toast({ title: `Request ${reviewDecision}` });
      setReviewTarget(null);
      setReviewReason('');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  if (!isManager) {
    return (
      <div className="p-4 md:p-8 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Approval Queue</h1>
        <p className="text-muted-foreground">Only managers and owners can access the approval queue.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Approval Queue</h1>
        <p className="text-muted-foreground text-sm">{ctx?.org_name}</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="change-requests" className="relative">
            Change Requests
            {counts && counts.changeRequests > 0 && (
              <span className="ml-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1">
                {counts.changeRequests}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="pto-requests" className="relative">
            PTO Requests
            {counts && counts.ptoRequests > 0 && (
              <span className="ml-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1">
                {counts.ptoRequests}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="corrections" className="relative">
            Corrections
            {counts && counts.corrections > 0 && (
              <span className="ml-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1">
                {counts.corrections}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="change-requests" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Select value={filter} onValueChange={setFilter}>
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
                <p className="text-muted-foreground">No {filter !== 'all' ? filter : ''} requests</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {requests.map(r => (
                <RequestCard
                  key={r.id}
                  request={r}
                  onReview={setReviewTarget}
                  highlighted={activeTab === 'change-requests' && r.id === linkedId}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="pto-requests" className="mt-4">
          <PtoRequestQueue highlightId={activeTab === 'pto-requests' ? linkedId : null} />
        </TabsContent>

        <TabsContent value="corrections" className="mt-4">
          <CorrectionQueuePanel highlightId={activeTab === 'corrections' ? linkedId : null} />
        </TabsContent>
      </Tabs>

      {/* Review Dialog */}
      <Dialog open={!!reviewTarget} onOpenChange={v => !v && setReviewTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Request</DialogTitle>
          </DialogHeader>
          {reviewTarget && (
            <div className="space-y-4">
              <div className="text-sm space-y-1">
                <p><span className="font-medium">Type:</span> {typeLabels[reviewTarget.request_type]}</p>
                {reviewTarget.payload?.entry_date && <p><span className="font-medium">Date:</span> {reviewTarget.payload.entry_date}</p>}
                {reviewTarget.payload?.description && <p>{reviewTarget.payload.description}</p>}
                {reviewTarget.payload?.details && <p className="text-xs text-muted-foreground italic">{reviewTarget.payload.details}</p>}
              </div>

              <div className="space-y-1">
                <Label>Decision</Label>
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
              </div>

              <div className="space-y-1">
                <Label>Reason <span className="text-destructive">*</span></Label>
                <Textarea
                  value={reviewReason}
                  onChange={e => setReviewReason(e.target.value)}
                  placeholder="Required: explain your decision"
                  rows={3}
                />
              </div>

              <Button
                onClick={handleReview}
                disabled={!reviewReason.trim() || reviewMutation.isPending}
                className="w-full"
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
