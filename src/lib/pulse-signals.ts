// Pulse signals — the receipts behind the orb.
//
// Every row here names the actual recorded data it came from, so the orb is
// never a black box: what you see in the panel is exactly what the pure
// `practicePulse` function was fed.

import { practicePulse, type Pulse, type PulseInput } from '@/lib/practice-pulse';

export type PulseSignal = {
  /** Short name of the signal. */
  label: string;
  /** The value as displayed. */
  value: string;
  /** Where it came from: table, rows, date window. */
  source: string;
};

export type PulseSignalsInput = PulseInput & {
  /** Eastern-local month key, e.g. "2026-07". */
  month: string;
  /** Previous month key used for the pace comparison. */
  comparisonMonth: string;
  /** Deposit-log rows recorded this month (each row = one closed-out day). */
  rowsThisMonth: number;
  /** Deposit-log rows recorded in the comparison month. */
  rowsComparisonMonth: number;
  /** Fraction of the month elapsed (0-1). */
  monthElapsed: number;
  /** Whole-month production of the comparison month, in cents. */
  comparisonProductionCents: number;
  /** Disruption breakdown this month. */
  hygieneCancellations: number;
  hygieneNoShows: number;
  doctorCancellations: number;
  doctorNoShows: number;
};

export type PulseSignalsReport = {
  pulse: Pulse;
  signals: PulseSignal[];
  /** True when there simply isn't enough recorded data to judge anything. */
  thin: boolean;
};

function money(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/**
 * Builds the pulse plus the itemized signal list. Pure: same input, same
 * receipts — the panel can never drift from the orb.
 */
export function pulseSignals(input: PulseSignalsInput): PulseSignalsReport {
  const pulse = practicePulse(input);

  const disruptionRows = [
    { label: 'Hygiene cancellations', n: input.hygieneCancellations },
    { label: 'Hygiene no-shows', n: input.hygieneNoShows },
    { label: 'Doctor cancellations', n: input.doctorCancellations },
    { label: 'Doctor no-shows', n: input.doctorNoShows },
  ];

  const signals: PulseSignal[] = [
    {
      label: 'Days closed out',
      value: `${input.rowsThisMonth} ${input.rowsThisMonth === 1 ? 'day' : 'days'}`,
      source: `deposit_logs rows in ${input.month}`,
    },
    {
      label: 'Production month to date',
      value: money(input.productionCents),
      source: `sum of production on those ${input.rowsThisMonth} rows`,
    },
    {
      label: 'Month elapsed',
      value: pct(input.monthElapsed),
      source: 'calendar day of month ÷ days in month (Eastern)',
    },
    {
      label: 'On-pace target',
      value: money(input.pacedTargetCents),
      source: `${money(input.comparisonProductionCents)} in ${input.comparisonMonth} (${input.rowsComparisonMonth} days) × ${pct(input.monthElapsed)}`,
    },
    {
      label: 'Pace',
      value: pulse.pace === null ? 'No comparison month yet' : pct(pulse.pace),
      source:
        pulse.pace === null
          ? 'no production recorded in the comparison month'
          : 'production ÷ on-pace target',
    },
    ...disruptionRows.map(r => ({
      label: r.label,
      value: String(r.n),
      source: `deposit_logs, ${input.month}`,
    })),
    {
      label: 'Disruptions vs usual',
      value:
        input.disruptionBaseline > 0
          ? `${input.disruptions} vs ~${Math.round(input.disruptionBaseline)} expected`
          : `${input.disruptions} (no baseline yet)`,
      source: `${input.comparisonMonth} disruptions × ${pct(input.monthElapsed)}; flagged above 125%`,
    },
  ];

  const thin = input.rowsThisMonth === 0 && input.rowsComparisonMonth === 0;

  return { pulse, signals, thin };
}
