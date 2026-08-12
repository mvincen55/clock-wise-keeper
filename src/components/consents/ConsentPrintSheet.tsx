import { format, parseISO } from 'date-fns';
import type { OrgBranding } from '@/hooks/useOrgBranding';
import { formatCents } from '@/lib/fof/money';
import { splitIntoPages } from '@/lib/consents/validation';
import {
  SIGNATURE_ROLE_LABELS,
  packetLineTotal,
  packetQuantity,
  packetTotals,
  patientRowCovers,
  templateLayout,
  type ConsentBlock,
  type ConsentForm,
  type ConsentTemplateContent,
  type PacketFill,
} from '@/lib/consents/types';

/**
 * The printed consent form: one professional master layout for every
 * template — office letterhead, the form title, brand-ruled section
 * headings, signature areas that never split across pages, and a footer
 * with the version date and page numbers. Styled by the `.cf-sheet` rules
 * in index.css (8.5 × 11 in, 0.5 in margins, grayscale-safe).
 *
 * `fill` carries the TEMPORARY patient/treatment values typed in the
 * Complete Forms workflow. They exist only in memory — this component
 * renders them to paper and nothing else ever stores them. Passing no fill
 * prints a blank copy with ruled lines to complete by hand.
 */

export interface ConsentPrintSheetProps {
  form: Pick<ConsentForm, 'id' | 'name' | 'isSample' | 'isFinancial' | 'currentVersion'>;
  content: ConsentTemplateContent;
  branding: Pick<OrgBranding, 'displayName' | 'legalName' | 'addressLine1' | 'addressLine2' | 'phone' | 'website' | 'logoUrl'>;
  fill?: PacketFill | null;
  /** Publication date of the printed version (ISO); shown in the footer. */
  versionDate?: string | null;
}

const answerKey = (formId: string, blockId: string) => `${formId}:${blockId}`;

function prettyDate(iso: string): string {
  try {
    return format(parseISO(iso), 'MMMM d, yyyy');
  } catch {
    return iso;
  }
}

/** A fill-in value over a ruled line; blank prints as a line to handwrite. */
function Fillable({ value, wide }: { value?: string; wide?: boolean }) {
  return (
    <span className={`cf-fill ${wide ? 'cf-fill-wide' : ''}`}>
      {value?.trim() ? value : ' '}
    </span>
  );
}

function CheckMark({ checked }: { checked: boolean }) {
  return <span className="cf-box">{checked ? '✕' : ' '}</span>;
}

