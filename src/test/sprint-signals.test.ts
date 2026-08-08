/**
 * The sprint architect's judgment starts in code, not in the model: the
 * deterministic signal layer decides what counts as a pattern, and the AI is
 * only allowed to phrase it. These tests pin the rules that matter:
 *
 *   - one unusual data point is never a pattern
 *   - thin data yields silence, not invented trends
 *   - a genuine multi-week deterioration is caught, with receipts
 *   - concerns and watch-items are kept apart (a concern gates the ⚠️ banner)
 */
import { describe, it, expect } from 'vitest';
import {
  detectSignals,
  rollupWeeks,
  type DailyCloseout,
  type ProviderDayRow,
} from '../../supabase/functions/_shared/sprint-signals';

function day(
  date: string,
  disruptions: number,
  staffing: string | null = 'about_right',
): DailyCloseout {
  return {
    deposit_date: date,
    production_cents: 500_000,
    hygiene_cancellations: disruptions,
    hygiene_no_shows: 0,
    doctor_cancellations: 0,
    doctor_no_shows: 0,
    staffing_assessment: staffing,
  };
}

/** Four closeouts (Mon-Thu) in the week starting mondayIso. */
function week(mondayIso: string, perDay: number, staffing: string | null = 'about_right') {
  const base = new Date(`${mondayIso}T12:00:00Z`);
  return [0, 1, 2, 3].map(offset => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + offset);
    return day(d.toISOString().slice(0, 10), perDay, staffing);
  });
}

describe('rollupWeeks', () => {
  it('groups closeouts into Monday-start weeks, oldest first', () => {
    const rows = [...week('2026-07-20', 1), ...week('2026-07-13', 2)];
    const weeks = rollupWeeks(rows);
    expect(weeks.map(w => w.weekOf)).toEqual(['2026-07-13', '2026-07-20']);
    expect(weeks[0].disruptions).toBe(8);
    expect(weeks[1].days).toBe(4);
  });

  it('counts strained days from the human staffing read', () => {
    const weeks = rollupWeeks(week('2026-07-13', 0, 'understaffed'));
    expect(weeks[0].strainedDays).toBe(4);
  });

  it('survives hostile rows without throwing', () => {
    expect(() =>
      rollupWeeks([{ deposit_date: '' } as unknown as DailyCloseout]),
    ).not.toThrow();
  });
});

describe('detectSignals — restraint', () => {
  it('says nothing on thin data', () => {
    expect(detectSignals(rollupWeeks(week('2026-07-13', 5)))).toEqual([]);
  });

  it('does not treat one bad week as a pattern', () => {
    const rows = [
      ...week('2026-07-06', 1),
      ...week('2026-07-13', 1),
      ...week('2026-07-20', 8), // one ugly week
    ];
    const signals = detectSignals(rollupWeeks(rows));
    expect(signals.filter(s => s.kind === 'disruptions_rising')).toEqual([]);
  });

  it('ignores weeks with too few closeouts to mean anything', () => {
    const rows = [day('2026-07-06', 9), day('2026-07-13', 9), day('2026-07-20', 9)];
    expect(detectSignals(rollupWeeks(rows))).toEqual([]);
  });
});

describe('detectSignals — real patterns', () => {
  it('flags three consecutive rising weeks as a concern, with receipts', () => {
    const rows = [
      ...week('2026-07-06', 1), // 4
      ...week('2026-07-13', 2), // 8
      ...week('2026-07-20', 3), // 12
    ];
    const signals = detectSignals(rollupWeeks(rows));
    const rising = signals.find(s => s.kind === 'disruptions_rising');
    expect(rising).toBeDefined();
    expect(rising!.concernLevel).toBe('concern');
    expect(rising!.receipt).toContain('4');
    expect(rising!.receipt).toContain('12');
    expect(rising!.receipt).toContain('2026-07-20');
  });

  it('flags sustained staffing strain as a concern', () => {
    const rows = [
      ...week('2026-07-06', 0, 'stretched'),
      ...week('2026-07-13', 0, 'understaffed'),
      ...week('2026-07-20', 0, 'about_right'),
    ];
    const signals = detectSignals(rollupWeeks(rows));
    const strain = signals.find(s => s.kind === 'staffing_strain');
    expect(strain).toBeDefined();
    expect(strain!.concernLevel).toBe('concern');
  });

  it('flags sustained open schedule time only with enough provider-days', () => {
    const providerDay = (date: string, open: number): ProviderDayRow => ({
      business_date: date,
      department: 'hygiene',
      net_bookable_minutes: 480,
      scheduled_minutes: 480 - open,
      true_open_minutes: open,
      cancellation_open_minutes: 0,
      no_show_open_minutes: 0,
    });
    const many = Array.from({ length: 12 }, (_, i) =>
      providerDay(`2026-07-${String(6 + i).padStart(2, '0')}`, 160),
    );
    const few = many.slice(0, 4);

    expect(detectSignals([], few)).toEqual([]);
    const signals = detectSignals([], many);
    const open = signals.find(s => s.kind === 'schedule_underused');
    expect(open).toBeDefined();
    expect(open!.receipt).toMatch(/33%/);
  });

  it('notices an earlier improvement that has slipped back', () => {
    const rows = [
      ...week('2026-06-15', 1),
      ...week('2026-06-22', 1),
      ...week('2026-06-29', 2),
      ...week('2026-07-06', 2),
      ...week('2026-07-13', 3),
    ];
    const signals = detectSignals(rollupWeeks(rows));
    expect(signals.some(s => s.kind === 'disruptions_recovered_then_slipping')).toBe(true);
  });
});
