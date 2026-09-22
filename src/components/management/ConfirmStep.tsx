import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

/**
 * The one-sentence confirmation every consequential action goes through
 * (design §5.4): the sentence states the consequence, one button confirms.
 * A required reason is collected in the same step.
 */
export default function ConfirmStep({ sentence, confirmLabel, destructive, reason, pending, onConfirm, onCancel }: {
  sentence: string;
  confirmLabel: string;
  destructive?: boolean;
  reason?: { label: string; min: number; placeholder?: string; optional?: boolean };
  pending?: boolean;
  onConfirm: (reason: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');
  const short = !!reason && !reason.optional && text.trim().length < reason.min;
  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3" role="group" aria-label="Confirm">
      <p className="text-sm">{sentence}</p>
      {reason && (
        <div className="space-y-1">
          <Label htmlFor="confirm-reason">{reason.label}{reason.optional ? '' : ` (at least ${reason.min} characters)`}</Label>
          <Textarea id="confirm-reason" value={text} onChange={e => setText(e.target.value)} rows={3} placeholder={reason.placeholder} autoFocus />
          {short && text.length > 0 && <p className="text-xs text-destructive">A reason of at least {reason.min} characters is required.</p>}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={destructive ? 'destructive' : 'default'} disabled={pending || short} onClick={() => onConfirm(text.trim())}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{confirmLabel}
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

/** "Based on these recorded items": label, value, and where it comes from. */
export function Receipts({ rows }: { rows: [string, string, string?][] }) {
  if (!rows.length) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Based on these recorded items</h3>
      <dl className="mt-1 divide-y text-sm">
        {rows.map(([label, value, source]) => (
          <div key={label} className="flex flex-wrap justify-between gap-x-4 py-1">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right">{value}{source ? <span className="block text-xs text-muted-foreground">{source}</span> : null}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
