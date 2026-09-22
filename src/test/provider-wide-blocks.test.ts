import { describe, expect, it, vi } from 'vitest';
import { applyProviderWideBlocks, type PlacedBlock } from '@/lib/schedule-reader/provider-hours';
import { processScheduleFrame } from '@/lib/schedule-reader/worker';
import { providerColumn } from '@/lib/schedule-provider-mapping';
import type { Provider } from '@/lib/providers';
import type { CaptureFrame, ClassifiedBlock, LayoutColumn, LayoutProfile, OcrBox, OcrWord, ReducedRow } from '@/lib/schedule-reader/types';

// "When someone is out": a block that takes the provider away (off, lunch,
// meeting) in one chair makes that span unavailable in every chair the
// provider runs. A chair-level block (a hold, equipment down) does not.

const placed = (code: ClassifiedBlock['code'], rowStart: number, rowEnd: number, extra: Partial<ClassifiedBlock> = {}): PlacedBlock => ({
  block: { code, minutes: (rowEnd - rowStart + 1) * 10, providerLabel: 'Dr. Alpha', department: 'doctor', confidence: 0.9, userConfirmed: false, ...extra },
  rowStart,
  rowEnd,
});
const row = (category: ReducedRow['category']): ReducedRow => ({ category, scheduledColumns: category === 'scheduled' ? 1 : 0 });

describe('applyProviderWideBlocks', () => {
  it('blocks open and unknown rows under a provider-wide block, keeps appointments, and clips to the grid', () => {
    const rows = [row('open'), row(null), row('scheduled'), row('open'), row('open')];
    const result = applyProviderWideBlocks(rows, [placed('PROVIDER_OFF', 0, 3), placed('LUNCH_BLOCK', 3, 9)]);
    expect(result.map(r => r.category)).toEqual(['blocked', 'blocked', 'scheduled', 'blocked', 'blocked']);
    expect(rows[0].category).toBe('open'); // input untouched
  });

  it('leaves chair-level, unplaced, and unconfident blocks alone', () => {
    const rows = [row('open'), row('open')];
    expect(applyProviderWideBlocks(rows, [placed('OTHER_OPERATIONAL_BLOCK', 0, 1)])).toBe(rows);
    expect(applyProviderWideBlocks(rows, [placed('EQUIPMENT_UNAVAILABLE', 0, 1)])).toBe(rows);
    expect(applyProviderWideBlocks(rows, [placed('STAFFING_LIMITATION', 0, 1)])).toBe(rows);
    expect(applyProviderWideBlocks(rows, [placed('PROVIDER_OFF', -1, -1)])).toBe(rows);
    expect(applyProviderWideBlocks(rows, [placed('PROVIDER_OFF', 0, 1, { confidence: 0.5 })])).toBe(rows);
    expect(applyProviderWideBlocks(rows, [placed('PROVIDER_OFF', 0, 1, { confidence: 0.5, userConfirmed: true })]).map(r => r.category)).toEqual(['blocked', 'blocked']);
  });
});

// End to end on a posted grid: chair 1 carries the day's note, chair 2 has an
// unrelated note and is otherwise blank, chair 3 is blank blue (omitted as an
// empty lane). Both kept chairs belong to the same doctor.

const doctor: Provider = { id: 'd', orgId: 'o', displayName: 'Dr. Alpha', providerType: 'doctor', employeeId: null, active: true, sortOrder: 0 };
const W = 300, H = 100;
const columns: LayoutColumn[] = [0, 1, 2].map(i => ({ xStart: i / 3, xEnd: (i + 1) / 3, kind: 'provider', ...providerColumn(doctor) }));
const profile: LayoutProfile = {
  id: 'layout', name: 'Office', pmsName: 'Dentrix', statusLegend: [],
  signature: { captureMode: 'posted', columns, timeGrid: { minutesPerRow: 10, dayStartMinutes: 480, dayEndMinutes: 560, yStart: .2, yEnd: 1 }, cancelledRemainVisible: false, blockStyle: 'mixed' },
};
const state = vi.hoisted(() => ({ words: [] as OcrWord[], regions: [] as OcrBox[] }));
vi.mock('@/lib/schedule-reader/ocr', () => ({ recognizeFrame: async () => ({ words: state.words, regions: state.regions, confidence: 1 }), terminateOcr: async () => {} }));

