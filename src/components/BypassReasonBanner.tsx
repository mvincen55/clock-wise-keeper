import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUnresolvedBypasses } from '@/hooks/useChecklistBypasses';
import BypassReasonDialog from '@/components/BypassReasonDialog';

/** Persistent, non-blocking follow-up until the member gives their reason. */
export default function BypassReasonBanner() {
  const { data: bypasses } = useUnresolvedBypasses();
  const [open, setOpen] = useState(false);

  const bypass = bypasses?.[0];
  if (!bypass) return null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2.5">
        <p className="flex items-center gap-2 text-sm text-foreground">
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
          You bypassed your checklist on {bypass.checklist_date} — add your reason.
          {(bypasses?.length ?? 0) > 1 && (
            <span className="text-muted-foreground">({bypasses!.length} waiting)</span>
          )}
        </p>
        <Button size="sm" onClick={() => setOpen(true)}>Add reason</Button>
      </div>
      <BypassReasonDialog bypass={bypass} open={open} onOpenChange={setOpen} />
    </>
  );
}
