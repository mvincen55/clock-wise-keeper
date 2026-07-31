import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useClockAction } from '@/hooks/useTimeEntries';
import { useChecklistGating } from '@/hooks/useChecklistGating';
import { useMessagingSettings } from '@/hooks/useMessagingSettings';
import { DEFAULT_MESSAGING_SETTINGS } from '@/lib/messaging-settings';

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/**
 * Wraps useClockAction: clock-out is intercepted while daily per-person
 * checklist items are open. The punch is never withheld once the member
 * chooses to bypass — nobody gets trapped at the office.
 */
export function useGuardedClockAction() {
  const clockAction = useClockAction();
  const { data: gating } = useChecklistGating();
  const { data: messaging } = useMessagingSettings();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bypassing, setBypassing] = useState(false);

  const doctorLabel = messaging?.doctor_recipient_label ?? DEFAULT_MESSAGING_SETTINGS.doctor_recipient_label;

  const run = (action: 'clock_in' | 'clock_out') => {
    if (action === 'clock_out' && (gating?.incompleteCount ?? 0) > 0) {
      setDialogOpen(true);
      return;
    }
    clockAction.mutate(action);
  };

  const bypassAndClockOut = async (reason: string) => {
    setBypassing(true);
    let escalationLevel = 1;
    try {
      const { data } = await supabase.functions.invoke('checklist-bypass', {
        body: { reason: reason?.trim() || null },
      });
      if (data?.recorded) escalationLevel = data.escalation_level ?? 1;
    } catch (e) {
      // Recording the bypass must never block the punch.
      console.error('checklist-bypass call failed', e);
    }

    setDialogOpen(false);
    setBypassing(false);
    clockAction.mutate('clock_out');
    qc.invalidateQueries({ queryKey: ['checklist-bypasses'] });

    if (escalationLevel > 1) {
      toast.warning(
        `This is your ${ordinal(escalationLevel)} clock-out with an unanswered checklist bypass. Your manager and ${doctorLabel} have been notified again — this needs an answer.`,
        { duration: 10000 }
      );
    } else {
      toast.info(`Clocked out. Your manager and ${doctorLabel} were notified about the open checklist items.`);
    }
  };

  return {
    run,
    isPending: clockAction.isPending || bypassing,
    dialogOpen,
    closeDialog: () => setDialogOpen(false),
    bypassAndClockOut,
    bypassing,
    incompleteCount: gating?.incompleteCount ?? 0,
    openSharedCount: gating?.openSharedCount ?? 0,
    lastAction: clockAction,
  };
}
