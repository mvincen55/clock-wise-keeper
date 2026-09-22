import { useState } from 'react';
import { toast } from 'sonner';
import { Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useReversePtoApproval } from '@/hooks/usePtoRequests';
import { useSealDay } from '@/hooks/useDepositLog';
import { useWithdrawKnowledgeApproval } from '@/hooks/useKnowledge';
import { formatTime } from '@/lib/time-utils';
import ConfirmStep from './ConfirmStep';
import type { Reversal } from './AttentionKindActions';

/**
 * Runs an audited reversal from a Done row: reverse a PTO approval, unseal a
 * closeout, withdraw a knowledge approval. Each confirms in one sentence,
 * takes its reason, and appends a new event; nothing is undone in place.
 */
export default function ReversalButton({ reversal, onReversed }: { reversal: Exclude<Reversal, { kind: 'none' }>; onReversed: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const reversePto = useReversePtoApproval();
  const seal = useSealDay();
  const withdraw = useWithdrawKnowledgeApproval();
  const pending = reversePto.isPending || seal.isPending || withdraw.isPending;

  const run = async (reason: string) => {
    try {
      if (reversal.kind === 'pto_approval') await reversePto.mutateAsync({ id: reversal.requestId, reason });
      else if (reversal.kind === 'unseal') await seal.mutateAsync({ closeoutId: reversal.closeoutId, depositDate: reversal.depositDate, seal: false, reason });
      else await withdraw.mutateAsync({ versionId: reversal.versionId, note: reason });
      setOpen(false);
      onReversed(`${reversal.kind === 'pto_approval' ? 'Reversed' : reversal.kind === 'unseal' ? 'Unsealed' : 'Approval withdrawn'} · ${formatTime(new Date())}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not reverse this');
    }
  };

  if (!open) {
    return <Button variant="ghost" size="sm" className="mt-1 h-7 px-2 text-xs" onClick={() => setOpen(true)}><Undo2 className="mr-1 h-3.5 w-3.5" />{reversal.label}</Button>;
  }
  return (
    <div className="mt-2">
      <ConfirmStep sentence={reversal.sentence} confirmLabel={reversal.label} destructive pending={pending}
        reason={{ label: 'Reason (required)', min: 5 }} onConfirm={run} onCancel={() => setOpen(false)} />
    </div>
  );
}
