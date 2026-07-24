import { formatCents } from '@/lib/money';

/**
 * Printable Deposit Log — reproduces the office's paper sheet: an Office
 * Copy (full breakdown, both banks) and a Bank Copy (cash + checks with
 * the deposit account), each on its own page. Pure props → JSX; rendered
 * via portal only while printing (.deposit-print-root in index.css).
 * Amounts only — the payer names stay on the physical checks.
 */

const CHECK_LINES = 46;
const LEFT_LINES = 23;

// Pre-printed on the paper bank copy (the deposit envelope's account).
const BANK_COPY_ACCOUNT = 'Bay Coast Account #841845805';

export interface DepositPrintProps {
  /** ET date 'YYYY-MM-DD'. */
  date: string;
  cashCents: number;
  /** Entered check amounts, in order. */
  checksCents: number[];
  insCcCents: number;
  ptCcCents: number;
  illumitracCents: number;
  outsideFinancingCents: number;
  /** Initials of whoever prepared the deposit ('' = hand-write). */
  initials: string;
}

const mdy = (iso: string): string => {
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
};

function CheckColumn({
  title,
  start,
  count,
  checks,
}: {
  title: string;
  start: number;
  count: number;
  checks: number[];
}) {
  return (
    <table className="dep-checks">
      <thead>
        <tr>
          <th>{title}</th>
          <th className="dep-num">Amount</th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: count }, (_, i) => {
          const line = start + i;
          const cents = checks[line - 1];
          return (
            <tr key={line}>
              <td className="dep-line">{line}</td>
              <td className="dep-num">{cents !== undefined && cents > 0 ? formatCents(cents) : ''}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function TotalRow({ label, cents, bold }: { label: string; cents: number; bold?: boolean }) {
  return (
    <div className={`dep-total-row${bold ? ' dep-total-grand' : ''}`}>
      <span>{label}</span>
      <span>{formatCents(cents)}</span>
    </div>
  );
}

function CopyPage({
  variant,
  date,
  cashCents,
  checksCents,
  insCcCents,
  ptCcCents,
  illumitracCents,
  outsideFinancingCents,
  initials,
}: DepositPrintProps & { variant: 'office' | 'bank' }) {
  const checksTotal = checksCents.reduce((a, b) => a + b, 0);
  const bankTotal = cashCents + checksTotal;
  const cardsTotal = insCcCents + ptCcCents;
  const grandTotal = bankTotal + cardsTotal + illumitracCents + outsideFinancingCents;

  return (
    <div className="dep-sheet">
      <div className="dep-date">Date: {mdy(date)}</div>
      <div className="dep-title">
        Deposit Log ({variant === 'office' ? 'Office Copy' : 'Bank Copy'})
      </div>

      <div className="dep-cash">
        <span>Cash</span>
        <span className="dep-num">{formatCents(cashCents)}</span>
      </div>

      <div className="dep-columns">
        <CheckColumn title="Checks" start={1} count={LEFT_LINES} checks={checksCents} />
        <CheckColumn
          title="Checks (Cont.)"
          start={LEFT_LINES + 1}
          count={CHECK_LINES - LEFT_LINES}
          checks={checksCents}
        />
      </div>

      <div className="dep-footer">
        <div className="dep-footer-left">
          {variant === 'office' ? (
            <>
              <TotalRow label="BC Bank" cents={bankTotal} />
              <TotalRow label="F Bank" cents={cardsTotal} />
            </>
          ) : (
            <div className="dep-account">{BANK_COPY_ACCOUNT}</div>
          )}
          <div className="dep-envelope">PURPLE ENVELOPE — NO TAPE</div>
        </div>
        <div className="dep-footer-right">
          <TotalRow label="Total Cash" cents={cashCents} />
          <TotalRow label="Total Checks" cents={checksTotal} />
          {variant === 'office' ? (
            <>
              <TotalRow label="Ins Credit Cards" cents={insCcCents} />
              <TotalRow label="Total Pt Credit Cards" cents={ptCcCents} />
              <TotalRow label="Illumitrac" cents={illumitracCents} />
              <TotalRow label="Outside Financing" cents={outsideFinancingCents} />
              <TotalRow label="TOTAL:" cents={grandTotal} bold />
            </>
          ) : (
            <TotalRow label="BC BANK TOTAL:" cents={bankTotal} bold />
          )}
          <div className="dep-initials">
            <span>Initials</span>
            <span className="dep-initials-value">{initials || '      '}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DepositPrintSheet(props: DepositPrintProps) {
  return (
    <>
      <CopyPage {...props} variant="office" />
      <CopyPage {...props} variant="bank" />
    </>
  );
}
