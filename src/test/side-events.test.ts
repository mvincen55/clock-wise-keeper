/**
 * The notes columns beside the chairs are the office's event log: "CX >>"
 * is a cancellation without notice for the chair the arrow points at, "NS"
 * a no-show. The chair says what became of the slot: open rows are the
 * event's open time, a booked row means it was refilled (recovered).
 */
import { describe, expect, it } from 'vitest';
import { applySideEvents, inkArrowHint, readSideEvents } from '@/lib/schedule-reader/side-events';
import type { LayoutColumn, OcrWord } from '@/lib/schedule-reader/types';

const rows = Array.from({ length: 6 }, (_, i) => ({ yTop: 20 + i * 10, yBottom: 30 + i * 10 }));
const col = (i: number, kind: LayoutColumn['kind']): LayoutColumn & { pxStart: number; pxEnd: number } =>
  ({ xStart: i / 3, xEnd: (i + 1) / 3, pxStart: i * 100, pxEnd: (i + 1) * 100, kind, providerLabel: kind === 'provider' ? `P${i}` : null, providerRole: null, department: null, employeeId: null });
const say = (text: string, x: number, y: number): OcrWord => ({ text, confidence: 95, bbox: { x0: x, x1: x + 14, y0: y, y1: y + 8 } });

describe('readSideEvents', () => {
  it('points each event at the chair its arrow names, or the nearer chair without one', () => {
    const columns = [col(0, 'provider'), col(1, 'non_clinical'), col(2, 'provider')];
    const words = [say('CX', 110, 31), say('-->', 126, 31), say('<--', 110, 41), say('NS', 126, 41), say('CX', 105, 51), say('>>', 121, 51)];
    const events = readSideEvents(words, columns, rows, 20);
    expect(events).toEqual([
      { kind: 'cancelled', rowIndex: 1, target: { pxStart: 200, pxEnd: 300 } },
      { kind: 'no_show', rowIndex: 2, target: { pxStart: 0, pxEnd: 100 } },
      { kind: 'cancelled', rowIndex: 3, target: { pxStart: 200, pxEnd: 300 } },
    ]);
    // A note that is not an event, and a chair's own words, are not events.
    expect(readSideEvents([say('SENT', 110, 31), say('BLAST', 130, 31), say('CX', 10, 31)], columns, rows, 20)).toEqual([]);
    // The engine's own reading of "CX >>" and "CX -->" from a thin bar: the arrow comes back as letters, or not at all.
    expect(readSideEvents([say('Css', 110, 31)], columns, rows, 20)).toEqual([{ kind: 'cancelled', rowIndex: 1, target: { pxStart: 200, pxEnd: 300 } }]);
    expect(readSideEvents([say('Cs', 110, 41), say('--»', 126, 41)], columns, rows, 20)).toEqual([{ kind: 'cancelled', rowIndex: 2, target: { pxStart: 200, pxEnd: 300 } }]);
  });
});

describe('applySideEvents', () => {
  const chair = { pxStart: 200, pxEnd: 300 };
  it('turns the open run after a cancellation into its open time, past the bar\'s own unknown row', () => {
    const out = applySideEvents([null, null, 'open', 'open', 'completed', 'open'], [{ kind: 'cancelled', rowIndex: 1, target: chair }], chair, rows, []);
    expect(out.statuses).toEqual([null, null, 'cancelled', 'cancelled', 'completed', 'open']);
    expect(out.counts).toEqual({ cancelled: 1, no_show: 0 });
    expect(out.recovered).toEqual({ cancelled: 0, no_show: 0 });
  });
  it('a refilled slot still counts, and the box booked there is recovered time', () => {
    const box = { x0: 200, y0: 30, x1: 300, y1: 60 };
    const out = applySideEvents([null, 'completed', 'completed', 'completed', 'open', 'open'], [{ kind: 'no_show', rowIndex: 1, target: chair }], chair, rows, [box]);
    expect(out.statuses[4]).toBe('open');
    expect(out.counts).toEqual({ cancelled: 0, no_show: 1 });
    expect(out.recovered).toEqual({ cancelled: 0, no_show: 1 });
    expect(out.recoveredRows).toBe(3);
  });
  it('ignores events aimed at another chair', () => {
    const out = applySideEvents(['open', 'open'], [{ kind: 'cancelled', rowIndex: 0, target: { pxStart: 0, pxEnd: 100 } }], chair, rows, []);
    expect(out.statuses).toEqual(['open', 'open']);
    expect(out.counts).toEqual({ cancelled: 0, no_show: 0 });
  });
});

describe('inkArrowHint', () => {
  // A 60x10 bar: gray with black ink. The engine read one word at x 24-36 of the bar.
  const bar = { x0: 100, y0: 30, x1: 160, y1: 40 };
  const pixels = (inkFrom: number, inkTo: number) => () => {
    const data = new Uint8ClampedArray(60 * 10 * 4);
    for (let y = 0; y < 10; y++) for (let x = 0; x < 60; x++) data.set(y >= 3 && y <= 6 && x >= inkFrom && x < inkTo ? [0, 0, 0, 255] : [128, 128, 128, 255], (y * 60 + x) * 4);
    return { width: 60, height: 10, data };
  };
  const line = { words: [{ text: 'Cs', confidence: 90, bbox: { x0: 124, x1: 136, y0: 32, y1: 38 } }], text: 'Cs' };
  it('finds an unread arrow by its ink beyond the words', () => {
    expect(inkArrowHint([bar], pixels(40, 46))(line)).toBe('right');
    expect(inkArrowHint([bar], pixels(6, 16))(line)).toBe('left');
    expect(inkArrowHint([bar], pixels(0, 0))(line)).toBeNull();
    expect(inkArrowHint([bar], () => null)(line)).toBeNull();
  });
});

describe('a bar between two chairs with no readable arrow', () => {
  const columns = [col(0, 'provider'), col(1, 'non_clinical'), col(2, 'provider')];
  it('goes to the chair where a slot could have been cancelled then: blank, or a box starting right there', () => {
    // Row 1 (y 30-40): the left chair's box started at row 0 and covers it; the right chair's box starts on it.
    const regions = [{ x0: 0, y0: 20, x1: 100, y1: 60 }, { x0: 200, y0: 30, x1: 300, y1: 60 }];
    expect(readSideEvents([say('Cs', 110, 31)], columns, rows, 20, () => null, regions)[0].target.pxStart).toBe(200);
    // Nothing booked in the left chair at that row, the right chair's box covering it since earlier: left.
    expect(readSideEvents([say('Cs', 110, 41)], columns, rows, 20, () => null, [{ x0: 200, y0: 20, x1: 300, y1: 60 }])[0].target.pxStart).toBe(0);
  });
});
