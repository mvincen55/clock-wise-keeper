import type {
  FofAmounts,
  FofComputation,
  FofPatientFields,
  FofPracticeInfo,
  FofTemplate,
} from '@/lib/fof/types';
import { formatCents } from '@/lib/fof/money';
import logoUrl from '@/assets/harelick-logo.png';

/**
 * The paper Financial Options Form. Pure props → JSX with no hooks or
 * fetching; rendered once as the on-screen preview and once (via portal)
 * as the print output so the two can never diverge. Styled by the
 * .fof-sheet rules in index.css (pt/in units, one letter page).
 */

interface FofPrintSheetProps {
  practice: FofPracticeInfo;
  template: FofTemplate;
  patient: FofPatientFields;
  /** Effective (post-override) totals shown on the form. */
  amounts: FofAmounts;
  computation: FofComputation;
}

function formatDateMDY(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${m}/${d}/${y}`;
}

function Blank({ value, minWidth }: { value: string; minWidth?: string }) {
  return (
    <span className="fof-blank" style={minWidth ? { minWidth } : undefined}>
      {value || ' '}
    </span>
  );
}

export default function FofPrintSheet({
  practice,
  template,
  patient,
  amounts,
  computation,
}: FofPrintSheetProps) {
  const { effective } = computation;
  const totalCents = amounts.totalCents ?? 0;
  const showDiscountRow = template.discountPercent > 0 || template.discountLabel.trim() !== '';

  // Asterisk markers are assigned deterministically so every star on the
  // page points at exactly one footnote: * validity ↔ Total Cost,
  // ** prepay terms ↔ discount, *** insurance disclaimer ↔ insurance rows.
  const validityMark = template.validityNote.trim() ? '*' : '';
  const prepayMark = template.prepayNote.trim() && showDiscountRow ? '**' : '';
  const insuranceMark =
    template.insuranceNote.trim() && (template.showInsuranceEstimate || template.showWriteOff)
      ? '***'
      : '';

  return (
    <div className="fof-sheet">
      <header className="fof-header">
        <img className="fof-logo" src={logoUrl} alt={practice.practiceName} />
      </header>

      <div className="fof-meta">
        <div className="fof-meta-field">
          <span className="fof-label">Patient Name:</span>
          <Blank value={patient.patientName} minWidth="2.4in" />
        </div>
        <div className="fof-meta-field">
          <span className="fof-label">Date:</span>
          <Blank value={patient.dateISO ? formatDateMDY(patient.dateISO) : ''} minWidth="1in" />
        </div>
      </div>

      <div className="fof-meta-field fof-treatment">
        <span className="fof-label">Treatment:</span>
        <Blank value={patient.treatment} minWidth="4.5in" />
      </div>

      <div className="fof-costs">
        <div className="fof-cost-row">
          <span>Total (Estimated) Cost{validityMark}:</span>
          <span>{formatCents(totalCents)}</span>
        </div>
        {(amounts.officeDiscountCents ?? 0) > 0 && (
          <div className="fof-cost-row">
            <span>Office Discount:</span>
            <span>−{formatCents(amounts.officeDiscountCents!)}</span>
          </div>
        )}
        {(amounts.patientCreditCents ?? 0) > 0 && (
          <div className="fof-cost-row">
            <span>Patient Current Credit:</span>
            <span>−{formatCents(amounts.patientCreditCents!)}</span>
          </div>
        )}
        {amounts.autoDiscount && amounts.autoDiscount.cents > 0 && (
          <div className="fof-cost-row">
            <span>{amounts.autoDiscount.label}:</span>
            <span>−{formatCents(amounts.autoDiscount.cents)}</span>
          </div>
        )}
        {template.showInsuranceEstimate && (
          <div className="fof-cost-row">
            <span>Estimated Insurance Payment{insuranceMark}:</span>
            <span>−{formatCents(amounts.insuranceEstimateCents ?? 0)}</span>
          </div>
        )}
        {template.showWriteOff && (
          <div className="fof-cost-row">
            <span>Estimated Insurance Write-Off{insuranceMark}:</span>
            <span>−{formatCents(amounts.writeOffCents ?? 0)}</span>
          </div>
        )}
        <div className="fof-cost-row fof-cost-total">
          <span>Patient's Portion:</span>
          <span>{formatCents(effective.patientPortionCents)}</span>
        </div>
      </div>

      <div className="fof-agreements">
        {template.showPrepayOption && (
          <div className="fof-box">
            <div className="fof-box-title">Prepay in Full Agreement</div>
            <div className="fof-cost-row">
              <span>Total Patient Portion:</span>
              <span>{formatCents(effective.patientPortionCents)}</span>
            </div>
            {showDiscountRow && (
              <div className="fof-cost-row">
                <span>{template.discountLabel}{prepayMark}:</span>
                <span>−{formatCents(effective.discountCents)}</span>
              </div>
            )}
            <div className="fof-cost-row fof-cost-total">
              <span>TOTAL DUE:</span>
              <span>{formatCents(effective.prepayTotalCents)}</span>
            </div>
          </div>
        )}
        {template.showInstallmentOption && (
          <div className="fof-box">
            <div className="fof-box-title">Payment Installment Agreement</div>
            {effective.installmentsCents.map((cents, i) => (
              <div className="fof-cost-row" key={i}>
                <span>{computation.installmentLabels[i] ?? `Installment ${i + 1}`}:</span>
                <span>{formatCents(cents)}</span>
              </div>
            ))}
            <div className="fof-cost-row fof-cost-total">
              <span>TOTAL DUE:</span>
              <span>{formatCents(effective.patientPortionCents)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="fof-footnotes">
        {validityMark && <p>{validityMark}{template.validityNote}</p>}
        {prepayMark && <p>{prepayMark}{template.prepayNote}</p>}
        {insuranceMark && <p>{insuranceMark}{template.insuranceNote}</p>}
        {template.contactNote.trim() && <p>{template.contactNote}</p>}
        {template.footnotes.map((text, i) => (
          <p key={i}>{text}</p>
        ))}
      </div>

      <div className="fof-signatures">
        {/* The patient hand-writes their printed name here; only the top
            of the form is auto-filled. */}
        <div className="fof-sig-intro">
          <span className="fof-sig-name-block">
            <Blank value="" minWidth="2.4in" />
            <span className="fof-sig-caption">Patient's Printed Name</span>
          </span>{' '}
          {template.signatureIntro}
        </div>

        <div className="fof-choices">
          {template.showPrepayOption && (
            <div className="fof-choice">
              <span className="fof-checkbox" /> Prepay in Full Agreement
            </div>
          )}
          {template.showInstallmentOption && (
            <div className="fof-choice">
              <span className="fof-checkbox" /> Payment Installment Agreement
            </div>
          )}
        </div>

        <div className="fof-sig-row">
          <div className="fof-sig-field fof-sig-wide">
            <div className="fof-sig-line" />
            <div className="fof-sig-caption">Patient Signature</div>
          </div>
          <div className="fof-sig-field">
            <div className="fof-sig-line" />
            <div className="fof-sig-caption">Date</div>
          </div>
        </div>
        <div className="fof-sig-row">
          <div className="fof-sig-field fof-sig-wide">
            <div className="fof-sig-line" />
            <div className="fof-sig-caption">{practice.practiceName} Representative</div>
          </div>
          <div className="fof-sig-field">
            <div className="fof-sig-line" />
            <div className="fof-sig-caption">Date</div>
          </div>
        </div>
      </div>

      <footer className="fof-footer">
        <span className="fof-footer-name">{practice.practiceName}</span>
        <span>
          {practice.addressLine1}, {practice.addressLine2} · {practice.phone}
          {practice.website.trim() ? ` · ${practice.website}` : ''}
        </span>
      </footer>
    </div>
  );
}
