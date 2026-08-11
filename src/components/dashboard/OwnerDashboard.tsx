import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { missedBreakdown } from '@/lib/owner-pulse';
import type { OwnerView, PulseFact } from './types';
import {
  Band, DashboardShell, EmptyState, Lanes, Masthead, MicroLabel, PersonRow, SignalRow,
  StatusDot, ViewContext,
} from './kit';

/**
 * OWNER — "how did my office do, and does anything need me?"
 *
 * The hero is the day's pulse read straight off the deposit log, opened by a
 * deterministic one-sentence briefing. Decisions that need owner authority
 * stay prominent but no longer DEFINE the page — zero approvals never claims
 * the office had a good day. Every number keeps exactly one home:
 *
 *   today's production/collected/new patients/missed             → hero
 *   the single recommendation                                    → What I'd look at
 *   approvals/reviews/acks/verifications                         → Owner attention
 *   the primary sprint                                           → Office goal
 *   MTD production/collections/new-patient pace, missed, history → Month in progress
 *   live roster and real exceptions                              → Staffing
 *
 * Missing data is narrated ("closeout isn't in yet"), never rendered as $0.
 */
export default function OwnerDashboard({ view }: { view: OwnerView }) {
  const {
    header, office, summary, brief, lookAt, decisionCount, decisions, goal, month,
    staffing, exceptions, lanes, roleContext,
  } = view;
  const openDecisions = decisions.filter((d) => d.value !== '0');
  const liveRoster = staffing.rows.length > 0;
  const factTiles: PulseFact[] = brief?.facts ?? [];

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
            Management
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5" />
          </Link>
        }
      />

      {/* Quiet office context: state line + role lane label. Never a hero. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          <StatusDot tone={office.phase === 'open' ? 'steady' : 'calm'} />
          {office.headline}
        </span>
        <ViewContext context={roleContext} />
      </div>

      {/* B — TODAY'S OFFICE PULSE. The hero: briefing sentence + the facts. */}
      <section className="mt-6 rounded-2xl border border-border bg-card px-5 py-6 sm:px-7">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <MicroLabel className="text-primary">Today&rsquo;s office pulse</MicroLabel>
          {brief && brief.scope !== 'none' && <MicroLabel>{brief.dayLabel}</MicroLabel>}
        </div>

        {summary ? (
          <p className="mt-3 max-w-[64ch] font-display text-[clamp(1.25rem,3.2vw,1.85rem)] font-bold leading-snug tracking-[-0.02em]">
            {summary}
          </p>
        ) : (
          <p className="mt-3 text-[14px] text-muted-foreground">Reading the day&rsquo;s numbers…</p>
        )}
        {brief?.note && <p className="mt-2 text-[13px] text-muted-foreground">{brief.note}</p>}

        {brief && brief.scope === 'none' ? (
          <EmptyState
            tone="setup"
            title="No days have been closed out yet."
            detail="The pulse reads production, collections, and missed appointments straight off the deposit log."
            action={{ label: 'Open the deposit log', to: '/deposit-log' }}
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
                        'mt-2 font-display text-[clamp(1.45rem,3.5vw,2.15rem)] font-extrabold leading-[0.9] tabular-nums tracking-[-0.03em]',
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

      {/* C — WHAT I'D LOOK AT. One grounded suggestion, receipts on tap. */}
      {lookAt && (
        <section className="mt-3 rounded-2xl border border-primary/25 bg-primary/[0.04] px-5 py-5 sm:px-7">
          <MicroLabel className="text-primary">What I&rsquo;d look at</MicroLabel>
          <p className="mt-2 max-w-[72ch] text-[14.5px] leading-relaxed">{lookAt.text}</p>
          {lookAt.action && (
            <Link
              to={lookAt.action.to}
              className="group mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-[12.5px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              {lookAt.action.label}
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5" />
            </Link>
          )}
          {lookAt.receipts.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer list-none font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                Why? — the recorded facts behind this
              </summary>
              <dl className="mt-3 space-y-2.5 border-t border-border pt-3">
                {lookAt.receipts.map((r) => (
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
        {/* Left: decisions, the goal, and the month's detail. */}
        <div className="space-y-8">
          {/* D — OWNER ATTENTION. Prominent when real, one calm line when clear. */}
          <Band
            title="Owner attention"
            count={openDecisions.length > 0 ? `${decisionCount} waiting` : undefined}
            action={{ label: 'Approvals', to: '/approvals' }}
          >
            {openDecisions.length === 0 ? (
              <EmptyState
                tone="good"
                title="No owner decisions are waiting."
                detail="Approvals, reviews, and sign-offs are clear."
              />
            ) : (
              openDecisions.map((d) => <SignalRow key={d.id} signal={d} />)
            )}
          </Band>

          {/* E — OFFICE GOAL. One primary sprint; the rest collapse to a count. */}
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

          {/* F — MONTH IN PROGRESS. Production MTD, missed MTD, recorded history. */}
          <Band
            title="Month in progress"
            count={month ? `${month.daysLogged} day${month.daysLogged === 1 ? '' : 's'} logged` : undefined}
            action={{ label: 'Reports', to: '/reports' }}
          >
            {month ? (
              <>
                {/* The month scoreboard: each metric against ONLY its own
                    optional goal. Pace verdicts appear only when the math
                    supports one; a missing goal reads as a factual total. */}
                {month.paceLines.map((line) => (
                  <Link
                    key={line.id}
                    to={line.href ?? '/reports'}
                    className="block border-b border-border py-4 transition-opacity hover:opacity-75"
                  >
                    <MicroLabel>{line.label}</MicroLabel>
                    <p
                      className={cn(
                        'mt-2 font-display text-[clamp(1.6rem,3.5vw,2.2rem)] font-extrabold leading-none tabular-nums tracking-[-0.03em]',
                        line.tone === 'attention' && 'text-warning',
                      )}
                    >
                      {line.value}
                    </p>
                    <p className="mt-1.5 text-[12px] text-muted-foreground">{line.detail}</p>
                  </Link>
                ))}
                <div className="border-b border-border py-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <MicroLabel>Missed appointments this month</MicroLabel>
                    <span
                      className={cn(
                        'font-display text-[1.35rem] font-bold leading-none tabular-nums',
                        month.missed.trend === 'above_pace' ? 'text-warning' : 'text-foreground',
                      )}
                    >
                      {month.missed.total}
                    </span>
                  </div>
                  {month.missed.total > 0 && (
                    <p className="mt-1.5 text-[12px] text-muted-foreground">
                      {missedBreakdown(month.missed)}
                    </p>
                  )}
                  {month.missed.trendLabel ? (
                    <p
                      className={cn(
                        'mt-1 text-[12px]',
                        month.missed.trend === 'above_pace' ? 'text-warning' : 'text-muted-foreground',
                      )}
                    >
                      {month.missed.trendLabel}
                    </p>
                  ) : (
                    month.missed.total === 0 && (
                      <p className="mt-1 text-[12px] text-muted-foreground">None recorded this month.</p>
                    )
                  )}
                </div>
                {month.trend.length > 1 && (
                  <div className="grid gap-x-6 gap-y-4 border-b border-border py-4 sm:grid-cols-2">
                    {(
                      [
                        {
                          key: 'production',
                          title: 'Production by month',
                          question: 'Is production holding?',
                          pick: (m: (typeof month.trend)[number]) => m.productionCents,
                          fmt: (v: number) => `$${Math.round(v / 100).toLocaleString('en-US')}`,
                          tone: 'bg-primary',
                        },
                        {
                          key: 'missed',
                          title: 'Missed appointments by month',
                          question: 'Getting better or worse?',
                          pick: (m: (typeof month.trend)[number]) => m.disruptions,
                          fmt: (v: number) => String(v),
                          tone: 'bg-warning/80',
                        },
                      ] as const
                    ).map((chart) => {
                      const max = Math.max(1, ...month.trend.map(chart.pick));
                      return (
                        <div key={chart.key} className="min-w-0">
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="text-[11.5px] text-muted-foreground">{chart.title}</p>
                            <p className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
                              {chart.question}
                            </p>
                          </div>
                          <div className="mt-2 flex h-14 items-end gap-1.5">
                            {month.trend.map((m) => (
                              <div key={m.month} className="flex-1" title={`${m.month}: ${chart.fmt(chart.pick(m))}`}>
                                <div
                                  className={cn('w-full', chart.tone)}
                                  style={{ height: `${Math.max((chart.pick(m) / max) * 56, 2)}px` }}
                                />
                              </div>
                            ))}
                          </div>
                          <div className="mt-1 flex justify-between font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                            <span>{month.trend[0].month.slice(5)}</span>
                            <span>{month.trend[month.trend.length - 1].month.slice(5)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="py-2.5 text-[11px] text-muted-foreground">
                  From the deposit log · figures update when a day is closed out.
                </p>
              </>
            ) : brief ? (
              <EmptyState
                tone="neutral"
                title="No closeouts this month yet."
                detail="Month figures appear as days are closed out in the deposit log."
              />
            ) : (
              <p className="border-b border-border py-4 text-[13px] text-muted-foreground">Loading…</p>
            )}
          </Band>
        </div>

        {/* Right: staffing only when it is a live question or a real exception. */}
        <div className="space-y-8">
          {(liveRoster || exceptions.length > 0) && (
            <Band
              title="Staffing today"
              count={liveRoster ? `${staffing.rows.length}` : undefined}
              action={{ label: 'Team', to: '/team' }}
            >
              {exceptions.map((s) => (
                <SignalRow key={s.id} signal={s} />
              ))}
              {liveRoster && staffing.rows.map((p) => <PersonRow key={p.id} person={p} />)}
            </Band>
          )}

          {/* Owners who also work a chair or the desk get a compact lane —
              it never competes with the pulse above. */}
          <Lanes lanes={lanes} />
        </div>
      </div>
    </DashboardShell>
  );
}
