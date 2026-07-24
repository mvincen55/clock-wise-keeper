import { formatCents } from '@/lib/money';
import logoUrl from '@/assets/harelick-logo.png';

/**
 * Printable Deposit Log — the office's daily deposit sheet as a designed
 * document in the practice's FOF visual language (deep purple on white,
 * grayscale-safe). Two copies, one letter page each: the Office Copy
 * (full breakdown, both banks) and the Bank Copy (cash + checks with the
 * deposit account). Pure props → JSX; rendered via portal only while
 * printing (.deposit-print-root in index.css). Amounts only — payer
 * names stay on the physical checks.
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
  /** Who prepared the deposit (from the saved record). */
  preparedBy: string;
  initials: string;
}

const longDate = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

function CheckColumn({
  start,
  count,
  checks,
}: {
  start: number;
  count: number;
  checks: number[];
}) {
  return (
    <table className="dep-checks">
      <thead>
        <tr>
          <th>Checks {start}–{start + count - 1}</th>
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
              <td className="dep-num">
                {cents !== undefined && cents > 0 ? formatCents(cents) : ''}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SummaryRow({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="dep-sum-row">
      <span>{label}</span>
      <span className="dep-num">{formatCents(cents)}</span>
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
  preparedBy,
  initials,
}: DepositPrintProps & { variant: 'office' | 'bank' }) {
  const checkCount = checksCents.filter(c => c > 0).length;
  const checksTotal = checksCents.reduce((a, b) => a + b, 0);
  const bankTotal = cashCents + checksTotal;
  const cardsTotal = insCcCents + ptCcCents;
  const grandTotal = bankTotal + cardsTotal + illumitracCents + outsideFinancingCents;

  return (
    <div className="dep-sheet">
      <header className="dep-head">
        <img className="dep-logo" src={logoUrl} alt="Harelick Dental Associates" />
        <div className="dep-head-meta">
          <div className="dep-kicker">Daily Deposit</div>
          <div className="dep-title">Deposit Log</div>
          <div className="dep-subtitle">
            {variant === 'office' ? 'Office Copy' : 'Bank Copy'} · {longDate(date)}
          </div>
        </div>
      </header>

      <div className="dep-cash">
        <span>Cash</span>
        <span className="dep-num">{formatCents(cashCents)}</span>
      </div>

      <div className="dep-columns">
        <CheckColumn start={1} count={LEFT_LINES} checks={checksCents} />
        <CheckColumn start={LEFT_LINES + 1} count={CHECK_LINES - LEFT_LINES} checks={checksCents} />
      </div>

      <div className="dep-footer">
        <div className="dep-footer-left">
          {variant === 'office' ? (
            <div className="dep-box">
              <div className="dep-box-title">Bank Split</div>
              <SummaryRow label="BC Bank — cash & checks" cents={bankTotal} />
              <SummaryRow label="F Bank — card deposits" cents={cardsTotal} />
            </div>
          ) : (
            <div className="dep-box">
              <div className="dep-box-title">Deposit To</div>
              <div className="dep-account">{BANK_COPY_ACCOUNT}</div>
            </div>
          )}
          <div className="dep-envelope">Purple envelope — no tape</div>
        </div>

        <div className="dep-footer-right">
          <div className="dep-box">
            <div className="dep-box-title">Deposit Summary</div>
            <SummaryRow label="Total Cash" cents={cashCents} />
            <SummaryRow
              label={checkCount > 0 ? `Total Checks (${checkCount})` : 'Total Checks'}
              cents={checksTotal}
            />
            {variant === 'office' && (
              <>
                <SummaryRow label="Ins Credit Cards" cents={insCcCents} />
                <SummaryRow label="Total Pt Credit Cards" cents={ptCcCents} />
                <SummaryRow label="Illumitrac" cents={illumitracCents} />
                <SummaryRow label="Outside Financing" cents={outsideFinancingCents} />
              </>
            )}
            <div className="dep-sum-grand">
              <span>{variant === 'office' ? 'Total' : 'BC Bank Total'}</span>
              <span className="dep-num">
                {formatCents(variant === 'office' ? grandTotal : bankTotal)}
              </span>
            </div>
          </div>
          <div className="dep-initials">
            <span className="dep-initials-label">
              Prepared by {preparedBy || '________________'}
            </span>
            <span className="dep-initials-slot">
              <span className="dep-initials-value">{initials}</span>
              <span className="dep-initials-caption">Initials</span>
            </span>
          </div>
        </div>
      </div>

      <footer className="dep-page-footer">
        Harelick Dental Associates, LLC · Daily Deposit Log ·{' '}
        {variant === 'office' ? 'Office Copy — file with the day sheet' : 'Bank Copy'}
      </footer>
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
