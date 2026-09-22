import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ageLabel, itemAction, itemTone, type AttentionItem } from '@/lib/attention';
import type { PaceLine, SentencePart, StatusLine, TodayException } from '@/lib/home-brief';
import type { ManagerView } from './types';
import {
  Band, DashboardShell, EmptyState, Lanes, Masthead, MicroLabel, SignalRow, StatusDot, ViewContext,
  toneText,
} from './kit';

/**
 * MANAGER — "How is the office right now, and what needs me?" (design §3.3)
 *
 * Home is a briefing. It renders no forms and takes no consequential action:
 * every row carries one navigation action, Review for a decision and Open for
 * a fix or a follow-up, and both land on the exact Attention item.
 *
 *   1  one sentence of state, each fact linked
 *   2  Needs you — the first three Attention items, then "n more"
 *   3  Today — exceptions only, then one count line; never a roster
 *   4  two status lines — the last closeout, and pace with a Why?
 *   5  Spotlight — the challenge only when it is noteworthy today
 *   6  Mine — only what needs the manager personally
 *   7  after close, Needs you becomes Before you leave
 *
 * Everything else that sat here (fact tiles, performance cards, the doctor
 * board, the sprint card, the notes board) lives with its owner now.
 */

const actionClass =
  'inline-flex shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-primary';
const arrow = <ArrowUpRight className="h-3 w-3 transition-transform group-hover:-translate-y-0.5" />;

/** The sentence: recorded facts, each one a link to where it can be acted on. */
function Sentence({ parts }: { parts: SentencePart[] }) {
  return (
    <p className="mt-3 max-w-[64ch] font-display text-[clamp(1.25rem,3.2vw,1.85rem)] font-bold leading-snug tracking-[-0.02em]">
      {parts.map((p, i) =>
        p.href ? (
          <Link
            key={i}
            to={p.href}
            className={cn(
              'underline decoration-border underline-offset-4 transition-colors hover:decoration-current',
              p.tone === 'attention' && 'text-warning',
              p.tone === 'urgent' && 'text-destructive',
            )}
          >
            {p.text}
          </Link>
        ) : (
          <span key={i} className={cn(p.tone === 'attention' && 'text-warning', p.tone === 'urgent' && 'text-destructive')}>
            {p.text}
          </span>
        ),
      )}
    </p>
  );
}

/** One Attention item: dot, who and what, age or deadline, one navigation action. */
function ItemRow({ item }: { item: AttentionItem }) {
  return (
    <Link
      to={`/management?item=${item.key}`}
      data-item-key={item.key}
      className="group flex items-center gap-3 border-b border-border py-3 transition-colors hover:bg-muted/60"
    >
      <StatusDot tone={itemTone(item)} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium leading-snug">
          {item.subject.name ? `${item.subject.name} · ` : ''}
          {item.label}
        </span>
        {item.detail && (
          <span className="block truncate text-[12.5px] leading-snug text-muted-foreground">{item.detail}</span>
        )}
      </span>
      <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-muted-foreground">{ageLabel(item)}</span>
      <span className={actionClass}>
        {itemAction(item)}
        {arrow}
      </span>
    </Link>
  );
}

/** A person who is an exception today. Links to their item when one exists. */
function ExceptionRow({ person }: { person: TodayException }) {
  const inner = (
    <>
      <StatusDot tone={person.tone} />
      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{person.name}</span>
      <span className={cn('font-mono text-[10.5px] uppercase tracking-[0.1em]', toneText[person.tone])}>{person.status}</span>
      {person.action && (
        <span className={actionClass}>
          {person.action}
          {arrow}
        </span>
      )}
    </>
  );
  const base = 'flex items-center gap-3 border-b border-border py-2.5';
  return person.href ? (
    <Link to={person.href} className={cn(base, 'group transition-colors hover:bg-muted/60')}>{inner}</Link>
  ) : (
    <div className={base}>{inner}</div>
  );
}

/** A status line: what it is, where it stands, and the one place to go. */
function StatusRow({ line }: { line: StatusLine }) {
  const inner = (
    <>
      <StatusDot tone={line.tone} />
      <span className="min-w-0 flex-1 text-[13.5px] leading-snug">
        <span className="font-medium">{line.label}</span>{' '}
        <span className={cn(line.tone === 'attention' ? 'text-warning' : line.tone === 'urgent' ? 'text-destructive' : 'text-muted-foreground')}>
          {line.text}
        </span>
      </span>
      {line.action && (
        <span className={actionClass}>
          {line.action}
          {arrow}
        </span>
      )}
    </>
  );
  return (
    <Link to={line.href} className="group flex items-center gap-3 border-b border-border py-3 transition-colors hover:bg-muted/60">
      {inner}
    </Link>
  );
}

