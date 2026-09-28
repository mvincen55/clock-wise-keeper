import type { OrgBranding } from '@/hooks/useOrgBranding';
import type { AttendanceIncidentEvent, IncidentReport } from '@/hooks/useIncidentReports';
import {
  CATEGORY_LABELS,
  PPE_LABELS,
  SEVERITY_LABELS,
  STATUS_LABELS,
  TREATMENT_LABELS,
  formatClockTime,
  formatSignedAt,
  isAttendanceReport,
  labelFor,
} from '@/lib/incidents';
import { ruleClause } from '@/lib/late-arrivals';

/**
 * Printable Incident Report — one letter page in the practice's document
 * language, for the safety binder and the OSHA sharps log. Pure props →
 * JSX; rendered via portal only while printing (.incident-print-root in
 * index.css). Workplace safety facts only; no patient identifiers.
 */

export interface IncidentPrintProps {
  report: IncidentReport;
  /** Who the report is about. */
  employeeName: string;
  branding: Pick<
    OrgBranding,
    'displayName' | 'legalName' | 'addressLine1' | 'addressLine2' | 'phone' | 'website' | 'logoUrl'
  >;
  /** Attendance reports only: the late arrivals the report is about. Ignored by the safety sheet. */
  events?: AttendanceIncidentEvent[];
}

const longDate = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

/** The role that countersigned, as it reads on paper. */
const roleWord = (role: string): string =>
  role === 'owner' ? 'Owner' : role === 'manager' ? 'Manager' : role;

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="inc-field">
      <span className="inc-field-label">{label}</span>
      <span className="inc-field-value">{value || '—'}</span>
    </div>
  );
}

function Block({ label, value }: { label: string; value: string }) {
  return (
    <div className="inc-block">
      <p className="inc-block-label">{label}</p>
      <p className="inc-block-value">{value || '—'}</p>
    </div>
  );
}

/**
 * One signature slot. A signature given in the app prints as the typed
 * name over the rule with the stamped time under it; an unsigned slot
 * prints the empty rule, so the same sheet works on paper when someone
 * signs in ink instead.
 */
function Signature({
  label,
  name,
  signedAt,
  note,
}: {
  label: string;
  name: string;
  signedAt: string | null;
  note?: string;
}) {
  const stamped = formatSignedAt(signedAt);
  return (
    <div className="inc-sign">
      <div className="inc-sign-line">
        {stamped && <span className="inc-sign-name">{name}</span>}
      </div>
      <p className="inc-sign-label">{label}</p>
      {stamped ? (
        <p className="inc-sign-meta">Signed electronically · {stamped}{note ? ` · ${note}` : ''}</p>
      ) : (
        <p className="inc-sign-meta">Not signed</p>
      )}
    </div>
  );
}

/** A punch time as it reads on paper, in the office's clock. */
const clockOf = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
};

/**
 * The attendance report on paper: the rule, the period, every late
 * arrival with its date and minutes, the totals, the meeting record, the
 * team member's comment, and both signatures. Same letterhead and print
 * language as the safety sheet; none of the safety fields.
 */
