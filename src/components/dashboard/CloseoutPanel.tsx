import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { DailyBrief } from '@/lib/owner-pulse';
import type { StatusLine } from '@/lib/home-brief';
import { Arrow, Chip, EmptyState, Panel, StatusDot, actionClass, focusRing, interactive, toneText } from './kit';

/** A status line: what it is, where it stands, and the one place to go. */
export function StatusRow({ line }: { line: StatusLine }) {
  return (
    <Link to={line.href} className={cn('group flex min-h-11 items-center gap-3 border-b border-border py-3 last:border-b-0 hover:bg-muted/50', interactive, focusRing)}>
      <StatusDot tone={line.tone} />
      <span className="min-w-0 flex-1 text-[15px] leading-snug">
        <span className="font-medium">{line.label}</span>{' '}
        <span className={cn(line.tone === 'attention' ? 'text-[hsl(30_80%_32%)] dark:text-warning' : line.tone === 'urgent' ? 'text-destructive' : 'text-muted-foreground')}>
          {line.text}
        </span>
      </span>
      {line.action && (
        <span className={actionClass}>
          {line.action}
          <Arrow />
        </span>
      )}
    </Link>
  );
}

/** "sealed" → Sealed · "saved, not sealed" → Not sealed · anything else capitalized. */
function stateLabel(text: string): string {
  if (text === 'sealed') return 'Sealed';
  if (text.startsWith('saved')) return 'Not sealed';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The latest closeout: its state and its facts in one compact panel. They
 * describe the same record, so they share one home. The state is a chip —
 * the queue carries the task of sealing an open day, so the panel never
 * repeats it as a second action — and with no closeout on record the panel
 * is the door to the first one.
 */
export function CloseoutPanel({ brief, lastDay, className }: { brief: DailyBrief | null; lastDay: StatusLine | null; className?: string }) {
  const hasFacts = !!brief && brief.scope !== 'none';
  const none = !!lastDay && lastDay.text.startsWith('none on record');
  const title = hasFacts ? brief.dayLabel : lastDay?.label ?? 'Latest closeout';
  const chip = lastDay && !none ? <Chip tone={lastDay.tone}>{stateLabel(lastDay.text)}</Chip> : undefined;
  return (
    <Panel
      title={title}
      aside={chip}
      action={{ label: 'Close the Day', to: '/deposit-log' }}
      description={hasFacts ? brief.note ?? undefined : undefined}
      className={className}
    >
      {none && hasFacts && lastDay && <StatusRow line={lastDay} />}
      {hasFacts ? (
        <dl className={cn('grid grid-cols-2 gap-x-4 gap-y-3', none && 'pt-3')}>
          {brief.facts.filter(f => f.id !== 'np-scheduled').map(f => (
            <div key={f.id} className="min-w-0">
              <dt className="text-[13px] font-semibold text-muted-foreground">{f.label}</dt>
              <dd className={cn('mt-0.5 font-display text-[1.35rem] font-bold leading-none tabular-nums tracking-[-0.02em]', f.tone === 'attention' ? toneText.attention : f.tone === 'urgent' ? toneText.urgent : 'text-foreground')}>{f.value}</dd>
              {f.detail && <dd className="mt-1 text-[12.5px] leading-snug text-muted-foreground">{f.detail}</dd>}
            </div>
          ))}
        </dl>
      ) : none || (brief && brief.scope === 'none') ? (
        <EmptyState
          tone="setup"
          title="No days have been closed out yet."
          detail={`${none ? 'None on record in the last two weeks. ' : ''}Production, collections, and missed appointments read straight off the deposit log.`}
          action={{ label: 'Close out a day', to: '/deposit-log' }}
          compact
        />
      ) : (
        <p className="py-2 text-[14px] text-muted-foreground" aria-busy="true">Reading the day’s numbers…</p>
      )}
    </Panel>
  );
}
