import { describe, expect, it } from 'vitest';
import { campaignWeeks, officeTimestamp, score, tallyClosed, weekKey } from './fill-the-schedule';
import type { Activity, Campaign, Ledger, Participant } from './fill-the-schedule';

const campaign: Campaign = { id: 'campaign', org_id: 'org', name: 'Fill the Schedule', starts_on: '2026-10-01', ends_on: '2026-12-31', timezone: 'America/New_York', status: 'active',
  pts_qr_card: 1, pts_unscheduled_booking: 1, pts_operative_handoff: 2, pts_chairside_card: null, pts_call: 1, pts_huddle: 1,
  pts_review_doctor: 3, pts_review_hygienist: 3, pts_review_clerical: 5, pts_review_assistant: 7, pts_attend_bonus: 2, pts_prepay_bonus: 2,
  prize_tier1_points: 20, prize_tier2_points: 30, clerical_min_calls: 10, open_hours_goal: 5, grand_prize_dollars: 100 };
const person: Participant = { id: 'participant', employee_id: 'employee', scoring_role: 'clerical', active: true };
const ledger = (): Ledger => ({ campaign, participants: [person], activities: [], calls: [], huddles: [], metrics: [], picks: [], names: [], audit: [] });
const action = (values: Partial<Activity>): Activity => ({ id: 'action', entry_code: 'CODE', employee_id: 'employee', activity_type: 'qr_card', occurred_at: '2026-10-02T15:00:00Z', tally_week: '2026-10-02', quantity: 1, status: 'approved', awarded_points: 1, parent_id: null, reason_code: null, ...values });

describe('office tally calendar', () => {
  it('closes Friday at noon Eastern, including after DST changes', () => {
    expect(weekKey('2026-10-02T15:59:59Z', campaign)).toBe('2026-10-02');
    expect(weekKey('2026-10-02T16:00:00Z', campaign)).toBe('2026-10-09');
    expect(weekKey('2026-11-06T16:59:59Z', campaign)).toBe('2026-11-06');
    expect(weekKey('2026-11-06T17:00:00Z', campaign)).toBe('2026-11-13');
    expect(weekKey('2026-10-03T14:00:00Z', campaign)).toBe('2026-10-09');
    expect(weekKey('2026-10-04T14:00:00Z', campaign)).toBe('2026-10-09');
  });
  it('uses office time rather than the device timezone and handles the final partial tally', () => {
    expect(officeTimestamp('2026-10-02T12:00')).toBe('2026-10-02T16:00:00.000Z');
    expect(officeTimestamp('2026-11-06T12:00')).toBe('2026-11-06T17:00:00.000Z');
    expect(weekKey('2027-01-01T04:59:59Z', campaign)).toBe('2026-12-31');
    expect(tallyClosed('2026-12-31', campaign, new Date('2027-01-01T04:59:59Z'))).toBe(false);
    expect(tallyClosed('2026-12-31', campaign, new Date('2027-01-01T05:00:00Z'))).toBe(true);
    expect(campaignWeeks(campaign)).toEqual(['2026-10-02', '2026-10-09', '2026-10-16', '2026-10-23', '2026-10-30', '2026-11-06', '2026-11-13', '2026-11-20', '2026-11-27', '2026-12-04', '2026-12-11', '2026-12-18', '2026-12-25', '2026-12-31']);
  });
  it('rejects an impossible daylight saving wall time', () => {
    expect(() => officeTimestamp('2026-03-08T02:30')).toThrow('daylight saving');
  });
});
describe('approved ledger and prizes', () => {
  it('excludes pending and reversed reports and does not inflate QR count with other activities', () => {
    const d = ledger(); d.activities = [action({ quantity: 3, awarded_points: 3 }), action({ id: 'pending', status: 'pending', awarded_points: null, activity_type: 'operative_handoff' }), action({ id: 'reversed', status: 'reversed', awarded_points: 10 }), action({ id: 'review', activity_type: 'google_review', awarded_points: 5 })];
    const s = score(d, person, '2026-10-02'); expect(s.points).toBe(8); expect(s.pending).toBe(1); expect(s.qrCount).toBe(3);
  });
  it('keeps points at the awarded rate and enforces the clerical call minimum', () => {
    const d = ledger(); d.activities = [action({ awarded_points: 21 })]; d.calls = [{ id: 'calls', employee_id: 'employee', week_key: '2026-10-02', verified_count: 9, points_per_call: 1 }];
    expect(score(d, person, '2026-10-02').earned).toBe(0);
    d.calls[0].verified_count = 10; const s = score(d, person, '2026-10-02'); expect(s.points).toBe(31); expect(s.earned).toBe(2);
    expect(score(d, { ...person, scoring_role: null }, '2026-10-02').earned).toBe(0);
    expect(score(d, { ...person, active: false }, '2026-10-02').earned).toBe(0);
  });
  it('flags prizes already received after a correction and attributes a later bonus to its own week', () => {
    const d = ledger(); d.activities = [action({ awarded_points: 20 }), action({ id: 'bonus', activity_type: 'prepay_bonus', parent_id: 'action', awarded_points: 2, tally_week: '2026-10-09' })];
    d.picks = [{ id: 'picks', employee_id: 'employee', week_key: '2026-10-02', received_count: 2 }];
    const p = { ...person, scoring_role: 'doctor' as const }; expect(score(d, p, '2026-10-02').overage).toBe(1); expect(score(d, p, '2026-10-09').points).toBe(2); expect(score(d, p, '2026-10-02').quarter).toBe(22);
    d.activities[0].status = 'reversed'; expect(score(d, p, '2026-10-02').overage).toBe(2);
  });
  it('counts only checked huddles and leaves missing open hours missing', () => {
    const d = ledger(); d.huddles = [{ id: 'h1', employee_id: 'employee', week_key: '2026-10-02', huddle_date: '2026-10-01', on_time: true, points: 1 }, { id: 'h2', employee_id: 'employee', week_key: '2026-10-02', huddle_date: '2026-10-02', on_time: false, points: 1 }];
    expect(score(d, person, '2026-10-02').points).toBe(1); expect(d.metrics.find(m => m.week_key === '2026-10-02')?.doctor_open_hours).toBeUndefined();
  });
});