/** Pace in one clause with its scope; Why? discloses the three figures. */
function PaceRow({ pace }: { pace: PaceLine }) {
  return (
    <div className="border-b border-border py-3">
      <div className="flex items-center gap-3">
        <StatusDot tone={pace.tone} />
        <p className="min-w-0 flex-1 text-[13.5px] leading-snug">
          <span className="font-medium">Pace</span>{' '}
          <span className={cn(pace.tone === 'attention' ? 'text-warning' : 'text-muted-foreground')}>{pace.text}</span>{' '}
          <span className="text-muted-foreground">({pace.scope})</span>
        </p>
      </div>
      {pace.figures.length > 0 && (
        <details className="mt-1.5 pl-5">
          <summary className="cursor-pointer list-none font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
            Why?
          </summary>
          <dl className="mt-2 grid gap-3 sm:grid-cols-3">
            {pace.figures.map((f) => (
              <div key={f.label} className="min-w-0">
                <dt className="text-[11px] text-muted-foreground">{f.label}</dt>
                <dd className={cn('mt-0.5 font-display text-[1.2rem] font-bold leading-none tabular-nums', f.tone === 'attention' && 'text-warning')}>
                  {f.value}
                </dd>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{f.detail}</p>
              </div>
            ))}
          </dl>
        </details>
      )}
    </div>
  );
}

