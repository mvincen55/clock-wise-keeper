import type { Goal, GoalTask, GoalUpdate } from '@/hooks/useGoals';
import { UPDATE_STATUS_LABELS, monthLabel } from '@/hooks/useGoals';
import { parseTargetNumber } from '@/components/goals/TargetProgress';
import type { OrgBranding } from '@/hooks/useOrgBranding';

/**
 * Printable Monthly Goals Report — one letter page (or more, flowing) that
 * summarizes every team member's SMART goal, plan progress, measurable
 * target, and latest check-in note for a month. Same document language as
 * the FOF / deposit / incident sheets: brand accent on white, grayscale
 * safe, pure props → JSX so the preview and the printed page can't drift.
 */

export interface GoalsReportRow {
  name: string;
  goal?: Goal;
  tasks: GoalTask[];
  latestUpdate?: GoalUpdate;
}

interface Props {
  month: string;
  rows: GoalsReportRow[];
  branding: Pick<OrgBranding, 'displayName' | 'legalName' | 'logoUrl'>;
  /** Who ran the report; printed in the footer band. */
  preparedBy?: string;
}

function printedNow(): string {
  return new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  });
}

function Bar({ fraction }: { fraction: number }) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <div className="goal-bar">
      <div className="goal-bar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

function MemberBlock({ row, month }: { row: GoalsReportRow; month: string }) {
  const { name, goal, tasks, latestUpdate } = row;
  const done = tasks.filter(t => t.done).length;
  const total = tasks.length;
  const fraction = total > 0 ? done / total : 0;
  const targetNumber = goal ? parseTargetNumber(goal.smart_target) : null;
  const soFar = targetNumber === null ? null : Math.round(fraction * targetNumber);

  return (
    <section className="goal-block">
      <div className="goal-block-head">
        <span className="goal-name">{name}</span>
        {goal && latestUpdate && (
          <span className={`goal-chip goal-chip-${latestUpdate.status}`}>
            {UPDATE_STATUS_LABELS[latestUpdate.status]}
          </span>
        )}
        {!goal && <span className="goal-chip goal-chip-none">No goal set</span>}
      </div>

      {goal ? (
        <>
          <p className="goal-title">{goal.title}</p>
          {goal.description && <p className="goal-desc">{goal.description}</p>}

          <div className="goal-metrics">
            <div className="goal-metric">
              <div className="goal-metric-head">
                <span>Plan progress</span>
                <span className="goal-metric-value">
                  {total > 0 ? `${done} of ${total} steps` : 'No steps yet'}
                </span>
              </div>
              <Bar fraction={fraction} />
            </div>
            {goal.smart_target && (
              <div className="goal-metric">
                <div className="goal-metric-head">
                  <span>Target: {goal.smart_target}</span>
                  {soFar !== null && (
                    <span className="goal-metric-value">
                      {soFar} of {targetNumber}
                    </span>
                  )}
                </div>
                <Bar fraction={fraction} />
              </div>
            )}
          </div>

          {total > 0 && (
            <ul className="goal-steps">
              {tasks.map(t => (
                <li key={t.id} className={t.done ? 'goal-step-done' : undefined}>
                  <span className="goal-step-box">{t.done ? '✓' : ''}</span>
                  <span>{t.title}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="goal-note">
            <div className="goal-note-label">Latest check-in</div>
            {latestUpdate ? (
              <p className="goal-note-body">{latestUpdate.content}</p>
            ) : (
              <p className="goal-note-empty">No check-in shared this month.</p>
            )}
          </div>
        </>
      ) : (
        <p className="goal-note-empty">Nothing set for {monthLabel(month)}.</p>
      )}
    </section>
  );
}

export default function GoalsPrintSheet({ month, rows, branding, preparedBy }: Props) {
  const withGoals = rows.filter(r => r.goal);
  const onTrack = withGoals.filter(r => r.latestUpdate?.status === 'on_track').length;
  const atRisk = withGoals.filter(r => r.latestUpdate?.status === 'at_risk').length;
  const complete = withGoals.filter(r => r.latestUpdate?.status === 'done').length;

  return (
    <div className="goal-sheet">
      <header className="goal-head">
        {branding.logoUrl !== '' && (
          <img className="goal-logo" src={branding.logoUrl} alt={branding.displayName} />
        )}
        <div className="goal-head-meta">
          <div className="goal-kicker">Monthly Goals</div>
          <div className="goal-doc-title">Team Goals Report</div>
          <div className="goal-subtitle">{monthLabel(month)}</div>
        </div>
      </header>

      <div className="goal-summary">
        <div className="goal-stat">
          <span className="goal-stat-num">{withGoals.length}</span>
          <span className="goal-stat-label">Goals set</span>
        </div>
        <div className="goal-stat">
          <span className="goal-stat-num">{onTrack}</span>
          <span className="goal-stat-label">On track</span>
        </div>
        <div className="goal-stat">
          <span className="goal-stat-num">{atRisk}</span>
          <span className="goal-stat-label">At risk</span>
        </div>
        <div className="goal-stat">
          <span className="goal-stat-num">{complete}</span>
          <span className="goal-stat-label">Done</span>
        </div>
      </div>

      <div className="goal-body">
        {rows.map(r => (
          <MemberBlock key={r.name + (r.goal?.id ?? '')} row={r} month={month} />
        ))}
        {rows.length === 0 && <p className="goal-note-empty">No team members to report on.</p>}
      </div>

      <footer className="goal-page-footer">
        {branding.legalName || branding.displayName} · Monthly Goals Report ·{' '}
        {monthLabel(month)} · Printed {printedNow()}
        {preparedBy ? ` by ${preparedBy}` : ''}
      </footer>
    </div>
  );
}