const BLUE: [number, number, number] = [133, 173, 214], GRAY: [number, number, number] = [128, 128, 128], PALE: [number, number, number] = [223, 238, 225];
const chair1Note: OcrBox = { x0: 0, y0: 20, x1: 100, y1: 100 };
const chair2Note: OcrBox = { x0: 105, y0: 30, x1: 195, y1: 50 };
const inBox = (box: OcrBox) => (x: number, y: number) => x >= box.x0 && x < box.x1 && y >= box.y0 && y < box.y1;

function frameWith(chair2Background: [number, number, number]): CaptureFrame {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const color = inBox(chair1Note)(x, y) || inBox(chair2Note)(x, y) ? GRAY : x >= 100 && x < 200 && y >= 20 ? chair2Background : BLUE;
    data.set([...color, 255], (y * W + x) * 4);
  }
  const ctx = { getImageData: () => ({ width: W, height: H, data }) };
  return { width: W, height: H, canvas: { getContext: () => ctx }, tracks: [], objectUrls: [] } as unknown as CaptureFrame;
}
const say = (text: string, x: number, y: number): OcrWord => ({ text, confidence: 95, bbox: { x0: x, x1: x + 18, y0: y, y1: y + 8 } });

async function analyze(chair1Text: string[], chair2Background: [number, number, number] = BLUE) {
  // Chair 1 spans x 0..100; keep every word of its note inside (and past the 18% rail band).
  state.words = [...chair1Text.map((t, i) => say(t, 42 + i * 18, 24)), say('crowns', 120, 34)];
  state.regions = [chair1Note, chair2Note];
  const result = await processScheduleFrame(frameWith(chair2Background), {
    profile, businessDate: '2026-09-21', knownStaffNames: [doctor.displayName], phraseRules: [], providers: [doctor],
    reviewColumns: async suggested => suggested.map(c => ({ ...c, kind: 'provider' as const, ...providerColumn(doctor) })),
  });
  return result;
}

describe('a posted day with the provider out', () => {
  it('"No Doctor" across one chair makes the doctor unavailable in every chair — no phantom open time', async () => {
    const result = await analyze(['No', 'Doctor']);
    expect(result.providers).toHaveLength(1);
    const [dr] = result.providers;
    expect(dr.activeColumns).toBe(2); // chair 3 was blank blue and omitted
    expect(dr.grossAvailableMinutes).toBe(80);
    expect(dr.intentionalUnavailableMinutes).toBe(80);
    expect(dr.netBookableMinutes).toBe(0);
    expect(dr.trueOpenMinutes).toBe(0);
    expect(dr.unclassifiedMinutes).toBe(0);
    expect(dr.automatedWorkloadClass).toBe('light');
    expect(dr.reviewStatus).toBe('auto_accepted');
    expect(result.blocks).toContainEqual(expect.objectContaining({ code: 'PROVIDER_OFF', minutes: 80, providerLabel: 'Dr. Alpha' }));
    expect(result.needsReview).toBe(false);
  });

  it('a chair-level hold in one chair leaves the other chair open', async () => {
    const [dr] = (await analyze(['Do', 'NOT', 'Book'])).providers;
    expect(dr.intentionalUnavailableMinutes).toBe(20); // the rows the second chair's own note occupies
    expect(dr.trueOpenMinutes).toBe(60);
    expect(dr.netBookableMinutes).toBe(60);
  });

  it('a pale-tinted second chair reads as open, not unclassified', async () => {
    const [dr] = (await analyze(['Do', 'NOT', 'Book'], PALE)).providers;
    expect(dr.trueOpenMinutes).toBe(60);
    expect(dr.unclassifiedMinutes).toBe(0);
    expect(dr.reviewStatus).toBe('auto_accepted');
  });
});
