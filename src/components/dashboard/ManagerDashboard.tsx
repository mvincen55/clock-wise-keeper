import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { money } from '@/lib/owner-pulse';
import type { ManagerView, MonthPaceLine, PulseFact } from './types';
import {
  Band, DashboardShell, EmptyState, Lanes, Masthead, MicroLabel, PersonRow, SignalRow,
  StatusDot, ViewContext,
} from './kit';

/**
 * MANAGER — "is the office okay, is performance on pace, what needs my hands?"
 *
 * Rebuilt around the same canonical pulse layer Owner Home reads:
 *
 *   A  quiet office context (state line + role context — never a hero)
 *   B  Manager Pulse: deterministic briefing + the day's facts
 *   C  Office performance: production / collections / new patients, each
 *      against ONLY its own goal, receipts on tap
 *   D  What needs your hands: one recommended intervention with evidence,
 *      then the queue ordered by operational consequence
 *   E  Close the Day status, linked to the exact record
 *   F  Staffing — live roster only while the office works; calm summary
 *      otherwise. Attendance no longer leads the page.
 *   G  Office goal (one primary sprint; the rest collapse to a count)
 *   H  personal role lane, compact
 *
 * The clock stays in the shell's GlobalTimeControl. Missing closeouts are
 * narrated, never rendered as $0, and a closed office invents no urgency.
 */