export default function ManagerDashboard({ view }: { view: ManagerView }) {
  const { header, office, home, mine, lanes, roleContext } = view;
  const { needs, today, wrapUp, spotlight } = home;
  const nowCount = needs.top.length + needs.more;
  const stillIn = today.exceptions.filter((e) => e.status.startsWith('Still clocked in'));
  const closeoutStep = wrapUp && home.lastDay?.action ? home.lastDay : null;
  const wrapEmpty = wrapUp && stillIn.length === 0 && !closeoutStep && !home.inbox && nowCount === 0;
  const alsoOpen = [
    needs.waiting > 0 && `${needs.waiting} waiting on others`,
    needs.deferred > 0 && `${needs.deferred} parked`,
  ].filter(Boolean).join(' · ');
  const statusLines: StatusLine[] = [];
  // The closeout step already leads Before you leave; the status band does not repeat it.
  if (home.lastDay && !closeoutStep) statusLines.push(home.lastDay);

  const todayLine = today.asOf
    ? today.asOf === 'loading'
      ? 'Reading today’s roster…'
      : 'The roster could not be read. Nobody is marked in or out.'
    : today.exceptions.length === 0 && (today.phase === 'open' || today.phase === 'unknown_hours')
      ? `Everyone scheduled is in · ${today.countLine}`
      : today.countLine;

  return (
    <DashboardShell>
      <Masthead
        officeName={header.officeName}
        roleLabel={header.roleLabel}
        title={header.personName}
        dateLabel={header.dateLabel}
        timeLabel={header.timeLabel}
        right={
          <Link
            to="/management"
            className="group inline-flex items-center gap-2 rounded-full border border-primary/35 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
          >
            Attention
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5" />
          </Link>
        }
      />

      {/* Quiet office context. A state line, never a siren. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          <StatusDot tone={office.phase === 'open' ? 'steady' : 'calm'} />
          {office.headline}
        </span>
        <ViewContext context={roleContext} />
      </div>

      {/* 1 — the sentence. Every fact in it is recorded, and linked. */}
      <section className="mt-6 rounded-2xl border border-border bg-card px-5 py-6 sm:px-7">
        <MicroLabel className="text-primary">{wrapUp ? 'Wrap-up' : 'Right now'}</MicroLabel>
        <Sentence parts={home.sentence} />
      </section>

      <div className="mt-8 grid gap-8 [&>*]:min-w-0 lg:grid-cols-[1.35fr_1fr] lg:gap-10">
        <div className="space-y-8">
          {/* 2 / 7 — Needs you, or Before you leave after close. Navigation only. */}
          <Band
            title={wrapUp ? 'Before you leave' : 'Needs you'}
            count={nowCount > 0 ? `${nowCount} now` : undefined}
            action={{ label: 'Attention', to: '/management' }}
          >
            {wrapUp && stillIn.map((p) => <ExceptionRow key={p.id} person={p} />)}
            {closeoutStep && <StatusRow line={closeoutStep} />}
            {wrapUp && home.inbox && <StatusRow line={home.inbox} />}
            {wrapUp && needs.top.length > 0 && (
              <MicroLabel className="pt-3">Carries into tomorrow</MicroLabel>
            )}
            {needs.top.map((item) => <ItemRow key={item.key} item={item} />)}
            {needs.more > 0 && (
              <Link
                to="/management"
                className="group flex items-center justify-between gap-3 border-b border-border py-3 text-[13px] text-muted-foreground transition-colors hover:bg-muted/60"
              >
                <span>{needs.more} more need{needs.more === 1 ? 's' : ''} you now</span>
                <span className={actionClass}>Open Attention{arrow}</span>
              </Link>
            )}
            {nowCount > 0 && alsoOpen && (
              <Link to="/management" className="block border-b border-border py-2.5 text-[12px] text-muted-foreground hover:underline">
                {alsoOpen}
              </Link>
            )}
            {wrapEmpty && (
              <EmptyState tone="good" title="Nothing needs attention tonight." detail="Everyone is clocked out and the closeout is sealed." />
            )}
            {!wrapUp && nowCount === 0 && (
              needs.degraded ? (
                <EmptyState
                  tone="neutral"
                  title="Some sources could not be read."
                  detail="Attention names which. Nothing here is confirmed clear."
                  action={{ label: 'Open Attention', to: '/management' }}
                />
              ) : (
                <EmptyState
                  tone="good"
                  title="Nothing is waiting on you."
                  detail={alsoOpen ? `${alsoOpen}. Decisions, fixes, and follow-ups are clear.` : 'Decisions, fixes, and follow-ups are all clear.'}
                />
              )
            )}
          </Band>

          {/* 3 — Today: exceptions, then one count line. Never a roster. */}
          <Band
            title="Today"
            count={today.scheduled > 0 ? `${today.scheduled} scheduled` : undefined}
            action={{ label: 'People', to: '/management/people' }}
          >
            {!wrapUp && today.exceptions.map((p) => <ExceptionRow key={p.id} person={p} />)}
            <p className={cn('py-3 text-[13px]', today.asOf === 'unavailable' ? 'text-warning' : 'text-muted-foreground')}>
              {todayLine}
            </p>
          </Band>
        </div>

        <div className="space-y-8">
          {/* 4 — the status lines: the last closeout and the pace, with receipts. */}
          {(statusLines.length > 0 || home.pace) && (
            <Band title="Status">
              {statusLines.map((line) => <StatusRow key={line.id} line={line} />)}
              {home.pace && <PaceRow pace={home.pace} />}
            </Band>
          )}

          {/* 5 — Spotlight: the challenge, only while it is noteworthy. */}
          {spotlight && (
            <Band title={`Challenge · ${spotlight.reason}`} action={{ label: 'Goals', to: '/goals' }}>
              <div className="border-b border-border py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="text-[15px] font-semibold leading-snug">{spotlight.goal.title}</p>
                  <span
                    className={cn(
                      'font-mono text-[10px] uppercase tracking-[0.12em]',
                      spotlight.goal.state === 'on_track' && 'text-success',
                      spotlight.goal.state === 'needs_push' && 'text-warning',
                      spotlight.goal.state === 'awaiting_verification' && 'text-primary',
                    )}
                  >
                    {spotlight.goal.stateLabel}
                  </span>
                </div>
                <p className="mt-3 font-display text-[2rem] font-extrabold leading-none tabular-nums tracking-[-0.02em]">
                  {spotlight.goal.done}
                  <span className="text-[1.25rem] text-muted-foreground"> / {spotlight.goal.total}</span>
                </p>
                <div className="mt-3 h-1.5 w-full bg-muted">
                  <div
                    className={cn('h-full transition-[width] duration-700', spotlight.goal.done >= spotlight.goal.total ? 'bg-success' : 'bg-primary')}
                    style={{ width: `${Math.min(100, spotlight.goal.total > 0 ? (spotlight.goal.done / spotlight.goal.total) * 100 : 0)}%` }}
                  />
                </div>
                <p className="mt-2 text-[12.5px] text-muted-foreground">
                  {spotlight.goal.remaining} remaining · ends {spotlight.goal.endsLabel}
                  {spotlight.goal.daysLeft > 0 ? ` (${spotlight.goal.daysLeft} day${spotlight.goal.daysLeft === 1 ? '' : 's'} left)` : ' (today)'}
                  {' · '}
                  {spotlight.goal.stateDetail}
                </p>
                {spotlight.goal.state === 'awaiting_verification' && (
                  <Link
                    to={`/management?item=challenge_verify:${spotlight.goal.id}`}
                    className={cn(actionClass, 'group mt-2 hover:underline')}
                  >
                    Review{arrow}
                  </Link>
                )}
              </div>
            </Band>
          )}

          {/* 6 — Mine: only what needs the manager personally. */}
          {mine.length > 0 && (
            <Band title="Mine" count={`${mine.length}`}>
              {mine.map((s) => <SignalRow key={s.id} signal={s} />)}
            </Band>
          )}

          {/* A manager who also works the floor keeps a compact personal lane. */}
          <Lanes lanes={lanes} />
        </div>
      </div>
    </DashboardShell>
  );
}
