import { expect, it, vi } from 'vitest';
import { suggestDailyColumns, providerColumn } from '@/lib/schedule-provider-mapping';
import { processScheduleFrame } from '@/lib/schedule-reader/worker';
import type { Provider } from '@/lib/providers';
import type { CaptureFrame, LayoutColumn, LayoutProfile, OcrWord } from '@/lib/schedule-reader/types';
const a: Provider = { id: 'a', orgId: 'o', displayName: 'Dr. Alpha', providerType: 'doctor', employeeId: null, active: true, sortOrder: 0 };
const b: Provider = { ...a, id: 'b', displayName: 'Dr. Bravo' };
const columns: LayoutColumn[] = [a, b, a].map((p, i) => ({ xStart: i / 3, xEnd: (i + 1) / 3, kind: 'provider', ...providerColumn(p), providerCode: i === 0 ? 'DR01' : i === 1 ? 'DR02' : undefined }));
const word = (text: string, x: number, confidence = 99): OcrWord => ({ text, confidence, bbox: { x0: x, x1: x + 10, y0: 5, y1: 10 } });
const state = vi.hoisted(() => ({ words: [] as OcrWord[] }));
vi.mock('@/lib/schedule-reader/ocr', () => ({ recognizeFrame: async () => ({ words: state.words, confidence: 1 }), terminateOcr: async () => {} }));
vi.mock('@/lib/schedule-reader/metrics-builder', async original => ({
  ...await original<typeof import('@/lib/schedule-reader/metrics-builder')>(),
  sampleColumnStatuses: (_ctx: unknown, col: { pxStart: number }) => [col.pxStart < 100 ? 'scheduled' : 'open'],
}));
const profile: LayoutProfile = { id: 'layout', name: 'Office', pmsName: null, statusLegend: [], signature: { columns, timeGrid: { minutesPerRow: 60, dayStartMinutes: 480, dayEndMinutes: 540, yStart: .2, yEnd: 1 }, cancelledRemainVisible: true, blockStyle: 'mixed' } };
const frame = { width: 300, height: 100, canvas: { getContext: () => ({}) }, tracks: [], objectUrls: [] } as unknown as CaptureFrame;
it('reassigns swapped providers, excludes notes, and never inherits stale owners', () => {
  const result = suggestDailyColumns([word('DR02', 20), word('DR01', 120), word('Notes', 220)], columns, 300, 100, [a,b]);
  expect(result.map(c => c.providerId)).toEqual(['b','a',undefined]);
  expect(result[2].kind).toBe('non_clinical');
  expect(suggestDailyColumns([], columns, 300, 100, [a,b]).every(c => !c.providerId && c.kind === 'provider')).toBe(true);
});
it('suggests unique staff surnames but leaves ambiguous names and weak OCR for review', () => {
  expect(suggestDailyColumns([word('Bravo',20)], columns,300,100,[a,b])[0].providerId).toBe('b');
  expect(suggestDailyColumns([word('Bravo',20)], columns,300,100,[b,{...b,id:'c'}])[0].providerId).toBeUndefined();
  expect(suggestDailyColumns([word('Notes',20,50)], columns,300,100,[a,b])[0].kind).toBe('provider');
});
it('uses reviewed daily assignments for metrics without changing saved calibration', async () => {
  state.words = [word('DR02',20),word('DR01',120),word('Notes',220)];
  const before = JSON.stringify(profile);
  const review = vi.fn(async (suggested: LayoutColumn[]) => suggested);
  const result = await processScheduleFrame(frame, { profile, businessDate: '2026-06-08', knownStaffNames: [], phraseRules: [], providers:[a,b], reviewColumns: review });
  expect(review).toHaveBeenCalledOnce();
  expect(result.providers.find(p => p.providerLabel === b.displayName)?.scheduledMinutes).toBe(60);
  expect(result.providers).toHaveLength(2);
  expect(JSON.stringify(profile)).toBe(before);
  expect(state.words).toHaveLength(0);
});
it('cancelled daily mapping produces no analysis and wipes OCR', async () => {
  state.words = [word('DR02',20)];
  await expect(processScheduleFrame(frame, { profile, businessDate:'2026-06-08', knownStaffNames:[], phraseRules:[], providers:[a,b], reviewColumns: async () => null })).rejects.toMatchObject({code:'PROCESSING_CANCELLED'});
  expect(state.words).toHaveLength(0);
});
it('runs the privacy gate before showing daily mapping', async () => {
  state.words = [word('212-555-1234',20)];
  const review = vi.fn();
  await expect(processScheduleFrame(frame, { profile, businessDate:'2026-06-08', knownStaffNames:[], phraseRules:[], providers:[a,b], reviewColumns: review })).rejects.toMatchObject({code:'PRIVACY_CHECK_FAILED'});
  expect(review).not.toHaveBeenCalled();
  expect(state.words).toHaveLength(0);
});
