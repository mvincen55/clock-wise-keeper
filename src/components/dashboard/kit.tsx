import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type {
  Figure, PersonStatus, ProgressRow, RoleContext, RoleLane, Shortcut, Signal, TimelineRow, Tone, ToolGroup,
} from './types';

/**
 * The authenticated dashboard kit — one visual system for every role.
 *
 * Clean neutral page, white cards with a clear boundary and a restrained
 * shadow, body text at 15px, labels at 13px, key numbers prominent. Purple
 * guides interaction (links, primary actions, selected controls); amber
 * and red appear only where something needs attention. Motion is limited
 * to short color and transform transitions and respects reduced motion.
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

/** Soft tints for chips and callouts, by tone. */
export const toneChip: Record<Tone, string> = {
  urgent: 'bg-destructive/10 text-destructive',
  attention: 'bg-warning/15 text-[hsl(30_80%_32%)] dark:text-warning',
  steady: 'bg-success/12 text-[hsl(145_60%_28%)] dark:text-success',
  calm: 'bg-muted text-muted-foreground',
};

/** The shared card surface. */
export const panelClass = 'rounded-xl border border-border bg-card shadow-[0_1px_2px_hsl(220_25%_10%/0.04),0_6px_20px_hsl(220_25%_10%/0.04)]';

/** The shared interactive transition, quiet and reduced-motion safe. */
export const interactive = 'transition-colors duration-150 motion-reduce:transition-none';

/** The text style of a row-level action: purple, 13.5px, one arrow. */
export const actionClass = cn('inline-flex shrink-0 items-center gap-1 text-[13.5px] font-medium text-primary', interactive);

export const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

/** Status is never color alone — every dot sits beside its own text. */
export function StatusDot({ tone, className }: { tone: Tone; className?: string }) {
  return <span aria-hidden className={cn('inline-block h-2 w-2 shrink-0 rounded-full', toneDot[tone], className)} />;
}

/** A small, readable section label. Sentence case, no letter-spacing tricks. */
export function SectionLabel({ children, className, as: Tag = 'p' }: { children: ReactNode; className?: string; as?: 'p' | 'span' | 'h2' | 'h3' }) {
  return <Tag className={cn('text-[13px] font-semibold leading-snug text-muted-foreground', className)}>{children}</Tag>;
}

/** Kept for older callers; reads like SectionLabel now. */
export const MicroLabel = SectionLabel;

/** A tone chip with text: "Behind pace", "Partial data", "3 now". */
export function Chip({ tone = 'calm', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex min-h-6 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium leading-none', toneChip[tone], className)}>
      {children}
    </span>
  );
}

