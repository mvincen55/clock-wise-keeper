/**
 * Completeness against the office calendar, and a package's complete monthly
 * summary as an authoritative total: missing records are never zero, a day
 * in progress is never expected yet, and thin daily detail under a full
 * month never reads as an incomplete total.
 */
import { describe, expect, it } from 'vitest';
import {
  authoritativeTotals, buildWindow, coverageLabel, cutoffFor, partialLabel, periodFor, totalsOf, wholeMonthsOf, withCoverage,
  type CloseoutDay, type PerformanceSources, type ReportDay, type ReportMonth,
} from '@/lib/performance-series';
import { reportMonthsFrom, type ReportImportRow } from '@/lib/report-history';
import { countOfficeDays, listOfficeDays, type OfficeDayCalendar } from '@/lib/office-days';
import type { PreparedReport } from '@/lib/prepared-report';

const calendar: OfficeDayCalendar = { closedDates: new Set(['2026-09-07']), openDates: new Set(['2026-09-12']) };
const closeout = (date: string, over: Partial<CloseoutDay> = {}): CloseoutDay => ({ date, productionCents: 500_000, collectionsCents: 400_000, sealedAt: `${date}T22:00:00Z`, ...over });
const sources = (closeouts: CloseoutDay[], extra: Partial<PerformanceSources> = {}): PerformanceSources => ({ closeouts, closeoutsState: 'ok', reportDays: [], reportState: 'ok', ...extra });

