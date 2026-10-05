/** Campaign-only ledger. No patient identifiers or clinical data. */
export type ScoringRole = 'doctor' | 'hygienist' | 'clerical' | 'assistant';
export type ActivityType = 'qr_card' | 'unscheduled_booking' | 'operative_handoff' | 'chairside_card' | 'google_review' | 'attend_bonus' | 'prepay_bonus';
export interface Campaign {
  id: string; org_id: string; name: string; starts_on: string; ends_on: string; timezone: string; status: 'active' | 'closed';
  pts_qr_card: number; pts_unscheduled_booking: number; pts_operative_handoff: number; pts_chairside_card: number | null;
  pts_call: number; pts_huddle: number; pts_review_doctor: number; pts_review_hygienist: number; pts_review_clerical: number; pts_review_assistant: number;
  pts_attend_bonus: number; pts_prepay_bonus: number; prize_tier1_points: number; prize_tier2_points: number; clerical_min_calls: number;
  open_hours_goal: number; grand_prize_dollars: number;
}
export interface Participant { id: string; employee_id: string; scoring_role: ScoringRole | null; active: boolean }
export interface Activity {
  id: string; entry_code: string; employee_id: string; activity_type: ActivityType; occurred_at: string; tally_week: string;
  quantity: number; status: 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'reversed'; awarded_points: number | null;
  parent_id: string | null; reason_code: string | null;
}
export interface Calls { id: string; employee_id: string; week_key: string; verified_count: number; points_per_call: number }
export interface Huddle { id: string; employee_id: string; huddle_date: string; week_key: string; on_time: boolean; points: number }
export interface Metric { id: string; week_key: string; doctor_open_hours: number | null }
export interface PrizePick { id: string; employee_id: string; week_key: string; received_count: number }
export interface RosterName { id: string; display_name: string; employment_status: string }
export interface Audit { id: string; employee_id: string | null; entity: string; action: string; created_at: string }
export interface Ledger {
  campaign: Campaign; participants: Participant[]; activities: Activity[]; calls: Calls[]; huddles: Huddle[];
  metrics: Metric[]; picks: PrizePick[]; names: RosterName[]; audit: Audit[];
}
export const labels: Record<ActivityType, string> = {
  qr_card: 'Review requested + QR card handed out', unscheduled_booking: 'Appointment booked from the unscheduled treatment list',
  operative_handoff: 'Operative treatment booked before leaving + walked to front desk', chairside_card: 'Card on file presented chairside on a case over $10,000',
  google_review: 'Posted Google review that names you', attend_bonus: 'Booked appointment attended', prepay_bonus: 'Prepayment confirmed',
};
export const roles: Record<ScoringRole, string> = { doctor: 'Doctor', hygienist: 'Hygienist', clerical: 'Clerical', assistant: 'Assistant' };
export const reasons = { recorded_in_error: 'Recorded in error', duplicate_entry: 'Duplicate entry', not_verified_in_record: 'Not verified in the record', rule_not_met: 'Rule not met', outside_campaign: 'Outside the campaign' };

export function localDateTime(value: Date | string, timezone = 'America/New_York'): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const get = (type: string) => parts.find(p => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
/** Resolve office wall time, rejecting impossible DST wall times. */
export function officeTimestamp(wall: string, timezone = 'America/New_York'): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(wall)) throw new Error('Choose the date and time it happened.');
  const target = Date.parse(`${wall}:00Z`);
  if (!Number.isFinite(target)) throw new Error('Choose a valid date and time.');
  let candidate = target;
  for (let i = 0; i < 3; i++) candidate += target - Date.parse(`${localDateTime(new Date(candidate), timezone)}:00Z`);
  if (localDateTime(new Date(candidate), timezone) !== wall) throw new Error('That office time does not exist because of the daylight saving change.');
  return new Date(candidate).toISOString();
}
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10);
}
export function weekKey(value: Date | string, campaign: Pick<Campaign, 'timezone' | 'ends_on'>): string {
  const local = localDateTime(value, campaign.timezone); const day = local.slice(0, 10);
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  const offset = dow < 5 || (dow === 5 && local.slice(11) < '12:00') ? 5 - dow : 12 - dow;
  const key = addDays(day, offset); return key > campaign.ends_on ? campaign.ends_on : key;
}
export function campaignWeeks(c: Campaign): string[] {
  const first = weekKey(officeTimestamp(`${c.starts_on}T00:00`, c.timezone), c);
  const result = [first]; let next = addDays(first, 7);
  while (next < c.ends_on) { result.push(next); next = addDays(next, 7); }
  if (result[result.length - 1] !== c.ends_on) result.push(c.ends_on); return result;
}
export function tallyClosed(week: string, c: Campaign, now = new Date()): boolean {
  const cutoff = week === c.ends_on ? officeTimestamp(`${addDays(week, 1)}T00:00`, c.timezone) : officeTimestamp(`${week}T12:00`, c.timezone);
  return now.getTime() >= Date.parse(cutoff);
}
export function activityRate(type: ActivityType, c: Campaign, role: ScoringRole | null): number | null {
  if (type === 'google_review') return role ? c[`pts_review_${role}`] : null;
  return c[`pts_${type}`];
}
export function score(ledger: Ledger, p: Participant, week: string) {
  const own = ledger.activities.filter(a => a.employee_id === p.employee_id);
  const activities = own.filter(a => a.tally_week === week);
  const calls = ledger.calls.find(a => a.employee_id === p.employee_id && a.week_key === week);
  const huddles = ledger.huddles.filter(a => a.employee_id === p.employee_id && a.week_key === week && a.on_time);
  const points = activities.filter(a => a.status === 'approved').reduce((n, a) => n + (a.awarded_points ?? 0), 0)
    + (calls ? calls.verified_count * calls.points_per_call : 0) + huddles.reduce((n, a) => n + a.points, 0);
  const eligible = p.active && !!p.scoring_role && (p.scoring_role !== 'clerical' || (calls?.verified_count ?? 0) >= ledger.campaign.clerical_min_calls);
  const earned = !eligible ? 0 : points >= ledger.campaign.prize_tier2_points ? 2 : points >= ledger.campaign.prize_tier1_points ? 1 : 0;
  const received = ledger.picks.find(a => a.employee_id === p.employee_id && a.week_key === week)?.received_count ?? 0;
  const quarter = own.filter(a => a.status === 'approved').reduce((n, a) => n + (a.awarded_points ?? 0), 0)
    + ledger.calls.filter(a => a.employee_id === p.employee_id).reduce((n, a) => n + a.verified_count * a.points_per_call, 0)
    + ledger.huddles.filter(a => a.employee_id === p.employee_id && a.on_time).reduce((n, a) => n + a.points, 0);
  return { points, quarter, earned, received, remaining: Math.max(0, earned - received), overage: Math.max(0, received - earned),
    pending: activities.filter(a => a.status === 'pending').length, qrCount: activities.filter(a => a.activity_type === 'qr_card' && a.status === 'approved').reduce((n, a) => n + a.quantity, 0),
    callCount: calls?.verified_count ?? 0, callRecorded: !!calls, huddleCount: huddles.length, eligible };
}
