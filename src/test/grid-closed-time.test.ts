/**
 * The grid's own colors are the office's record of the day's hours.
 *
 * Dentrix paints an unbooked slot inside a provider's hours pale, and leaves
 * the blank blue grid where the provider is closed: before the first
 * patient, at lunch, after the last. A frame that paints slots this way reads
 * blank blue as closed time — off duty, confirmed by the office's own
 * setting — never as open, and saved hours are not applied over it. A frame
 * with no tinted slot anywhere keeps the old reading, blank grid is open.
 *
 * A note in its own box is as long as the box, even when the closed rows
 * next to it read as blocked too.
 */
import { describe, expect, it, vi } from 'vitest';
import { processScheduleFrame } from '@/lib/schedule-reader/worker';
import { providerColumn } from '@/lib/schedule-reader/provider-mapping';
import type { CaptureFrame, LayoutColumn, LayoutProfile, OcrBox, OcrWord } from '@/lib/schedule-reader/types';
import type { Provider } from '@/lib/providers';

const doctor: Provider = { id: 'd', orgId: 'o', displayName: 'Dr. Alpha', providerType: 'doctor', employeeId: null, active: true, sortOrder: 0 };
const W = 300, H = 120;
// Ten rows of ten minutes from y=20: 8:00 to 9:40.
const timeGrid = { minutesPerRow: 10, dayStartMinutes: 480, dayEndMinutes: 580, yStart: 20 / H, yEnd: 1 };
const column = (workingHours?: LayoutColumn['workingHours']): LayoutColumn => ({ xStart: 0, xEnd: 1 / 3, kind: 'provider', ...providerColumn(doctor), workingHours });
const profile = (col: LayoutColumn): LayoutProfile => ({
  id: 'layout', name: 'Office', pmsName: 'Dentrix', statusLegend: [],
  signature: { captureMode: 'posted', columns: [col], timeGrid, cancelledRemainVisible: false, blockStyle: 'mixed' },
});
const state = vi.hoisted(() => ({ words: [] as OcrWord[], regions: [] as OcrBox[] }));
vi.mock('@/lib/schedule-reader/ocr', () => ({ recognizeFrame: async () => ({ words: state.words, regions: state.regions, confidence: 1 }), terminateOcr: async () => {} }));

const BLUE: [number, number, number] = [133, 173, 214], GRAY: [number, number, number] = [128, 128, 128], PALE: [number, number, number] = [223, 238, 225], LINE: [number, number, number] = [192, 192, 192];
const visit: OcrBox = { x0: 0, y0: 40, x1: 100, y1: 70 };   // rows 2-4
const hold: OcrBox = { x0: 0, y0: 90, x1: 100, y1: 100 };   // row 7
const inBox = (b: OcrBox, x: number, y: number) => x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1;

/** Rows 0-1 blue, 2-4 a visit, 5-6 open (pale or blue), 7 a hold, 8-9 blue; a grid line on every row. */
function frameWith(openColor: [number, number, number]): CaptureFrame {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const color = inBox(visit, x, y) || inBox(hold, x, y) ? GRAY : y % 10 === 0 ? LINE : x < 100 && y >= 70 && y < 90 ? openColor : BLUE;
    data.set([...color, 255], (y * W + x) * 4);
  }
  const ctx = { getImageData: () => ({ width: W, height: H, data }) };
  return { width: W, height: H, canvas: { getContext: () => ctx }, tracks: [], objectUrls: [] } as unknown as CaptureFrame;
}
const say = (text: string, x: number, y: number): OcrWord => ({ text, confidence: 95, bbox: { x0: x, x1: x + 18, y0: y, y1: y + 8 } });

async function analyze(openColor: [number, number, number], col: LayoutColumn) {
  state.words = [say('DR02', 42, 44), say('NP', 42, 91)];
  state.regions = [visit, hold];
  return processScheduleFrame(frameWith(openColor), {
    profile: profile(col), businessDate: '2026-09-21', knownStaffNames: [doctor.displayName], phraseRules: [], providers: [doctor],
    reviewColumns: async () => [col],
  });
}

describe('a grid that paints its open slots', () => {
  it('reads blank blue as the provider\'s closed time, confirmed, and takes the hours from the grid', async () => {
    // Saved hours say Monday is off all day; the grid says otherwise and wins.
    const result = await analyze(PALE, column([{ weekday: 1, startMinutes: 0, endMinutes: 0 }]));
    const p = result.providers[0];
    expect(p.scheduledMinutes).toBe(30);
    expect(p.trueOpenMinutes).toBe(20);
    expect(p.unclassifiedMinutes).toBe(0);
    expect(p.intentionalUnavailableMinutes).toBe(50);
    expect(p.netBookableMinutes).toBe(50);
    expect(result.availabilityConflicts).toEqual([]);
    expect(result.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PROVIDER_OFF', minutes: 40, userConfirmed: true }),
      expect.objectContaining({ code: 'OTHER_OPERATIONAL_BLOCK', minutes: 10 }),
    ]));
    // The observed day: first patient 8:20, available 8:20 to 9:10, nothing before or after.
    expect(p.firstPatientMinute).toBe(500);
    expect(p.availableStartMinute).toBe(500);
    expect(p.availableEndMinute).toBe(550);
  });

  it('a hold in its own box is as long as the box, not the closed rows beside it', async () => {
    const result = await analyze(PALE, column());
    expect(result.blocks.find(b => b.code === 'OTHER_OPERATIONAL_BLOCK')?.minutes).toBe(10);
  });

  it('a grid with no tinted slot keeps blank grid as open time and applies the saved hours', async () => {
    const result = await analyze(BLUE, column([{ weekday: 1, startMinutes: 500, endMinutes: 560 }]));
    const p = result.providers[0];
    expect(p.scheduledMinutes).toBe(30);
    // Rows 0-1 and 8-9 are open on the grid but outside the saved hours: off duty.
    expect(p.trueOpenMinutes).toBe(20);
    expect(result.blocks).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'PROVIDER_OFF', minutes: 40, userConfirmed: true })]));
  });
});
