import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatCents, parseSignedInput } from '@/lib/account-balance/money';
import type { RowPatch } from '@/lib/account-balance/session';
import {
  CLASSIFICATION_LABELS,
  type LedgerClassification,
  type LedgerMoneyField,
  type LedgerRow,
  type ReconciliationResult,
} from '@/lib/account-balance/types';

/**
 * Stage 2 — VERIFY WHAT WAS READ. A clean editable review of the extracted
 * ledger: every cell can be corrected, garbage rows deleted, missed rows
 * added, and rows reordered when OCR clearly misplaced one. Low-confidence
 * reads say "Please verify" out loud; nothing is fixed silently.
 *
 * All edits dispatch into the in-memory session reducer — no persistence.
 */

interface LedgerVerifyTableProps {
  rows: LedgerRow[];
  reconciliation: ReconciliationResult;
  onUpdateRow: (rowId: string, patch: RowPatch) => void;
  onMarkVerified: (rowId: string) => void;
  onDeleteRow: (rowId: string) => void;
  onAddRowAfter: (rowId: string | null) => void;
  onMoveRow: (rowId: string, direction: -1 | 1) => void;
}

const CLASSIFICATIONS = Object.keys(CLASSIFICATION_LABELS) as LedgerClassification[];

/** Money cell — free typing, committed (and parsed) on blur. */
function MoneyCell({
  cents,
  uncertain,
  ariaLabel,
  onCommit,
}: {
  cents: number | null;
  uncertain: boolean;
  ariaLabel: string;
  onCommit: (cents: number | null) => void;
}) {
  const display = cents === null ? '' : (cents / 100).toFixed(2);
  const [text, setText] = useState(display);
  useEffect(() => setText(display), [display]);
  return (
    <Input
      className={`h-8 w-24 text-right text-xs tabular-nums ${uncertain ? 'border-destructive' : ''}`}
      inputMode="decimal"
      autoComplete="off"
      aria-label={ariaLabel}
      value={text}
      onChange={e => setText(e.target.value)}
      onBlur={() => {
        const trimmed = text.trim();
        if (trimmed === '') {
          if (cents !== null) onCommit(null);
          else setText(display);
          return;
        }
        const parsed = parseSignedInput(trimmed);
        if (parsed === null) {
          setText(display); // unparseable — revert, never guess
        } else if (parsed !== cents) {
          onCommit(parsed);
        } else {
          setText(display);
        }
      }}
    />
  );
}

function TextCell({
  value,
  ariaLabel,
  className,
  onCommit,
}: {
  value: string;
  ariaLabel: string;
  className?: string;
  onCommit: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <Input
      className={`h-8 text-xs ${className ?? ''}`}
      autoComplete="off"
      aria-label={ariaLabel}
      value={text}
      onChange={e => setText(e.target.value)}
      onBlur={() => {
        if (text !== value) onCommit(text);
      }}
    />
  );
}