describe('office days', () => {
  it('counts the calendar’s office days: weekdays, minus closures, plus marked Saturdays', () => {
    // Sep 1–12, 2026: Tue Sep 1 … Sat Sep 12; Labor Day closed; Sat Sep 12 open.
    expect(listOfficeDays('2026-09-01', '2026-09-12', calendar)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12']);
    expect(countOfficeDays('2026-09-01', '2026-09-12', calendar)).toBe(9);
    expect(countOfficeDays('2026-09-12', '2026-09-01', calendar)).toBe(0);
  });
});

describe('cutoff and coverage', () => {
  const period = periodFor('this_month', '2026-09-10');
  const coverageOf = (src: PerformanceSources) => {
    const points = buildWindow({ period, today: '2026-09-10', sources: src })!.points;
    return withCoverage(totalsOf(points), period, { today: '2026-09-10', calendar, source: 'closeouts', points });
  };
  it('the cutoff is yesterday while today is in progress, today once its closeout is on record', () => {
    expect(cutoffFor(period, '2026-09-10', false)).toBe('2026-09-09');
    expect(cutoffFor(period, '2026-09-10', true)).toBe('2026-09-10');
    expect(cutoffFor(periodFor('last_month', '2026-09-10'), '2026-09-10', false)).toBe('2026-08-31');
  });
  it('expected days are the office days through the cutoff; recorded against them decides completeness', () => {
    const days = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-08', '2026-09-09'].map(d => closeout(d));
    const full = coverageOf(sources(days));
    expect(full).toMatchObject({ expectedDays: 6, completeness: 'complete', cutoff: '2026-09-09' });
    expect(coverageLabel(full, 'closeouts')).toBe('6 of 6 office days recorded · through Sep 9');
    expect(partialLabel(full, 'closeouts')).toBeNull();

    const thin = coverageOf(sources(days.slice(0, 4)));
    expect(thin).toMatchObject({ expectedDays: 6, completeness: 'partial' });
    expect(partialLabel(thin, 'closeouts')).toBe('Partial data · 2 office days not recorded');

    const recordedToday = coverageOf(sources([...days, closeout('2026-09-10')]));
    expect(recordedToday).toMatchObject({ expectedDays: 7, completeness: 'complete', cutoff: '2026-09-10' });
  });
  it('without the calendar completeness stays unknown and the label counts calendar days', () => {
    const w = buildWindow({ period, today: '2026-09-10', sources: sources([closeout('2026-09-01')]) })!;
    expect(w.totals).toMatchObject({ expectedDays: null, completeness: 'unknown' });
    expect(w.coverageLabel).toBe('1 of 10 days recorded · through Sep 1');
    expect(partialLabel(w.totals, 'closeouts')).toBeNull();
  });
  it('buildWindow carries the calendar through', () => {
    const w = buildWindow({ period, today: '2026-09-10', sources: sources([closeout('2026-09-01')]), calendar })!;
    expect(w.totals.expectedDays).toBe(6);
    expect(w.coverageLabel).toBe('1 of 6 office days recorded · through Sep 1');
  });
});

describe('closeouts outside the office calendar', () => {
  const period = periodFor('this_month', '2026-09-10');
  it('count in the totals but never cover a missing office day, and the label names them', () => {
    // Office days through Sep 9 (cutoff): Sep 1, 2, 3, 4, 8, 9 = 6. Recorded: five of them (Sep 8 missing)
    // plus Sat Sep 5 and Sun Sep 6, which the calendar does not list.
    const days = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-09'].map(d => closeout(d));
    const w = buildWindow({ period, today: '2026-09-10', sources: sources(days), calendar })!;
    expect(w.totals.primaryRecordedDays).toBe(7);
    expect(w.totals.primaryCents).toBe(7 * 500_000); // the weekend closeouts are real money
    expect(w.totals.expectedDays).toBe(6);
    expect(w.totals.primaryRecordedOfficeDays).toBe(5);
    expect(w.totals.offCalendarDays).toBe(2);
    expect(w.totals.completeness).toBe('partial');
    expect(partialLabel(w.totals, 'closeouts')).toBe('Partial data · 1 office day not recorded');
    expect(coverageLabel(w.totals, 'closeouts')).toBe('5 of 6 office days recorded · through Sep 9 · 2 recorded outside the office calendar');
  });
  it('never read as more recorded than expected', () => {
    const days = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-08', '2026-09-09'].map(d => closeout(d));
    const w = buildWindow({ period, today: '2026-09-10', sources: sources(days), calendar })!;
    expect(w.totals.completeness).toBe('complete');
    expect(coverageLabel(w.totals, 'closeouts')).toBe('6 of 6 office days recorded · through Sep 9 · 2 recorded outside the office calendar');
    expect(partialLabel(w.totals, 'closeouts')).toBeNull();
  });
});

describe('a complete monthly summary is authoritative', () => {
  const month = (over: Partial<ReportMonth> = {}): ReportMonth => ({ month: '2026-08', coverage: 'full_calendar_month', production_cents: 12_000_000, collections_cents: 9_500_000, ...over });
  it('applies only to whole calendar months every one of which has a full row', () => {
    expect(wholeMonthsOf({ start: '2026-08-01', end: '2026-08-31' })).toEqual(['2026-08']);
    expect(wholeMonthsOf({ start: '2026-07-01', end: '2026-08-31' })).toEqual(['2026-07', '2026-08']);
    expect(wholeMonthsOf({ start: '2026-08-01', end: '2026-08-30' })).toEqual([]);
    expect(authoritativeTotals({ start: '2026-08-01', end: '2026-08-31' }, [month()])).toEqual({ primaryCents: 12_000_000, secondaryCents: 9_500_000 });
    expect(authoritativeTotals({ start: '2026-08-01', end: '2026-08-31' }, [month({ coverage: 'partial' })])).toBeNull();
    expect(authoritativeTotals({ start: '2026-07-01', end: '2026-08-31' }, [month()])).toBeNull();
    expect(authoritativeTotals({ start: '2026-08-01', end: '2026-08-30' }, [month()])).toBeNull();
    expect(authoritativeTotals({ start: '2026-08-01', end: '2026-08-31' }, undefined)).toBeNull();
  });
  it('takes the one row report-history selected for a month; a duplicate row never adds to it', () => {
    const range = { start: '2026-08-01', end: '2026-08-31' };
    expect(authoritativeTotals(range, [month({ production_cents: 2, collections_cents: 2 }), month()])).toEqual({ primaryCents: 2, secondaryCents: 2 });
  });
  it('a window on report history with thin daily rows still reads as a complete month total', () => {
    const day: ReportDay = { date: '2026-08-04', postedChargesCents: 500_000, receiptsCents: 400_000, packageStart: '2026-08-01', packageEnd: '2026-08-31', importedAt: '2026-09-01T00:00:00Z' };
    const period = periodFor('last_month', '2026-09-10');
    const w = buildWindow({ period, today: '2026-09-10', sources: sources([], { reportDays: [day], reportMonths: [month()] }), calendar })!;
    expect(w.source).toBe('report_history');
    expect(w.totals).toMatchObject({ primaryCents: 12_000_000, secondaryCents: 9_500_000, authoritative: true, completeness: 'complete' });
    expect(w.coverageLabel).toBe('Complete month · report package summary · through Aug 4');
    // The daily points underneath keep their gaps: a missing day is not a zero.
    expect(w.points.filter(p => p.status === 'not_in_package').length).toBeGreaterThan(0);
  });
  it('the rows report-history selects feed the authoritative total: newest import wins a month, a partial month withholds it', () => {
    const imp = (id: string, importedAt: string, rows: unknown[]): ReportImportRow => ({ id, report_start: '2026-07-01', report_end: '2026-08-31', imported_at: importedAt, payload: { monthly_financials_by_entry_date: rows, daily_financials_by_entry_date: [] } as unknown as PreparedReport });
    const months = reportMonthsFrom([
      imp('old', '2026-09-01T00:00:00Z', [{ month: '2026-08', coverage: 'full_calendar_month', posted_charges_cents: 1, recorded_payments_cents: 1 }, { month: '2026-07', coverage: 'full_calendar_month', posted_charges_cents: 700, recorded_payments_cents: 400 }]),
      imp('new', '2026-09-05T00:00:00Z', [{ month: '2026-08', coverage: 'full_calendar_month', posted_charges_cents: 2, recorded_payments_cents: 2 }, { month: 'bad', coverage: 'full_calendar_month', posted_charges_cents: 3, recorded_payments_cents: 3 }, { month: '2026-06', coverage: 'full_calendar_month', posted_charges_cents: 9, recorded_payments_cents: 9 }]),
    ]);
    expect(months.map(m => [m.month, m.production_cents, m.coverage])).toEqual([['2026-07', 700, 'full_calendar_month'], ['2026-08', 2, 'full_calendar_month']]);
    expect(authoritativeTotals({ start: '2026-08-01', end: '2026-08-31' }, months)).toEqual({ primaryCents: 2, secondaryCents: 2 });
    expect(authoritativeTotals({ start: '2026-07-01', end: '2026-08-31' }, months)).toEqual({ primaryCents: 702, secondaryCents: 402 });
    const partial = reportMonthsFrom([imp('p', '2026-09-06T00:00:00Z', [{ month: '2026-08', coverage: 'partial', posted_charges_cents: 5, recorded_payments_cents: 5 }])]);
    expect(authoritativeTotals({ start: '2026-08-01', end: '2026-08-31' }, partial)).toBeNull();
  });
});
