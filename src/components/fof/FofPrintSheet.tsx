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

// Tiny inline icons (lucide outlines) — self-contained so the printed
// page never depends on a font or network asset.
const iconProps = {
  className: 'fof-icon',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const CalendarIcon = () => (
  <svg {...iconProps}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);
const UserIcon = () => (
  <svg {...iconProps}>
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);
const ShieldIcon = () => (
  <svg {...iconProps}>
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);
const PhoneIcon = () => (
  <svg {...iconProps}>
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);
const MailIcon = () => (
  <svg {...iconProps}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);
const PinIcon = () => (
  <svg {...iconProps}>
    <path d="M20 10c0 4.99-5.54 10.19-7.4 11.79a1 1 0 0 1-1.2 0C9.54 20.19 4 14.99 4 10a8 8 0 0 1 16 0" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);
const GlobeIcon = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20" />
  </svg>
);
// Filled scalloped seal with a white dollar sign (the "you save" badge).
const DollarSealIcon = () => (
  <svg className="fof-icon" viewBox="0 0 24 24">
    <path
      fill="currentColor"
      d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"
    />
    <g fill="none" stroke="white" strokeWidth="1.7" strokeLinecap="round">
      <path d="M14.3 9.2h-3.4a1.45 1.45 0 1 0 0 2.9h2.2a1.45 1.45 0 1 1 0 2.9H9.7" />
      <path d="M12 7.4v9.2" />
    </g>
  </svg>
);
// Filled info dot for the fine-print block.
const InfoIcon = () => (
  <svg className="fof-icon" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" fill="currentColor" />
    <path
      d="M12 16.2v-5M12 7.8h.01"
      fill="none"
      stroke="white"
      strokeWidth="2.2"
      strokeLinecap="round"
    />
  </svg>
);
const CircleDollarIcon = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="10" />
    <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
    <path d="M12 18V6" />
  </svg>
);

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
  // The insurance disclaimer only earns its spot when an insurance row
  // actually prints — no payment and no write-off means no note.
  const insuranceRowsShown =
    (template.showInsuranceEstimate && (amounts.insuranceEstimateCents ?? 0) > 0) ||
    (template.showWriteOff && (amounts.writeOffCents ?? 0) > 0);
  const insuranceMark = template.insuranceNote.trim() && insuranceRowsShown ? '***' : '';

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

  // Both agreements side-by-side under "Choose Your Payment Option";
  // a lone agreement keeps the full-width card.
  const bothOptions = template.showPrepayOption && template.showInstallmentOption;

  // Content-aware density: long treatment lines, big footnote blocks, and
  // double agreement cards tighten spacing/type in steps so the form
  // always fits one letter page and still looks composed.
  const contentScore =
    patient.treatment.length +
    footnoteItems.join(' ').length / 2 +
    (callout ? callout.text.length / 4 : 0) +
    (template.contactNote.trim() ? 80 : 0) +
    (bothOptions
      ? 150 + installmentCells.length * 14
      : (template.showPrepayOption ? 120 : 0) +
        (template.showInstallmentOption ? 60 + installmentCells.length * 30 : 0));
  const densityClass =
    contentScore > 700 ? ' fof-dense fof-denser' : contentScore > 520 ? ' fof-dense' : '';

  return (
    <div className={`fof-sheet${densityClass}`}>
      <header className="fof-head">
        <img className="fof-logo" src={logoUrl} alt={practice.practiceName} />
        <div className="fof-head-meta">
          <div className="fof-meta-item">
            <CalendarIcon />
            <span className="fof-meta-key">Date</span>
            <span className="fof-meta-value">
              {patient.dateISO ? formatDateMDY(patient.dateISO) : '—'}
            </span>
          </div>
          <div className="fof-meta-item">
            <UserIcon />
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
              <span>{amounts.officeDiscountLabel?.trim() || 'Office Discount'}</span>
              <span>−{formatCents(amounts.officeDiscountCents!)}</span>
            </div>
          )}
          {(amounts.patientCreditCents ?? 0) > 0 && (
            <div className="fof-row">
              <span>Patient Current Credit</span>
              <span>−{formatCents(amounts.patientCreditCents!)}</span>
            </div>
          )}
          {(amounts.membershipCoveredCents ?? 0) > 0 && (
            <div className="fof-row">
              <span>Included with Illumitrac Membership</span>
              <span>−{formatCents(amounts.membershipCoveredCents!)}</span>
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
            <div className="fof-callout-inner">
              <span className="fof-icon-bubble">
                <ShieldIcon />
              </span>
              <div>
                <div className="fof-card-title">
                  {callout.title}
                  {callout.mark}
                </div>
                <p>{callout.text}</p>
              </div>
            </div>
          </div>
        )}
      </section>

      {bothOptions ? (
        <section className="fof-options">
          <div className="fof-options-head">Choose Your Payment Option</div>
          <div className="fof-options-row">
            <div className="fof-option">
              <div className="fof-option-title">
                <span className="fof-option-icon">
                  <CircleDollarIcon />
                </span>
                Option 1 · Prepay in Full — Pay Today &amp; Save
              </div>
              <div className="fof-option-body">
                <div className="fof-row">
                  <span>Total Patient Portion</span>
                  <span>{formatCents(effective.patientPortionCents)}</span>
                </div>
                {showDiscountRow && (
                  <div className="fof-row">
                    <span>
                      {template.discountLabel}
                      {prepayMark}
                    </span>
                    <span>−{formatCents(effective.discountCents)}</span>
                  </div>
                )}
                <div className="fof-row fof-row-total">
                  <span>Total Due Today</span>
                  <span>{formatCents(effective.prepayTotalCents)}</span>
                </div>
                {effective.discountCents > 0 && (
                  <div className="fof-save-chip">
                    <span className="fof-save-seal">
                      <DollarSealIcon />
                    </span>
                    <span>
                      <strong>You save {formatCents(effective.discountCents)}</strong> when
                      you prepay in full.
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="fof-or">or</div>
            <div className="fof-option">
              <div className="fof-option-title">
                <span className="fof-option-icon">
                  <CalendarIcon />
                </span>
                Option 2 · Payment Installment Agreement
              </div>
              <div className="fof-option-body">
                {installmentCells.map((cell, i) => (
                  <div className="fof-row" key={i}>
                    <span>{cell.label}</span>
                    <span>{formatCents(cell.cents)}</span>
                  </div>
                ))}
                <div className="fof-row fof-row-total">
                  <span>Total Due</span>
                  <span>{formatCents(effective.patientPortionCents)}</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : template.showPrepayOption ? (
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
      ) : template.showInstallmentOption ? (
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
      ) : null}

      {template.contactNote.trim() !== '' && (
        <section className="fof-band fof-band-split">
          <div className="fof-band-cell">
            <span className="fof-icon-bubble">
              <PhoneIcon />
            </span>
            <div>
              <div className="fof-band-title">Financing Options Available</div>
              <p>
                We offer outside financing through trusted providers. Call us at{' '}
                {practice.phone} to learn more — or with any questions about this form.
              </p>
            </div>
          </div>
        </section>
      )}

      {footnoteItems.length > 0 && (
        <div className="fof-footnotes">
          <span className="fof-info-badge">
            <InfoIcon />
          </span>
          <div className="fof-footnotes-list">
            {footnoteItems.map((text, i) => (
              <p key={i}>{text}</p>
            ))}
          </div>
        </div>
      )}

      <div className="fof-signatures">
        {/* The patient hand-writes their printed name here; only the top
            of the form is auto-filled. The blank sits inline so the whole
            thing reads as one sentence, caption tucked under the blank. */}
        <p className="fof-sig-ack">
          <span className="fof-sig-ack-blank">
            <span className="fof-sig-ack-line" />
            <span className="fof-sig-ack-caption">Patient's Printed Name</span>
          </span>
          <span className="fof-sig-ack-text">{template.signatureIntro}</span>
        </p>

        {/* Checkboxes only make sense as a choice — with a single
            agreement offered there's nothing to pick, so no boxes. */}
        {template.showPrepayOption && template.showInstallmentOption && (
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
        )}

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
        <span className="fof-footer-item">
          <PinIcon />
          {practice.addressLine1}, {practice.addressLine2}
        </span>
        <span className="fof-footer-item">
          <PhoneIcon />
          {practice.phone}
        </span>
        {practice.website.trim() !== '' && (
          <span className="fof-footer-item">
            <GlobeIcon />
            {practice.website}
          </span>
        )}
      </footer>
    </div>
  );
}
