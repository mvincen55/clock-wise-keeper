/**
 * Member office pulse — visibility filtering and role relevance.
 *
 *  - each metric is gated by ITS OWN visibility setting; a hidden metric is
 *    omitted entirely (no locked teaser, no empty card);
 *  - the lines are the same canonical MonthPaceLine objects the owner reads —
 *    no member-specific math exists;
 *  - role pulse items follow the operational role, never the permission tier,
 *    and only front desk gets the new-patient pipeline emphasis.
 */
import { describe, expect, it } from 'vitest';
import type { DayVitals, VitalsSummary, VitalsVisibility } from '@/hooks/usePracticeVitals';
import { monthPaceLines, type OwnerPulseInput } from '@/lib/owner-pulse';
import { memberOfficeLines, rolePulseItems } from '@/lib/member-pulse';

const day = (date: string, over: Partial<DayVitals> = {}): DayVitals => ({
  date,
  productionCents: 742_000,
  collectedCents: 615_000,
  newPatientsScheduled: 3,
  newPatientsSeen: 2,
  hygieneCancellations: 2,
  hygieneNoShows: 1,
  doctorCancellations: 0,
  doctorNoShows: 0,
  ...over,
});

const summary = (over: Partial<VitalsSummary> = {}): VitalsSummary => ({
  productionCents: 4_218_000,
  collectedCents: 5_840_000,
  newPatientsScheduled: 14,
  newPatientsSeen: 11,
  newPatientsScheduledRecordedDays: 6,
  newPatientsSeenRecordedDays: 6,
  hygieneCancellations: 4,
  hygieneNoShows: 2,
  doctorCancellations: 3,
  doctorNoShows: 2,
  disruptions: 11,
  days: 6,
  ...over,
});

const input = (over: Partial<OwnerPulseInput> = {}): OwnerPulseInput => ({
  today: '2026-08-10',
  todayVitals: day('2026-08-10'),
  latest: day('2026-08-10'),
  thisMonth: summary(),
  prevMonth: null,
  monthElapsed: 10 / 31,
  targets: { productionCents: 14_000_000, collectionsCents: 13_500_000, newPatientsSeen: 40 },
  weeklyNewPatientPace: 10,
  scheduledThisWeek: 5,
  scheduledThisWeekRecordedDays: 2,
  officePhase: 'open',
  ...over,
});

const ALL: VitalsVisibility = { production: true, collections: true, newPatients: true };

describe('memberOfficeLines', () => {
  it('with everything visible, members read the SAME lines the owner reads', () => {
    expect(memberOfficeLines(input(), ALL)).toEqual(monthPaceLines(input()));
  });

  it('each metric is gated by its own setting, independently', () => {
    const lines = memberOfficeLines(input(), {
      production: false,
      collections: true,
      newPatients: true,
    });
    expect(lines.map(l => l.id)).toEqual(['collections', 'new_patients']);

    const npOnly = memberOfficeLines(input(), {
      production: false,
      collections: false,
      newPatients: true,
    });
    expect(npOnly.map(l => l.id)).toEqual(['new_patients']);
  });

  it('a hidden metric leaves NO trace — no teaser, no placeholder', () => {
    const lines = memberOfficeLines(input(), {
      production: false,
      collections: false,
      newPatients: false,
    });
    expect(lines).toHaveLength(0);
  });

  it('real dollar values are shown when the office chose "everyone"', () => {
    const lines = memberOfficeLines(input(), ALL);
    expect(lines.find(l => l.id === 'production')?.value).toBe('$42,180');
    expect(lines.find(l => l.id === 'collections')?.value).toBe('$58,400');
  });

  it('a brand-new office shows nothing rather than a wall of zeros', () => {
    const lines = memberOfficeLines(
      input({
        thisMonth: summary({
          days: 0, productionCents: 0, collectedCents: 0,
          newPatientsSeen: 0, newPatientsSeenRecordedDays: 0,
        }),
      }),
      ALL,
    );
    expect(lines).toHaveLength(0);
  });
});

describe('rolePulseItems', () => {
  it('front desk gets the new-patient pipeline and the seen pace', () => {
    const items = rolePulseItems('front_desk', input(), ALL);
    const ids = items.map(i => i.id);
    expect(ids).toContain('np-scheduled');
    expect(ids).toContain('np-seen-pace');
    const scheduled = items.find(i => i.id === 'np-scheduled');
    expect(scheduled?.value).toBe('3 today');
    expect(scheduled?.detail).toMatch(/5 this week/);
  });

  it('front desk seen-pace respects the new-patient visibility setting', () => {
    const items = rolePulseItems('front_desk', input(), { ...ALL, newPatients: false });
    expect(items.map(i => i.id)).not.toContain('np-seen-pace');
    // The operational pipeline count (their own work) remains.
    expect(items.map(i => i.id)).toContain('np-scheduled');
  });

  it('hygienists see hygiene-side disruption, not the front-desk pipeline', () => {
    const items = rolePulseItems('hygienist', input(), ALL);
    expect(items.map(i => i.id)).toEqual(['hygiene-missed']);
    expect(items[0].value).toBe('6'); // 4 cancellations + 2 no-shows
  });

  it('dental assistants and sterilization get no financial emphasis here', () => {
    expect(rolePulseItems('dental_assistant', input(), ALL)).toHaveLength(0);
    expect(rolePulseItems('sterilization', input(), ALL)).toHaveLength(0);
  });

  it('no operational role → no role pulse', () => {
    expect(rolePulseItems(null, input(), ALL)).toHaveLength(0);
  });
});