/** A count badge for a panel header. */
export function CountBadge({ count, tone = 'steady' }: { count: number; tone?: Tone }) {
  if (count <= 0) return null;
  return (
    <span className={cn('inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-[12.5px] font-semibold tabular-nums', tone === 'calm' ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground')}>
      {count}
    </span>
  );
}

type LinkVariant = 'primary' | 'secondary' | 'ghost' | 'text';

const linkVariant: Record<LinkVariant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  secondary: 'border border-primary/30 bg-card text-primary hover:bg-primary/[0.06]',
  ghost: 'text-primary hover:bg-primary/[0.06]',
  text: 'text-primary underline-offset-4 hover:underline',
};

/** The one arrow every action carries; it nudges right on hover unless motion is reduced. */
export function Arrow() {
  return <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />;
}

/** A link that reads as an action. Comfortable to tap, purple, one arrow. */
export function ActionLink({ to, children, variant = 'secondary', className, arrow = true, size = 'md', title }: {
  to: string; children: ReactNode; variant?: LinkVariant; className?: string; arrow?: boolean; size?: 'sm' | 'md'; title?: string;
}) {
  return (
    <Link
      to={to}
      title={title}
      className={cn(
        'group inline-flex shrink-0 items-center gap-1.5 rounded-full font-medium', interactive, focusRing,
        variant === 'text' ? 'text-[14px]' : size === 'sm' ? 'min-h-8 px-3 text-[13px]' : 'min-h-10 px-4 text-[14px]',
        linkVariant[variant], className,
      )}
    >
      {children}
      {arrow && <Arrow />}
    </Link>
  );
}

/**
 * A titled card. The header carries the title, an optional count, an
 * optional action; the body is the caller's. Every panel on Home is one of
 * these, so boundaries, spacing, and headings match everywhere.
 */
export function Panel({
  id,
  title,
  count,
  countTone,
  action,
  aside,
  children,
  className,
  bodyClassName,
  tone,
  description,
}: {
  id?: string;
  title: ReactNode;
  count?: number;
  countTone?: Tone;
  action?: { label: string; to: string };
  /** Anything else for the header's right side (an info control, a switch). */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** A tinted left edge for a panel that needs attention. */
  tone?: Tone;
  description?: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-label={typeof title === 'string' ? title : undefined}
      className={cn(panelClass, 'min-w-0 overflow-hidden', tone === 'attention' && 'border-l-4 border-l-warning', tone === 'urgent' && 'border-l-4 border-l-destructive', className)}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 pb-2 pt-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <h2 className="text-[16px] font-semibold leading-snug text-foreground">{title}</h2>
          {count !== undefined && <CountBadge count={count} tone={countTone} />}
        </div>
        <div className="flex items-center gap-2">
          {aside}
          {action && (
            <ActionLink to={action.to} variant="text" size="sm">
              {action.label}
            </ActionLink>
          )}
        </div>
        {description && <p className="basis-full text-[13.5px] leading-snug text-muted-foreground">{description}</p>}
      </header>
      <div className={cn('px-5 pb-5 sm:px-6', bodyClassName)}>{children}</div>
    </section>
  );
}

/**
 * The compact information control: an ⓘ that discloses the caveats — date
 * range, cutoff, completeness, comparison basis — on demand, so the panel
 * itself stays readable.
 */
export function InfoPopover({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-home-control="info"
          aria-label={label}
          className={cn('inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground', interactive, focusRing, className)}
        >
          <Info className="h-4 w-4" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] p-4 text-[13.5px] leading-snug">
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** A definition list for the info control: label → value. */
export function InfoList({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="space-y-2">
      {rows.map(r => (
        <div key={r.label} className="grid grid-cols-[7rem_1fr] gap-2">
          <dt className="text-muted-foreground">{r.label}</dt>
          <dd className="min-w-0 break-words font-medium text-foreground">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A key number: prominent value, readable label, one line of context. */
export function Stat({ value, label, detail, tone, href, size = 'md', className }: {
  value: ReactNode; label: string; detail?: ReactNode; tone?: Tone; href?: string; size?: 'sm' | 'md' | 'lg'; className?: string;
}) {
  const body = (
    <>
      <p className="text-[13px] font-semibold text-muted-foreground">{label}</p>
      <p className={cn('mt-1 font-display font-bold leading-none tabular-nums tracking-[-0.02em]', size === 'lg' ? 'text-[2rem]' : size === 'md' ? 'text-[1.65rem]' : 'text-[1.35rem]', tone ? toneText[tone] : 'text-foreground')}>
        {value}
      </p>
      {detail && <div className="mt-1.5 text-[13px] leading-snug text-muted-foreground">{detail}</div>}
    </>
  );
  if (href) {
    return (
      <Link to={href} className={cn('block min-w-0 rounded-lg hover:bg-muted/60', interactive, focusRing, className)}>
        {body}
      </Link>
    );
  }
  return <div className={cn('min-w-0', className)}>{body}</div>;
}

/** A ruled, scannable row. Replaces one-card-per-fact. */
export function Row({ children, to, className }: { children: ReactNode; to?: string; className?: string }) {
  const base = cn('flex min-h-11 items-center gap-3 border-b border-border py-3 text-left last:border-b-0', to && cn('hover:bg-muted/50', interactive, focusRing), className);
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
        <p className="text-[15px] font-medium leading-snug">{signal.label}</p>
        {signal.detail && <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{signal.detail}</p>}
      </div>
      {signal.value && (
        <span className={cn('font-display text-[1.35rem] font-bold leading-none tabular-nums', toneText[signal.tone])}>{signal.value}</span>
      )}
    </Row>
  );
}

export function EmptyLine({ children }: { children: ReactNode }) {
  return (
    <div className="py-3">
      <p className="text-[14px] text-muted-foreground">{children}</p>
    </div>
  );
}

/**
 * A designed empty state. Empty is a real production experience, not an edge
 * case, and each one declares what its emptiness MEANS:
 *  - `good`    — genuinely clear; say so once, no action needed.
 *  - `neutral` — nothing yet (e.g. not enough history); no action needed.
 *  - `setup`   — incomplete setup; offers the one action that changes it.
 *  - `error`   — a source failed; nothing here is confirmed.
 */
export function EmptyState({
  tone = 'neutral',
  title,
  detail,
  action,
  compact,
}: {
  tone?: 'good' | 'neutral' | 'setup' | 'error';
  title: string;
  detail?: string;
  action?: { label: string; to: string };
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border px-4', compact ? 'py-3' : 'py-4',
        tone === 'good' && 'border-success/25 bg-success/[0.06]',
        tone === 'neutral' && 'border-border bg-muted/40',
        tone === 'setup' && 'border-primary/25 bg-primary/[0.05]',
        tone === 'error' && 'border-warning/40 bg-warning/[0.08]',
      )}
    >
      <p className={cn('text-[15px] font-semibold leading-snug', tone === 'good' ? 'text-[hsl(145_60%_28%)] dark:text-success' : tone === 'setup' ? 'text-primary' : 'text-foreground')}>
        {title}
      </p>
      {detail && <p className="mt-1 text-[13.5px] leading-snug text-muted-foreground">{detail}</p>}
      {action && (
        <ActionLink to={action.to} variant="primary" size="sm" className="mt-3">
          {action.label}
        </ActionLink>
      )}
    </div>
  );
}

/** Skeleton lines for a panel that is still reading. */
export function LoadingLines({ lines = 3, label = 'Reading…' }: { lines?: number; label?: string }) {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-2.5 py-1">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-3.5 rounded bg-muted motion-safe:animate-pulse" style={{ width: `${78 - i * 14}%` }} />
      ))}
      <p className="text-[13px] text-muted-foreground">{label}</p>
    </div>
  );
}

