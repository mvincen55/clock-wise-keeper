// sprint-signals — deterministic office signals for the sprint architect.
//
// The AI never decides what the numbers are; this module does. It rolls raw
// closeout rows into weekly aggregates, reads the trend, and separates two
// very different findings:
//
//   opportunity — something a team could rally around as a sprint
//   concern     — a pattern that looks like a real operational problem and
//                 deserves a manager's eyes before it becomes a contest
//
// Pure functions only. No Deno, no Supabase — unit-tested from src/test.
// One data point is never a pattern: every concern here requires at least
// three weeks of signal, and none of them names a person or assigns blame.

export type DailyCloseout = {
  deposit_date: string; // YYYY-MM-DD
  production_cents: number | null;
  hygiene_cancellations: number;
  hygiene_no_shows: number;
  doctor_cancellations: number;
  doctor_no_shows: number;
  staffing_assessment: string | null;
};

export type ProviderDayRow = {
  business_date: string;
  department: string | null;
  net_bookable_minutes: number | null;
  scheduled_minutes: number | null;
  true_open_minutes: number | null;
  cancellation_open_minutes: number | null;
  no_show_open_minutes: number | null;
};

export type WeekRollup = {
  /** Monday of the week, YYYY-MM-DD. */
  weekOf: string;
  days: number;
  disruptions: number; // cancellations + no-shows, all columns
  cancellations: number;
  noShows: number;
  productionCents: number;
  strainedDays: number; // stretched / understaffed / unsafe closeouts
};

export type OperationalSignal = {
  kind:
    | 'disruptions_rising'
    | 'schedule_underused'
    | 'staffing_strain'
    | 'disruptions_recovered_then_slipping';
  /** Plain-English receipt built only from the real numbers. */
  receipt: string;
  /** True when this looks like a manager-review matter, not just sprint fuel. */
  concernLevel: 'watch' | 'concern';
};

const DAY_MS = 86_400_000;

function mondayOf(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  const dow = d.getUTCDay(); // 0 = Sunday
  d.setUTCDate(d.getUTCDate() - ((dow + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function disruptionsOf(row: DailyCloseout): number {
  return (
    Number(row.hygiene_cancellations ?? 0) +
    Number(row.hygiene_no_shows ?? 0) +
    Number(row.doctor_cancellations ?? 0) +
    Number(row.doctor_no_shows ?? 0)
  );
}

/** Roll daily closeouts into calendar weeks, oldest first. */
export function rollupWeeks(rows: DailyCloseout[]): WeekRollup[] {
  const byWeek = new Map<string, WeekRollup>();
  for (const row of rows) {
    if (!row?.deposit_date) continue;
    const weekOf = mondayOf(row.deposit_date);
    const week = byWeek.get(weekOf) ?? {
      weekOf,
      days: 0,
      disruptions: 0,
      cancellations: 0,
      noShows: 0,
      productionCents: 0,
      strainedDays: 0,
    };
    week.days += 1;
    week.disruptions += disruptionsOf(row);
    week.cancellations +=
      Number(row.hygiene_cancellations ?? 0) + Number(row.doctor_cancellations ?? 0);
    week.noShows += Number(row.hygiene_no_shows ?? 0) + Number(row.doctor_no_shows ?? 0);
    week.productionCents += Number(row.production_cents ?? 0);
    if (
      row.staffing_assessment === 'stretched' ||
      row.staffing_assessment === 'understaffed' ||
      row.staffing_assessment === 'unsafe'
    ) {
      week.strainedDays += 1;
    }
    byWeek.set(weekOf, week);
  }
  return [...byWeek.values()].sort((a, b) => (a.weekOf < b.weekOf ? -1 : 1));
}

/**
 * Read the office's recent weeks for patterns worth naming. Deliberately
 * conservative: thin data (under three weeks with at least three closeouts
 * each) yields nothing, and a single bad week never registers.
 */
export function detectSignals(
  weeks: WeekRollup[],
  providerDays: ProviderDayRow[] = [],
): OperationalSignal[] {
  const signals: OperationalSignal[] = [];
  const solid = weeks.filter((w) => w.days >= 3);
  if (solid.length >= 3) {
    const recent = solid.slice(-3);
    const [a, b, c] = recent.map((w) => w.disruptions);
    const perDay = recent.map((w) => w.disruptions / w.days);

    // Three consecutive rising weeks, ending meaningfully above where it started.
    if (c > b && b > a && a > 0 && c >= a * 1.5 && c >= 6) {
      signals.push({
        kind: 'disruptions_rising',
        receipt:
          `Cancellations and no-shows have risen three weeks running: ` +
          `${a}, then ${b}, then ${c} (weeks of ${recent[0].weekOf}, ${recent[1].weekOf}, ${recent[2].weekOf}).`,
        concernLevel: 'concern',
      });
    } else if (
      // A softer trend still needs BOTH later weeks elevated — one ugly week
      // on its own is noise, not a pattern.
      perDay[2] > perDay[0] * 1.4 &&
      perDay[1] > perDay[0] * 1.15 &&
      recent[2].disruptions >= 6
    ) {
      signals.push({
        kind: 'disruptions_rising',
        receipt:
          `Cancellations and no-shows are trending up: ${recent[0].disruptions} the week of ` +
          `${recent[0].weekOf} vs ${recent[2].disruptions} the week of ${recent[2].weekOf}.`,
        concernLevel: 'watch',
      });
    }

    // Earlier improvement that has been given back — the "it came back" case.
    if (solid.length >= 5) {
      const earlier = solid.slice(0, -3);
      const bestEarlier = Math.min(...earlier.map((w) => w.disruptions / Math.max(1, w.days)));
      if (bestEarlier > 0 && perDay[2] >= bestEarlier * 2 && recent[2].disruptions >= 6) {
        signals.push({
          kind: 'disruptions_recovered_then_slipping',
          receipt:
            `Disruptions per day got down to ${bestEarlier.toFixed(1)} earlier in this window ` +
            `but are back up to ${perDay[2].toFixed(1)} the week of ${recent[2].weekOf}.`,
          concernLevel: 'watch',
        });
      }
    }

    // The humans keep saying the days hurt.
    const strained = recent.reduce((s, w) => s + w.strainedDays, 0);
    const closeouts = recent.reduce((s, w) => s + w.days, 0);
    if (closeouts >= 6 && strained / closeouts >= 0.4) {
      signals.push({
        kind: 'staffing_strain',
        receipt:
          `${strained} of the last ${closeouts} closeouts rated staffing as stretched, ` +
          `understaffed, or unsafe.`,
        concernLevel: 'concern',
      });
    }
  }

  // Schedule utilization, when the office captures it. Sustained open time
  // across many provider-days is a signal; one slow day is not.
  const days = providerDays.filter((p) => Number(p.net_bookable_minutes ?? 0) > 0);
  if (days.length >= 10) {
    const bookable = days.reduce((s, p) => s + Number(p.net_bookable_minutes ?? 0), 0);
    const open = days.reduce((s, p) => s + Number(p.true_open_minutes ?? 0), 0);
    const openPct = open / Math.max(1, bookable);
    if (openPct >= 0.25) {
      signals.push({
        kind: 'schedule_underused',
        receipt:
          `Across ${days.length} recent provider-days, ${Math.round(openPct * 100)}% of bookable ` +
          `time sat truly open (${Math.round(open / 60)} hours).`,
        concernLevel: openPct >= 0.35 ? 'concern' : 'watch',
      });
    }
  }

  return signals;
}
