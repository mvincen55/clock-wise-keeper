import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  Figure, PersonStatus, ProgressRow, RoleContext, RoleLane, Shortcut, Signal, TimelineRow, Tone,
} from './types';

/**
 * The authenticated dashboard kit.
 *
 * Same family as the public surfaces — hard rules, mono micro-labels, heavy
 * display numerals, no rounded card soup — but rendered in the OFFICE's
 * semantic tokens so the office identity stays primary.
 */

export const toneText: Record<Tone, string> = {
  urgent: 'text-destructive',
  attention: 'text-warning',
  steady: 'text-primary',
  calm: 'text-muted-foreground',
};

export const toneDot: Record<Tone, string> = {
  urgent: 'bg-destructive',
  attention: 'bg-warning',
  steady: 'bg-success',
  calm: 'bg-muted-foreground/40',
};

/** Status is never colour alone — every dot carries its own text label. */
export function StatusDot({ tone, className }: { tone: Tone; className?: string }) {
  return <span aria-hidden className={cn('inline-block h-2 w-2 shrink-0', toneDot[tone], className)} />;
}

export function MicroLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('min-w-0 break-words font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground', className)}>
      {children}
    </p>
  );
}

/** A titled region. One rule, no box. */
export function Band({
  title,
  count,
  action,
  children,
  className,
}: {
  title: string;
  count?: string;
  action?: { label: string; to: string };
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('min-w-0', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-foreground pb-2">
        <div className="flex min-w-0 items-baseline gap-3">
          <MicroLabel className="text-foreground/70">{title}</MicroLabel>
          {count && <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{count}</span>}
        </div>
        {action && (
          <Link
            to={action.to}
            className="group inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-primary hover:underline"
          >
            {action.label}
            <ArrowUpRight className="h-3 w-3 transition-transform group-hover:-translate-y-0.5" />
          </Link>
        )}
      </div>
      <div className="mt-1">{children}</div>
    </section>
  );
}

/** A ruled, scannable row. Replaces one-card-per-fact. */
export function Row({
  children,
  to,
  className,
}: {
  children: ReactNode;
  to?: string;
  className?: string;
}) {
  const base = cn(
    'flex items-center gap-3 border-b border-border py-3 text-left transition-colors',
    to && 'hover:bg-muted/60',
    className,
  );
  if (!to) return <div className={base}>{children}</div>;
  return (
    <Link to={to} className={base}>
      {children}
    </Link>
  );
}

export function SignalRow({ signal }: { signal: Signal }) {
  return (
    <Row to={signal.href}>
      <StatusDot tone={signal.tone} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium leading-snug">{signal.label}</p>
        {signal.detail && (
          <p className="truncate text-[12.5px] leading-snug text-muted-foreground">{signal.detail}</p>
        )}
      </div>
      {signal.value && (
        <span
          className={cn(
            'font-display text-[1.35rem] font-bold leading-none tabular-nums',
            toneText[signal.tone],
          )}
        >
          {signal.value}
        </span>
      )}
    </Row>
  );
}

export function EmptyLine({ children }: { children: ReactNode }) {
  return (
    <div className="border-b border-border py-4">
      <p className="text-[13px] text-muted-foreground">{children}</p>
    </div>
  );
}

/**
 * The command strip: the numbers that answer "how are we doing" before any
 * reading happens. Dominant on desktop, a two-up block on mobile.
 */
export function FigureStrip({ figures, invert }: { figures: Figure[]; invert?: boolean }) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 sm:grid-cols-4',
        invert ? 'divide-primary-foreground/20' : 'divide-border',
        'divide-x divide-y sm:divide-y-0',
      )}
    >
      {figures.map((f) => {
        const body = (
          <>
            <p
              className={cn(
                'font-display text-[clamp(1.9rem,5vw,3rem)] font-extrabold leading-[0.85] tabular-nums tracking-[-0.03em]',
                invert
                  ? 'text-primary-foreground'
                  : f.tone
                    ? toneText[f.tone]
                    : 'text-foreground',
              )}
            >
              {f.value}
            </p>
            <p
              className={cn(
                'mt-2 font-mono text-[10px] uppercase leading-tight tracking-[0.14em]',
                invert ? 'text-primary-foreground/70' : 'text-muted-foreground',
              )}
            >
              {f.label}
            </p>
            {f.detail && (
              <p
                className={cn(
                  'mt-1 text-[11.5px] leading-tight',
                  invert ? 'text-primary-foreground/60' : 'text-muted-foreground',
                )}
              >
                {f.detail}
              </p>
            )}
          </>
        );
        return f.href ? (
          <Link key={f.id} to={f.href} className="block px-4 py-5 transition-opacity hover:opacity-75 sm:px-5">
            {body}
          </Link>
        ) : (
          <div key={f.id} className="px-4 py-5 sm:px-5">
            {body}
          </div>
        );
      })}
    </div>
  );
}

/** Progress as a hard bar, never a decorative chart. */
export function ProgressLine({ row }: { row: ProgressRow }) {
  const pct = row.total > 0 ? Math.round((row.done / row.total) * 100) : 0;
  const inner = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <p className="truncate text-[13.5px] font-medium">{row.label}</p>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {row.done}/{row.total}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full bg-muted">
        <div
          className={cn('h-full transition-[width] duration-700', pct >= 100 ? 'bg-success' : 'bg-primary')}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      {row.detail && <p className="mt-1.5 text-[12px] text-muted-foreground">{row.detail}</p>}
    </>
  );
  return (
    <div className="border-b border-border py-3.5">
      {row.href ? (
        <Link to={row.href} className="block transition-opacity hover:opacity-75">
          {inner}
        </Link>
      ) : (
        inner
      )}
    </div>
  );
}

