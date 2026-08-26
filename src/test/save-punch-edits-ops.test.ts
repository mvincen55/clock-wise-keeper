/**
 * Transactional punch editing: the client builds an operation list and
 * the server applies it atomically.
 *
 * Guards the Phase 4 contract (Time Clock Legitimacy Hardening):
 * buildPunchEditOps translates editor state into exactly the ops the
 * save_punch_edits RPC applies — voids for removals (never deletes),
 * updates only for real changes, no operation ever touches a voided
 * punch — and the RPC's structured rejections map to human copy.
 */
import { describe, it, expect } from 'vitest';
import { buildPunchEditOps, friendlyEditError, type EditablePunch } from '@/hooks/usePunchEditor';

function ep(overrides: Partial<EditablePunch>): EditablePunch {
  return {
    id: 'p1',
    punch_type: 'in',
    punch_time: '2026-08-14T13:00:00.000Z',
    original_punch_time: '2026-08-14T13:00:00.000Z',
    is_deleted: false,
    is_new: false,
    is_edited: false,
    source: 'manual',
    location_lat: null,
    location_lng: null,
    voided_at: null,
    void_reason: null,
    ...overrides,
  };
}

describe('buildPunchEditOps', () => {
  it('a removed live punch becomes a void op, never a delete', () => {
    const orig = [ep({ id: 'a' }), ep({ id: 'b', punch_type: 'out', punch_time: '2026-08-14T21:00:00.000Z' })];
    const edited = [orig[0], { ...orig[1], is_deleted: true }];
    expect(buildPunchEditOps(orig, edited)).toEqual([{ op: 'void', id: 'b' }]);
  });

  it('a removed already-voided punch produces no op (immutable history)', () => {
    const orig = [ep({ id: 'a' }), ep({ id: 'v', voided_at: '2026-08-14T20:00:00.000Z' })];
    const edited = [orig[0]];
    expect(buildPunchEditOps(orig, edited)).toEqual([]);
  });

  it('an unchanged punch produces no update op', () => {
    const orig = [ep({ id: 'a' })];
    expect(buildPunchEditOps(orig, [ep({ id: 'a' })])).toEqual([]);
  });

  it('time and type changes become one update op; source rides along only when changed', () => {
    const orig = [ep({ id: 'a' })];
    const edited = [ep({ id: 'a', punch_time: '2026-08-14T13:30:00.000Z', punch_type: 'out' })];
    expect(buildPunchEditOps(orig, edited)).toEqual([
      { op: 'update', id: 'a', punch_time: '2026-08-14T13:30:00.000Z', punch_type: 'out' },
    ]);

    const sourceChanged = [ep({ id: 'a', source: 'auto_location' })];
    expect(buildPunchEditOps(orig, sourceChanged)).toEqual([
      { op: 'update', id: 'a', punch_time: orig[0].punch_time, punch_type: 'in', source: 'auto_location' },
    ]);
  });

  it('edits to a voided punch are dropped', () => {
    const orig = [ep({ id: 'v', voided_at: '2026-08-14T20:00:00.000Z' })];
    const edited = [ep({ id: 'v', voided_at: '2026-08-14T20:00:00.000Z', punch_time: '2026-08-14T15:00:00.000Z' })];
    expect(buildPunchEditOps(orig, edited)).toEqual([]);
  });

  it('new punches insert; a new punch removed before saving produces nothing', () => {
    const orig: EditablePunch[] = [];
    const added = ep({ id: null, is_new: true, punch_time: '2026-08-14T13:00:00.000Z' });
    expect(buildPunchEditOps(orig, [added])).toEqual([
      { op: 'insert', punch_time: '2026-08-14T13:00:00.000Z', punch_type: 'in' },
    ]);
    expect(buildPunchEditOps(orig, [{ ...added, is_deleted: true }])).toEqual([]);
  });

  it('a full session diff yields void + update + insert in one list', () => {
    const orig = [
      ep({ id: 'a' }),
      ep({ id: 'b', punch_type: 'out', punch_time: '2026-08-14T17:00:00.000Z' }),
    ];
    const edited = [
      ep({ id: 'a', punch_time: '2026-08-14T12:45:00.000Z' }),
      { ...orig[1], is_deleted: true },
      ep({ id: null, is_new: true, punch_type: 'out', punch_time: '2026-08-14T21:00:00.000Z' }),
    ];
    expect(buildPunchEditOps(orig, edited)).toEqual([
      { op: 'void', id: 'b' },
      { op: 'update', id: 'a', punch_time: '2026-08-14T12:45:00.000Z', punch_type: 'in' },
      { op: 'insert', punch_time: '2026-08-14T21:00:00.000Z', punch_type: 'out' },
    ]);
  });
});

describe('friendlyEditError', () => {
  it('maps the structured rejections', () => {
    expect(friendlyEditError('EDIT_SEQUENCE_INVALID: punches must alternate')).toMatch(/alternate in\/out/);
    expect(friendlyEditError('EDIT_PUNCH_VOIDED: voided punches are immutable')).toMatch(/voided/);
    expect(friendlyEditError('EDIT_ADMIN_ONLY: punch edits are manager-only')).toMatch(/manager-only/);
    expect(friendlyEditError('EDIT_REASON_REQUIRED: an edit reason is required')).toMatch(/reason/);
    expect(friendlyEditError('connection reset')).toBeNull();
  });
});
