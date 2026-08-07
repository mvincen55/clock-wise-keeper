import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import type { OwnerView } from './types';
import {
  Band, DashboardShell, EmptyLine, FigureStrip, Masthead, MicroLabel, PersonRow,
  ProgressLine, SignalRow,
} from './kit';

/**
 * OWNER — practice command center.
 *
 * Decisions and exceptions first; no clock controls (owners do not punch —
 * `roleClocksIn` already blocks it at the shell), no manager task noise, no
 * personal team-member widgets. Every figure below comes from a real table.
 */
export default function OwnerDashboard({ view }: { view: OwnerView }) {
  const { header, figures, decisions, staffing, goals, pulse, health } = view;
  const openDecisions = decisions.filter((d) => d.value !== '0');

  return (
    <DashboardShell>
      <Masthead
        officeName={header.officeName}
        roleLabel={header.roleLabel}
        title="Command"
        dateLabel={header.dateLabel}
        timeLabel={header.timeLabel}
        right={
          <Link
            to="/management"
            className="group inline-flex items-center gap-2 border-2 border-foreground px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors hover:bg-foreground hover:text-background"
          >
            Management
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5" />
          </Link>
        }
      />

      {/* Dominant attention region — the four numbers, in the office colour. */}
      <div className="mt-6 bg-primary text-primary-foreground">
        <FigureStrip figures={figures} invert />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.35fr_1fr] lg:gap-10">
        {/* Left: what the owner must decide. */}
        <div className="space-y-8">
          <Band
            title="Waiting on you"
            count={`${openDecisions.length} open`}
            action={{ label: 'Approvals', to: '/approvals' }}
          >
            {openDecisions.length === 0 ? (
              <EmptyLine>Nothing is waiting on an owner decision right now.</EmptyLine>
            ) : (
              openDecisions.map((d) => <SignalRow key={d.id} signal={d} />)
            )}
          </Band>

          <Band title="Operational goals" count={`${goals.length} in flight`} action={{ label: 'Goals', to: '/goals' }}>
            {goals.length === 0 ? (
              <EmptyLine>No sprints or goals are running. Set one from Goals.</EmptyLine>
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
                <div className="mt-4 h-2 w-full bg-muted">
                  <div
                    className="h-full bg-primary transition-[width] duration-700"
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
            count={`${staffing.present}/${staffing.expected} in`}
            action={{ label: 'Team', to: '/team' }}
          >
            {staffing.rows.length === 0 ? (
              <EmptyLine>Nobody is scheduled today.</EmptyLine>
            ) : (
              staffing.rows.map((p) => <PersonRow key={p.id} person={p} />)
            )}
          </Band>

          <Band title="Office pulse">
            {pulse.length === 0 ? <EmptyLine>Quiet.</EmptyLine> : pulse.map((s) => <SignalRow key={s.id} signal={s} />)}
          </Band>
        </div>
      </div>
    </DashboardShell>
  );
}
