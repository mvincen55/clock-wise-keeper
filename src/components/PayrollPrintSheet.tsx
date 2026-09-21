import type { OrgBranding } from '@/hooks/useOrgBranding';
import { formatDate, minutesToHHMM } from '@/lib/time-utils';
import { formatBreak, formatHoursMinutes, formatSignedHours } from '@/lib/payroll-utils';

/**
 * Printable payroll timesheet — the office's payroll record as a designed
 * document in the practice's document language (brand accent on white,
 * grayscale-safe), flowing over as many letter pages as the period needs.
 * Every clock-in and clock-out of every day, with breaks; hour
 * adjustments where they are paid, with their reason; weekly totals with
 * the over-40 flag; missing or incomplete time called out before anything
 * is sent; a signature block. Pure props → JSX; rendered via portal only
 * while printing (.payroll-print-root in index.css). Names are the
 * office's own team, never patients.
 */

export type PayrollPrintSegment = {
  /** Pre-formatted wall-clock times ("08:29 AM"); null when that punch is missing. */
  inTime: string | null;
  outTime: string | null;
  /** Source labels ("GPS", "Import", "Manual", "System"); printed when not Manual. */
  inSource?: string;
  outSource?: string;
  /** Minutes since the previous stretch's clock-out — lunch or a break. */
  breakMinutes: number | null;
};

export type PayrollPrintItem =
  | {
      kind: 'day';
      date: string;
      segments: PayrollPrintSegment[];
      totalMinutes: number | null;
      minutesLate: number;
      remote: boolean;
      edited: boolean;
      comment: string;
      /** 'OK', 'MISSING PUNCH', or 'ANOMALY' from the report's day check. */
      timeStatus: string;
    }
  | { kind: 'adjustment'; date: string; hoursDelta: number; reason: string };

export interface PayrollPrintEmployee {
  /** "Last, First · CODE" */
  label: string;
  /** Oldest first. */
  items: PayrollPrintItem[];
  recordedMinutes: number;
  adjustmentMinutes: number;
  /** Paid: recorded plus adjustments. */
  totalMinutes: number;
}

export interface PayrollPrintWeek {
  label: string;
  weekStart: string;
  workedMinutes: number;
  adjustmentMinutes: number;
  totalMinutes: number;
  otMinutes: number;
}

export interface PayrollPrintFlag {
  label: string;
  date: string;
  kind: string;
}

export interface PayrollPrintProps {
  /** "Weekly Timesheet", "Pay Period Summary", or "Monthly Summary". */
  title: string;
  periodStart: string;
  periodEnd: string;
  /** Display string, e.g. "Mon, Sep 21, 2026 03:40 PM". */
  generatedAt: string;
  preparedBy: string;
  branding: Pick<OrgBranding, 'displayName' | 'legalName' | 'logoUrl'>;
  totals: {
    payrollMinutes: number;
    recordedMinutes: number;
    adjustmentMinutes: number;
    daysWorked: number;
    lateDays: number;
    editedDays: number;
  };
  weeks: PayrollPrintWeek[];
  employees: PayrollPrintEmployee[];
  flags: PayrollPrintFlag[];
}

