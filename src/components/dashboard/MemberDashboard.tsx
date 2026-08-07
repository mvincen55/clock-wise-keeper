import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MemberView } from './types';
import {
  Band, DashboardShell, EmptyLine, FigureStrip, Lanes, Masthead, MicroLabel, ProgressLine,
  SignalRow, StatusDot, ViewContext, toneText,
} from './kit';
import { TrendChart } from './charts';

/**
 * TEAM MEMBER — personal launchpad.
 *
 * Own status, one next action, then my work. Clocking stays in the shell's
 * compact control / sticky mobile bar so the product never reads as a time
 * clock. Nothing management-only is rendered here.
 */
export default function MemberDashboard({ view }: { view: MemberView }) {
  const { header, status, next, mine, progress, figures, office, chart, lanes, roleContext } = view;

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

      {/* First viewport: status + the single next action. */}
      <div className="mt-6 grid gap-px bg-border md:grid-cols-[1fr_1.15fr]">
        <div className="bg-background px-5 py-6 sm:px-6">
          <MicroLabel>Today</MicroLabel>
          <div className="mt-3 flex items-center gap-2.5">
            <StatusDot tone={status.tone} className="h-2.5 w-2.5" />
            <p
              className={cn(
                'font-display text-[clamp(1.5rem,4.5vw,2.25rem)] font-extrabold uppercase leading-[0.9] tracking-[-0.03em]',
                toneText[status.tone],
              )}
            >
              {status.label}
            </p>
          </div>
          <p className="mt-3 max-w-[36ch] text-[13.5px] leading-snug text-muted-foreground">{status.detail}</p>
        </div>

        <div className="bg-primary px-5 py-6 text-primary-foreground sm:px-6">
          <MicroLabel className="text-primary-foreground/70">Next</MicroLabel>
          {next ? (
            <>
              <p className="mt-3 font-display text-[clamp(1.35rem,3.6vw,1.9rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.025em]">
                {next.title}
              </p>
              <p className="mt-2 max-w-[42ch] text-[13.5px] leading-snug text-primary-foreground/75">
                {next.detail}
              </p>
              <Link
                to={next.href}
                className="group mt-5 inline-flex items-center gap-2 border-2 border-primary-foreground px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors hover:bg-primary-foreground hover:text-primary"
              >
                {next.cta}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </>
          ) : (
            <p className="mt-3 max-w-[38ch] text-[14px] leading-snug text-primary-foreground/80">
              You are clear. Nothing is assigned to you right now.
            </p>
          )}
        </div>
      </div>

      <div className="mt-8 border-y-2 border-foreground">
        <FigureStrip figures={figures} />
      </div>

      <div className="mt-8 grid gap-8 [&>*]:min-w-0 lg:grid-cols-[1.3fr_1fr] lg:gap-10">
        <div className="space-y-8">
          <Band title="Open for me" count={`${mine.length}`} action={{ label: 'Workplace', to: '/workplace' }}>
            {mine.length === 0 ? (
              <EmptyLine>Nothing open. Anything new will land here and in your inbox.</EmptyLine>
            ) : (
              mine.map((s) => <SignalRow key={s.id} signal={s} />)
            )}
          </Band>

          {/* Primary operational role sets the emphasis; backup roles stay
              compact underneath unless they are being covered today. */}
          <Lanes lanes={lanes} />
        </div>

        <div className="space-y-8">
          <Band title="My progress" action={{ label: 'Goals', to: '/goals' }}>
            {progress.length === 0 ? (
              <EmptyLine>No goals set for this month.</EmptyLine>
            ) : (
              progress.map((p) => <ProgressLine key={p.id} row={p} />)
            )}
          </Band>

          {chart && <TrendChart series={chart} />}

          <Band title="Around the office">
            {office.length === 0 ? (
              <EmptyLine>No announcements.</EmptyLine>
            ) : (
              office.map((s) => <SignalRow key={s.id} signal={s} />)
            )}
          </Band>
        </div>
      </div>
    </DashboardShell>
  );
}
