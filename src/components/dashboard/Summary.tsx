import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { CloseoutDayCell, HomeSummary } from '@/lib/home-brief';
import { StatusDot, focusRing, interactive, panelClass, toneText } from './kit';

/**
 * The status board at the top of an admin Home: the office state as a
 * headline, everyone on today's roster as a chip with their own status
 * (the chips fill the width they have), the last office days' closeout
 * states as a strip, and at most three genuine priorities, each linked.
 * Routine status is calm; nothing here repeats the queue's count or the
 * meters.
 */

const CELL: Record<CloseoutDayCell['state'], string> = {
  sealed: 'bg-primary/80',
  saved: 'bg-warning',
  missing: 'bg-destructive/20 ring-1 ring-inset ring-destructive/70',
  today: 'border border-dashed border-muted-foreground/60 bg-transparent',
};

function stripCaption(cells: CloseoutDayCell[]): string {
  const missing = cells.filter(c => c.state === 'missing');
  const saved = cells.filter(c => c.state === 'saved').length;
  const parts: string[] = [];
  if (missing.length === 0) parts.push('every office day recorded');
  else if (missing.length === 1) parts.push(`1 missing (${missing[0].label.split(' · ')[0]})`);
  else parts.push(`${missing.length} missing (${missing[0].label.split(' · ')[0]} – ${missing[missing.length - 1].label.split(' · ')[0]})`);
  if (saved > 0) parts.push(`${saved} not sealed`);
  return parts.join(' · ');
}

function CloseoutStrip({ cells }: { cells: CloseoutDayCell[] }) {
  return (
    <div data-home-closeout-strip className="min-w-0">
      <p className="text-[13px] font-semibold text-muted-foreground">Closeouts · last {cells.length} office days</p>
      <ol className="mt-2 flex flex-wrap items-center gap-1" aria-label="Closeouts by office day">
        {cells.map(c => (
          <li key={c.date}>
            <Link
              to={c.href}
              aria-label={c.label}
              title={c.label}
              data-state={c.state}
              className={cn('block h-4 w-4 rounded-[3px] hover:ring-2 hover:ring-primary/40', CELL[c.state], interactive, focusRing)}
            />
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[13px] leading-snug text-muted-foreground">{stripCaption(cells)}</p>
    </div>
  );
}

export function SummaryPanel({ summary, title }: { summary: HomeSummary; title: string }) {
  const hasLines = summary.lines.length > 0;
  const people = summary.who.flatMap(g => g.people.map(p => ({ ...p, group: g.label })));
  const hasStrip = summary.closeoutStrip.length > 0;
  return (
    <section aria-label={title} className={cn(panelClass, 'px-5 py-4 sm:px-6')}>
      <div className={cn('grid gap-x-8 gap-y-4', hasStrip && 'lg:grid-cols-[minmax(0,1fr)_auto]')}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-[13px] font-semibold text-primary">{title}</p>
            <p className="text-[13px] text-muted-foreground">{summary.detail}</p>
          </div>
          <p className={cn('mt-1 text-[clamp(1.15rem,2.2vw,1.4rem)] font-bold leading-snug tracking-[-0.01em]', summary.tone === 'attention' && 'text-[hsl(30_80%_32%)] dark:text-warning')}>
            {summary.headline}
          </p>
          {people.length > 0 && (
            <ul data-home-roster className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-x-4 gap-y-2" aria-label="Who is where">
              {people.map(p => (
                <li key={p.id} className="flex min-w-0 items-center gap-2 text-[14px] leading-snug">
                  <StatusDot tone={p.tone} />
                  <span className="min-w-0 truncate font-medium">{p.name}</span>
                  <span className={cn('shrink-0 text-[13px]', p.tone === 'attention' || p.tone === 'urgent' ? toneText[p.tone] : 'text-muted-foreground')}>
                    {p.group}{p.note ? ` · ${p.note}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {hasStrip && (
          <div className="lg:border-l lg:border-border lg:pl-6">
            <CloseoutStrip cells={summary.closeoutStrip} />
          </div>
        )}
      </div>
      {hasLines ? (
        <ul className="mt-3 space-y-1.5 border-t border-border pt-3">
          {summary.lines.map(l => (
            <li key={l.id} className="flex items-start gap-2.5 text-[15px] leading-snug">
              <StatusDot tone={l.tone} className="mt-[7px]" />
              {l.href ? (
                <Link to={l.href} className={cn('rounded-sm underline decoration-border underline-offset-4 hover:decoration-current', l.tone === 'calm' ? 'text-foreground/85' : toneText[l.tone], interactive, focusRing)}>
                  {l.text}
                </Link>
              ) : (
                <span className={l.tone === 'calm' ? 'text-foreground/85' : toneText[l.tone]}>{l.text}</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 border-t border-border pt-3 text-[14px] text-muted-foreground">Nothing needs your attention right now.</p>
      )}
    </section>
  );
}
