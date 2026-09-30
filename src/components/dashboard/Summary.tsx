import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { HomeSummary, RosterPerson } from '@/lib/home-brief';
import { paceBasisLabel, type GoalMeter } from '@/lib/goal-progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { GoalBrief } from './types';
import { ActionLink, Chip, LoadingLines, StatusDot, focusRing, interactive, panelClass, toneText } from './kit';
import { GoalMeterRow } from './performance/GoalMeters';
import { ChallengeCard, challengeTone } from './ChallengeCard';

/**
 * The status board at the top of an admin Home, read top to bottom: the
 * office state as a headline; everyone on today's roster as a chip with
 * their own status — hover (or focus) shows their schedule for today and a
 * click opens their record in People; at most three genuine priorities,
 * each linked; then the month — production and collections against their
 * own goals on the office-day pace, and the office challenge with its
 * state. Routine status is calm; nothing here repeats the queue's count.
 *
 * The chips are plain links with a tooltip, not a hover card: a hover
 * card's trigger cancels the tap on touch devices, and on a phone the tap
 * is the whole point.
 */

/** The month's goals as the board shows them. */
export type MonthRow = {
  /** Production and collections against their own targets; null while loading. */
  meters: GoalMeter[] | null;
  loading: boolean;
  /** Whether this reader may set a goal (owners and managers). */
  canSetGoals: boolean;
  /** The office challenge, when one is running. */
  challenge: GoalBrief | null;
  /** Where a challenge awaiting verification is decided. */
  reviewHref?: string;
};

type BoardPerson = RosterPerson & { group: string };

/** One sentence for assistive technology: the status, the shift, remote, minutes late. */
function scheduleSentence(p: BoardPerson): string {
  const parts = [p.status];
  parts.push(p.shift ? `scheduled ${p.shift}` : 'no shift times on the schedule');
  if (p.remote) parts.push('working remotely');
  if (p.minutesLate) parts.push(`arrived ${p.minutesLate} minutes after the scheduled start`);
  return parts.join(', ');
}

function PersonChip({ person: p }: { person: BoardPerson }) {
  const noteTone = p.tone === 'attention' || p.tone === 'urgent' ? toneText[p.tone] : 'text-muted-foreground';
  return (
    <li className="min-w-0 max-w-full shrink-0">
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to={p.href}
            data-home-person={p.id}
            className={cn('group -mx-1.5 flex min-w-0 items-center gap-2 rounded-md px-1.5 py-0.5 text-[14px] leading-snug hover:bg-muted/70', interactive, focusRing)}
          >
            <StatusDot tone={p.tone} />
            <span className="min-w-0 truncate font-medium decoration-border underline-offset-4 group-hover:underline">{p.name}</span>
            <span className={cn('shrink-0 text-[13px]', noteTone)}>{p.group}{p.note ? ` · ${p.note}` : ''}</span>
          </Link>
        </TooltipTrigger>
        <TooltipPrimitive.Portal>
          <TooltipContent
            side="bottom"
            align="start"
            aria-label={`${p.name}: ${scheduleSentence(p)}. Opens their record in People.`}
            className="w-64 max-w-[calc(100vw-2rem)] px-3.5 py-3 text-[13.5px] leading-snug"
          >
            <p className="font-semibold text-foreground">{p.name}</p>
            <p className="mt-1 flex items-center gap-1.5 text-foreground/85">
              <StatusDot tone={p.tone} />
              {p.status}
            </p>
            <dl className="mt-2 space-y-1 text-muted-foreground">
              <div className="flex items-baseline justify-between gap-3">
                <dt>Today’s shift</dt>
                <dd className="text-right font-medium text-foreground">{p.shift ?? 'No times on the schedule'}</dd>
              </div>
              {p.remote && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt>Working</dt>
                  <dd className="text-right font-medium text-foreground">Remotely today</dd>
                </div>
              )}
              {p.minutesLate !== null && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt>Arrived</dt>
                  <dd className="text-right font-medium text-foreground">{p.minutesLate} min after the start</dd>
                </div>
              )}
            </dl>
            <p className="mt-2 text-[12.5px] font-medium text-primary">Open their record in People</p>
          </TooltipContent>
        </TooltipPrimitive.Portal>
      </Tooltip>
    </li>
  );
}

/**
 * Everyone on the roster. A phone reads the chips as one wrapped line;
 * from 40rem of width they sit in columns that fill the space they have.
 */
