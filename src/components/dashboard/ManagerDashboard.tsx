import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import type { ManagerView } from './types';
import {
  Band, DashboardShell, EmptyLine, FigureStrip, Masthead, PersonRow, ProgressLine,
  SignalRow, TimelineLine,
} from './kit';

/**
 * MANAGER — live operational cockpit.
 *
 * Reads as: who is here, what needs attention, what to do next, are we on
 * track. The clock stays in the shell's compact GlobalTimeControl; there is
 * deliberately no time-clock card here.
 */
export default function ManagerDashboard({ view }: { view: ManagerView }) {
  const { header, figures, roster, attention, progress, timeline } = view;
  const open = attention.filter((a) => a.value !== '0');

  return (
    <DashboardShell>
      <Masthead
        officeName={header.officeName}
        roleLabel={header.roleLabel}
        title="The floor"
        dateLabel={header.dateLabel}
        timeLabel={header.timeLabel}
        right={
          <Link
            to="/approvals"
            className="group inline-flex items-center gap-2 border-2 border-foreground px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors hover:bg-foreground hover:text-background"
          >
            Approvals
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5" />
          </Link>
        }
      />

      <div className="mt-6 border-y-2 border-foreground">
        <FigureStrip figures={figures} />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1.3fr_1fr] lg:gap-8">
        {/* Who is here — first thing a manager looks for. */}
        <Band title="On the floor" count={`${roster.length}`} action={{ label: 'Team', to: '/team' }}>
          {roster.length === 0 ? (
            <EmptyLine>Nobody is scheduled today.</EmptyLine>
          ) : (
            roster.map((p) => <PersonRow key={p.id} person={p} />)
          )}
        </Band>

        {/* The dominant column: what needs hands. */}
        <div className="space-y-8 lg:order-none">
          <Band title="Needs attention" count={`${open.length} open`}>
            {open.length === 0 ? (
              <EmptyLine>Nothing outstanding. The floor is clear.</EmptyLine>
            ) : (
              open.map((s) => <SignalRow key={s.id} signal={s} />)
            )}
          </Band>

          <Band title="On track?" action={{ label: 'Checklists', to: '/checklists' }}>
            {progress.length === 0 ? (
              <EmptyLine>No checklists are set up for today.</EmptyLine>
            ) : (
              progress.map((p) => <ProgressLine key={p.id} row={p} />)
            )}
          </Band>
        </div>

        {/* Today, in order. */}
        <Band title="Today" action={{ label: 'Huddle', to: '/morning-huddle' }}>
          {timeline.length === 0 ? (
            <EmptyLine>Nothing logged yet today.</EmptyLine>
          ) : (
            timeline.map((t) => <TimelineLine key={t.id} row={t} />)
          )}
        </Band>
      </div>
    </DashboardShell>
  );
}
