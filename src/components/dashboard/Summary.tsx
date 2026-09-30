import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { HomeSummary } from '@/lib/home-brief';
import { StatusDot, focusRing, interactive, panelClass, toneText } from './kit';

/**
 * The short summary at the top of an admin Home: the office state as a
 * headline, who is where by name, and at most three genuine priorities,
 * each one linked. Routine status is calm; nothing here repeats the queue's
 * count or the meters.
 */
export function SummaryPanel({ summary, title }: { summary: HomeSummary; title: string }) {
  const hasLines = summary.lines.length > 0;
  return (
    <section aria-label={title} className={cn(panelClass, 'px-5 py-4 sm:px-6')}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[13px] font-semibold text-primary">{title}</p>
        <p className="text-[13px] text-muted-foreground">{summary.detail}</p>
      </div>
      <p className={cn('mt-1 text-[clamp(1.15rem,2.2vw,1.4rem)] font-bold leading-snug tracking-[-0.01em]', summary.tone === 'attention' && 'text-[hsl(30_80%_32%)] dark:text-warning')}>
        {summary.headline}
      </p>
      {summary.who.length > 0 && (
        <p className="mt-1.5 text-[14px] leading-relaxed text-foreground/85" data-home-roster>
          {summary.who.map((g, i) => (
            <span key={g.id}>
              {i > 0 && <span className="text-muted-foreground"> · </span>}
              <span className={cn('font-semibold', g.tone === 'attention' ? toneText.attention : 'text-muted-foreground')}>{g.label}:</span> {g.names.join(', ')}
            </span>
          ))}
        </p>
      )}
      {hasLines ? (
        <ul className="mt-3 space-y-1.5">
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
        <p className="mt-2 text-[14px] text-muted-foreground">Nothing needs your attention right now.</p>
      )}
    </section>
  );
}
