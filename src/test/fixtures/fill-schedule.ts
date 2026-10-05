import type { Campaign, Ledger } from '@/lib/fill-the-schedule';
export const campaign: Campaign = { id: 'campaign', org_id: 'org', name: 'Fill the Schedule', starts_on: '2026-10-05', ends_on: '2026-12-31', timezone: 'America/New_York', status: 'active', auto_import_enabled: false, scan_validation: null,
  pts_qr_card: 1, pts_unscheduled_booking: 1, pts_operative_handoff: 2, pts_chairside_card: null, pts_call: 1, pts_huddle: 1,
  pts_review_doctor: 3, pts_review_hygienist: 3, pts_review_clerical: 5, pts_review_assistant: 7, pts_attend_bonus: 2, pts_prepay_bonus: 2,
  prize_tier1_points: 20, prize_tier2_points: 30, clerical_min_calls: 10, open_hours_goal: 5, grand_prize_dollars: 100 };
export function fixture(): Ledger {
  return { campaign: { ...campaign }, participants: [{ id: 'p1', employee_id: 'staff', scoring_role: 'assistant', active: true }, { id: 'p2', employee_id: 'other', scoring_role: null, active: true }],
    names: [{ id: 'staff', display_name: 'Test Assistant', employment_status: 'active' }, { id: 'other', display_name: 'Test Teammate', employment_status: 'active' }],
    activities: [{ id: 'booking', entry_code: 'BOOK1234', employee_id: 'staff', activity_type: 'unscheduled_booking', occurred_at: '2026-10-05T14:00:00Z', tally_week: '2026-10-09', quantity: 1, status: 'pending', awarded_points: null, parent_id: null, reason_code: null, source: 'web' }, { id: 'otherqr', entry_code: 'OTHER123', employee_id: 'other', activity_type: 'qr_card', occurred_at: '2026-10-05T14:00:00Z', tally_week: '2026-10-09', quantity: 1, status: 'approved', awarded_points: 1, parent_id: null, reason_code: null, source: 'web' }],
    calls: [], huddles: [], metrics: [], picks: [], audit: [], checks: [], sheetRows: [],
    sheets: [{ id: 'sheet', sheet_code: 'S-1009-A', week_key: '2026-10-09', row_count: 12, status: 'open', printed_at: '2026-10-05T14:00:00Z' }] };
}
