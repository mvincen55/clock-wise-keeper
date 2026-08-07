import type { ChecklistCompletion } from '@/lib/broken-appts/checklist';
import type { Rung } from '@/lib/broken-appts/types';

/**
 * The office-only documentation page printed LAST in the Broken Appointment
 * package: what this workflow decided and what the employee actually
 * completed, action by action. Never handed to the patient — the banner
 * says so in print. Applicable actions that were NOT checked are shown as
 * "Not completed at time of print", never hidden: the page records reality.
 *
 * Pure props → JSX (FofPrintSheet pattern). HIPAA boundary: everything on
 * this page comes from React state and exists only on screen and on paper
 * (src/lib/broken-appts/types.ts).
 */

export interface OfficeCopyChecklistRow {
  label: string;
  completion: ChecklistCompletion | null;
}

interface BaOfficeCopySheetProps {
  patientName: string;
  /** The broken appointment's date, M/D/YYYY ('—' when not entered). */
  apptDateMDY: string;
  /** e.g. "Late cancellation" / "No-show". */
  eventLabel: string;
  rung: Rung;
  /** Today's Dentrix event code (9100 / 9101). */
  eventCode: string;
  /** The date the workflow ran, M/D/YYYY. */
  workflowDateMDY: string;
  /** Canonical staff code of the logged-in team member. */
  staffCode: string;
  checklist: OfficeCopyChecklistRow[];
  /** True when this page follows a patient letter in the same print job. */
  startOnNewPage?: boolean;
}

export default function BaOfficeCopySheet({
  patientName,
  apptDateMDY,
  eventLabel,
  rung,
  eventCode,
  workflowDateMDY,
  staffCode,
  checklist,
  startOnNewPage = true,
}: BaOfficeCopySheetProps) {
  return (
    <div className={startOnNewPage ? 'ba-office-sheet ba-office-sheet--break' : 'ba-office-sheet'}>
      <div className="ba-office-heading">OFFICE COPY</div>
      <div className="ba-office-subheading">Broken Appointment Documentation</div>
      <div className="ba-office-banner">DO NOT GIVE TO PATIENT</div>

      <table className="ba-office-context">
        <tbody>
          <tr>
            <th>Patient</th>
            <td>{patientName.trim() || '—'}</td>
            <th>Appointment date</th>
            <td>{apptDateMDY}</td>
          </tr>
          <tr>
            <th>Event</th>
            <td>{eventLabel}</td>
            <th>Final rung</th>
            <td>Rung {rung}</td>
          </tr>
          <tr>
            <th>Event code</th>
            <td>{eventCode}</td>
            <th>Workflow date</th>
            <td>{workflowDateMDY}</td>
          </tr>
          <tr>
            <th>Team member</th>
            <td colSpan={3}>{staffCode}</td>
          </tr>
        </tbody>
      </table>

      <table className="ba-office-actions">
        <thead>
          <tr>
            <th>Action</th>
            <th>Completed by</th>
            <th>Date</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {checklist.map(({ label, completion }, i) => (
            <tr key={i}>
              <td>{label}</td>
              {completion ? (
                <>
                  <td>{completion.staffCode}</td>
                  <td>{completion.date}</td>
                  <td>{completion.time}</td>
                </>
              ) : (
                <td colSpan={3} className="ba-office-incomplete">
                  Not completed at time of print
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ba-office-fineprint">
        Internal record of the Broken Appointment workflow — file with the office's
        records. This page documents staff actions only.
      </div>
    </div>
  );
}
