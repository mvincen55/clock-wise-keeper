import { it, expect } from 'vitest';
import { auditCsvRows, buildAuditCsv } from '@/lib/audit-export';

const punch = { id: 'p1', punch_time: '2026-09-09T13:40:00Z', punch_type: 'in', voided_at: null, void_reason: null, source: 'manual' };
const base = { created_at: '2026-09-14T22:08:00Z', actor_id: null, user_id: 'u-emp', employee_id: 'e1', reason: null, event_details: {} };
const codes = { byEmployee: new Map([['e1', 'AA14']]), byUser: new Map([['u-emp', 'AA14'], ['u-mgr', 'DA14']]) };

it('reports a trigger-logged void as a removal in plain English, by staff code', () => {
  const rows = auditCsvRows([{ ...base, event_type: 'punch_edit', action_type: 'update', actor_id: 'u-mgr', before_json: punch,
    after_json: { ...punch, voided_at: '2026-09-14T22:08:00Z', void_reason: 'Superseded by re-import (overwrite)' } }], codes);
  expect(rows).toEqual([{ date: '09/14/2026', time: '06:08 PM', employee: 'AA14', event: 'Punch Removed',
    what: 'DA14 removed the clock-in at 09:40 AM.', by: 'DA14', reason: 'Superseded by re-import (overwrite)' }]);
});

it('says when a write changed nothing instead of showing a time edited to itself', () => {
  const rows = auditCsvRows([{ ...base, event_type: 'punch_edit', action_type: 'update', before_json: punch, after_json: { ...punch } }], codes);
  expect(rows[0]).toMatchObject({ what: 'The system re-saved the clock-in at 09:40 AM without changing it.', by: 'System' });
});

it('describes a real edit as a move', () => {
  const rows = auditCsvRows([{ ...base, event_type: 'punch_edit', action_type: 'update', actor_id: 'u-mgr', reason: 'Forgot to clock out', before_json: punch,
    after_json: { ...punch, punch_time: '2026-09-09T13:45:00Z' } }], codes);
  expect(rows[0]).toMatchObject({ what: 'DA14 moved the clock-in from 09:40 AM to 09:45 AM.', by: 'DA14', reason: 'Forgot to clock out' });
});

it('describes an employee clocking in themselves, and a manager adding one for them', () => {
  const self = auditCsvRows([{ ...base, event_type: 'punch_created', action_type: 'insert', actor_id: 'u-emp', before_json: null, after_json: punch }], codes);
  expect(self[0].what).toBe('AA14 clocked in at 09:40 AM.');
  const added = auditCsvRows([{ ...base, event_type: 'punch_added_manually', action_type: 'insert', actor_id: 'u-mgr', before_json: null,
    after_json: { ...punch, punch_type: 'out', punch_time: '2026-09-09T21:40:00Z' } }], codes);
  expect(added[0].what).toBe('DA14 added a clock-out at 05:40 PM for AA14.');
});

it('never prints a name: an unknown actor or employee is Unassigned', () => {
  const rows = auditCsvRows([{ ...base, employee_id: 'e-unknown', user_id: 'u-unknown', actor_id: 'u-unknown', event_type: 'punch_created', before_json: null, after_json: punch }], codes);
  expect(rows[0]).toMatchObject({ employee: 'Unassigned', by: 'Unassigned' });
});

it('writes one CSV line per event with the new header and escapes commas', () => {
  const csv = buildAuditCsv([{ ...base, event_type: 'punch_created', action_type: 'insert', before_json: null, after_json: punch, reason: 'Late, per manager' }], codes);
  const lines = csv.split('\n');
  expect(lines[0]).toBe('Date,Time,Employee,Event,What happened,By,Reason');
  expect(lines).toHaveLength(2);
  expect(lines[1]).toContain('"Late, per manager"');
});