/** The full fee table for the financial agreement's cost block. */
function FeeTable({ fill }: { fill: PacketFill }) {
  const totals = packetTotals(fill);
  const hasAdjustments =
    fill.discountCents > 0 || fill.insuranceEstimateCents > 0 || fill.depositCents > 0;
  // Quantities only appear when a line actually multiplies — a packet of
  // single-unit procedures prints exactly the classic three-column table.
  const showQty = fill.procedures.some(p => packetQuantity(p) > 1);
  return (
    <div className="cf-feetable">
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Procedure</th>
            {showQty && <th className="cf-num">Qty</th>}
            {showQty && <th className="cf-num">Unit Fee</th>}
            <th className="cf-num">{showQty ? 'Total' : 'Fee'}</th>
          </tr>
        </thead>
        <tbody>
          {fill.procedures.map((p, i) => {
            const line = packetLineTotal(p);
            return (
              <tr key={`${p.code}-${i}`}>
                <td>{p.code}</td>
                <td>
                  {p.description}
                  {p.overridden && <span className="cf-override"> (adjusted from office fee)</span>}
                </td>
                {showQty && <td className="cf-num">{packetQuantity(p)}</td>}
                {showQty && <td className="cf-num">{p.feeCents === null ? '—' : formatCents(p.feeCents)}</td>}
                <td className="cf-num">{line === null ? '—' : formatCents(line)}</td>
              </tr>
            );
          })}
          {fill.procedures.length === 0 && (
            <tr>
              <td colSpan={showQty ? 5 : 3} className="cf-feeblank">No procedures listed — complete by hand.</td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="cf-feetotals">
        {hasAdjustments && (
          <div className="cf-feerow"><span>Treatment subtotal</span><span>{formatCents(totals.subtotalCents)}</span></div>
        )}
        {fill.discountCents > 0 && (
          <div className="cf-feerow"><span>Discount / courtesy</span><span>−{formatCents(fill.discountCents)}</span></div>
        )}
        <div className="cf-feerow cf-feetotal"><span>Total treatment fee</span><span>{formatCents(totals.totalCents)}</span></div>
        {fill.insuranceEstimateCents > 0 && (
          <div className="cf-feerow"><span>Estimated insurance (estimate only)</span><span>−{formatCents(fill.insuranceEstimateCents)}</span></div>
        )}
        {fill.depositCents > 0 && (
          <div className="cf-feerow"><span>Deposit received</span><span>−{formatCents(fill.depositCents)}</span></div>
        )}
        {(fill.insuranceEstimateCents > 0 || fill.depositCents > 0) && (
          <div className="cf-feerow cf-feetotal"><span>Estimated patient portion</span><span>{formatCents(totals.estimatedPatientCents)}</span></div>
        )}
      </div>
      {fill.paymentArrangement.trim() && (
        <p className="cf-feearrangement">Payment arrangement: {fill.paymentArrangement}</p>
      )}
    </div>
  );
}

function BlockView({
  block,
  formId,
  fill,
  isFinancial,
}: {
  block: ConsentBlock;
  formId: string;
  fill: PacketFill | null;
  isFinancial: boolean;
}) {
  const answer = fill?.answers[answerKey(formId, block.id)] ?? '';

  switch (block.type) {
    case 'title':
      return <h1 className="cf-title">{block.label}</h1>;
    case 'section':
      return (
        <div className="cf-keep">
          <h2 className="cf-section">{block.label}</h2>
          {block.body && <p className="cf-para">{block.body}</p>}
        </div>
      );
    case 'instruction':
      return <p className="cf-instruction">{block.body ?? block.label}</p>;
    case 'paragraph':
      return <p className="cf-para">{block.body}</p>;
    case 'bullets':
      return (
        <ul className="cf-bullets">
          {(block.items ?? []).map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      );
    case 'checkbox':
      return (
        <p className="cf-check cf-keep">
          <CheckMark checked={answer === 'checked'} />
          <span>{block.label}</span>
        </p>
      );
    case 'yesno':
      return (
        <div className="cf-yesno cf-keep">
          <span className="cf-yesno-label">{block.label}</span>
          <span className="cf-yesno-opts">
            <CheckMark checked={answer === 'yes'} /> Yes
            <CheckMark checked={answer === 'no'} /> No
          </span>
        </div>
      );
    case 'short_answer':
      return (
        <p className="cf-field cf-keep">
          <span className="cf-field-label">{block.label}:</span> <Fillable value={answer} wide />
        </p>
      );
    case 'long_answer':
      return (
        <div className="cf-keep">
          <p className="cf-field-label">{block.label}:</p>
          <div className="cf-longline">{answer ? <span>{answer}</span> : null}</div>
          {!answer && <div className="cf-longline" />}
        </div>
      );
    case 'date':
      return (
        <p className="cf-field cf-keep">
          <span className="cf-field-label">{block.label || 'Date'}:</span>{' '}
          <Fillable value={fill?.date ? prettyDate(fill.date) : undefined} />
        </p>
      );
    case 'tooth_numbers':
      return (
        <p className="cf-field cf-keep">
          <span className="cf-field-label">{block.label || 'Tooth Number(s)'}:</span>{' '}
          <Fillable value={fill?.toothNumbers} />
          {fill?.surfaces?.trim() ? <>{'  '}<span className="cf-field-label">Surface(s):</span> <Fillable value={fill.surfaces} /></> : null}
        </p>
      );
    case 'procedure': {
      const procedures = fill?.procedures.map(p => p.description || p.code).join(', ');
      return (
        <p className="cf-field cf-keep">
          <span className="cf-field-label">{block.label || 'Procedure'}:</span>{' '}
          <Fillable value={procedures} wide />
        </p>
      );
    }
    case 'provider':
      return (
        <p className="cf-field cf-keep">
          <span className="cf-field-label">{block.label || 'Treating Provider'}:</span>{' '}
          <Fillable value={fill?.providerName} />
        </p>
      );
    case 'patient_name':
      return (
        <p className="cf-field cf-keep">
          <span className="cf-field-label">{block.label || 'Patient Name'}:</span>{' '}
          <Fillable value={fill?.patientName} wide />
        </p>
      );
    case 'cost': {
      // Only forms designed with a cost block ever show money. The financial
      // agreement gets the full fee table; a consent shows the total line.
      if (isFinancial && fill) return <FeeTable fill={fill} />;
      const total = fill && fill.procedures.length > 0
        ? formatCents(packetTotals(fill).totalCents)
        : undefined;
      return (
        <p className="cf-field cf-keep">
          <span className="cf-field-label">{block.label || 'Treatment Cost'}:</span>{' '}
          <Fillable value={total} />
        </p>
      );
    }
    case 'initials':
      return (
        <p className="cf-initials cf-keep">
          <span className="cf-initialbox">{' '}</span>
          <span>{block.label}</span>
        </p>
      );
    case 'signature': {
      // An on-screen signature prints as its image sitting on the rule line
      // with the signed date beside it; unsigned roles keep the blank rule so
      // signing on paper stays a normal path (and blank copies never change).
      const role = block.role ?? 'patient';
      const sigImage = fill?.signatures[role];
      const signedDate = sigImage && fill?.signedAtIso ? prettyDate(fill.signedAtIso.slice(0, 10)) : undefined;
      return (
        <div className="cf-sig cf-keep">
          <div className="cf-sigline">
            <div className="cf-sigcell">
              {sigImage && (
                <img src={sigImage} alt={`${SIGNATURE_ROLE_LABELS[role]} signature`} className="cf-sigimg" />
              )}
              <div className="cf-sigrule" />
              <div className="cf-sigcaption">
                {SIGNATURE_ROLE_LABELS[role]} Signature
                {block.required === false ? ' (if applicable)' : ''}
              </div>
            </div>
            <div className="cf-sigcell cf-sigdate">
              <div className="cf-sigrule">{signedDate ? <span className="cf-sigdateval">{signedDate}</span> : null}</div>
              <div className="cf-sigcaption">Date</div>
            </div>
          </div>
        </div>
      );
    }
    case 'medications':
      return (
        <div className="cf-keep">
          {block.label && <p className="cf-field-label">{block.label}</p>}
          <ul className="cf-meds">
            {(block.items ?? []).map((item, i) => {
              const key = answerKey(formId, block.id);
              const chosen = (fill?.answers[key] ?? '').split('||').includes(item);
              return (
                <li key={i}>
                  <CheckMark checked={chosen} /> {item}
                </li>
              );
            })}
          </ul>
        </div>
      );
    case 'notes': {
      // Temporary packet notes render here; a blank packet (or blank copy)
      // prints ruled lines to complete by hand.
      const notes = fill?.notes?.trim();
      return (
        <div className="cf-keep">
          <p className="cf-field-label">{block.label || 'Notes'}:</p>
          {notes ? (
            <div className="cf-longline"><span>{notes}</span></div>
          ) : (
            <>
              <div className="cf-longline" />
              <div className="cf-longline" />
            </>
          )}
        </div>
      );
    }
    case 'logo':
      return null; // the letterhead already carries the logo
    case 'divider':
      return <hr className="cf-divider" />;
    default:
      return null;
  }
}

/** True when a conditional block's controlling answer keeps it visible. */
function blockVisible(block: ConsentBlock, formId: string, fill: PacketFill | null): boolean {
  if (!block.condition || !fill) return true; // blank copies print everything
  const controlling = fill.answers[answerKey(formId, block.condition.blockId)] ?? '';
  switch (block.condition.equals) {
    case 'yes': return controlling === 'yes';
    case 'no': return controlling === 'no';
    case 'checked': return controlling === 'checked';
    case 'unchecked': return controlling !== 'checked';
    default: return true;
  }
}

export default function ConsentPrintSheet({
  form,
  content,
  branding,
  fill = null,
  versionDate = null,
}: ConsentPrintSheetProps) {
  const layout = templateLayout(content);
  const visible = content.blocks.filter(b => {
    if (!blockVisible(b, form.id, fill)) return false;
    // The standard patient row owns the name and date of birth — body copies
    // never print twice.
    if (layout.patientRow && patientRowCovers(b)) return false;
    return true;
  });
  const pages = splitIntoPages(visible);
  const officeName = branding.displayName || branding.legalName || 'Dental Office';
  // The footer is the one place the office identifies itself, in legal form.
  const legalName = branding.legalName || branding.displayName || 'Dental Office';
  const addressBits = [branding.addressLine1, branding.addressLine2].filter(Boolean).join(', ');
  const contactBits = [branding.phone, branding.website].filter(Boolean).join(' · ');
  const versionLabel = form.currentVersion > 0
    ? `v${form.currentVersion}${versionDate ? ` · ${prettyDate(versionDate)}` : ''}`
    : 'Draft';
  const sheetClass = `cf-sheet${layout.pageFit === 'one_page' ? ' cf-compact' : ''}`;

  return (
    <>
      {pages.map((pageBlocks, pageIndex) => (
        <div className={sheetClass} key={pageIndex}>
          {pageIndex === 0 ? (
            <>
              <header className="cf-head">
                <div className="cf-head-office">
                  {branding.logoUrl ? (
                    <img src={branding.logoUrl} alt={officeName} className="cf-logo" />
                  ) : (
                    <div className="cf-logo-mark">{officeName.charAt(0).toUpperCase()}</div>
                  )}
                </div>
                <div className="cf-head-doc">
                  <div className="cf-doc-name">{form.name}</div>
                  <div className="cf-doc-version">{versionLabel}</div>
                </div>
              </header>
              {layout.patientRow && (
                <div className="cf-patient-row cf-keep">
                  <p className="cf-field">
                    <span className="cf-field-label">Patient Name:</span>{' '}
                    <Fillable value={fill?.patientName} wide />
                  </p>
                  <p className="cf-field">
                    <span className="cf-field-label">Date of Birth:</span>{' '}
                    <Fillable value={fill?.dateOfBirth} />
                  </p>
                </div>
              )}
            </>
          ) : (
            <header className="cf-head cf-head-continued">
              <div className="cf-doc-name-sm">{form.name} — continued</div>
              {layout.patientRow && (
                <div className="cf-patient-row-sm">
                  Patient: <Fillable value={fill?.patientName} />
                </div>
              )}
            </header>
          )}

          {form.isSample && pageIndex === 0 && (
            <div className="cf-sample-banner">
              SAMPLE TEMPLATE — review and edit before clinical use
            </div>
          )}

          <main className="cf-body">
            {pageBlocks.map(block => (
              <BlockView
                key={block.id}
                block={block}
                formId={form.id}
                fill={fill}
                isFinancial={form.isFinancial}
              />
            ))}
          </main>

          <footer className="cf-foot">
            <span className="cf-foot-office">
              {legalName}
              {addressBits && ` · ${addressBits}`}
              {contactBits && ` · ${contactBits}`}
            </span>
            <span>
              {versionLabel} · Page {pageIndex + 1} of {pages.length}
            </span>
          </footer>
        </div>
      ))}
    </>
  );
}
