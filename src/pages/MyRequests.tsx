import { useState, useEffect, type ReactNode } from 'react';
import { useMyChangeRequests, ChangeRequestRow } from '@/hooks/useChangeRequests';
import { useMyCorrectionRequests } from '@/hooks/useCorrectionRequests';
import { ChangeRequestModal } from '@/components/ChangeRequestModal';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/time-utils';
import { Loader2, Plus, Inbox, History } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { useConsumedSearchParam, useScrollIntoView, DEEP_LINK_HIGHLIGHT } from '@/hooks/useDeepLink';

const statusBadge: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-warning/20 text-warning' },
  approved: { label: 'Approved', className: 'bg-success/20 text-success' },
  denied: { label: 'Denied', className: 'bg-destructive/20 text-destructive' },
  applied: { label: 'Applied', className: 'bg-primary/20 text-primary' },
};

const typeLabels: Record<string, string> = {
  punch_edit: 'Punch Edit',
  day_off: 'Day Off',
  schedule_change: 'Schedule Change',
  other: 'Other',
};

/** A card a notification can land on, highlighted and scrolled into view. */
function RequestCard({ highlighted, children }: { highlighted: boolean; children: ReactNode }) {
  const ref = useScrollIntoView<HTMLDivElement>(highlighted);
  return (
    <Card ref={ref} className={`card-elevated ${highlighted ? DEEP_LINK_HIGHLIGHT : ''}`}>
      {children}
    </Card>
  );
}

export default function MyRequests() {
  const { data: requests, isLoading } = useMyChangeRequests();
  const { data: corrections } = useMyCorrectionRequests();
  const [modalOpen, setModalOpen] = useState(false);
  const { user } = useAuth();
  const qc = useQueryClient();
  // Decision notifications point at the exact request they decided.
  const linkedRequestId = useConsumedSearchParam('request');
  const linkedCorrectionId = useConsumedSearchParam('correction');

  // Auto-mark request-related notifications as read when visiting this page
  useEffect(() => {
    if (!user) return;
    const markRead = async () => {
      const requestTypes = [
        'change_request_approved', 'change_request_denied',
        'pto_request_approved', 'pto_request_denied',
        'correction_approved', 'correction_denied',
      ];
      const { data: unread } = await supabase
        .from('notifications')
        .select('id')
        .eq('recipient_user_id', user.id)
        .eq('is_read', false)
        .in('notification_type', requestTypes);
      if (unread && unread.length > 0) {
        await supabase
          .from('notifications')
          .update({ is_read: true })
          .in('id', unread.map(n => n.id));
        qc.invalidateQueries({ queryKey: ['notifications'] });
      }
    };
    markRead();
  }, [user?.id, qc]);

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold">My Requests</h1>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> New Request
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !requests?.length ? (
        <Card className="card-elevated">
          <CardContent className="p-8 text-center">
            <Inbox className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No requests yet. Submit one to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map(r => {
            const badge = statusBadge[r.status] || statusBadge.pending;
            const payload = r.payload || {};
            return (
              <RequestCard key={r.id} highlighted={r.id === linkedRequestId}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{typeLabels[r.request_type] || r.request_type}</Badge>
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${badge.className}`}>{badge.label}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatDate(r.created_at)}</span>
                  </div>
                  {payload.entry_date && (
                    <p className="text-sm text-muted-foreground">Date: <span className="font-medium text-foreground">{payload.entry_date}</span></p>
                  )}
                  {payload.description && <p className="text-sm">{payload.description}</p>}
                  {payload.details && <p className="text-xs text-muted-foreground italic">{payload.details}</p>}
                  {r.review_reason && (
                    <div className="pt-2 border-t text-xs text-muted-foreground">
                      <span className="font-medium">Manager note:</span> {r.review_reason}
                    </div>
                  )}
                </CardContent>
              </RequestCard>
            );
          })}
        </div>
      )}

      {/* Correction requests — where "correction approved/denied" notifications land. */}
      {!!corrections?.length && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-semibold">My Correction Requests</h2>
          </div>
          {corrections.map(c => {
            const badge = statusBadge[c.status] || statusBadge.pending;
            const change = c.proposed_change || {};
            return (
              <RequestCard key={c.id} highlighted={c.id === linkedCorrectionId}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs font-mono">{c.target_table}</Badge>
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${badge.className}`}>{badge.label}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatDate(c.created_at)}</span>
                  </div>
                  {change.entry_date && (
                    <p className="text-sm text-muted-foreground">Date: <span className="font-medium text-foreground">{change.entry_date}</span></p>
                  )}
                  <p className="text-sm">{c.reason}</p>
                  {c.resolution_note && (
                    <div className="pt-2 border-t text-xs text-muted-foreground">
                      <span className="font-medium">Resolution:</span> {c.resolution_note}
                    </div>
                  )}
                </CardContent>
              </RequestCard>
            );
          })}
        </section>
      )}

      <ChangeRequestModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
