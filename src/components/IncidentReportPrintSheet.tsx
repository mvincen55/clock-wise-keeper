import type { OrgBranding } from '@/hooks/useOrgBranding';
import type { IncidentReport } from '@/hooks/useIncidentReports';
import {
  CATEGORY_LABELS,
  PPE_LABELS,
  SEVERITY_LABELS,
  STATUS_LABELS,
  TREATMENT_LABELS,
  formatClockTime,
  formatSignedAt,
  labelFor,
} from '@/lib/incidents';

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

export default function IncidentReportPrintSheet({
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
