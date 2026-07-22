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
 * The paper Financial Options Form — card-based layout: logo + date/patient
 * header, treatment + hero total, cost breakdown beside a key-note callout,
 * agreement cards with per-visit cells, contact band, marked footnotes,
 * signature block, footer. Pure props → JSX with no hooks or fetching;
 * rendered once as the on-screen preview and once (via portal) as the
 * print output so the two can never diverge. Styled by the .fof-* rules in
 * index.css (pt/in units, one letter page).
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
  // page points at exactly one note: * validity ↔ Total Cost, ** prepay
  // terms ↔ discount, *** insurance disclaimer ↔ insurance rows.
  const validityMark = template.validityNote.trim() ? '*' : '';
  const prepayMark = template.prepayNote.trim() && showDiscountRow ? '**' : '';
  const insuranceMark =
    template.insuranceNote.trim() && (template.showInsuranceEstimate || template.showWriteOff)
      ? '***'
      : '';

  // The most relevant note is promoted into the callout card beside the
  // cost breakdown; it keeps its marker and is dropped from the footnotes.
  const callout = insuranceMark
    ? { title: 'Estimates Only', mark: insuranceMark, text: template.insuranceNote }
    : prepayMark
      ? { title: 'Prepay Discount Terms', mark: prepayMark, text: template.prepayNote }
      : template.validityNote.trim()
        ? { title: 'Please Note', mark: validityMark, text: template.validityNote }
        : null;

  const footnoteItems: string[] = [];
  if (validityMark && callout?.mark !== validityMark) {
    footnoteItems.push(`${validityMark} ${template.validityNote}`);
  }
  if (prepayMark && callout?.mark !== prepayMark) {
    footnoteItems.push(`${prepayMark} ${template.prepayNote}`);
  }
  for (const extra of template.footnotes) footnoteItems.push(extra);

  const installmentCells = effective.installmentsCents.map((cents, i) => ({
    heading: effective.installmentsCents.length > 1 ? `Payment ${i + 1}` : 'Payment',
    label: computation.installmentLabels[i] ?? `Installment ${i + 1}`,
    cents,
  }));

  // Content-aware density: long treatment lines, big footnote blocks, and
  // double agreement cards tighten spacing/type in steps so the form
  // always fits one letter page and still looks composed.
  const contentScore =
    patient.treatment.length +
    footnoteItems.join(' ').length / 2 +
    (callout ? callout.text.length / 4 : 0) +
    (template.contactNote.trim() ? 80 : 0) +
    (template.showPrepayOption ? 120 : 0) +
    (template.showInstallmentOption ? 60 + installmentCells.length * 30 : 0);
  const densityClass =
    contentScore > 700 ? ' fof-dense fof-denser' : contentScore > 520 ? ' fof-dense' : '';

  return (
    <div className={`fof-sheet${densityClass}`}>
      <header className="fof-head">
        <img className="fof-logo" src={logoUrl} alt={practice.practiceName} />
        <div className="fof-head-meta">
          <div>
            <span className="fof-meta-key">Date</span>
            <span className="fof-meta-value">
              {patient.dateISO ? formatDateMDY(patient.dateISO) : '—'}
            </span>
          </div>
          <div>
            <span className="fof-meta-key">Patient</span>
            <span className="fof-meta-value">{patient.patientName || '—'}</span>
          </div>
        </div>
      </header>

      <section className="fof-hero">
        <div className="fof-hero-treatment">
          <div className="fof-kicker">Your Treatment</div>
          <div className="fof-treatment-text">{patient.treatment || '—'}</div>
        </div>
        <div className="fof-hero-card">
          <div className="fof-kicker">Your Total Cost (Your Portion)</div>
          <div className="fof-hero-amount">{formatCents(effective.patientPortionCents)}</div>
          <div className="fof-hero-sub">
            {template.showInsuranceEstimate
              ? 'This is your estimated out-of-pocket amount.'
              : 'This is your estimated cost for the treatment above.'}
          </div>
        </div>
      </section>

      <section className="fof-cards">
        <div className="fof-card fof-breakdown">
          <div className="fof-card-title">Cost Breakdown</div>
          <div className="fof-row">
            <span>Total (Estimated) Cost{validityMark}</span>
            <span>{formatCents(totalCents)}</span>
          </div>
          {(amounts.officeDiscountCents ?? 0) > 0 && (
            <div className="fof-row">
              <span>Office Discount</span>
              <span>−{formatCents(amounts.officeDiscountCents!)}</span>
            </div>
          )}
          {(amounts.patientCreditCents ?? 0) > 0 && (
            <div className="fof-row">
              <span>Patient Current Credit</span>
              <span>−{formatCents(amounts.patientCreditCents!)}</span>
            </div>
          )}
          {amounts.autoDiscount && amounts.autoDiscount.cents > 0 && (
            <div className="fof-row">
              <span>{amounts.autoDiscount.label}</span>
              <span>−{formatCents(amounts.autoDiscount.cents)}</span>
            </div>
          )}
          {template.showInsuranceEstimate && (amounts.insuranceEstimateCents ?? 0) > 0 && (
            <div className="fof-row">
              <span>Estimated Insurance Payment{insuranceMark}</span>
              <span>−{formatCents(amounts.insuranceEstimateCents ?? 0)}</span>
            </div>
          )}
          {template.showWriteOff && (amounts.writeOffCents ?? 0) > 0 && (
            <div className="fof-row">
              <span>Estimated Insurance Write-Off{insuranceMark}</span>
              <span>−{formatCents(amounts.writeOffCents ?? 0)}</span>
            </div>
          )}
          <div className="fof-row fof-row-total">
            <span>You Pay (Your Portion)</span>
            <span>{formatCents(effective.patientPortionCents)}</span>
          </div>
        </div>

        {callout && (
          <div className="fof-card fof-callout">
            <div className="fof-card-title">
              {callout.title}
              {callout.mark}
            </div>
            <p>{callout.text}</p>
          </div>
        )}
      </section>

      {template.showPrepayOption && (
        <section className="fof-agreement">
          <div className="fof-agreement-title">Prepay in Full Agreement</div>
          <div className="fof-cells">
            <div className="fof-cell">
              <div className="fof-cell-head">Total Patient Portion</div>
              <div className="fof-cell-amount">{formatCents(effective.patientPortionCents)}</div>
            </div>
            {showDiscountRow && (
              <div className="fof-cell">
                <div className="fof-cell-head">
                  {template.discountLabel}
                  {prepayMark}
                </div>
                <div className="fof-cell-amount">−{formatCents(effective.discountCents)}</div>
              </div>
            )}
            <div className="fof-cell fof-cell-total">
              <div className="fof-cell-head">Total Due</div>
              <div className="fof-cell-amount">{formatCents(effective.prepayTotalCents)}</div>
            </div>
          </div>
        </section>
      )}

      {template.showInstallmentOption && (
        <section className="fof-agreement">
          <div className="fof-agreement-title">Payment Installment Agreement</div>
          <div className="fof-cells">
            {installmentCells.map((cell, i) => (
              <div className="fof-cell" key={i}>
                <div className="fof-cell-head">{cell.heading}</div>
                <div className="fof-cell-label">{cell.label}</div>
                <div className="fof-cell-amount">{formatCents(cell.cents)}</div>
              </div>
            ))}
            <div className="fof-cell fof-cell-total">
              <div className="fof-cell-head">Total Due</div>
              <div className="fof-cell-amount">{formatCents(effective.patientPortionCents)}</div>
            </div>
          </div>
        </section>
      )}

      {template.contactNote.trim() !== '' && (
        <section className="fof-band">{template.contactNote}</section>
      )}

      {footnoteItems.length > 0 && (
        <div className="fof-footnotes">
          {footnoteItems.map((text, i) => (
            <p key={i}>{text}</p>
          ))}
        </div>
      )}

      <div className="fof-signatures">
        {/* The patient hand-writes their printed name here; only the top
            of the form is auto-filled. */}
        <div className="fof-sig-row fof-sig-ack">
          <div className="fof-sig-field fof-sig-ack-name">
            <div className="fof-sig-line" />
            <div className="fof-sig-caption">Patient's Printed Name</div>
          </div>
          <div className="fof-sig-ack-text">{template.signatureIntro}</div>
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
