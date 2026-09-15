import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getToday } from '@/lib/time-utils';
import { useAuth } from '@/hooks/useAuth';
import { loadLedger, nextSeal, recordSeal, saveLedger } from '@/lib/wax-seal';

type Milestone = { id: string; label: string; detail: string; earned: boolean };

/**
 * Marks at most one earned milestone per month, quietly.
 * No confetti, no ranking — a plain note and a calm toast, once.
 */
export function useMilestoneSeal(milestones: Milestone[] | undefined) {
  const { user } = useAuth();
  const [sealed, setSealed] = useState<Milestone | null>(null);

  useEffect(() => {
    if (!milestones?.length || !user) return;
    const today = getToday();
    // Keyed by person so a teammate on the same front-desk PC never inherits
    // (or suppresses) someone else's milestones.
    const ledger = loadLedger(localStorage, user.id);
    const id = nextSeal(
      milestones.filter(m => m.earned).map(m => m.id),
      today,
      ledger
    );
    if (!id) return;

    const milestone = milestones.find(m => m.id === id);
    if (!milestone) return;

    saveLedger(recordSeal(id, today, ledger), localStorage, user.id);
    setSealed(milestone);
    toast(milestone.label, { description: milestone.detail, duration: 6000 });
  }, [milestones, user]);

  return sealed;
}