export default function LedgerVerifyTable({
  rows,
  reconciliation,
  onUpdateRow,
  onMarkVerified,
  onDeleteRow,
  onAddRowAfter,
  onMoveRow,
}: LedgerVerifyTableProps) {
  const resultByRow = new Map(reconciliation.rowResults.map(r => [r.rowId, r]));

  const verifyBadge = (row: LedgerRow, field: LedgerMoneyField) =>
    row.lowConfidenceFields.includes(field) && !row.staffVerified;

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-2 py-2 font-medium">Date</th>
              <th className="px-2 py-2 font-medium">Tooth</th>
              <th className="px-2 py-2 font-medium">Dentrix description</th>
              <th className="px-2 py-2 font-medium">Patient</th>
              <th className="px-2 py-2 font-medium text-right">Charge</th>
              <th className="px-2 py-2 font-medium text-right">Payment / Credit</th>
              <th className="px-2 py-2 font-medium text-right">Running Balance</th>
              <th className="px-2 py-2 font-medium">Classification</th>
              <th className="px-2 py-2 font-medium">Verification</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const result = resultByRow.get(row.id);
              const mismatch = result ? !result.matches : false;
              const isFirstMismatch = reconciliation.firstMismatchRowId === row.id;
              const needsVerify = row.lowConfidenceFields.length > 0 && !row.staffVerified;
              return (
                <tr
                  key={row.id}
                  className={`border-b align-top ${mismatch ? 'bg-destructive/5' : ''}`}
                >
                  <td className="px-2 py-1.5">
                    <Input
                      type="date"
                      className={`h-8 w-36 text-xs ${verifyBadge(row, 'date') ? 'border-destructive' : ''}`}
                      aria-label={`Row ${index + 1} date`}
                      value={row.dateISO}
                      onChange={e => onUpdateRow(row.id, { dateISO: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <TextCell
                      value={row.tooth}
                      className="w-14"
                      ariaLabel={`Row ${index + 1} tooth`}
                      onCommit={tooth => onUpdateRow(row.id, { tooth })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <TextCell
                      value={row.rawDescription}
                      className="w-56"
                      ariaLabel={`Row ${index + 1} description`}
                      onCommit={rawDescription => onUpdateRow(row.id, { rawDescription })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <TextCell
                      value={row.patientName}
                      className="w-32"
                      ariaLabel={`Row ${index + 1} patient`}
                      onCommit={patientName => onUpdateRow(row.id, { patientName })}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <MoneyCell
                      cents={row.chargeCents}
                      uncertain={verifyBadge(row, 'charge')}
                      ariaLabel={`Row ${index + 1} charge`}
                      onCommit={chargeCents => onUpdateRow(row.id, { chargeCents })}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <MoneyCell
                      cents={row.paymentCents}
                      uncertain={verifyBadge(row, 'payment')}
                      ariaLabel={`Row ${index + 1} payment`}
                      onCommit={paymentCents => onUpdateRow(row.id, { paymentCents })}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <MoneyCell
                      cents={row.balanceCents}
                      uncertain={verifyBadge(row, 'balance')}
                      ariaLabel={`Row ${index + 1} running balance`}
                      onCommit={balanceCents => onUpdateRow(row.id, { balanceCents })}
                    />
                    {mismatch && (
                      <div className="mt-1 text-[11px] font-medium text-destructive">
                        {isFirstMismatch
                          ? 'The running balance stops matching at this transaction.'
                          : `Math expects ${formatCents(result!.expectedBalanceCents)}`}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <Select
                      value={row.classification}
                      onValueChange={value =>
                        onUpdateRow(row.id, { classification: value as LedgerClassification })
                      }
                    >
                      <SelectTrigger
                        className="h-8 w-44 text-xs"
                        aria-label={`Row ${index + 1} classification`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CLASSIFICATIONS.map(c => (
                          <SelectItem key={c} value={c} className="text-xs">
                            {CLASSIFICATION_LABELS[c]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-1.5">
                    {needsVerify ? (
                      <div className="space-y-1">
                        <Badge variant="destructive" className="text-[10px]">Please verify</Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 w-full text-[11px]"
                          onClick={() => onMarkVerified(row.id)}
                        >
                          <Check className="h-3 w-3 mr-1" />
                          Looks right
                        </Button>
                      </div>
                    ) : row.staffVerified ? (
                      <Badge variant="secondary" className="text-[10px]">Verified</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">Read OK</Badge>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={index === 0}
                        onClick={() => onMoveRow(row.id, -1)}
                        aria-label={`Move row ${index + 1} up`}
                        title="Move up (only if OCR misplaced this row)"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={index === rows.length - 1}
                        onClick={() => onMoveRow(row.id, 1)}
                        aria-label={`Move row ${index + 1} down`}
                        title="Move down (only if OCR misplaced this row)"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => onDeleteRow(row.id)}
                        aria-label={`Delete row ${index + 1}`}
                        title="Delete this row (OCR garbage)"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Button variant="outline" size="sm" onClick={() => onAddRowAfter(rows[rows.length - 1]?.id ?? null)}>
        <Plus className="h-4 w-4 mr-1.5" />
        Add a missed row
      </Button>
    </div>
  );
}
