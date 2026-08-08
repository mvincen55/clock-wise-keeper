import { CheckCircle2, CircleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatCents } from '@/lib/account-balance/money';
import type { ReadinessReport, ReconciliationResult } from '@/lib/account-balance/types';

/**
 * Internal readiness panel — the staff-facing truth board. Shows the
 * reconciliation card (Dentrix vs Purple Envelope, to the penny) and the
 * READY FOR PATIENT checklist. None of this ever appears on the printout.
 */

interface ReadinessPanelProps {
  rowCount: number;
  reconciliation: ReconciliationResult;
  readiness: ReadinessReport;
}

export default function ReadinessPanel({ rowCount, reconciliation, readiness }: ReadinessPanelProps) {
  const displayed = reconciliation.displayedEndingBalanceCents;
  return (
    <div className="space-y-3">
      <div className="rounded-md border p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">Reconciliation</span>
          {reconciliation.reconciled ? (
            <Badge className="bg-emerald-600 hover:bg-emerald-600">Reconciled</Badge>
          ) : (
            <Badge variant="destructive">Needs review</Badge>
          )}
        </div>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Ledger rows read</dt>
            <dd className="tabular-nums">{rowCount}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Dentrix ending balance</dt>
            <dd className="tabular-nums">{displayed === null ? '—' : formatCents(displayed)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Purple Envelope reconstructed balance</dt>
            <dd className="tabular-nums">{formatCents(reconciliation.reconstructedEndingBalanceCents)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t pt-1 font-medium">
            <dt>Difference</dt>
            <dd className={`tabular-nums ${reconciliation.differenceCents === 0 ? '' : 'text-destructive'}`}>
              {formatCents(reconciliation.differenceCents)}
            </dd>
          </div>
        </dl>
      </div>

      <div className={`rounded-md border p-4 ${readiness.ready ? 'border-emerald-600/40 bg-emerald-600/5' : ''}`}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">
            {readiness.ready ? 'READY FOR PATIENT' : 'Not ready yet'}
          </span>
          {readiness.unresolvedQuestionCount > 0 && (
            <Badge variant="destructive">
              {readiness.unresolvedQuestionCount} unresolved question{readiness.unresolvedQuestionCount === 1 ? '' : 's'}
            </Badge>
          )}
        </div>
        <ul className="space-y-1.5 text-sm">
          {readiness.items.map(item => (
            <li key={item.key} className="flex items-start gap-2">
              {item.passed ? (
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-700" />
              ) : (
                <CircleAlert className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
              )}
              <span>
                {item.label}
                {!item.passed && item.detail && (
                  <span className="block text-xs text-muted-foreground">{item.detail}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
