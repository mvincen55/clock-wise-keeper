import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { TodayBand, TodayException } from '@/lib/home-brief';
import type { Signal } from './types';
import { Arrow, Panel, SignalRow, StatusDot, actionClass, focusRing, interactive, toneText } from './kit';

/** A person who is an exception today. Links to their item when one exists. */
export function ExceptionRow({ person }: { person: TodayException }) {
  const inner = (
    <>
      <StatusDot tone={person.tone} />
      <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{person.name}</span>
      <span className={cn('text-[13px] font-medium', toneText[person.tone])}>{person.status}</span>
      {person.action && (
        <span className={actionClass}>
          {person.action}
          <Arrow />
        </span>
      )}
    </>
  );
  const base = 'flex min-h-11 items-center gap-3 border-b border-border py-2.5 last:border-b-0';
  return person.href ? (
    <Link to={person.href} className={cn(base, 'group rounded-md hover:bg-muted/50', interactive, focusRing)}>{inner}</Link>
  ) : (
    <div className={base}>{inner}</div>
  );
}

/** The one count line under the exceptions: who is in, who comes later, or why nobody is marked. */
export function todayLine(today: TodayBand): string {
  if (today.asOf) return today.asOf === 'loading' ? 'Reading today’s roster…' : 'The roster could not be read. Nobody is marked in or out.';
  if (today.exceptions.length === 0 && (today.phase === 'open' || today.phase === 'unknown_hours')) return `Everyone scheduled is in · ${today.countLine}`;
  return today.countLine;
}

/**
 * Today, for an owner or a manager: any attendance fact the day has already
 * made true (a no-punch day, a missing clock-out), the exceptions (anyone
 * who needs a look, anyone off), then one count line. Never a roster — the
 * board at the top names everyone, with their schedule a hover away. After
 * close the wrap-up list carries the exceptions, so only the count remains.
 */
export function TodayPanel({ today, wrapUp = false, signals = [] }: { today: TodayBand; wrapUp?: boolean; signals?: Signal[] }) {
  return (
    <Panel
      title="Today"
      action={{ label: 'People', to: '/management/people' }}
      description={today.scheduled > 0 ? `${today.scheduled} scheduled` : undefined}
    >
      {signals.map(s => <SignalRow key={s.id} signal={s} />)}
      {!wrapUp && today.exceptions.map(p => <ExceptionRow key={p.id} person={p} />)}
      <p className={cn('py-2 text-[14px]', today.asOf === 'unavailable' ? 'text-[hsl(30_80%_32%)] dark:text-warning' : 'text-muted-foreground')}>{todayLine(today)}</p>
    </Panel>
  );
}
