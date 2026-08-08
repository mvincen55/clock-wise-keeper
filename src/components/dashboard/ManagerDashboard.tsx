import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import type { ManagerView } from './types';
import {
  Band, DashboardShell, EmptyState, FigureStrip, Lanes, Masthead, PersonRow, ProgressLine,
  SignalRow, ViewContext,
} from './kit';

/**
 * MANAGER — live operational cockpit.
 *
 * Reads as: what state is the office in, who is here (only while that is a
 * live question), what needs attention, are we on track. The clock stays in
 * the shell's compact GlobalTimeControl; there is deliberately no time-clock
 * card here, and off-hours never invent staffing exceptions.
 */
export default function ManagerDashboard({ view }: { view: ManagerView }) {
  const { header, office, figures, staffing, attention, progress, lanes, roleContext } = view;
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
            to="/approvals"
            className="group inline-flex items-center gap-2 rounded-full border border-primary/35 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
          >
            Approvals
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5" />
          </Link>
        }
      />

      <div className="mt-3">
        <ViewContext context={roleContext} />
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
        <FigureStrip figures={figures} />
      </div>

      <div className="mt-8 grid gap-8 [&>*]:min-w-0 lg:grid-cols-[1fr_1.3fr] lg:gap-10">
        {/* Who is here — a live question only while the office works. */}
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

        {/* The dominant column: what needs hands, then progress. */}
        <div className="space-y-8">
          <Band title="Needs attention" count={`${attention.length} open`}>
            {attention.length === 0 ? (
              <EmptyState tone="good" title="Nothing outstanding." detail="The floor is clear — approvals, reviews, and notes are all handled." />
            ) : (
              attention.map((s) => <SignalRow key={s.id} signal={s} />)
            )}
          </Band>

          <Band title="On track?" action={{ label: 'Goals', to: '/goals' }}>
            {progress.length === 0 ? (
              <EmptyState
                tone="setup"
                title="No team sprint is running."
                detail="Pick one shared number the office can rally around."
                action={{ label: 'Start a sprint', to: '/goals' }}
              />
            ) : (
              progress.map((p) => <ProgressLine key={p.id} row={p} />)
            )}
          </Band>

          {/* A manager who also works the floor keeps a personal lane here —
              it never displaces the cockpit above. */}
          <Lanes lanes={lanes} />
        </div>
      </div>
    </DashboardShell>
  );
}