function Stretches({ segments }: { segments: PayrollPrintSegment[] }) {
  if (segments.length === 0) return <span className="pay-muted">No punches</span>;
  const src = (label?: string) => (label && label !== 'Manual' ? <span className="pay-src"> ({label})</span> : null);
  return (
    <div>
      {segments.map((seg, i) => (
        <div key={i}>
          {seg.breakMinutes != null && seg.breakMinutes > 0 && (
            <div className="pay-break">{formatBreak(seg.breakMinutes)} break</div>
          )}
          <div className="pay-stretch">
            {seg.inTime ? <>{seg.inTime}{src(seg.inSource)}</> : <span className="pay-flag">no clock in</span>}
            {' – '}
            {seg.outTime ? <>{seg.outTime}{src(seg.outSource)}</> : <span className="pay-flag">no clock out</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function DayNotes({ item }: { item: Extract<PayrollPrintItem, { kind: 'day' }> }) {
  const notes: string[] = [];
  if (item.timeStatus && item.timeStatus !== 'OK') notes.push(item.timeStatus);
  if (item.edited) notes.push('Edited');
  if (item.remote) notes.push('Remote');
  if (item.comment) notes.push(item.comment);
  return <>{notes.join(' · ')}</>;
}

export default function PayrollPrintSheet({
  title, periodStart, periodEnd, generatedAt, preparedBy, branding, totals, weeks, employees, flags,
}: PayrollPrintProps) {
  const period = `${formatDate(periodStart)} – ${formatDate(periodEnd)}`;
  const signedMinutes = (m: number) => `${m < 0 ? '−' : '+'}${minutesToHHMM(Math.abs(m))}`;

  return (
    <div className="pay-sheet">
      <header className="pay-head">
        <div className="pay-brand">
          {branding.logoUrl !== '' && (
            <img className="pay-logo" src={branding.logoUrl} alt={branding.displayName} />
          )}
          <div>
            <div className="pay-practice">{branding.displayName}</div>
            {branding.legalName !== '' && branding.legalName !== branding.displayName && (
              <div className="pay-legal">{branding.legalName}</div>
            )}
          </div>
        </div>
        <div className="pay-head-meta">
          <div className="pay-kicker">Payroll records</div>
          <div className="pay-title">{title}</div>
          <div className="pay-subtitle">{period}</div>
          <div className="pay-generated">Generated {generatedAt} · Prepared by {preparedBy}</div>
        </div>
      </header>

      <section className="pay-summary">
        <div className="pay-box">
          <div className="pay-box-value">{minutesToHHMM(totals.payrollMinutes)}</div>
          <div className="pay-box-label">Paid hours</div>
          {totals.adjustmentMinutes !== 0 && (
            <div className="pay-box-note">{minutesToHHMM(totals.recordedMinutes)} recorded {signedMinutes(totals.adjustmentMinutes)} adjustments</div>
          )}
        </div>
        <div className="pay-box">
          <div className="pay-box-value">{totals.daysWorked}</div>
          <div className="pay-box-label">Days worked</div>
        </div>
        <div className="pay-box">
          <div className="pay-box-value">{totals.lateDays}</div>
          <div className="pay-box-label">Late arrivals</div>
        </div>
        <div className="pay-box">
          <div className="pay-box-value">{totals.editedDays}</div>
          <div className="pay-box-label">Edited days</div>
        </div>
      </section>

      {flags.length > 0 && (
        <section className="pay-flags">
          <div className="pay-flags-title">
            Missing or incomplete time — {flags.length} item{flags.length === 1 ? '' : 's'} to resolve before hours are sent
          </div>
          <table className="pay-table">
            <thead>
              <tr><th>Team member</th><th>Date</th><th>Issue</th></tr>
            </thead>
            <tbody>
              {flags.map((f, i) => (
                <tr key={i}><td>{f.label}</td><td>{formatDate(f.date)}</td><td>{f.kind}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {weeks.length > 0 && (
        <section className="pay-section">
          <div className="pay-section-title">Weekly totals</div>
          <table className="pay-table">
            <thead>
              <tr>
                <th>Team member</th>
                <th>Week of</th>
                <th className="pay-num">Recorded</th>
                <th className="pay-num">Adjustments</th>
                <th className="pay-num">Paid hours</th>
                <th>Over 40 hours</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map(w => (
                <tr key={`${w.label}|${w.weekStart}`}>
                  <td>{w.label}</td>
                  <td>{formatDate(w.weekStart)}</td>
                  <td className="pay-num">{minutesToHHMM(w.workedMinutes)}</td>
                  <td className="pay-num">{w.adjustmentMinutes === 0 ? '' : signedMinutes(w.adjustmentMinutes)}</td>
                  <td className="pay-num pay-strong">{minutesToHHMM(w.totalMinutes)}</td>
                  <td className="pay-flag">{w.otMinutes > 0 ? `${formatHoursMinutes(w.otMinutes)} over` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pay-footnote">Overtime is flagged for the payroll operator, never computed as pay here.</div>
        </section>
      )}

      {employees.map(emp => (
        <section className="pay-employee" key={emp.label}>
          <div className="pay-employee-head">
            <span>{emp.label}</span>
            <span className="pay-num">{minutesToHHMM(emp.totalMinutes)} paid</span>
          </div>
          <table className="pay-table pay-days">
            <thead>
              <tr>
                <th>Date</th>
                <th>Clock in – clock out</th>
                <th className="pay-num">Hours</th>
                <th>Late</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {emp.items.map((item, i) =>
                item.kind === 'day' ? (
                  <tr key={`d-${item.date}-${i}`}>
                    <td className="pay-date">{formatDate(item.date)}</td>
                    <td><Stretches segments={item.segments} /></td>
                    <td className="pay-num">{item.totalMinutes != null ? minutesToHHMM(item.totalMinutes) : '—'}</td>
                    <td className="pay-flag">{item.minutesLate > 0 ? `${item.minutesLate}m late` : ''}</td>
                    <td className="pay-notes"><DayNotes item={item} /></td>
                  </tr>
                ) : (
                  <tr key={`a-${item.date}-${i}`} className="pay-adj">
                    <td className="pay-date">{formatDate(item.date)}</td>
                    <td colSpan={1}>
                      <div className="pay-strong">Hours adjustment</div>
                      <div className="pay-adj-reason">{item.reason}</div>
                    </td>
                    <td className="pay-num pay-strong">{formatSignedHours(item.hoursDelta)}</td>
                    <td></td>
                    <td className="pay-notes">Counts toward the hours paid this week</td>
                  </tr>
                ),
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} className="pay-foot-label">
                  {emp.adjustmentMinutes !== 0
                    ? `${minutesToHHMM(emp.recordedMinutes)} recorded ${signedMinutes(emp.adjustmentMinutes)} adjustments`
                    : 'Total'}
                </td>
                <td className="pay-num pay-strong">{minutesToHHMM(emp.totalMinutes)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </section>
      ))}

      <section className="pay-sign">
        <div>Prepared by ______________________________ Date ____________</div>
        <div>Reviewed by ______________________________ Date ____________</div>
      </section>

      <footer className="pay-page-footer">
        {branding.legalName || branding.displayName} · {title} · {period} · Payroll record
      </footer>
    </div>
  );
}