/**
 * The utility strip: a few numbers the person reaches for. Dominant
 * numbers, readable labels, two-up on a phone.
 */
export function FigureStrip({ figures }: { figures: Figure[] }) {
  return (
    <div className={cn('grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border', figures.length >= 3 ? 'sm:grid-cols-3' : '')}>
      {figures.map(f => {
        const body = (
          <>
            <p className="text-[13px] font-semibold text-muted-foreground">{f.label}</p>
            <p className={cn('mt-1 font-display text-[1.5rem] font-bold leading-none tabular-nums tracking-[-0.02em]', f.tone ? toneText[f.tone] : 'text-foreground')}>{f.value}</p>
            {f.detail && <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">{f.detail}</p>}
          </>
        );
        return f.href ? (
          <Link key={f.id} to={f.href} className={cn('block min-w-0 bg-card px-4 py-3.5 hover:bg-muted/50', interactive, focusRing)}>
            {body}
          </Link>
        ) : (
          <div key={f.id} className="min-w-0 bg-card px-4 py-3.5">
            {body}
          </div>
        );
      })}
    </div>
  );
}

/** Progress as a plain bar with its numbers, never a decorative chart. */
export function ProgressLine({ row }: { row: ProgressRow }) {
  const pct = row.total > 0 ? Math.round((row.done / row.total) * 100) : 0;
  const inner = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <p className="truncate text-[15px] font-medium">{row.label}</p>
        <span className="text-[13px] tabular-nums text-muted-foreground">
          {row.done}/{row.total}
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none', pct >= 100 ? 'bg-success' : 'bg-primary')} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      {row.detail && <p className="mt-1.5 text-[13px] text-muted-foreground">{row.detail}</p>}
    </>
  );
  return (
    <div className="border-b border-border py-3.5 last:border-b-0">
      {row.href ? (
        <Link to={row.href} className={cn('block rounded-md hover:bg-muted/40', interactive, focusRing)}>
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
    <div className="flex min-h-10 items-center gap-3 border-b border-border py-2 last:border-b-0">
      <StatusDot tone={person.tone} />
      <p className="min-w-0 flex-1 truncate text-[15px] font-medium">{person.name}</p>
      <span className={cn('text-[13px] font-medium', toneText[person.tone])}>{person.status}</span>
    </div>
  );
}

export function TimelineLine({ row }: { row: TimelineRow }) {
  return (
    <div className="grid grid-cols-[4rem_1fr] gap-3 border-b border-border py-2.5 last:border-b-0">
      <span className="text-[13px] tabular-nums text-muted-foreground">{row.time}</span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <StatusDot tone={row.tone} />
          <p className="truncate text-[15px]">{row.label}</p>
        </div>
        {row.detail && <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{row.detail}</p>}
      </div>
    </div>
  );
}

/**
 * Page header for Home: greeting, office state, date and time, the role
 * context, and the primary actions — visible without scrolling on a laptop,
 * stacked on a phone.
 */
export function HomeHeader({
  greeting,
  officeName,
  dateLabel,
  timeLabel,
  state,
  context,
  actions,
}: {
  greeting: string;
  officeName: string;
  dateLabel: string;
  timeLabel: string;
  /** The office state chip: "Open · 4 of 8 in". */
  state?: { text: string; tone: Tone };
  context?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <p className="text-[13.5px] text-muted-foreground">
          {officeName} · {dateLabel} · {timeLabel}
        </p>
        <h1 className="mt-1 text-[clamp(1.5rem,3vw,1.9rem)] font-bold leading-tight tracking-[-0.02em]">{greeting}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {state && (
            <Chip tone={state.tone}>
              <StatusDot tone={state.tone} />
              {state.text}
            </Chip>
          )}
          {context}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/**
 * The two-column Home layout: a main column and a narrower sidebar that
 * flow INDEPENDENTLY — the main column's next panel follows its previous
 * one whatever the sidebar's height, so a short queue never leaves a gap
 * above the financial block. Under `lg` the two columns dissolve
 * (`display: contents`) into one flex column and each slot's `order` sets
 * the reading order: the person's actions first, then today's status, then
 * the numbers.
 */
export function HomeColumns({ main, aside, className }: { main: ReactNode; aside: ReactNode; className?: string }) {
  return (
    <div data-home-columns className={cn('flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(19rem,22rem)] lg:items-start', className)}>
      <div data-home-column="main" className="contents lg:block lg:min-w-0 lg:space-y-4">{main}</div>
      <div data-home-column="aside" className="contents lg:block lg:min-w-0 lg:space-y-4">{aside}</div>
    </div>
  );
}

/** One panel's place in the Home columns: its mobile reading order, and no stretching. */
export function Slot({ order, children, className }: { order: number; children: ReactNode; className?: string }) {
  return <div data-home-slot className={cn('min-w-0', className)} style={{ order }}>{children}</div>;
}

/** Page frame: wide, gutter-consistent, and never centered in a narrow column. */
export function DashboardShell({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6 md:px-8 md:py-7">{children}</div>;
}

/**
 * "My view" context: permission tier, assigned operational role, and any
 * backup roles as small chips. A LABEL, not a switch — it grants nothing.
 */
export function ViewContext({ context }: { context: RoleContext }) {
  const { tierLabel, primaryLabel, secondaryLabels, coveringTodayLabels } = context;
  const backup = secondaryLabels.filter(l => !coveringTodayLabels.includes(l));
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
      <Chip tone="calm">{tierLabel}</Chip>
      {primaryLabel && <Chip tone="calm">{primaryLabel}</Chip>}
      {coveringTodayLabels.map(l => (
        <Chip key={l} tone="steady">Covering today: {l}</Chip>
      ))}
      {backup.map(l => (
        <Chip key={l} tone="calm">Backup: {l}</Chip>
      ))}
    </span>
  );
}

/** A tool tile: label, one line of detail, comfortable to tap. */
export function ToolTile({ tool }: { tool: Shortcut }) {
  return (
    <Link
      to={tool.to}
      className={cn('group flex min-h-[3.25rem] min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-card px-3.5 py-2.5 hover:border-primary/40 hover:bg-primary/[0.04]', interactive, focusRing)}
    >
      <span className="min-w-0">
        <span className="block truncate text-[14.5px] font-medium text-foreground">{tool.label}</span>
        {tool.detail && <span className="block truncate text-[12.5px] leading-snug text-muted-foreground">{tool.detail}</span>}
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-primary transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
    </Link>
  );
}

/**
 * The tools area: one organized place, the person's most relevant tools
 * first (their assigned role, today's coverage, management for admins),
 * with the backup roles and the long tail revealed by one control instead
 * of a second menu.
 */
export function ToolsPanel({ groups, id = 'tools' }: { groups: ToolGroup[]; id?: string }) {
  const [more, setMore] = useState(false);
  const primary = groups.filter(g => g.emphasis === 'primary');
  const secondary = groups.filter(g => g.emphasis === 'secondary');
  const secondaryCount = secondary.reduce((n, g) => n + g.tools.length, 0);
  if (groups.length === 0) return null;
  const renderGroup = (g: ToolGroup) => (
    <div key={g.id} className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <SectionLabel as="h3" className="text-foreground">{g.label}</SectionLabel>
        {g.note && <span className="text-[12.5px] text-muted-foreground">{g.note}</span>}
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {g.tools.map(t => <ToolTile key={t.id} tool={t} />)}
      </div>
    </div>
  );
  return (
    <Panel id={id} title="Tools" description="Your most relevant tools first. Every destination is checked by its own page and by the office’s access rules.">
      <div className="space-y-5">
        {primary.map(renderGroup)}
        {secondary.length > 0 && (
          <div>
            <button
              type="button"
              data-home-control="more-tools"
              aria-expanded={more}
              aria-controls={`${id}-more`}
              onClick={() => setMore(m => !m)}
              className={cn('inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border px-4 text-[14px] font-medium text-foreground hover:bg-muted', interactive, focusRing)}
            >
              {more ? 'Fewer tools' : `More tools · ${secondaryCount}`}
              <ChevronDown className={cn('h-4 w-4 transition-transform duration-150 motion-reduce:transition-none', more && 'rotate-180')} aria-hidden />
            </button>
            {more && (
              <div id={`${id}-more`} className="mt-4 space-y-5">
                {secondary.map(renderGroup)}
              </div>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}

/**
 * Coverage lanes: only the roles a person is covering TODAY contribute
 * time-sensitive items here, clearly labeled. A backup capability adds
 * nothing to the queue; its tools live in the tools area.
 */
export function Lanes({ lanes, className }: { lanes: RoleLane[]; className?: string }) {
  const covering = lanes.filter(l => l.kind === 'backup' && l.covering && l.urgent.length > 0);
  if (covering.length === 0) return null;
  return (
    <div className={cn('space-y-4', className)}>
      {covering.map(lane => (
        <Panel key={lane.role} title={`Covering today · ${lane.label}`} description={lane.mission}>
          {lane.urgent.map(s => <SignalRow key={s.id} signal={s} />)}
        </Panel>
      ))}
    </div>
  );
}

/** Kept for callers of the older API; the tools area replaced it. */
export function ShortcutList({ shortcuts }: { shortcuts: Shortcut[] }) {
  if (shortcuts.length === 0) return null;
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {shortcuts.map(s => <ToolTile key={s.id} tool={s} />)}
    </div>
  );
}
