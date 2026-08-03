import { describe, it, expect } from 'vitest';
import { businessHoursCutoff, isOnTime } from '@/lib/broken-appts/business-hours';

// Rule 2: the notice window counts business hours only — weekends and
// office closed dates contribute zero. 48 business hours = 2 business
// days, which is where staff miscount across weekends.
//
// Calendar anchors (2026): Aug 3 is a Monday.

const local = (y: number, m: number, d: number, h: number, min = 0) =>
  new Date(y, m - 1, d, h, min);

describe('businessHoursCutoff (48 business hours)', () => {
  it('Mon 9:00 AM appt → cutoff the prior Thursday 9:00 AM', () => {
    expect(businessHoursCutoff(local(2026, 8, 3, 9), 48)).toEqual(local(2026, 7, 30, 9));
  });

  it('Fri 2:00 PM appt → cutoff Wednesday 2:00 PM', () => {
    expect(businessHoursCutoff(local(2026, 8, 7, 14), 48)).toEqual(local(2026, 8, 5, 14));
  });

  it('Tue 10:00 AM appt → cutoff the prior Friday 10:00 AM', () => {
    expect(businessHoursCutoff(local(2026, 8, 4, 10), 48)).toEqual(local(2026, 7, 31, 10));
  });

  it('a closed date in the span pushes the cutoff back one more day', () => {
    // Fri appt with Thursday closed: Thu contributes zero hours.
    expect(businessHoursCutoff(local(2026, 8, 7, 14), 48, ['2026-08-06'])).toEqual(
      local(2026, 8, 4, 14)
    );
  });

  it('changing office_closed_dates shifts the cutoff', () => {
    const open = businessHoursCutoff(local(2026, 8, 7, 14), 48, []);
    const closed = businessHoursCutoff(local(2026, 8, 7, 14), 48, ['2026-08-06']);
    expect(closed.getTime()).toBeLessThan(open.getTime());
    expect(open).toEqual(local(2026, 8, 5, 14));
    expect(closed).toEqual(local(2026, 8, 4, 14));
  });

  it('a closed date landing on a weekend changes nothing (already skipped)', () => {
    expect(businessHoursCutoff(local(2026, 8, 3, 9), 48, ['2026-08-01', '2026-08-02'])).toEqual(
      local(2026, 7, 30, 9)
    );
  });

  it('fractional windows count partial business days (36h = 1.5 days)', () => {
    // Mon 9:00 − 12h → Sun 9:00 PM, a zero-hour day → Fri 9:00 PM;
    // minus one whole business day → Thu 9:00 PM.
    expect(businessHoursCutoff(local(2026, 8, 3, 9), 36)).toEqual(local(2026, 7, 30, 21));
  });
});

describe('isOnTime', () => {
  const appt = local(2026, 8, 3, 9); // Mon 9:00 AM → cutoff Thu 7/30 9:00 AM

  it('notice exactly at the cutoff is on time', () => {
    expect(isOnTime(local(2026, 7, 30, 9), appt, 48)).toBe(true);
  });

  it('notice a minute past the cutoff is late', () => {
    expect(isOnTime(local(2026, 7, 30, 9, 1), appt, 48)).toBe(false);
  });

  it('weekend notice for a Monday appointment is late (Rule 2)', () => {
    expect(isOnTime(local(2026, 8, 1, 10), appt, 48)).toBe(false);
  });

  it('a closed date can flip the verdict from on time to late', () => {
    const friAppt = local(2026, 8, 7, 14);
    const notice = local(2026, 8, 4, 16); // Tue 4 PM
    // Open Thursday: cutoff Wed 2 PM — Tue 4 PM makes it.
    expect(isOnTime(notice, friAppt, 48, [])).toBe(true);
    // Thursday closed: cutoff moves to Tue 2 PM — the same notice is late.
    expect(isOnTime(notice, friAppt, 48, ['2026-08-06'])).toBe(false);
    // An earlier notice (Tue 1 PM) still makes it.
    expect(isOnTime(local(2026, 8, 4, 13), friAppt, 48, ['2026-08-06'])).toBe(true);
  });
});
