import { it, expect } from 'vitest';
import { auditCsvRows, buildAuditCsv } from '@/lib/audit-export';

const punch = { id: 'p1', punch_time: '2026-09-09T13:40:00Z', punch_type: 'in', voided_at: null, void_reason: null };
const base = { created_at: '2026-09-14T22:08:00Z', actor_id: null, reason: null, event_details: {} };
const names = new Map<string, string>([['u1', 'Megan Vincent']]);

it('reports a trigger-logged void as Punch Voided, not a time edited to itself', () => {
  const rows = auditCsvRows([{ ...base, event_type: 'punch_edit', action_type: 'update', before_json: punch,
    after_json: { ...punch, voided_at: '2026-09-14T22:08:00Z', void_reason: 'Superseded by re-import (overwrite)' } }], names);
  expect(rows).toEqual([{ date: '09/14/2026', time: '06:08 PM', event: 'Punch Voided', field: 'Removed', before: 'None', after: 'Yes',
    actor: 'System', reason: 'Superseded by re-import (overwrite)' }]);
});

it('reports an update that changed nothing as No change', () => {
  const rows = auditCsvRows([{ ...base, event_type: 'punch_edit', action_type: 'update', actor_id: 'u1', before_json: punch, after_json: { ...punch } }], names);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ event: 'Punch Edit', field: 'No change', before: '—', after: '—', actor: 'Megan Vincent' });
});

it('writes one row per changed field on a real edit', () => {
  const rows = auditCsvRows([{ ...base, event_type: 'punch_edit', action_type: 'update', reason: 'Forgot to clock out', before_json: punch,
    after_json: { ...punch, punch_time: '2026-09-09T13:45:00Z', punch_type: 'out' } }], names);
  expect(rows.map(r => [r.field, r.before, r.after])).toEqual([['Time', '09:40 AM', '09:45 AM'], ['Punch', 'Clock in', 'Clock out']]);
  expect(rows.every(r => r.reason === 'Forgot to clock out')).toBe(true);
});

it('keeps a recorded punch as a single row and escapes commas in the CSV', () => {
  const csv = buildAuditCsv([{ ...base, event_type: 'punch_created', action_type: 'insert', before_json: null, after_json: punch,
    event_details: { source: 'manual' }, reason: 'Late, per manager' }], names);
  const lines = csv.split('\n');
  expect(lines[0]).toBe('Date,Time,Event,Field,Before,After,Actor,Reason');
  expect(lines).toHaveLength(2);
  expect(lines[1]).toContain('Punch Recorded');
  expect(lines[1]).toContain('"Late, per manager"');
});
