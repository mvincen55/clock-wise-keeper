import { useState } from 'react';
import { useMyChangeRequests, ChangeRequestRow } from '@/hooks/useChangeRequests';
import { ChangeRequestModal } from '@/components/ChangeRequestModal';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/time-utils';
import { Loader2, Plus, Inbox } from 'lucide-react';

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

export default function MyRequests() {
  const { data: requests, isLoading } = useMyChangeRequests();
  const [modalOpen, setModalOpen] = useState(false);

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
              <Card key={r.id} className="card-elevated">
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
              </Card>
            );
          })}
        </div>
      )}

      <ChangeRequestModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
