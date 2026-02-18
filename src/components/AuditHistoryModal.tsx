import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuditHistoryByDate } from '@/hooks/useCorrectionRequests';
import { Badge } from '@/components/ui/badge';
import { Loader2, History, User, FileText } from 'lucide-react';
import { formatDate } from '@/lib/time-utils';

interface AuditHistoryModalProps {
  open: boolean;
  onClose: () => void;
  employeeId: string;
  entryDate: string;
  employeeName?: string;
}

const actionLabels: Record<string, { label: string; className: string }> = {
  request_create: { label: 'Request Created', className: 'bg-primary/20 text-primary' },
  request_approve: { label: 'Approved', className: 'bg-success/20 text-success' },
  request_deny: { label: 'Denied', className: 'bg-destructive/20 text-destructive' },
  manager_edit: { label: 'Manager Edit', className: 'bg-warning/20 text-warning' },
  system_adjustment: { label: 'System', className: 'bg-muted text-muted-foreground' },
};

export function AuditHistoryModal({ open, onClose, employeeId, entryDate, employeeName }: AuditHistoryModalProps) {
  const { data: events, isLoading } = useAuditHistoryByDate(
    open ? employeeId : undefined,
    open ? entryDate : undefined
  );

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Audit History
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {employeeName && <span className="font-medium">{employeeName}</span>}
            {employeeName && ' — '}{formatDate(entryDate)}
          </p>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !events?.length ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No audit events for this date</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
            {events.map((evt: any) => {
              const actionInfo = actionLabels[evt.action_type] || actionLabels[evt.event_type] || { label: evt.action_type || evt.event_type, className: 'bg-muted text-muted-foreground' };
              return (
                <div key={evt.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className={`text-xs ${actionInfo.className}`}>
                      {actionInfo.label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(evt.created_at).toLocaleString()}
                    </span>
                  </div>

                  {evt.reason && (
                    <p className="text-sm"><span className="font-medium">Reason:</span> {evt.reason}</p>
                  )}

                  {evt.target_table && (
                    <p className="text-xs text-muted-foreground">
                      Table: <span className="font-mono">{evt.target_table}</span>
                    </p>
                  )}

                  {evt.before_json && (
                    <div className="text-xs">
                      <span className="font-medium text-muted-foreground">Before:</span>
                      <pre className="mt-0.5 p-1.5 rounded bg-muted text-xs overflow-x-auto">
                        {JSON.stringify(evt.before_json, null, 2)}
                      </pre>
                    </div>
                  )}

                  {evt.after_json && (
                    <div className="text-xs">
                      <span className="font-medium text-muted-foreground">After:</span>
                      <pre className="mt-0.5 p-1.5 rounded bg-muted text-xs overflow-x-auto">
                        {JSON.stringify(evt.after_json, null, 2)}
                      </pre>
                    </div>
                  )}

                  {/* Legacy event_details fallback */}
                  {!evt.before_json && !evt.after_json && evt.event_details && (
                    <div className="text-xs">
                      <pre className="p-1.5 rounded bg-muted overflow-x-auto">
                        {JSON.stringify(evt.event_details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
