import { formatCents, formatDateLong, formatDateShort } from '@/lib/account-balance/money';
import { lowerFirstWord } from '@/lib/account-balance/procedure-language';
import type { Cents, PatientExplanation } from '@/lib/account-balance/types';

/**
 * The printed ACCOUNT BALANCE EXPLANATION — a polished, patient-facing
 * financial explanation, not an accounting export. Pure props → JSX with no
 * hooks or fetching; rendered once inside ScaledPrintPreview and once via a
 * print portal so the preview and the paper can never diverge. Styled by the
 * .abx-* rules in index.css (pt/in units, US Letter, multi-page allowed).
 *
 * HIPAA boundary: every prop value is in-memory session data. This component
 * must never log, persist, or transmit anything; internal classifications,
 * confidence scores, and reconciliation mechanics never appear here.
 */

export interface AbxPracticeInfo {
  practiceName: string;
  addressLine1: string;
  addressLine2: string;
  phone: string;
  website: string;
  /** Public URL or data: URI; empty = no logo printed. */
  logoUrl: string;
}

interface AccountBalancePrintSheetProps {
  practice: AbxPracticeInfo;
  explanation: PatientExplanation;
}

// Tiny inline icons — self-contained so the printed page never depends on a
// font or network asset (FofPrintSheet pattern).
const iconProps = {
  className: 'abx-icon',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const PhoneIcon = () => (
  <svg {...iconProps}>
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
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
const ShieldIcon = () => (
  <svg {...iconProps}>
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
  </svg>
);

/** How the visit balances add up to the current balance, in one line. */
function balanceSentence(e: PatientExplanation): string {
  const parts: Array<{ cents: Cents; text: string }> = [];
  if (e.broughtForward) {
    parts.push({ cents: e.broughtForward.amountCents, text: `${formatCents(e.broughtForward.amountCents)} brought forward` });
  }
  for (const section of e.sections) {
    if (section.remainingCents === 0) continue;
    const when = section.dateISO ? ` from ${formatDateShort(section.dateISO)}` : '';
    parts.push({
      cents: section.remainingCents,
      text:
        section.remainingCents < 0
          ? `${formatCents(-section.remainingCents)} credit${when}`
          : `${formatCents(section.remainingCents)} balance${when}`,
    });
  }
  for (const credit of e.generalCredits) {
    parts.push({ cents: credit.amountCents, text: `${formatCents(Math.abs(credit.amountCents))} ${lowerFirstWord(credit.label)}` });
  }
  if (parts.length === 0) return 'Every visit on this statement is paid in full.';
  if (parts.length === 1) return `The ${parts[0].text}.`;
  // One minus glyph throughout: the typographic "−", never the ASCII hyphen.
  const signed = (cents: Cents) => `${cents < 0 ? '−' : ''}${formatCents(Math.abs(cents))}`;
  const sum = parts
    .map((p, i) => (i === 0 ? signed(p.cents) : `${p.cents < 0 ? '−' : '+'} ${formatCents(Math.abs(p.cents))}`))
    .join(' ');
  const words = parts
    .map((p, i) => (i === 0 ? `The ${p.text}` : p.cents < 0 ? `less the ${p.text}` : `plus the ${p.text}`))
    .join(', ');
  return `${words}: ${sum} = ${signed(e.calculationTotalCents)}.`;
}

export default function AccountBalancePrintSheet({
  practice,
  explanation,
}: AccountBalancePrintSheetProps) {
  const e = explanation;

  return (
    <div className="abx-sheet">
      <header className="abx-head">
        <div className="abx-head-identity">
          {practice.logoUrl !== '' && (
            <img className="abx-logo" src={practice.logoUrl} alt={practice.practiceName} />
          )}
          {practice.practiceName.trim() !== '' && (
            <div className="abx-practice-name">{practice.practiceName}</div>
          )}
        </div>
        <div className="abx-head-meta">
          <div className="abx-doc-title">Account Balance Explanation</div>
          <div className="abx-meta-line abx-meta-due">
            <span className="abx-meta-key">Balance due</span> {formatCents(e.currentBalanceCents)}
          </div>
          {e.patientName.trim() !== '' && (
            <div className="abx-meta-line">
              <span className="abx-meta-key">Patient</span> {e.patientName}
            </div>
          )}
          {e.statementThroughDateISO !== '' && (
            <div className="abx-meta-line">
              <span className="abx-meta-key">Statement through</span>{' '}
              {formatDateLong(e.statementThroughDateISO)}
            </div>
          )}
        </div>
      </header>

      <p className="abx-intro">
        Each date of service is shown separately. Insurance payments are matched to the
        appointment they paid.
      </p>

      {e.broughtForward && (
        <div className="abx-invoice">
          <div className="abx-invoice-head">
            <span className="abx-invoice-date">Before {formatDateShort(e.broughtForward.beforeDateISO)}</span>
            <span className="abx-invoice-title">Balance brought forward</span>
          </div>
          <div className="abx-invoice-body">
            <p className="abx-invoice-desc">
              This part of the balance comes from account activity before the period shown
              on this statement.
            </p>
            <div className="abx-row abx-row-total">
              <span>Balance brought forward</span>
              <span>{formatCents(e.broughtForward.amountCents)}</span>
            </div>
          </div>
        </div>
      )}

      {e.sections.map((section, i) => (
        <div className="abx-invoice" key={i}>
          <div className="abx-invoice-head">
            <span className="abx-invoice-date">
              {section.dateISO ? formatDateShort(section.dateISO) : 'Date not read'}
            </span>
            <span className="abx-invoice-title">
              {section.services.length > 1 ? section.summaryLabel : section.title}
            </span>
          </div>
          <div className="abx-invoice-body">
            {section.serviceSentence !== '' && (
              <p className="abx-invoice-desc">{section.serviceSentence}</p>
            )}
            <div className="abx-row">
              <span>{section.services.length > 1 ? 'Visit charges' : 'Charge'}</span>
              <span>{formatCents(section.servicesTotalCents)}</span>
            </div>
            {section.insurancePaidCents !== 0 && (
              <div className="abx-row">
                <span>
                  Insurance payment{section.insurancePaymentDatesISO.length > 1 ? 's' : ''} received
                  {section.insurancePaymentDatesISO.length > 0 &&
                    ` ${section.insurancePaymentDatesISO.map(formatDateShort).join(' and ')}`}
                </span>
                <span>{formatCents(section.insurancePaidCents)}</span>
              </div>
            )}
            {section.insuranceAppliedCents !== null && section.insurancePaidCents === 0 && (
              <div className="abx-row">
                <span>Insurance applied</span>
                <span>{formatCents(section.insuranceAppliedCents)}</span>
              </div>
            )}
            {section.patientPaidCents !== 0 && (
              <div className="abx-row">
                <span>Your payment</span>
                <span>{formatCents(section.patientPaidCents)}</span>
              </div>
            )}
            <div className="abx-row abx-row-total">
              <span>
                {section.remainingCents < 0 ? 'Credit remaining from this visit' : 'Patient balance from this visit'}
              </span>
              <span>
                {section.remainingCents < 0
                  ? `${formatCents(-section.remainingCents)} credit`
                  : formatCents(section.remainingCents)}
              </span>
            </div>
            {section.contextNote !== '' && (
              <p className="abx-card-note">{section.contextNote}</p>
            )}
          </div>
        </div>
      ))}

      {e.generalCredits.length > 0 && (
        <div className="abx-invoice">
          <div className="abx-invoice-head">
            <span className="abx-invoice-title">Other payments &amp; credits</span>
          </div>
          <div className="abx-invoice-body">
            {e.generalCredits.map((credit, i) => (
              <div className="abx-row" key={i}>
                <span>{credit.label}</span>
                <span>{formatCents(credit.amountCents)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <section className="abx-calc">
        <div className="abx-calc-head">
          <span className="abx-calc-title">Current balance due</span>
          <span className="abx-calc-amount">{formatCents(e.calculationTotalCents)}</span>
        </div>
        <p className="abx-calc-explain">{balanceSentence(e)}</p>
      </section>

      {e.otherActivity.length > 0 && (
        <>
          <div className="abx-section-head">Other account activity</div>
          {e.otherActivity.map((item, i) => (
            <div className="abx-card abx-card-muted" key={i}>
              <div className="abx-card-title">{item.title}</div>
              {item.lines.map((line, j) => (
                <div className="abx-row" key={j}>
                  <span>{line.label}</span>
                  <span>{formatCents(line.amountCents)}</span>
                </div>
              ))}
              <div className="abx-row abx-row-total">
                <span>Amount contributing to current balance</span>
                <span>{formatCents(item.netCents)}</span>
              </div>
              {item.note !== '' && <p className="abx-card-note">{item.note}</p>}
            </div>
          ))}
        </>
      )}

      {e.insuranceNotes.length > 0 && (
        <div className="abx-insurance">
          <span className="abx-insurance-icon">
            <ShieldIcon />
          </span>
          <div>
            <div className="abx-card-title">About your insurance</div>
            {e.insuranceNotes.map((note, i) => (
              <p key={i}>{note}</p>
            ))}
          </div>
        </div>
      )}

      <p className="abx-closing">
        Questions about this balance? We're happy to walk through it with you
        {practice.phone.trim() !== '' ? ` — call us at ${practice.phone}.` : '.'}
      </p>

      <footer className="abx-footer">
        {(practice.addressLine1.trim() !== '' || practice.addressLine2.trim() !== '') && (
          <span className="abx-footer-item">
            <PinIcon />
            {[practice.addressLine1, practice.addressLine2].filter(s => s.trim() !== '').join(', ')}
          </span>
        )}
        {practice.phone.trim() !== '' && (
          <span className="abx-footer-item">
            <PhoneIcon />
            {practice.phone}
          </span>
        )}
        {practice.website.trim() !== '' && (
          <span className="abx-footer-item">
            <GlobeIcon />
            {practice.website}
          </span>
        )}
      </footer>
    </div>
  );
}