export default function ManagerDashboard({ view }: { view: ManagerView }) {
  const {
    header, office, summary, brief, performance, pipeline, next, queue, closeDay, staffing, goal,
    lanes, roleContext,
  } = view;
  const liveRoster = staffing.rows.length > 0;
  const factTiles: PulseFact[] = brief?.facts ?? [];
  const newOffice = brief?.scope === 'none';

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
            to="/approvals"
            className="group inline-flex items-center gap-2 rounded-full border border-primary/35 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
          >
            Approvals
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5" />
          </Link>
        }
      />

      {/* A — quiet office context. A state line, never a siren. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          <StatusDot tone={office.phase === 'open' ? 'steady' : 'calm'} />
          {office.headline}
        </span>
        <ViewContext context={roleContext} />
      </div>

      {/* B — MANAGER PULSE. Same facts and honesty rules as Owner Home. */}
      <section className="mt-6 rounded-2xl border border-border bg-card px-5 py-6 sm:px-7">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <MicroLabel className="text-primary">Manager pulse</MicroLabel>
          {brief && brief.scope !== 'none' && <MicroLabel>{brief.dayLabel}</MicroLabel>}
        </div>

        {summary ? (
          <p className="mt-3 max-w-[64ch] font-display text-[clamp(1.2rem,3vw,1.7rem)] font-bold leading-snug tracking-[-0.02em]">
            {summary}
          </p>
        ) : (
          <p className="mt-3 text-[14px] text-muted-foreground">Reading the day&rsquo;s numbers…</p>
        )}
        {brief?.note && <p className="mt-2 text-[13px] text-muted-foreground">{brief.note}</p>}

        {newOffice ? (
          <EmptyState
            tone="setup"
            title="No days have been closed out yet."
            detail="The pulse reads production, collections, new patients, and missed appointments straight off the deposit log."
            action={{ label: 'Open Close the Day', to: '/deposit-log' }}
          />
        ) : (
          factTiles.length > 0 && (
            <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3 lg:grid-cols-5">
              {factTiles.map((f) => {
                const body = (
                  <>
                    <MicroLabel>{f.label}</MicroLabel>
                    <p
                      className={cn(
                        'mt-2 font-display text-[clamp(1.35rem,3vw,1.9rem)] font-extrabold leading-[0.9] tabular-nums tracking-[-0.03em]',
                        f.tone === 'attention' && 'text-warning',
                        f.tone === 'urgent' && 'text-destructive',
                      )}
                    >
                      {f.value}
                    </p>
                    {f.detail && (
                      <p className="mt-1.5 text-[11.5px] leading-tight text-muted-foreground">{f.detail}</p>
                    )}
                  </>
                );
                return f.href ? (
                  <Link key={f.id} to={f.href} className="block bg-card px-4 py-4 transition-colors hover:bg-muted/50">
                    {body}
                  </Link>
                ) : (
                  <div key={f.id} className="bg-card px-4 py-4">
                    {body}
                  </div>
                );
              })}
            </div>
          )
        )}
      </section>

      {/* C — OFFICE PERFORMANCE. Three compact cards, one metric each,
          paced only against their own goals. Receipts on tap. */}
      {!newOffice && performance && (
        <div className="mt-3 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-3">
          {performance.map((line: MonthPaceLine) => (
            <div key={line.id} className="bg-card px-5 py-5">
              <MicroLabel>{line.label}</MicroLabel>
              <p
                className={cn(
                  'mt-2 font-display text-[clamp(1.5rem,3.2vw,2rem)] font-extrabold leading-none tabular-nums tracking-[-0.03em]',
                  line.tone === 'attention' && 'text-warning',
                )}
              >
                {line.value}
              </p>
              <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground">{line.detail}</p>
              {line.id === 'new_patients' && pipeline && (
                <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground">
                  Pipeline: {pipeline.scheduledThisWeek} scheduled this week
                  {pipeline.recordedDays === 0 ? ' (nothing recorded yet)' : ''} — scheduled never
                  counts toward the seen goal.
                </p>
              )}
              {line.pace && (
                <details className="mt-2">
                  <summary className="cursor-pointer list-none font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                    Why?
                  </summary>
                  <p className="mt-1.5 text-[11.5px] leading-snug text-muted-foreground">
                    {(() => {
                      const fmt = line.id === 'new_patients' ? String : money;
                      return `${fmt(line.pace.actual)} recorded vs ${fmt(line.pace.pacedTarget)} expected by now — the full ${fmt(line.pace.target)} goal × the share of the month elapsed. Paced against this metric's own goal only.`;
                    })()}
                  </p>
                </details>
              )}
            </div>
          ))}
        </div>
      )}

      {/* D (top) — the one recommended intervention, evidence attached. */}
      {next && (
        <section className="mt-3 rounded-2xl border border-primary/25 bg-primary/[0.04] px-5 py-5 sm:px-7">
          <MicroLabel className="text-primary">What I&rsquo;d step into first</MicroLabel>
          <p className="mt-2 max-w-[72ch] text-[14.5px] leading-relaxed">{next.text}</p>
          {next.action && (
            <Link
              to={next.action.to}
              className="group mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-[12.5px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              {next.action.label}
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5" />
            </Link>
          )}
          {next.receipts.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer list-none font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                Why? — the recorded facts behind this
              </summary>
              <dl className="mt-3 space-y-2.5 border-t border-border pt-3">
                {next.receipts.map((r) => (
                  <div key={r.label}>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-[12px] text-muted-foreground">{r.label}</dt>
                      <dd className="text-[12px] font-medium tabular-nums">{r.value}</dd>
                    </div>
                    <p className="text-[11px] leading-snug text-muted-foreground/80">{r.source}</p>
                  </div>
                ))}
              </dl>
            </details>
          )}
        </section>
      )}

      <div className="mt-8 grid gap-8 [&>*]:min-w-0 lg:grid-cols-[1.35fr_1fr] lg:gap-10">
        {/* Left, dominant: the consequence-ordered queue, then the goal. */}
        <div className="space-y-8">
          <Band title="What needs your hands" count={queue.length > 0 ? `${queue.length} open` : undefined}>
            {queue.length === 0 ? (
              <EmptyState
                tone="good"
                title="Nothing is waiting on you."
                detail="Closeouts, approvals, reviews, and follow-through are all clear."
              />
            ) : (
              queue.map((s) => <SignalRow key={s.id} signal={s} />)
            )}
          </Band>

          {/* G — the office goal. One primary sprint, verification preserved. */}
          <Band title="Office goal" action={{ label: 'Goals', to: '/goals' }}>
            {goal ? (
              <div className="border-b border-border py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="text-[15px] font-semibold leading-snug">{goal.title}</p>
                  <span
                    className={cn(
                      'font-mono text-[10px] uppercase tracking-[0.12em]',
                      goal.state === 'on_track' && 'text-success',
                      goal.state === 'needs_push' && 'text-warning',
                      goal.state === 'awaiting_verification' && 'text-primary',
                    )}
                  >
                    {goal.stateLabel}
                  </span>
                </div>
                <p className="mt-3 font-display text-[2rem] font-extrabold leading-none tabular-nums tracking-[-0.02em]">
                  {goal.done}
                  <span className="text-[1.25rem] text-muted-foreground"> / {goal.total}</span>
                </p>
                <div className="mt-3 h-1.5 w-full bg-muted">
                  <div
                    className={cn(
                      'h-full transition-[width] duration-700',
                      goal.done >= goal.total ? 'bg-success' : 'bg-primary',
                    )}
                    style={{ width: `${Math.min(100, goal.total > 0 ? (goal.done / goal.total) * 100 : 0)}%` }}
                  />
                </div>
                <p className="mt-2 text-[12.5px] text-muted-foreground">
                  {goal.remaining} remaining · ends {goal.endsLabel}
                  {goal.daysLeft > 0 ? ` (${goal.daysLeft} day${goal.daysLeft === 1 ? '' : 's'} left)` : ' (today)'}
                  {' · '}
                  {goal.stateDetail}
                </p>
                {goal.moreCount > 0 && (
                  <Link
                    to="/goals"
                    className="group mt-2 inline-flex items-center gap-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-primary hover:underline"
                  >
                    {goal.moreCount} more active
                    <ArrowUpRight className="h-3 w-3 transition-transform group-hover:-translate-y-0.5" />
                  </Link>
                )}
              </div>
            ) : (
              <EmptyState
                tone="setup"
                title="No office goal is running."
                detail="Pick one shared number the office can rally around — the Sprint Builder can scope it."
                action={{ label: 'Choose a goal', to: '/goals' }}
              />
            )}
          </Band>
        </div>

        {/* Right: the record of truth, staffing when it matters, my own lane. */}
        <div className="space-y-8">
          {/* E — Close the Day status, linked to the exact record. */}
          {closeDay && (
            <Band title="Close the Day" action={{ label: 'Open', to: closeDay.href }}>
              <div className="border-b border-border py-4">
                <div className="flex items-center gap-2.5">
                  <StatusDot tone={closeDay.tone} />
                  <p className="text-[15px] font-semibold leading-snug">{closeDay.label}</p>
                </div>
                <p className="mt-1.5 text-[12.5px] text-muted-foreground">{closeDay.detail}</p>
              </div>
            </Band>
          )}

          {/* F — staffing. A live question only while the office works; a calm
              summary (never manufactured urgency) when it does not. */}
          <Band
            title="Staffing today"
            count={liveRoster ? `${staffing.rows.length}` : undefined}
            action={{ label: 'Team', to: '/team' }}
          >
            {staffing.reviewCount > 0 && (
              <SignalRow
                signal={{
                  id: 'attendance-review',
                  label: `${staffing.reviewCount} attendance item${staffing.reviewCount === 1 ? '' : 's'} need review`,
                  detail: staffing.reviewDetail,
                  value: String(staffing.reviewCount),
                  href: '/team',
                  tone: 'attention',
                }}
              />
            )}
            {liveRoster ? (
              staffing.rows.map((p) => <PersonRow key={p.id} person={p} />)
            ) : (
              <EmptyState
                tone="neutral"
                title={office.headline}
                detail={`${office.detail} No live staffing status is needed.`}
              />
            )}
          </Band>

          {/* H — a manager who also works the floor keeps a compact personal
              lane. It never turns Home into two dashboards. */}
          <Lanes lanes={lanes} />
        </div>
      </div>
    </DashboardShell>
  );
}
