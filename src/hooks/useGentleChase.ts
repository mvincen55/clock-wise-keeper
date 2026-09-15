import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { getToday } from '@/lib/time-utils';
import { chaseMessage } from '@/lib/copilot';
import { useMyItems } from '@/hooks/useCopilot';
import { useAuth } from '@/hooks/useAuth';

/**
 * THE GENTLE CHASE.
 *
 * Reminders arrive at the moment of action, not in a pile: once at clock-in,
 * once mid-day if nothing has been touched. Never more. Quiet is a feature —
 * too many pings and the whole system gets ignored.
 */

const KEY = 'copilot_chase';

// Flags are per person: a shared front-desk PC must not let one teammate's
// morning reminder silence the next teammate's.
function alreadyChased(userId: string, phase: string, today: string): boolean {
  try {
    return localStorage.getItem(`${KEY}:${userId}:${phase}`) === today;
  } catch {
    return true;
  }
}

function markChased(userId: string, phase: string, today: string) {
  try {
    localStorage.setItem(`${KEY}:${userId}:${phase}`, today);
  } catch {
    /* fails open */
  }
}

/** Call once when the member clocks in. */
export function useClockInChase() {
  const { user } = useAuth();
  const { data: items } = useMyItems();
  const fired = useRef(false);

  return () => {
    if (!user) return;
    const today = getToday();
    if (fired.current || alreadyChased(user.id, 'clock_in', today)) return;
    const open = (items ?? []).filter(i => !i.done && (!i.due_date || i.due_date <= today));
    const message = chaseMessage(open.length, 'clock_in');
    if (!message) return;
    fired.current = true;
    markChased(user.id, 'clock_in', today);
    toast(message, { description: open[0]?.first_step ?? undefined });
  };
}

/** Mid-day check-in, only if nothing has been ticked off yet. */
export function useMiddayChase() {
  const { user } = useAuth();
  const { data: items } = useMyItems();

  useEffect(() => {
    if (!items || !user) return;
    const today = getToday();
    if (alreadyChased(user.id, 'midday', today)) return;
    const hour = Number(
      new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' }).format(
        new Date()
      )
    );
    if (hour < 12 || hour >= 16) return;
    const mine = items.filter(i => !i.due_date || i.due_date <= today);
    const open = mine.filter(i => !i.done);
    if (!open.length || mine.some(i => i.done)) return; // some progress: stay quiet
    const message = chaseMessage(open.length, 'midday');
    if (!message) return;
    markChased(user.id, 'midday', today);
    toast(message, { description: open[0]?.first_step ?? undefined });
  }, [items, user]);
}
