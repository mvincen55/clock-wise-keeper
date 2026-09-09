import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCents } from '@/lib/fof/money';
import type { PaymentPlanResult } from '@/lib/fof/payment-plan';

interface Props {
  result: PaymentPlanResult;
  /** Raw text the staff typed per payment, keyed by the payment's stable id. */
  amountOverrides: Record<string, string>;
  labelOverrides: Record<string, string>;
  onAmountChange: (rowId: string, value: string) => void;
  onLabelChange: (rowId: string, value: string) => void;
  onClearEdits: () => void;
  /** Form-wide discount/credit that still needs allocating, in cents. */
  adjustmentCents: number;
  adjustmentAllocated: boolean;
  onAllocateAdjustment: () => void;
  onUnallocateAdjustment: () => void;
}

/**
 * The payment schedule the office's own policy produced, with the review the
 * requirements demand: every payment can be renamed or re-priced, edits stay
 * attached to the payment they were made on, and anything that would print an
 * inconsistent form is called out instead of quietly resolved.
 */
export function FofPaymentScheduleEditor({
  result,
  amountOverrides,
  labelOverrides,
  onAmountChange,
  onLabelChange,
  onClearEdits,
  adjustmentCents,
  adjustmentAllocated,
  onAllocateAdjustment,
  onUnallocateAdjustment,
}: Props) {
  const hasEdits =
    Object.keys(amountOverrides).length > 0 || Object.keys(labelOverrides).length > 0;

  return (
    <div className="space-y-3">
      {result.issues.length > 0 && (
        <Alert variant={result.blocksPrint ? 'destructive' : 'default'}>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {result.blocksPrint ? 'Needs a decision before printing' : 'Worth a look'}
          </AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4 space-y-1">
              {result.issues.map((issue, i) => (
                <li key={`${issue.code}-${issue.rowId ?? i}`}>{issue.message}</li>
              ))}
            </ul>
            {adjustmentCents > 0 && !adjustmentAllocated && (
              <Button size="sm" className="mt-2" onClick={onAllocateAdjustment}>
                Spread {formatCents(adjustmentCents)} across the treatment
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {adjustmentCents > 0 && adjustmentAllocated && (
        <p className="text-xs text-muted-foreground">
          {formatCents(adjustmentCents)} off is spread across the treatment in proportion to
          each procedure&apos;s cost.{' '}
          <button className="underline" onClick={onUnallocateAdjustment}>
            Undo
          </button>
        </p>
      )}

      {result.rows.map((row) => (
        <div key={row.id} className="flex items-center gap-2">
          <Input
            className="flex-1 min-w-0 text-sm"
            autoComplete="off"
            aria-label="Payment name"
            value={labelOverrides[row.id] ?? row.label}
            onChange={(e) => onLabelChange(row.id, e.target.value)}
          />
          {(row.overridden || row.labelOverridden) && <Badge variant="secondary">custom</Badge>}
          <Input
            className="w-32 shrink-0 text-right"
            inputMode="decimal"
            autoComplete="off"
            aria-label="Payment amount"
            placeholder={formatCents(row.computedCents)}
            value={amountOverrides[row.id] ?? ''}
            onChange={(e) => onAmountChange(row.id, e.target.value)}
          />
          {row.overridden && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              title="Reset to the amount the policy calculated"
              onClick={() => onAmountChange(row.id, '')}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ))}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {result.rows.length} payment{result.rows.length === 1 ? '' : 's'} ·{' '}
          {formatCents(result.scheduledCents)} scheduled
          {result.priorPaidCents > 0 && ` · ${formatCents(result.priorPaidCents)} already paid`}
        </span>
        {hasEdits && (
          <button className="underline" onClick={onClearEdits}>
            Reset all payment edits
          </button>
        )}
      </div>
    </div>
  );
}

export default FofPaymentScheduleEditor;
