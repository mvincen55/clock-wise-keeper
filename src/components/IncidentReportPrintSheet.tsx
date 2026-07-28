import type { OrgBranding } from '@/hooks/useOrgBranding';
import type { IncidentReport } from '@/hooks/useIncidentReports';
import {
  CATEGORY_LABELS,
  PPE_LABELS,
  SEVERITY_LABELS,
  STATUS_LABELS,
  TREATMENT_LABELS,
  formatClockTime,
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
  branding: Pick<OrgBranding, 'displayName' | 'legalName' | 'addressLine1' | 'addressLine2' | 'phone' | 'logoUrl'>;
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

export default function IncidentReportPrintSheet({
  report,
  employeeName,
  branding,
}: IncidentPrintProps) {
  const time = formatClockTime(report.incident_time);

  return (
    <div className="inc-sheet">
      <div className="inc-head">
        <div>
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt={branding.displayName} className="inc-logo" />
          ) : (
            <p className="inc-practice">{branding.displayName || branding.legalName}</p>
          )}
          <p className="inc-practice-sub">
            {[branding.addressLine1, branding.addressLine2, branding.phone]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="inc-head-right">
          <p className="inc-title">Incident Report</p>
          <p className="inc-status">{labelFor(STATUS_LABELS, report.status)}</p>
        </div>
      </div>

      <div className="inc-grid">
        <Field label="Employee" value={employeeName} />
        <Field label="Date of incident" value={longDate(report.incident_date)} />
        <Field label="Time" value={time || 'Not recorded'} />
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
        <div className="inc-sign">
          <div className="inc-sign-line" />
          <p className="inc-sign-label">Employee signature / date</p>
        </div>
        <div className="inc-sign">
          <div className="inc-sign-line" />
          <p className="inc-sign-label">Manager signature / date</p>
        </div>
      </div>

      <p className="inc-foot">
        Filed by {report.reported_by_name || '—'} · {branding.legalName || branding.displayName}
        {' · '}Workplace safety record — retain per OSHA recordkeeping requirements.
      </p>
    </div>
  );
}
