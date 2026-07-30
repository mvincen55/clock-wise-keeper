import { Button } from '@/components/ui/button';
import { Check, X, ListPlus } from 'lucide-react';
import { getToday } from '@/lib/time-utils';
import { dayLabel } from '@/lib/copilot';
import {
  useCaptureProposals,
  useConfirmCapture,
  useDeclineCapture,
  type CaptureProposal,
} from '@/hooks/useCopilot';

/**
 * "Want this on your list?" — the one-tap capture chip.
 *
 * Capture is never typing: the item is already drafted with a day and a tiny
 * first step. One tap makes it real; one tap drops it for good.
 */
export function CaptureChip({ proposal }: { proposal: CaptureProposal }) {
  const confirm = useConfirmCapture();
  const decline = useDeclineCapture();
  const today = getToday();
  const busy = confirm.isPending || decline.isPending;

  return (
    <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <ListPlus className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium leading-snug">Want this on your list?</p>
          <p className="text-sm text-foreground/90">{proposal.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {proposal.due_date ? dayLabel(proposal.due_date, today) : 'today'}
            {proposal.first_step ? ` · start: ${proposal.first_step}` : ''}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={() => confirm.mutate(proposal)}>
          <Check className="h-3.5 w-3.5 mr-1" /> Add it
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => decline.mutate(proposal.id)}>
          <X className="h-3.5 w-3.5 mr-1" /> No thanks
        </Button>
      </div>
    </div>
  );
}

/** All open proposals raised on one surface. */
export function CaptureChips({ surface }: { surface: string }) {
  const { data: proposals } = useCaptureProposals(surface);
  if (!proposals?.length) return null;
  return (
    <div className="space-y-2">
      {proposals.map(p => (
        <CaptureChip key={p.id} proposal={p} />
      ))}
    </div>
  );
}

export default CaptureChips;
