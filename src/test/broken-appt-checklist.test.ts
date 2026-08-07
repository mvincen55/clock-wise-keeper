import { describe, it, expect } from 'vitest';
import {
  completionLabel,
  completionStamp,
  formatStampDate,
  formatStampTime,
  pruneChecklistState,
  toggleChecklistItem,
  type ChecklistState,
} from '@/lib/broken-appts/checklist';

// The interactive checklist's memory model: checking stamps the canonical
// staff code + exact local time, unchecking removes the record, rechecking
// stamps FRESH — and the OFFICE COPY table renders whatever this state
// holds at print time. Everything is pure and memory-only.

const AT = new Date(2026, 7, 7, 10, 47); // Aug 7 2026, 10:47 AM local

describe('stamp formatting', () => {
  it('dates are zero-padded MM/DD/YYYY', () => {
    expect(formatStampDate(AT)).toBe('08/07/2026');
    expect(formatStampDate(new Date(2026, 11, 31))).toBe('12/31/2026');
  });

  it('times are local h:mm AM/PM', () => {
    expect(formatStampTime(AT)).toBe('10:47 AM');
    expect(formatStampTime(new Date(2026, 0, 1, 0, 5))).toBe('12:05 AM');
    expect(formatStampTime(new Date(2026, 0, 1, 12, 0))).toBe('12:00 PM');
    expect(formatStampTime(new Date(2026, 0, 1, 15, 9))).toBe('3:09 PM');
  });

  it('the inline label reads CODE • date • time', () => {
    expect(completionLabel(completionStamp('MEG', AT))).toBe('MEG • 08/07/2026 • 10:47 AM');
  });
});

describe('toggleChecklistItem', () => {
  it('checking records the staff code and timestamp', () => {
    const state = toggleChecklistItem({}, 'Post 9100 (auto-fee)', true, 'MEG', AT);
    expect(state['Post 9100 (auto-fee)']).toEqual({
      date: '08/07/2026',
      time: '10:47 AM',
      staffCode: 'MEG',
    });
  });

  it('unchecking removes the completion and its timestamp entirely', () => {
    let state = toggleChecklistItem({}, 'Call patient', true, 'MEG', AT);
    state = toggleChecklistItem(state, 'Call patient', false, 'MEG', AT);
    expect(state['Call patient']).toBeUndefined();
    expect(Object.keys(state)).toHaveLength(0);
  });

  it('rechecking creates a NEW timestamp, never reviving the old one', () => {
    let state = toggleChecklistItem({}, 'Call patient', true, 'MEG', AT);
    state = toggleChecklistItem(state, 'Call patient', false, 'MEG', AT);
    const later = new Date(2026, 7, 7, 11, 2);
    state = toggleChecklistItem(state, 'Call patient', true, 'MEG', later);
    expect(state['Call patient']).toEqual({
      date: '08/07/2026',
      time: '11:02 AM',
      staffCode: 'MEG',
    });
  });

  it('never mutates the previous state (React setState contract)', () => {
    const before: ChecklistState = {};
    const after = toggleChecklistItem(before, 'X', true, 'MEG', AT);
    expect(before).toEqual({});
    expect(after).not.toBe(before);
  });
});

describe('pruneChecklistState', () => {
  it('drops completions whose action is no longer applicable', () => {
    const state: ChecklistState = {
      'Post 9100 (auto-fee)': completionStamp('MEG', AT),
      'Apply courtesy credit (net $0)': completionStamp('MEG', AT),
    };
    const pruned = pruneChecklistState(state, ['Post 9100 (auto-fee)']);
    expect(Object.keys(pruned)).toEqual(['Post 9100 (auto-fee)']);
  });

  it('keeps everything when the labels still apply', () => {
    const state: ChecklistState = { A: completionStamp('MEG', AT) };
    expect(pruneChecklistState(state, ['A', 'B'])).toEqual(state);
  });
});
