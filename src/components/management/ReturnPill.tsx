import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * Fix-and-return (design §5.6): an editor opened from Payroll readiness or
 * Attention carries `?return=<path>`; the pill takes the person back once the
 * record is fixed. Only in-app paths are honored.
 */
const LABELS: [string, string][] = [
  ['/management/payroll', 'Return to Payroll readiness'],
  ['/management/people', 'Return to People'],
  ['/management', 'Return to Attention'],
];

function safeReturnPath(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

export default function ReturnPill() {
  const [params] = useSearchParams();
  const to = safeReturnPath(params.get('return'));
  if (!to) return null;
  const label = LABELS.find(([prefix]) => to.startsWith(prefix))?.[1] ?? 'Return';
  return (
    <Link to={to} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border bg-muted/50 px-3 text-sm font-medium hover:bg-muted">
      <ArrowLeft className="h-4 w-4" />{label}
    </Link>
  );
}