/** One line per person. Reads as a roster sheet, not as avatars in a grid. */
export function PersonRow({ person }: { person: PersonStatus }) {
  return (
    <div className="flex items-center gap-3 border-b border-border py-2.5">
      <StatusDot tone={person.tone} />
      <p className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{person.name}</p>
      <span className={cn('font-mono text-[10.5px] uppercase tracking-[0.1em]', toneText[person.tone])}>
        {person.status}
      </span>
    </div>
  );
}

export function TimelineLine({ row }: { row: TimelineRow }) {
  return (
    <div className="grid grid-cols-[3.5rem_1fr] gap-3 border-b border-border py-2.5">
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{row.time}</span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <StatusDot tone={row.tone} />
          <p className="truncate text-[13.5px]">{row.label}</p>
        </div>
        {row.detail && <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{row.detail}</p>}
      </div>
    </div>
  );
}

/**
 * Page masthead. The office name leads; Purple Envelope is not mentioned —
 * attribution stays in the shell footer.
 */
export function Masthead({
  officeName,
  roleLabel,
  title,
  dateLabel,
  timeLabel,
  right,
}: {
  officeName: string;
  roleLabel: string;
  title: string;
  dateLabel: string;
  timeLabel: string;
  right?: ReactNode;
}) {
  return (
    <div className="border-b-2 border-foreground pb-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <MicroLabel>
          {officeName} · {roleLabel}
        </MicroLabel>
        <MicroLabel>
          {dateLabel} · {timeLabel}
        </MicroLabel>
      </div>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-[clamp(1.75rem,5.5vw,3.1rem)] font-extrabold uppercase leading-[0.88] tracking-[-0.035em]">
          {title}
        </h1>
        {right}
      </div>
    </div>
  );
}

/** Page frame: wide, gutter-consistent, and never centred in a narrow column. */
export function DashboardShell({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6 md:px-8 md:py-8">{children}</div>;
}

/**
 * "My view" context line: permission tier, primary operational role, and any
 * backup roles. It is a LABEL, not a switch — it never changes permission, and
 * the underlying links are already filtered to what the tier can open.
 */
export function ViewContext({ context }: { context: RoleContext }) {
  const { tierLabel, primaryLabel, secondaryLabels, coveringTodayLabels } = context;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
      <span className="text-foreground/70">{tierLabel}</span>
      {primaryLabel && (
        <>
          <span aria-hidden>/</span>
          <span>My view: {primaryLabel}</span>
        </>
      )}
      {secondaryLabels.length > 0 && (
        <>
          <span aria-hidden>/</span>
          <span>
            Also covering: {secondaryLabels.join(', ')}
            {coveringTodayLabels.length > 0 ? ' · today' : ''}
          </span>
        </>
      )}
    </div>
  );
}

/** Shortcut list for an operational-role lane. Reads as an index, not buttons. */
export function ShortcutList({ shortcuts }: { shortcuts: Shortcut[] }) {
  if (shortcuts.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3">
      {shortcuts.map((s) => (
        <Link
          key={s.id}
          to={s.to}
          className="group flex min-w-0 items-center justify-between gap-2 bg-background px-3 py-3 transition-colors hover:bg-muted/70"
        >
          <span className="truncate text-[13px] font-medium">{s.label}</span>
          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5" />
        </Link>
      ))}
    </div>
  );
}

/**
 * One operational-role lane. Primary reads full; a backup lane stays compact
 * and clearly labelled so two roles never compete for the same attention.
 */
export function Lane({ lane }: { lane: RoleLane }) {
  const compact = lane.kind === 'backup';
  return (
    <section className={cn('min-w-0', compact && 'border-l-2 border-border pl-4')}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-foreground pb-2">
        <MicroLabel className="text-foreground/70">
          {compact ? 'Also covering' : 'My work'} · {lane.label}
        </MicroLabel>
        {lane.note && (
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{lane.note}</span>
        )}
      </div>
      {!compact && <p className="mt-2 max-w-[52ch] text-[13px] leading-snug text-muted-foreground">{lane.mission}</p>}
      {lane.urgent.length > 0 && (
        <div className="mt-2">
          {lane.urgent.map((s) => (
            <SignalRow key={s.id} signal={s} />
          ))}
        </div>
      )}
      <div className="mt-3">
        <ShortcutList shortcuts={lane.shortcuts} />
      </div>
    </section>
  );
}

/** Primary lane first, then backup lanes, compact. */
export function Lanes({ lanes, className }: { lanes: RoleLane[]; className?: string }) {
  if (lanes.length === 0) return null;
  const primary = lanes.filter((l) => l.kind === 'primary');
  const backup = lanes.filter((l) => l.kind === 'backup');
  return (
    <div className={cn('space-y-6', className)}>
      {primary.map((l) => (
        <Lane key={l.role} lane={l} />
      ))}
      {backup.map((l) => (
        <Lane key={l.role} lane={l} />
      ))}
    </div>
  );
}
