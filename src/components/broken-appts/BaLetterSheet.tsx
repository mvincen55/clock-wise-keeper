import { Fragment } from 'react';
import OfficeLetterheadSheet, {
  type LetterheadBranding,
} from '@/components/letterhead/OfficeLetterheadSheet';
import { formatDateMDY, formatMoney, mergeFields } from '@/lib/broken-appts/outputs';
import { formatLetterDate } from '@/lib/letters/letter-body';
import type { BaCanceledAppt, BaPatientFields, BaSettings } from '@/lib/broken-appts/types';

/**
 * The printed broken-appointment letter. The approved template wording,
 * merge fields, rung logic, and enclosure line live here; the letterhead
 * itself (logo masthead, dateline, recipient block, closing, footer, page
 * behavior) comes from the shared OfficeLetterheadSheet — this module no
 * longer owns any letter layout of its own. Pure props → JSX with no hooks
 * or fetching; rendered once as the on-screen preview and once via portal
 * (.letter-print-root) as the print output so the two can never diverge.
 * Rung 4's appointment table overflows to an attachment page automatically.
 *
 * HIPAA boundary: patient values arrive as props from React state only —
 * never persisted or transmitted (see src/lib/broken-appts/types.ts).
 */

/** Rows beyond this print as the attachment page instead of inline. */
export const INLINE_APPT_ROWS_MAX = 6;

interface BaLetterSheetProps {
  branding: LetterheadBranding;
  settings: BaSettings;
  /** Letter template body ({{merge_field}} placeholders, **bold** runs). */
  body: string;
  patient: BaPatientFields;
  /** Rung 4: the canceled future appointments listed in the letter. */
  canceledAppts?: BaCanceledAppt[];
  /** Letter date (ISO YYYY-MM-DD) — computed once by the page. */
  todayISO: string;
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
  todayISO,
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
  });

  const paragraphs = merged.split(/\n\n+/).filter(p => p.trim() !== '');
  const patientFullName = [patient.firstName, patient.lastName]
    .map(p => p.trim())
    .filter(Boolean)
    .join(' ');

  // Broken-appointment letters are always mailed: blank address lines print
  // as a written-in dash rather than collapsing.
  const recipient = {
    name: patientFullName || '—',
    addressLine1: patient.addressLine1.trim() || '—',
    addressLine2: '',
    city: patient.city.trim() || '—',
    state: patient.state.trim(),
    zip: patient.zip.trim(),
  };

  const letterBody = (
    <>
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
      <p className="letter-fineprint">
        This letter is generated automatically by our scheduling system as part of our
        standard record-keeping for every patient.
      </p>
    </>
  );

  const todayText = formatLetterDate(todayISO);

  return (
    <OfficeLetterheadSheet
      branding={branding}
      dateText={todayText}
      recipient={recipient}
      salutation={`Dear ${patient.firstName.trim() || 'patient'},`}
      body={letterBody}
      signer={{
        closing: 'Warm regards,',
        name: settings.signatureName.trim() || practiceName,
        title: settings.signatureName.trim() !== '' ? settings.signatureTitle : '',
      }}
      enclosure="Enclosure: Account Statement"
      attachment={
        tableAttached ? (
          <div className="letter-attach-page">
            <div className="letter-attach-title">Attached Appointment List</div>
            <div className="letter-attach-sub">
              {patientFullName || '—'} · Prepared {todayText} · {canceledAppts.length} canceled
              appointments
            </div>
            <ApptTable rows={canceledAppts} />
          </div>
        ) : undefined
      }
    />
  );
}
