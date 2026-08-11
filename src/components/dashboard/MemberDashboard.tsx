import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MemberView } from './types';
import {
  Band, DashboardShell, EmptyState, FigureStrip, Lanes, Masthead, MicroLabel, SignalRow,
  StatusDot, ViewContext,
} from './kit';

/**
 * TEAM MEMBER — "what should I do next, and how is our office doing?"
 *
 *   A  My next move — the one highest-priority assigned item (or "clear")
 *   B  Our office pulse — the same canonical month lines the owner reads,
 *      filtered per-metric by the office's visibility settings. Office-level
 *      only: no rankings, no personal attribution, no peer comparisons.
 *   C  role-relevant pulse + the operational-role lanes
 *   D  my open work
 *   E  the shared office goal
 *   F  personal utilities — recorded time, PTO, timesheet links. Useful, but
 *      deliberately at the bottom: Purple Envelope is not a time clock.
 *
 * Clocking stays in the shell's compact GlobalTimeControl / sticky mobile
 * bar. Time analytics live on the Timesheet page, not here.
 */
export default function MemberDashboard({ view }: { view: MemberView }) {
  const {
    header, next, officePulse, officePulseNote, rolePulse, mine, goal, status, utilities, lanes,
    roleContext,
  } = view;

  return (
    <DashboardShell>
      <Masthead
        officeName={header.officeName}
        roleLabel={header.roleLabel}
        title={header.personName}
        dateLabel={header.dateLabel}
        timeLabel={header.timeLabel}
      />

      <div className="mt-3">
        <ViewContext context={roleContext} />
      </div>

      {/* A — MY NEXT MOVE. One action, or a genuine all-clear. */}
      <section className="mt-6 overflow-hidden rounded-2xl bg-primary px-5 py-6 text-primary-foreground sm:px-7">
        <MicroLabel className="text-primary-foreground/70">My next move</MicroLabel>
        {next ? (
          <>
            <p className="mt-3 font-display text-[clamp(1.4rem,3.8vw,2rem)] font-extrabold leading-[0.95] tracking-[-0.025em]">
              {next.title}
            </p>
            <p className="mt-2 max-w-[52ch] text-[13.5px] leading-snug text-primary-foreground/75">
              {next.detail}
            </p>
            <Link
              to={next.href}
              className="group mt-5 inline-flex items-center gap-2 rounded-full border border-primary-foreground/70 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors hover:bg-primary-foreground hover:text-primary"
            >
              {next.cta}
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </>
        ) : (
          <p className="mt-3 max-w-[48ch] font-display text-[clamp(1.2rem,3.2vw,1.7rem)] font-bold leading-snug tracking-[-0.02em]">
            You&rsquo;re clear. Nothing is assigned to you right now.
          </p>
        )}
      </section>

      <div className="mt-8 grid gap-8 [&>*]:min-w-0 lg:grid-cols-[1.3fr_1fr] lg:gap-10">
        {/* Left: how the office is doing, and my role's slice of it. */}
        <div className="space-y-8">
          {/* B — OUR OFFICE PULSE. Real values when the office shares them;
              a hidden metric is simply absent — no locked teaser. */}
          {officePulse.length > 0 && (
            <Band title="Our office pulse" action={{ label: 'Close the Day', to: '/deposit-log' }}>
              <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
                {officePulse.map((line) => (
                  <div key={line.id} className="bg-card px-4 py-4">
                    <MicroLabel>{line.label}</MicroLabel>
                    <p
                      className={cn(
                        'mt-2 font-display text-[clamp(1.35rem,3vw,1.8rem)] font-extrabold leading-[0.9] tabular-nums tracking-[-0.03em]',
                        line.tone === 'attention' && 'text-warning',
                      )}
                    >
                      {line.value}
                    </p>
                    <p className="mt-1.5 text-[11.5px] leading-tight text-muted-foreground">{line.detail}</p>
                  </div>
                ))}
              </div>
              {officePulseNote && (
                <p className="mt-2 text-[11.5px] text-muted-foreground">{officePulseNote}</p>
              )}
              <p className="mt-1 text-[11.5px] text-muted-foreground">
                Office totals only — this is a shared scoreboard, never an individual one.
              </p>
            </Band>
          )}

          {/* C — the slice of the office that belongs to my role. */}
          {rolePulse.length > 0 && (
            <Band title="For my role">
              {rolePulse.map((item) => (
                <SignalRow key={item.id} signal={item} />
              ))}
            </Band>
          )}

          {/* C — role lanes: primary sets emphasis, backups stay compact. */}
          <Lanes lanes={lanes} />
        </div>

        {/* Right: my open work, the shared goal, my utilities. */}
        <div className="space-y-8">
          {/* D — MY OPEN WORK. */}
          <Band title="My open work" count={`${mine.length}`} action={{ label: 'Workplace', to: '/workplace' }}>
            {mine.length === 0 ? (
              <EmptyState
                tone="good"
                title="You're clear."
                detail="Nothing is assigned to you. Anything new will land here and in your inbox."
              />
            ) : (
              mine.map((s) => <SignalRow key={s.id} signal={s} />)
            )}
          </Band>

          {/* E — the shared office goal. Office-level, never personal blame. */}
          <Band title="Office goal" action={{ label: 'Goals', to: '/goals' }}>
            {goal ? (
              <div className="border-b border-border py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="text-[14.5px] font-semibold leading-snug">{goal.title}</p>
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
                <p className="mt-3 font-display text-[1.7rem] font-extrabold leading-none tabular-nums tracking-[-0.02em]">
                  {goal.done}
                  <span className="text-[1.1rem] text-muted-foreground"> / {goal.total}</span>
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
                <p className="mt-2 text-[12px] text-muted-foreground">
                  A shared office result — {goal.remaining} to go, ends {goal.endsLabel}.
                </p>
              </div>
            ) : (
              <EmptyState
                tone="neutral"
                title="No office goal is running."
                detail="When the office starts a sprint, its shared progress lives here."
              />
            )}
          </Band>

          {/* F — personal utilities. Present, honest, and not the headline. */}
          <Band title="My time & PTO" action={{ label: 'Timesheet', to: '/timesheet' }}>
            <div className="flex items-center gap-2.5 border-b border-border py-3">
              <StatusDot tone={status.tone} />
              <p className="text-[13.5px] font-medium">{status.label}</p>
              <p className="min-w-0 flex-1 truncate text-right text-[12px] text-muted-foreground">
                {status.detail}
              </p>
            </div>
            <FigureStrip figures={utilities} />
          </Band>
        </div>
      </div>
    </DashboardShell>
  );
}
