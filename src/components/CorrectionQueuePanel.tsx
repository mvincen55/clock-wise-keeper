import { useEffect, useState } from 'react';
import { useOrgCorrectionRequests, useReviewCorrectionRequest, useMarkCorrectionApplied, CorrectionRequestRow } from '@/hooks/useCorrectionRequests';
import { useScrollIntoView, DEEP_LINK_HIGHLIGHT } from '@/hooks/useDeepLink';
import { supabase } from '@/integrations/supabase/client';
import { PunchEditorModal } from '@/components/PunchEditorModal';
import type { PunchRow } from '@/hooks/useTimeEntries';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/time-utils';
import { Loader2, CheckCircle, XCircle, Inbox, FileEdit, History, Wrench } from 'lucide-react';

const statusBadge: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-warning/20 text-warning' },
  approved: { label: 'Approved — not yet applied', className: 'bg-success/20 text-success' },
  denied: { label: 'Denied', className: 'bg-destructive/20 text-destructive' },
  applied: { label: 'Applied', className: 'bg-primary/20 text-primary' },
};

function CorrectionCard({ request, onReview, onFix, fixLoading, highlighted }: {
  request: CorrectionRequestRow;
  onReview: (r: CorrectionRequestRow) => void;
  onFix: (r: CorrectionRequestRow) => void;
  fixLoading: boolean;
  highlighted?: boolean;
}) {
  const badge = statusBadge[request.status] || statusBadge.pending;
  const change = request.proposed_change || {};
  const ref = useScrollIntoView<HTMLDivElement>(!!highlighted);
  // An approved punch correction still needs its fix landed through the
  // audited editor; the status upgrades to Applied only when that save
  // succeeds.
  const needsFix = request.status === 'approved' && request.target_table === 'punches';

  return (
    <Card ref={ref} className={`card-elevated ${highlighted ? DEEP_LINK_HIGHLIGHT : ''}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs font-mono">{request.target_table}</Badge>
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${badge.className}`}>{badge.label}</span>
          </div>
          <span className="text-xs text-muted-foreground">{formatDate(request.created_at)}</span>
        </div>

        {change.entry_date && (
          <p className="text-sm text-muted-foreground">Date: <span className="font-medium text-foreground">{change.entry_date}</span></p>
        )}
        {change.description && <p className="text-sm">{change.description}</p>}

        <div className="rounded bg-muted p-2">
          <p className="text-xs font-medium text-muted-foreground mb-1">Reason:</p>
          <p className="text-sm">{request.reason}</p>
        </div>

        <div className="flex gap-2">
          {request.status === 'pending' && (
            <Button size="sm" variant="default" onClick={() => onReview(request)}>
              <FileEdit className="h-3.5 w-3.5 mr-1" /> Review
            </Button>
          )}
          {needsFix && (
            <Button size="sm" variant="default" disabled={fixLoading} onClick={() => onFix(request)}>
              {fixLoading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Wrench className="h-3.5 w-3.5 mr-1" />}
              Fix punches now
            </Button>
          )}
        </div>

        {request.resolution_note && (
          <div className="pt-2 border-t text-xs text-muted-foreground">
            <span className="font-medium">Resolution:</span> {request.resolution_note}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function CorrectionQueuePanel({ highlightId }: { highlightId?: string | null }) {
  // Deep links start on "all" so the request is findable whatever its status.
  const [tab, setTab] = useState(highlightId ? 'all' : 'pending');
  useEffect(() => {
    if (highlightId) setTab('all');
  }, [highlightId]);
  const { data: requests, isLoading } = useOrgCorrectionRequests(tab);
  const reviewMutation = useReviewCorrectionRequest();
  const markApplied = useMarkCorrectionApplied();
  const { toast } = useToast();

  const [reviewTarget, setReviewTarget] = useState<CorrectionRequestRow | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'approved' | 'denied'>('approved');
  const [reviewNote, setReviewNote] = useState('');

  // The approved-punch-correction fix flow: the manager lands in the
  // punch editor prefilled with that employee's day (or null-entry mode
  // for a fully missed day); a successful save marks the request
  // APPLIED, referencing the audit events that applied it.
  const [fixState, setFixState] = useState<{
    request: CorrectionRequestRow;
    entryId: string | null;
    punches: PunchRow[];
    employeeName?: string;
  } | null>(null);
  const [fixLoadingId, setFixLoadingId] = useState<string | null>(null);

  const openFixEditor = async (request: CorrectionRequestRow) => {
    const entryDate = request.proposed_change?.entry_date;
    if (!entryDate) {
      toast({
        title: 'No date on this request',
        description: 'Fix the day from the Attendance table, then mark it applied here.',
        variant: 'destructive',
      });
      return;
    }
    setFixLoadingId(request.id);
    try {
      const { data: emp } = await supabase
        .from('employees').select('id, display_name').eq('id', request.employee_id).maybeSingle();
      const { data: entry } = await supabase
        .from('time_entries').select('id')
        .eq('employee_id', request.employee_id).eq('entry_date', entryDate).maybeSingle();
      let punches: PunchRow[] = [];
      if (entry) {
        const { data: p } = await supabase
          .from('punches').select('*').eq('time_entry_id', entry.id).order('seq', { ascending: true });
        punches = (p || []) as PunchRow[];
      }
      setFixState({ request, entryId: entry?.id ?? null, punches, employeeName: emp?.display_name });
    } catch (err: any) {
      toast({ title: 'Could not load the day', description: err.message, variant: 'destructive' });
    } finally {
      setFixLoadingId(null);
    }
  };

  const handleReview = async () => {
    if (!reviewTarget) return;
    if (reviewDecision === 'denied' && reviewNote.trim().length < 10) {
      toast({ title: 'Note too short', description: 'Denial requires at least 10 characters.', variant: 'destructive' });
      return;
    }
    if (!reviewNote.trim()) {
      toast({ title: 'Note required', variant: 'destructive' });
      return;
    }
    try {
      const target = reviewTarget;
      await reviewMutation.mutateAsync({
        id: target.id,
        status: reviewDecision,
        resolution_note: reviewNote.trim(),
      });
      toast({ title: `Request ${reviewDecision}` });
      setReviewTarget(null);
      setReviewNote('');
      // Approving a punch correction flows straight into the editor so
      // the approval doesn't sit un-applied by accident.
      if (reviewDecision === 'approved' && target.target_table === 'punches') {
        void openFixEditor(target);
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const pendingCount = requests?.filter(r => r.status === 'pending').length || 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <History className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Correction Requests</h2>
        {pendingCount > 0 && (
          <Badge variant="destructive" className="text-xs">{pendingCount} pending</Badge>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="applied">Applied</TabsTrigger>
          <TabsTrigger value="denied">Denied</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-3">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !requests?.length ? (
            <Card className="card-elevated">
              <CardContent className="p-6 text-center">
                <Inbox className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground text-sm">No {tab !== 'all' ? tab : ''} correction requests</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {requests.map(r => (
                <CorrectionCard
                  key={r.id}
                  request={r}
                  onReview={setReviewTarget}
                  onFix={openFixEditor}
                  fixLoading={fixLoadingId === r.id}
                  highlighted={r.id === highlightId}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Fix-punches editor for an approved correction */}
      {fixState && (
        <PunchEditorModal
          open
          onClose={() => setFixState(null)}
          entryId={fixState.entryId}
          entryDate={fixState.request.proposed_change?.entry_date}
          punches={fixState.punches}
          employeeId={fixState.request.employee_id}
          employeeName={fixState.employeeName}
          onSaved={async result => {
            if (result) {
              try {
                await markApplied.mutateAsync({ id: fixState.request.id, audit_event_ids: result.audit_event_ids });
                toast({ title: 'Correction applied', description: 'Status updated with audit references.' });
              } catch (err: any) {
                toast({
                  title: 'Punches saved, but the request status did not update',
                  description: err.message,
                  variant: 'destructive',
                });
              }
            }
            setFixState(null);
          }}
        />
      )}

      {/* Review Dialog */}
      <Dialog open={!!reviewTarget} onOpenChange={v => !v && setReviewTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Correction Request</DialogTitle>
          </DialogHeader>
          {reviewTarget && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted p-3 text-sm space-y-2">
                <p><span className="font-medium">Table:</span> {reviewTarget.target_table}</p>
                {reviewTarget.proposed_change?.entry_date && (
                  <p><span className="font-medium">Date:</span> {reviewTarget.proposed_change.entry_date}</p>
                )}
                {reviewTarget.proposed_change?.description && (
                  <p>{reviewTarget.proposed_change.description}</p>
                )}
                <div className="border-t pt-2 mt-2">
                  <p className="text-xs font-medium text-muted-foreground">Employee Reason:</p>
                  <p>{reviewTarget.reason}</p>
                </div>
              </div>

              <div className="space-y-1">
                <Label>Decision</Label>
                <div className="flex gap-2">
                  <Button
                    variant={reviewDecision === 'approved' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setReviewDecision('approved')}
                  >
                    <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve & Apply
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
                <Label>
                  Resolution Note <span className="text-destructive">*</span>
                  {reviewDecision === 'denied' && <span className="text-xs text-muted-foreground ml-1">(min 10 chars)</span>}
                </Label>
                <Textarea
                  value={reviewNote}
                  onChange={e => setReviewNote(e.target.value)}
                  placeholder={reviewDecision === 'denied' ? 'Explain why this is being denied...' : 'Note about the approval...'}
                  rows={3}
                />
              </div>

              <Button
                onClick={handleReview}
                disabled={!reviewNote.trim() || (reviewDecision === 'denied' && reviewNote.trim().length < 10) || reviewMutation.isPending}
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
