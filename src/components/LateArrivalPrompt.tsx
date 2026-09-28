import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Check, Clock3, Loader2, MessageSquareText } from 'lucide-react';
import { CorrectionRequestModal } from '@/components/CorrectionRequestModal';
import { useAcknowledgeTardy, useRequestTardyExcuse, type TardyRow } from '@/hooks/useTardies';
import { useToast } from '@/hooks/use-toast';
import { formatClock, formatDate, formatTime } from '@/lib/time-utils';

/**
 * The three answers to "you arrived late", none of them an interrogation:
 *
 *   Acknowledge as unexcused — a receipt (who, when). No reason, no
 *     signature, no manager task. The arrival stays on record as unexcused.
 *   Request excused — a short explanation; a manager approves or declines.
 *     Pending review from the moment it is sent.
 *   Report incorrect time — the existing correction request; a manager fixes
 *     the punches and the late arrival goes away with the correction.
 *
 * Closing the prompt does nothing at all: the late arrival is neither
 * acknowledged nor erased, and the prompt comes back next time.
 */
type Props = {
  open: boolean;
  tardy: TardyRow | null;
  onClose: () => void;
};

export function LateArrivalPrompt({ open, tardy, onClose }: Props) {
  const [mode, setMode] = useState<'choose' | 'excuse'>('choose');
  const [explanation, setExplanation] = useState('');
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const acknowledge = useAcknowledgeTardy();
  const request = useRequestTardyExcuse();
  const { toast } = useToast();

  const close = () => {
    setMode('choose');
    setExplanation('');
    onClose();
  };

  if (!tardy) return null;
  const busy = acknowledge.isPending || request.isPending;

  const doAcknowledge = async () => {
    try {
      await acknowledge.mutateAsync(tardy.id);
      toast({ title: 'Acknowledged', description: `Late arrival on ${formatDate(tardy.entry_date)} recorded as unexcused.` });
      close();
    } catch (e) {
      toast({ title: 'Could not acknowledge', description: e instanceof Error ? e.message : 'Try again.', variant: 'destructive' });
    }
  };

  const doRequest = async () => {
    try {
      await request.mutateAsync({ tardyId: tardy.id, explanation: explanation.trim() });
      toast({ title: 'Excuse requested', description: 'Pending review. Your manager will decide and you will be notified.' });
      close();
    } catch (e) {
      toast({ title: 'Could not send the request', description: e instanceof Error ? e.message : 'Try again.', variant: 'destructive' });
    }
  };

  return (
    <>
      <Dialog open={open && !correctionOpen} onOpenChange={v => { if (!v) close(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock3 className="h-5 w-5 text-warning" />
              Late arrival · {formatDate(tardy.entry_date)}
            </DialogTitle>
            <DialogDescription>
              Scheduled {formatClock(tardy.expected_start_time)}, clocked in {formatTime(tardy.actual_start_time)} — {tardy.minutes_late} minute{tardy.minutes_late === 1 ? '' : 's'} past the grace period.
              No explanation is required.
            </DialogDescription>
          </DialogHeader>

          {mode === 'choose' && (
            <div className="space-y-2">
              <Button className="w-full justify-start" disabled={busy} onClick={doAcknowledge}>
                {acknowledge.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                Acknowledge as unexcused
              </Button>
              <p className="px-1 text-xs text-muted-foreground">Records that you saw it. It stays on your record as unexcused and counts toward the office's late-arrival rule.</p>
              <Button variant="outline" className="w-full justify-start" disabled={busy} onClick={() => setMode('excuse')}>
                <MessageSquareText className="mr-2 h-4 w-4" />
                Request excused
              </Button>
              <p className="px-1 text-xs text-muted-foreground">A short explanation goes to your manager for a decision. While it waits, it is not counted.</p>
              <Button variant="outline" className="w-full justify-start" disabled={busy} onClick={() => setCorrectionOpen(true)}>
                <Clock3 className="mr-2 h-4 w-4" />
                Report incorrect time
              </Button>
              <p className="px-1 text-xs text-muted-foreground">The clock-in time is wrong. A correction request goes to your manager; a corrected time removes the late arrival.</p>
              <p className="pt-2 text-xs text-muted-foreground">Closing this window records nothing; the late arrival stays as it is.</p>
            </div>
          )}

          {mode === 'excuse' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="excuse-explanation">Explanation (short)</Label>
                <Textarea
                  id="excuse-explanation"
                  value={explanation}
                  onChange={e => setExplanation(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="What happened, in a sentence or two."
                />
                <p className="text-xs text-muted-foreground">Sent to your manager as an excuse request: pending review until they decide.</p>
              </div>
              <div className="flex gap-2">
                <Button onClick={doRequest} disabled={explanation.trim().length < 3 || busy} className="flex-1">
                  {request.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send request
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => setMode('choose')}>Back</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <CorrectionRequestModal
        open={correctionOpen}
        onClose={() => { setCorrectionOpen(false); close(); }}
        prefill={{
          target_table: 'punches',
          target_id: tardy.time_entry_id ?? undefined,
          entry_date: tardy.entry_date,
          description: `Clock-in on ${tardy.entry_date} shows ${formatTime(tardy.actual_start_time)}; the recorded time is incorrect.`,
        }}
      />
    </>
  );
}
