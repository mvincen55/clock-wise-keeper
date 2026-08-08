import { Link } from 'react-router-dom';
import { ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OwnerView } from './types';
import {
  Band, DashboardShell, EmptyState, FigureStrip, Lanes, Masthead, MicroLabel, PersonRow,
  ProgressLine, SignalRow, ViewContext,
} from './kit';

/**
 * OWNER — "is the office okay, and does anything need me?"
 *
 * Order of importance: office status, then decisions waiting on owner
 * authority, then goals and pulse. Attendance appears ONLY as a real
 * exception ("N attendance items need review") — the arrivals trend lives on
 * Team, where an owner inspects it on purpose. A clear state is celebrated,
 * never rendered as a wall of zeros.
 */
export default function OwnerDashboard({ view }: { view: OwnerView }) {
  const { header, office, decisionCount, decisions, glance, staffing, goals, pulse, health, lanes, roleContext } = view;
  const openDecisions = decisions.filter((d) => d.value !== '0');
  const clear = decisionCount === 0;
  const liveRoster = staffing.rows.length > 0;

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

      <div className="mt-3">
        <ViewContext context={roleContext} />
      </div>

      {/* Primary command area: office state + does anything need me? */}
      <div className="mt-6 grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        <div
          className={cn(
            'rounded-2xl border px-6 py-7',
            clear ? 'border-success/25 bg-success/[0.05]' : 'border-primary/25 bg-primary/[0.05]',
          )}
        >
          <MicroLabel className={clear ? 'text-success' : 'text-primary'}>Owner status</MicroLabel>
          {clear ? (
            <>
              <div className="mt-3 flex items-center gap-3">
                <CheckCircle2 className="h-7 w-7 shrink-0 text-success" aria-hidden />
                <p className="font-display text-[clamp(1.7rem,4.5vw,2.5rem)] font-extrabold leading-[0.95] tracking-[-0.03em] text-foreground">
                  You&rsquo;re clear.
                </p>
              </div>
              <p className="mt-2 text-[14px] leading-snug text-muted-foreground">
                Nothing needs an owner decision right now.
              </p>
            </>
          ) : (
            <>
              <p className="mt-3 font-display text-[clamp(1.7rem,4.5vw,2.5rem)] font-extrabold leading-[0.95] tracking-[-0.03em] text-foreground">
                {decisionCount} need{decisionCount === 1 ? 's' : ''} you
              </p>
              <p className="mt-2 text-[14px] leading-snug text-muted-foreground">
                Approvals, reviews, and sign-offs only an owner can move.
              </p>
              <Link
                to="/approvals"
                className="group mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-[12.5px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Review them
                <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5" />
              </Link>
            </>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card px-6 py-7">
          <MicroLabel>Office status</MicroLabel>
          <p className="mt-3 font-display text-[clamp(1.3rem,3vw,1.7rem)] font-extrabold leading-[0.95] tracking-[-0.02em]">
            {office.headline}
          </p>
          <p className="mt-2 text-[13px] leading-snug text-muted-foreground">{office.detail}</p>
        </div>
      </div>

      {/* Compact at-a-glance strip — status, not a second copy of the bands. */}
      <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-card [&_.font-display]:text-[clamp(1.3rem,3vw,1.7rem)]">
        <FigureStrip figures={glance} />
      </div>

      <div className="mt-8 grid gap-8 [&>*]:min-w-0 lg:grid-cols-[1.35fr_1fr] lg:gap-10">
        {/* Left: what the owner must decide, and what the office is chasing. */}
        <div className="space-y-8">
          {openDecisions.length > 0 && (
            <Band
              title="Waiting on you"
              count={`${openDecisions.length} open`}
              action={{ label: 'Approvals', to: '/approvals' }}
            >
              {openDecisions.map((d) => (
                <SignalRow key={d.id} signal={d} />
              ))}
            </Band>
          )}

          <Band title="Office goals" count={goals.length > 0 ? `${goals.length} in flight` : undefined} action={{ label: 'Goals', to: '/goals' }}>
            {goals.length === 0 ? (
              <EmptyState
                tone="setup"
                title="No office goal is active."
                detail="Pick one shared number the office can rally around."
                action={{ label: 'Start a sprint', to: '/goals' }}
              />
            ) : (
              goals.map((g) => <ProgressLine key={g.id} row={g} />)
            )}
          </Band>

          {health && (
            <Band title="Collections pace" action={{ label: 'Reports', to: '/reports' }}>
              <div className="border-b border-border py-4">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="font-display text-[clamp(1.8rem,4vw,2.6rem)] font-extrabold leading-none tabular-nums tracking-[-0.03em]">
                      {health.collectedLabel}
                    </p>
                    <MicroLabel className="mt-2">Collected this month · {health.days} days logged</MicroLabel>
                  </div>
                  <p className="text-[13px] text-muted-foreground">{health.paceLabel}</p>
                </div>
                <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-700"
                    style={{ width: `${Math.min(100, Math.max(0, health.pacePct))}%` }}
                  />
                </div>
                <p className="mt-2 text-[12.5px] text-muted-foreground">
                  {health.disruptions} cancellation{health.disruptions === 1 ? '' : 's'} or no-show
                  {health.disruptions === 1 ? '' : 's'} recorded this month.
                </p>
              </div>
            </Band>
          )}
        </div>

        {/* Right: standing context, compact. */}
        <div className="space-y-8">
          <Band
            title="Staffing today"
            count={liveRoster ? `${staffing.rows.length}` : undefined}
            action={{ label: 'Team', to: '/team' }}
          >
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

          <Band title="Office pulse">
            {pulse.length === 0 ? (
              <EmptyState tone="good" title="All quiet." detail="No unresolved notes or exceptions right now." />
            ) : (
              pulse.map((s) => <SignalRow key={s.id} signal={s} />)
            )}
          </Band>

          {/* Owners who also work a chair or the desk get a compact lane —
              it never competes with the decisions above. */}
          <Lanes lanes={lanes} />
        </div>
      </div>
    </DashboardShell>
  );
}
