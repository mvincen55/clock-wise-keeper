/** Session reducer — in-memory workflow state, destroyed on clear. */
import { describe, it, expect } from 'vitest';
import {
  EMPTY_SESSION,
  ledgerSessionReducer,
  sessionHasPatientData,
  type LedgerSessionState,
} from '@/lib/account-balance/session';
import { goldenRows, makeRow } from './account-balance-fixture';

const step = (state: LedgerSessionState, action: Parameters<typeof ledgerSessionReducer>[1]) =>
  ledgerSessionReducer(state, action);

describe('ledgerSessionReducer', () => {
  it('adds captures with sequence-overlap dedupe between them', () => {
    const rows = goldenRows();
    const first = rows.slice(0, 10);
    const second = rows.slice(8); // repeats rows 8–9 at the seam
    let state = step(EMPTY_SESSION, { type: 'addCapture', rows: first });
    state = step(state, { type: 'addCapture', rows: second });
    expect(state.captureCount).toBe(2);
    expect(state.lastOverlapRemoved).toBe(2);
    expect(state.rows).toHaveLength(rows.length);
  });

  it('re-runs the deterministic classifier when staff correct a description', () => {
    const row = makeRow({ id: 'x', dateISO: '2026-01-01', rawDescription: 'MISC 1234', chargeCents: 5000, balanceCents: 5000 });
    let state = step(EMPTY_SESSION, { type: 'addCapture', rows: [row] });
    expect(state.rows[0].classification).toBe('UNKNOWN');
    state = step(state, {
      type: 'updateRow',
      rowId: 'x',
      patch: { rawDescription: 'CANCELLATION W/OUT NOTICE' },
    });
    expect(state.rows[0].classification).toBe('CANCELLATION_OR_NO_SHOW_FEE');
    expect(state.rows[0].staffVerified).toBe(true);
  });

  it('a staff-chosen classification wins and is not overwritten', () => {
    const row = makeRow({ id: 'x', dateISO: '2026-01-01', rawDescription: 'MISC 1234', chargeCents: 5000 });
    let state = step(EMPTY_SESSION, { type: 'addCapture', rows: [row] });
    state = step(state, {
      type: 'updateRow',
      rowId: 'x',
      patch: { classification: 'TREATMENT_CHARGE' },
    });
    expect(state.rows[0].classification).toBe('TREATMENT_CHARGE');
    expect(state.rows[0].classificationConfidence).toBe(1);
  });

  it('editing an uncertain field settles its "Please verify" flag', () => {
    const row = makeRow({
      id: 'x', dateISO: '2026-01-01', rawDescription: 'Periodic oral evaluation',
      chargeCents: 6500, balanceCents: 6500, lowConfidenceFields: ['charge', 'balance'],
    });
    let state = step(EMPTY_SESSION, { type: 'addCapture', rows: [row] });
    state = step(state, { type: 'updateRow', rowId: 'x', patch: { chargeCents: 6600 } });
    expect(state.rows[0].lowConfidenceFields).toEqual(['balance']);
  });

  it('supports delete, insert-after, and reorder', () => {
    const rows = [
      makeRow({ id: 'a', dateISO: '2026-01-01', rawDescription: 'Periodic oral evaluation', chargeCents: 100 }),
      makeRow({ id: 'b', dateISO: '2026-01-02', rawDescription: 'Prophylaxis-adult', chargeCents: 200 }),
    ];
    let state = step(EMPTY_SESSION, { type: 'addCapture', rows });
    state = step(state, { type: 'addRowAfter', rowId: 'a' });
    expect(state.rows).toHaveLength(3);
    expect(state.rows[1].rawDescription).toBe('');
    const blankId = state.rows[1].id;
    state = step(state, { type: 'moveRow', rowId: blankId, direction: 1 });
    expect(state.rows[2].id).toBe(blankId);
    state = step(state, { type: 'deleteRow', rowId: blankId });
    expect(state.rows.map(r => r.id)).toEqual(['a', 'b']);
  });

  it('clearAll destroys every patient-specific value', () => {
    let state = step(EMPTY_SESSION, { type: 'addCapture', rows: goldenRows() });
    state = step(state, { type: 'setPatientName', name: 'Taylor Sample' });
    state = step(state, { type: 'answer', questionId: 'q1', optionId: 'copay' });
    state = step(state, { type: 'markPrinted' });
    expect(sessionHasPatientData(state)).toBe(true);

    state = step(state, { type: 'clearAll' });
    expect(state.rows).toEqual([]);
    expect(state.patientNameOverride).toBeNull();
    expect(state.answers).toEqual({});
    expect(state.printed).toBe(false);
    expect(state.stage).toBe('capture');
    expect(sessionHasPatientData(state)).toBe(false);
  });
});
