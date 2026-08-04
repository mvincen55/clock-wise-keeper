import { Fragment } from 'react';
import type { OrgBranding } from '@/hooks/useOrgBranding';
import { formatDateMDY, formatMoney, mergeFields } from '@/lib/broken-appts/outputs';
import type { BaCanceledAppt, BaPatientFields, BaSettings } from '@/lib/broken-appts/types';

/**
 * The printed broken-appointment letter — letterhead (org logo above the
 * practice name when one is uploaded), dateline, patient address block,
 * salutation, merged body, automatic-letter line, closing, and enclosure
 * footer. Pure props → JSX with no hooks or fetching (FofPrintSheet
 * pattern); rendered once as the on-screen preview and once via portal as
 * the print output so the two can never diverge. Styled by the .ba-* rules
 * in index.css (pt/in units, one letter page; Rung 4's appointment table
 * overflows to an attachment page automatically). The org brand accent
 * stays in the letterhead — body typography is neutral correspondence
 * styling.
 *
 * HIPAA boundary: patient values arrive as props from React state only —
 * never persisted or transmitted (see src/lib/broken-appts/types.ts).
 */

/** Rows beyond this print as the attachment page instead of inline. */
export const INLINE_APPT_ROWS_MAX = 6;

interface BaLetterSheetProps {
  branding: Pick<
    OrgBranding,
    'displayName' | 'legalName' | 'addressLine1' | 'addressLine2' | 'phone' | 'logoUrl'
  >;
  settings: BaSettings;
  /** Letter template body ({{merge_field}} placeholders, **bold** runs). */
  body: string;
  patient: BaPatientFields;
  /** Rung 4: the canceled future appointments listed in the letter. */
  canceledAppts?: BaCanceledAppt[];
  /** Dateline, e.g. "8/3/2026" — computed once by the page. */
  todayMDY: string;
  /**
   * Caller-resolved merge values the card state selects —
   * transaction_snippet and card_sentence (already fee-resolved).
   */
  extraFields?: Record<string, string>;
}

/** **bold** runs → <strong>; everything else passes through verbatim. */
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : <Fragment key={i}>{part}</Fragment>));
}

function ApptTable({ rows }: { rows: BaCanceledAppt[] }) {
  return (
    <table className="ba-appt-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Time</th>
          <th>Provider</th>
          <th>Visit Type</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>{r.date ? formatDateMDY(r.date) : '—'}</td>
            <td>{r.time || '—'}</td>
            <td>{r.provider || '—'}</td>
            <td>{r.visitType || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function BaLetterSheet({
  branding,
  settings,
  body,
  patient,
  canceledAppts = [],
  todayMDY,
  extraFields = {},
}: BaLetterSheetProps) {
  const practiceName = branding.legalName.trim() || branding.displayName.trim();
  const phone = settings.officePhone.trim() || branding.phone.trim();
  const tableAttached = canceledAppts.length > INLINE_APPT_ROWS_MAX;

  const merged = mergeFields(body, {
    first_name: patient.firstName.trim() || 'patient',
    appt_date: patient.apptDateISO ? formatDateMDY(patient.apptDateISO) : '—',
    office_phone: phone,
    fee_amount: formatMoney(settings.feeAmount),
    prepay_floor: formatMoney(settings.vipPrepayFloor),
    notice_hours: String(settings.noticeBusinessHours),
    ...extraFields,
  });

  const paragraphs = merged.split(/\n\n+/).filter(p => p.trim() !== '');
  const patientFullName = [patient.firstName, patient.lastName]
    .map(p => p.trim())
    .filter(Boolean)
    .join(' ');
  const cityLine = [patient.city.trim(), [patient.state.trim(), patient.zip.trim()].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="ba-letter">
      <header className="ba-letterhead">
        <div className="ba-letterhead-id">
          {/* Org-branding asset (same pipeline as the FOF print); absent
              logo falls back to the text-only letterhead with no gap. */}
          {branding.logoUrl !== '' && (
            <img className="ba-logo" src={branding.logoUrl} alt={practiceName} />
          )}
          <div className="ba-letterhead-name">{practiceName}</div>
        </div>
        <div className="ba-letterhead-meta">
          {branding.addressLine1}
          <br />
          {branding.addressLine2}
          <br />
          {phone}
        </div>
      </header>

      <div className="ba-dateline">{todayMDY}</div>

      <div className="ba-address-block">
        {patientFullName || '—'}
        <br />
        {patient.addressLine1 || '—'}
        <br />
        {cityLine || '—'}
      </div>

      <p className="ba-salutation">Dear {patient.firstName.trim() || 'patient'},</p>

      <div className="ba-body">
        {paragraphs.map((para, i) => {
          if (para.trim() === '{{appointment_table}}') {
            if (canceledAppts.length === 0) return null;
            return tableAttached ? (
              <p key={i}>
                <strong>A full appointment list is attached.</strong>
              </p>
            ) : (
              <ApptTable key={i} rows={canceledAppts} />
            );
          }
          return <p key={i}>{renderInline(para)}</p>;
        })}
      </div>

      <p className="ba-auto-line">
        This letter is generated automatically by our scheduling system as part of our
        standard record-keeping for every patient.
      </p>

      <div className="ba-closing">
        Warm regards,
        <div className="ba-signature-name">{settings.signatureName.trim() || practiceName}</div>
        {settings.signatureName.trim() !== '' && (
          <div className="ba-signature-title">{settings.signatureTitle}</div>
        )}
      </div>

      <div className="ba-enclosure">Enclosure: Account Statement</div>

      {tableAttached && (
        <div className="ba-attach-page">
          <div className="ba-attach-title">Attached Appointment List</div>
          <div className="ba-attach-sub">
            {patientFullName || '—'} · Prepared {todayMDY} · {canceledAppts.length} canceled
            appointments
          </div>
          <ApptTable rows={canceledAppts} />
        </div>
      )}
    </div>
  );
}