export function Roster({ people }: { people: BoardPerson[] }) {
  return (
    <TooltipProvider delayDuration={150} skipDelayDuration={500}>
      <div className="mt-3 [container-type:inline-size]">
        <ul
          data-home-roster
          aria-label="Who is where"
          className="flex flex-wrap gap-x-5 gap-y-1.5 [@container(min-width:40rem)]:grid [@container(min-width:40rem)]:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] [@container(min-width:40rem)]:gap-x-4 [@container(min-width:40rem)]:gap-y-2"
        >
          {people.map(p => <PersonChip key={p.id} person={p} />)}
        </ul>
      </div>
    </TooltipProvider>
  );
}

export function BriefPriorities({ summary }: { summary: HomeSummary }) {
  if (!summary.lines.length) return null;
  return <ul aria-label="Office priorities" className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">{summary.lines.map(line => <li key={line.id} className="flex items-center gap-2"><StatusDot tone={line.tone} />{line.href ? <Link to={line.href} className={cn('rounded-sm underline decoration-border underline-offset-4', focusRing)}>{line.text}</Link> : line.text}</li>)}</ul>;
}

/** The office challenge as the month row's third cell, or the door to one. */
function ChallengeTile({ challenge, canSetGoals, reviewHref }: { challenge: GoalBrief | null; canSetGoals: boolean; reviewHref?: string }) {
  if (!challenge) {
    return (
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-muted-foreground">Challenge</p>
        <p className="mt-2 text-[1.05rem] font-semibold leading-none text-muted-foreground">No office goal is running.</p>
        <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">One shared number the office can rally around, with its own window.</p>
        {canSetGoals ? (
          <ActionLink to="/goals" variant="text" size="sm" className="mt-1.5">Choose a goal</ActionLink>
        ) : (
          <p className="mt-1 text-[13px] text-muted-foreground">An owner or manager can start one in Office → Goals.</p>
        )}
      </div>
    );
  }
  const tone = challengeTone(challenge);
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <p className="text-[13px] font-semibold text-muted-foreground">Challenge</p>
        <Chip tone={tone}>
          <StatusDot tone={tone} />
          {challenge.stateLabel}
        </Chip>
      </div>
      <ChallengeCard goal={challenge} tile reviewHref={reviewHref} />
    </div>
  );
}

/**
 * The month: the two goal meters and the challenge, three across when the
 * board is wide, two (the challenge across the pair) on a narrower board,
 * one on a phone — where each cell keeps its figure, its bar and its state
 * and drops the captions.
 */
function MonthBlock({ month }: { month: MonthRow }) {
  const { meters, loading, canSetGoals, challenge, reviewHref } = month;
  const basis = meters?.[0]?.basis;
  return (
    <div data-home-month className="mt-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[13px] font-semibold text-primary">This month</p>
        <ActionLink to="/goals" variant="text" size="sm">Goals</ActionLink>
      </div>
      {loading || !meters ? (
        <div className="mt-2"><LoadingLines label="Reading this month…" lines={2} /></div>
      ) : (
        <div className="[container-type:inline-size]">
          <ul aria-label="Goals this month" className="mt-2 grid gap-x-6 gap-y-4 [@container(min-width:40rem)]:grid-cols-2 [@container(min-width:48rem)]:grid-cols-3">
            {meters.map(m => (
              <li key={m.id} className="min-w-0">
                <GoalMeterRow meter={m} canSetGoals={canSetGoals} variant="tile" />
              </li>
            ))}
            <li className={cn('min-w-0', meters.length === 2 && '[@container(min-width:40rem)]:col-span-2 [@container(min-width:48rem)]:col-span-1')}>
              <ChallengeTile challenge={challenge} canSetGoals={canSetGoals} reviewHref={reviewHref} />
            </li>
          </ul>
          {basis && (
            <details className="mt-3">
              <summary className="cursor-pointer list-none text-[13px] font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">How pace is calculated</summary>
              <p className="pt-1.5 text-[13px] leading-snug text-muted-foreground">{paceBasisLabel(basis)}</p>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

export function SummaryPanel({ summary, title, month }: { summary: HomeSummary; title: string; month?: MonthRow }) {
  const hasLines = summary.lines.length > 0;
  const people: BoardPerson[] = summary.who.flatMap(g => g.people.map(p => ({ ...p, group: g.label })));
  return (
    <section aria-label={title} className={cn(panelClass, 'px-5 py-4 sm:px-6')}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[13px] font-semibold text-primary">{title}</p>
        <p className="text-[13px] text-muted-foreground">{summary.detail}</p>
      </div>
      <p className={cn('mt-1 text-[clamp(1.15rem,2.2vw,1.4rem)] font-bold leading-snug tracking-[-0.01em]', summary.tone === 'attention' && 'text-[hsl(30_80%_32%)] dark:text-warning')}>
        {summary.headline}
      </p>
      {people.length > 0 && <Roster people={people} />}
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
      {month && <MonthBlock month={month} />}
    </section>
  );
}