function AttendancePrintSheet({ report, employeeName, branding, events = [] }: IncidentPrintProps) {
  const rule = report.rule_threshold_count && report.rule_window_days
    ? ruleClause({ threshold_count: report.rule_threshold_count, threshold_window_days: report.rule_window_days, is_active: true })
    : 'the office late-arrival rule';
  const period = report.period_start && report.period_end
    ? `${longDate(report.period_start)} – ${longDate(report.period_end)}`
    : longDate(report.incident_date);
  const qualifying = events.filter(e => e.role === 'qualifying');
  const followUps = events.filter(e => e.role === 'follow_up');
  const eventLine = (e: AttendanceIncidentEvent) =>
    `${e.minutes_late} min late · scheduled ${formatClockTime(e.expected_start_time)}${e.actual_start_time ? `, arrived ${clockOf(e.actual_start_time)}` : ''}`;

  return (
    <div className="inc-sheet">
      <header className="inc-head">
        {branding.logoUrl ? (
          <img src={branding.logoUrl} alt={branding.displayName} className="inc-logo" />
        ) : (
          <p className="inc-practice">{branding.displayName || branding.legalName}</p>
        )}
        <div className="inc-head-meta">
          <p className="inc-title">Attendance Incident Report</p>
          <div className="inc-meta-item">
            <span className="inc-meta-key">Team member</span>
            <span className="inc-meta-value">{employeeName}</span>
          </div>
          <div className="inc-meta-item">
            <span className="inc-meta-key">Period</span>
            <span className="inc-meta-value">{period}</span>
          </div>
          <div className="inc-meta-item">
            <span className="inc-meta-key">Status</span>
            <span className="inc-meta-value">{labelFor(STATUS_LABELS, report.status)}</span>
          </div>
        </div>
      </header>

      <div className="inc-grid">
        <Field label="Rule" value={rule} />
        <Field label="Late arrivals" value={String(report.occurrence_count ?? qualifying.length)} />
        <Field label="Total minutes late" value={String(report.total_minutes_late ?? 0)} />
        <Field label="Opened" value={formatSignedAt(report.created_at)} />
      </div>

      <Block label="Summary" value={report.description} />

      <div className="inc-block">
        <p className="inc-block-label">Late arrivals in this report</p>
        <div className="inc-grid inc-grid-tight">
          {qualifying.map(e => (
            <Field key={e.id} label={longDate(e.entry_date)} value={eventLine(e)} />
          ))}
          {qualifying.length === 0 && <Field label="Records" value="—" />}
        </div>
        {followUps.length > 0 && (
          <>
            <p className="inc-block-label">Later late arrivals while the report was open (linked, not counted above)</p>
            <div className="inc-grid inc-grid-tight">
              {followUps.map(e => (
                <Field key={e.id} label={longDate(e.entry_date)} value={eventLine(e)} />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="inc-review">
        <p className="inc-block-label">Meeting</p>
        <div className="inc-grid inc-grid-tight">
          <Field label="Meeting date" value={report.meeting_date ? longDate(report.meeting_date) : 'Not recorded'} />
          <Field label="Recorded by" value={report.meeting_recorded_at ? report.reviewed_by_name : ''} />
        </div>
        <p className="inc-block-value">{report.meeting_summary || '—'}</p>
        {report.meeting_next_steps && (
          <p className="inc-block-value">Next steps: {report.meeting_next_steps}</p>
        )}
      </div>

      <Block label="Team member comment" value={report.employee_comment} />

      <div className="inc-signatures">
        <Signature
          label="Team member signature / date — confirms the discussion and receipt, not agreement with every statement"
          name={report.employee_signature}
          signedAt={report.employee_signed_at}
        />
        <Signature
          label={report.countersign_role === 'owner' ? 'Owner signature / date' : 'Manager signature / date'}
          name={report.manager_signature}
          signedAt={report.manager_signed_at}
          note={report.manager_signed_role ? roleWord(report.manager_signed_role) : ''}
        />
      </div>

      <p className="inc-foot">
        Opened automatically by the office late-arrival rule · {branding.legalName || branding.displayName}
        {' · '}Attendance record — documents a threshold crossing; it is not a disciplinary decision.
      </p>

      <footer className="inc-footer">
        {(branding.addressLine1 || branding.addressLine2) && (
          <span className="inc-footer-item">
            {[branding.addressLine1, branding.addressLine2].filter(Boolean).join(', ')}
          </span>
        )}
        {branding.phone && <span className="inc-footer-item">{branding.phone}</span>}
        {branding.website && <span className="inc-footer-item">{branding.website}</span>}
      </footer>
    </div>
  );
}

export default function IncidentReportPrintSheet(props: IncidentPrintProps) {
  if (isAttendanceReport(props.report)) return <AttendancePrintSheet {...props} />;
  return <SafetyPrintSheet {...props} />;
}

function SafetyPrintSheet({
  report,
  employeeName,
  branding,
}: IncidentPrintProps) {
  const time = formatClockTime(report.incident_time);

  return (
    <div className="inc-sheet">
      {/* Letterhead in the FOF's language: the office logo carries the
          page, the document's own facts sit opposite it. */}
      <header className="inc-head">
        {branding.logoUrl ? (
          <img src={branding.logoUrl} alt={branding.displayName} className="inc-logo" />
        ) : (
          <p className="inc-practice">{branding.displayName || branding.legalName}</p>
        )}
        <div className="inc-head-meta">
          <p className="inc-title">Incident Report</p>
          <div className="inc-meta-item">
            <span className="inc-meta-key">Employee</span>
            <span className="inc-meta-value">{employeeName}</span>
          </div>
          <div className="inc-meta-item">
            <span className="inc-meta-key">Date</span>
            <span className="inc-meta-value">
              {longDate(report.incident_date)}
              {time ? ` · ${time}` : ''}
            </span>
          </div>
          <div className="inc-meta-item">
            <span className="inc-meta-key">Status</span>
            <span className="inc-meta-value">{labelFor(STATUS_LABELS, report.status)}</span>
          </div>
        </div>
      </header>

      <div className="inc-grid">
        <Field label="Type" value={labelFor(CATEGORY_LABELS, report.category)} />
        <Field label="Severity" value={labelFor(SEVERITY_LABELS, report.severity)} />
        <Field label="Location" value={report.location} />
        <Field label="Body part" value={report.body_part} />
        <Field label="Instrument / device" value={report.device_involved} />
        <Field label="PPE worn" value={labelFor(PPE_LABELS, report.ppe_worn)} />
        <Field label="Medical treatment" value={labelFor(TREATMENT_LABELS, report.medical_treatment)} />
        <Field label="Work related" value={report.work_related ? 'Yes' : 'No'} />
        <Field label="Work days missed" value={String(report.days_away)} />
      </div>

      <Block label="What happened" value={report.description} />
      <Block label="Action taken immediately" value={report.immediate_action} />
      <Block label="Witnesses" value={report.witnesses} />

      <div className="inc-review">
        <p className="inc-block-label">Manager review</p>
        <div className="inc-grid inc-grid-tight">
          <Field label="Reviewed by" value={report.reviewed_by_name} />
          <Field
            label="Follow-up required"
            value={report.follow_up_required ? 'Yes' : 'No'}
          />
        </div>
        <p className="inc-block-value">{report.review_notes || '—'}</p>
        {report.follow_up_notes && (
          <p className="inc-block-value">Follow-up: {report.follow_up_notes}</p>
        )}
      </div>

      <div className="inc-signatures">
        <Signature
          label="Employee signature / date"
          name={report.employee_signature}
          signedAt={report.employee_signed_at}
        />
        <Signature
          label={
            report.countersign_role === 'owner'
              ? 'Owner signature / date'
              : 'Manager or owner signature / date'
          }
          name={report.manager_signature}
          signedAt={report.manager_signed_at}
          note={report.manager_signed_role ? roleWord(report.manager_signed_role) : ''}
        />
      </div>

      <p className="inc-foot">
        Filed by {report.reported_by_name || '—'} · {branding.legalName || branding.displayName}
        {' · '}Workplace safety record — retain per OSHA recordkeeping requirements.
      </p>

      {/* The same brand band that anchors the FOF. */}
      <footer className="inc-footer">
        {(branding.addressLine1 || branding.addressLine2) && (
          <span className="inc-footer-item">
            {[branding.addressLine1, branding.addressLine2].filter(Boolean).join(', ')}
          </span>
        )}
        {branding.phone && <span className="inc-footer-item">{branding.phone}</span>}
        {branding.website && <span className="inc-footer-item">{branding.website}</span>}
      </footer>
    </div>
  );
}
