/**
 * Deposit Log — the daily deposit sheet. Cash, numbered checks, card and
 * financing totals, split across the two banks like the paper version
 * (checks + cash to one, cards to the other). Amounts only — no payer
 * names, no account numbers.
 */
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Banknote, ChevronLeft, ChevronRight, Loader2, Plus, Trash2 } from 'lucide-react';
import { getToday } from '@/lib/time-utils';
import { formatCents, parseCurrencyInput } from '@/lib/money';
import {
  depositChecks,
  useDepositLog,
  useSaveDepositLog,
} from '@/hooks/useDepositLog';

function shiftDate(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const noonUtc = new Date(Date.UTC(y, m - 1, d, 12));
  noonUtc.setUTCDate(noonUtc.getUTCDate() + delta);
  return noonUtc.toISOString().slice(0, 10);
}

function dateLabel(date: string): string {
  if (date === getToday()) return 'Today';
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

interface FormState {
  cash: string;
  checks: string[];
  insCc: string;
  ptCc: string;
  illumitrac: string;
  outsideFinancing: string;
  notes: string;
}

const centsToInput = (cents: number): string => (cents > 0 ? (cents / 100).toFixed(2) : '');

export default function DepositLog() {
  const [date, setDate] = useState(getToday());
  const { data: log, isLoading } = useDepositLog(date);
  const save = useSaveDepositLog();

  const [form, setForm] = useState<FormState | null>(null);

  // Re-seed the form whenever a different day's record arrives.
  useEffect(() => {
    if (isLoading) {
      setForm(null);
      return;
    }
    setForm({
      cash: centsToInput(log?.cash_cents ?? 0),
      checks: depositChecks(log).map(c => (c / 100).toFixed(2)),
      insCc: centsToInput(log?.ins_cc_cents ?? 0),
      ptCc: centsToInput(log?.pt_cc_cents ?? 0),
      illumitrac: centsToInput(log?.illumitrac_cents ?? 0),
      outsideFinancing: centsToInput(log?.outside_financing_cents ?? 0),
      notes: log?.notes ?? '',
    });
  }, [log, isLoading, date]);

  const totals = useMemo(() => {
    if (!form) return null;
    const cash = parseCurrencyInput(form.cash) ?? 0;
    const checkAmounts = form.checks.map(c => parseCurrencyInput(c) ?? 0);
    const checks = checkAmounts.reduce((a, b) => a + b, 0);
    const insCc = parseCurrencyInput(form.insCc) ?? 0;
    const ptCc = parseCurrencyInput(form.ptCc) ?? 0;
    const illumitrac = parseCurrencyInput(form.illumitrac) ?? 0;
    const financing = parseCurrencyInput(form.outsideFinancing) ?? 0;
    return {
      cash,
      checks,
      checkCount: checkAmounts.filter(c => c > 0).length,
      insCc,
      ptCc,
      illumitrac,
      financing,
      bank: cash + checks,
      cards: insCc + ptCc,
      grand: cash + checks + insCc + ptCc + illumitrac + financing,
      checkAmounts,
    };
  }, [form]);

  const setField = (field: keyof Omit<FormState, 'checks'>) => (value: string) =>
    setForm(f => (f ? { ...f, [field]: value } : f));

  const handleSave = () => {
    if (!form || !totals) return;
    save.mutate(
      {
        depositDate: date,
        cashCents: totals.cash,
        checksCents: totals.checkAmounts.filter(c => c > 0),
        insCcCents: totals.insCc,
        ptCcCents: totals.ptCc,
        illumitracCents: totals.illumitrac,
        outsideFinancingCents: totals.financing,
        notes: form.notes,
      },
      {
        onSuccess: () => toast.success('Deposit log saved'),
        onError: err => toast.error(`Save failed: ${err.message}`),
      }
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Banknote className="h-6 w-6" />
            Deposit Log
          </h1>
          <p className="text-muted-foreground text-sm">
            Daily deposit sheet — amounts only, one record per day.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setDate(shiftDate(date, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-36 text-center">{dateLabel(date)}</span>
          <Button
            variant="ghost"
            size="icon"
            disabled={date >= getToday()}
            onClick={() => setDate(shiftDate(date, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!form || !totals ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Cash &amp; Checks</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="dep-cash">Cash</Label>
                  <Input
                    id="dep-cash"
                    inputMode="decimal"
                    placeholder="$0.00"
                    value={form.cash}
                    onChange={e => setField('cash')(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Checks</Label>
                  {form.checks.map((check, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-6 text-right text-xs text-muted-foreground">{i + 1}</span>
                      <Input
                        inputMode="decimal"
                        placeholder="$0.00"
                        value={check}
                        onChange={e =>
                          setForm(f => {
                            if (!f) return f;
                            const checks = [...f.checks];
                            checks[i] = e.target.value;
                            return { ...f, checks };
                          })
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive shrink-0"
                        onClick={() =>
                          setForm(f =>
                            f ? { ...f, checks: f.checks.filter((_, idx) => idx !== i) } : f
                          )
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setForm(f => (f ? { ...f, checks: [...f.checks, ''] } : f))}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Add Check
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Cards &amp; Other</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="dep-inscc">Insurance Credit Cards</Label>
                    <Input id="dep-inscc" inputMode="decimal" placeholder="$0.00" value={form.insCc} onChange={e => setField('insCc')(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="dep-ptcc">Patient Credit Cards</Label>
                    <Input id="dep-ptcc" inputMode="decimal" placeholder="$0.00" value={form.ptCc} onChange={e => setField('ptCc')(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="dep-illumitrac">Illumitrac</Label>
                    <Input id="dep-illumitrac" inputMode="decimal" placeholder="$0.00" value={form.illumitrac} onChange={e => setField('illumitrac')(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="dep-financing">Outside Financing</Label>
                    <Input id="dep-financing" inputMode="decimal" placeholder="$0.00" value={form.outsideFinancing} onChange={e => setField('outsideFinancing')(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dep-notes">Notes (optional)</Label>
                  <Textarea id="dep-notes" rows={2} value={form.notes} onChange={e => setField('notes')(e.target.value)} />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Totals</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span>Total Cash</span><span>{formatCents(totals.cash)}</span></div>
                <div className="flex justify-between">
                  <span>Total Checks {totals.checkCount > 0 && `(${totals.checkCount})`}</span>
                  <span>{formatCents(totals.checks)}</span>
                </div>
                <div className="flex justify-between"><span>Insurance Credit Cards</span><span>{formatCents(totals.insCc)}</span></div>
                <div className="flex justify-between"><span>Patient Credit Cards</span><span>{formatCents(totals.ptCc)}</span></div>
                <div className="flex justify-between"><span>Illumitrac</span><span>{formatCents(totals.illumitrac)}</span></div>
                <div className="flex justify-between"><span>Outside Financing</span><span>{formatCents(totals.financing)}</span></div>
                <div className="border-t pt-1.5 mt-1.5 space-y-1.5">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Bank deposit (cash + checks)</span><span>{formatCents(totals.bank)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Card deposits</span><span>{formatCents(totals.cards)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-base">
                    <span>TOTAL</span><span>{formatCents(totals.grand)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-between gap-2">
              {log?.prepared_by_name ? (
                <p className="text-xs text-muted-foreground">
                  Last saved by {log.prepared_by_name}
                </p>
              ) : <span />}
              <Button onClick={handleSave} disabled={save.isPending}>
                {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Deposit Log
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
