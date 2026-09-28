import { useMemo, useState } from 'react';
import { Clock3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LateArrivalPrompt } from '@/components/LateArrivalPrompt';
import { useAuth } from '@/hooks/useAuth';
import { useTardies, type TardyRow } from '@/hooks/useTardies';
import { awaitsEmployeeAnswer } from '@/lib/late-arrivals';
import { formatDate, getToday, shiftDate } from '@/lib/time-utils';

/** How far back the notice looks for arrivals still waiting on an answer. */
export const LATE_ARRIVAL_NOTICE_DAYS = 45;

/**
 * The signed-in person's late arrivals that still wait on their answer,
 * one line each with the prompt behind it. Renders nothing when there are
 * none. Dismissing the prompt leaves the line where it is: the notice is
 * the record talking, not a task that goes away when ignored.
 */
export function LateArrivalNotice() {
  const { user } = useAuth();
  const today = getToday();
  const { data: tardies } = useTardies(shiftDate(today, -LATE_ARRIVAL_NOTICE_DAYS), today);
  const [open, setOpen] = useState<TardyRow | null>(null);

  const waiting = useMemo(
    () => (tardies ?? []).filter(t => t.user_id === user?.id && awaitsEmployeeAnswer(t)).sort((a, b) => a.entry_date.localeCompare(b.entry_date)),
    [tardies, user?.id],
  );
  if (!user || waiting.length === 0) return null;

  return (
    <section aria-label="Late arrivals waiting on your answer" className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Clock3 className="h-4 w-4 text-warning" />
        {waiting.length === 1 ? 'A late arrival is waiting on your answer.' : `${waiting.length} late arrivals are waiting on your answer.`}
      </p>
      <p className="text-xs text-muted-foreground">
        Acknowledge it as unexcused, ask for it to be excused, or report an incorrect time. No explanation is required to acknowledge.
      </p>
      <ul className="divide-y divide-warning/20">
        {waiting.map(t => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm">
            <span>{formatDate(t.entry_date)} · {t.minutes_late} min late</span>
            <Button size="sm" variant="outline" onClick={() => setOpen(t)}>Answer</Button>
          </li>
        ))}
      </ul>
      <LateArrivalPrompt open={!!open} tardy={open} onClose={() => setOpen(null)} />
    </section>
  );
}
