import { describe, expect, it } from 'vitest';
import { detectTimeRail } from '@/lib/schedule-reader/layout-detector';
import { RAIL_TOKEN, railCropBounds } from '@/lib/schedule-reader/ocr';
import { isNotesOnlyColumn } from '@/lib/schedule-reader/appointment-regions';
import type { OcrWord } from '@/lib/schedule-reader/types';

// What the engine actually returns for a real Dentrix capture (1825×939):
// the full-page read of the left edge, and the rail strip read at 3x as
// sparse text (coordinates mapped back to the frame). Hour labels at 1x come
// back as "oem", "EE", "Zit"; at 3x, most hours and every minute mark read.
// These fixtures are the engine's own words, not hand-written ones.

type Tuple = [string, number, number, number, number, number];
const word = ([text, x0, x1, y0, y1, confidence]: Tuple): OcrWord => ({ text, confidence, bbox: { x0, x1, y0, y1 } });

const FULL_PAGE_LEFT: Tuple[] = [
  ["Note", 47.0, 69.0, 6.0, 15.0, 82],
  ["EI", 7.0, 31.0, 18.0, 33.0, 42],
  ["on", 231.0, 309.0, 22.0, 41.0, 28],
  ["7:00am]", 4.0, 38.0, 36.0, 60.0, 56],
  ["10", 21.0, 32.0, 57.0, 66.0, 95],
  ["20", 21.0, 32.0, 70.0, 79.0, 93],
  ["\u201c0", 21.0, 32.0, 96.0, 105.0, 1],
  ["=]", 21.0, 32.0, 109.0, 118.0, 37],
  ["10", 21.0, 32.0, 135.0, 144.0, 72],
  ["2", 21.0, 32.0, 148.0, 157.0, 68],
  ["\u201c0", 21.0, 32.0, 174.0, 183.0, 1],
  ["50", 21.0, 32.0, 187.0, 196.0, 81],
  ["10", 21.0, 32.0, 213.0, 222.0, 90],
  ["2", 21.0, 32.0, 226.0, 235.0, 85],
  ["0", 21.0, 32.0, 252.0, 261.0, 45],
  ["50", 21.0, 32.0, 265.0, 274.0, 81],
  ["oem", 4.0, 38.0, 278.0, 287.0, 34],
  ["MR]", 86.0, 112.0, 276.0, 277.0, 8],
  ["10", 21.0, 32.0, 291.0, 300.0, 90],
  ["2", 21.0, 32.0, 304.0, 313.0, 85],
  ["0", 21.0, 32.0, 330.0, 339.0, 45],
  ["50", 21.0, 32.0, 343.0, 352.0, 81],
  ["EE", 4.0, 130.0, 354.0, 367.0, 22],
  ["10", 21.0, 32.0, 369.0, 378.0, 90],
  ["2", 21.0, 32.0, 382.0, 391.0, 85],
  ["0", 21.0, 32.0, 408.0, 417.0, 45],
  ["50", 21.0, 32.0, 421.0, 430.0, 84],
  ["Zi", 4.0, 38.0, 434.0, 445.0, 40],
  ["10", 21.0, 32.0, 447.0, 456.0, 82],
  ["x", 21.0, 32.0, 460.0, 469.0, 61],
  ["40", 21.0, 32.0, 486.0, 495.0, 95],
  ["50", 21.0, 32.0, 499.0, 508.0, 84],
  ["Ul", 100.0, 112.0, 493.0, 518.0, 20],
  [":00pm|", 4.0, 38.0, 512.0, 523.0, 52],
  ["10", 21.0, 32.0, 525.0, 534.0, 90],
  ["2", 21.0, 32.0, 538.0, 547.0, 85],
  ["0", 21.0, 32.0, 564.0, 573.0, 45],
  ["50", 21.0, 32.0, 577.0, 586.0, 84],
  ["i", 86.0, 94.0, 588.0, 589.0, 14],
  ["Zit", 4.0, 38.0, 590.0, 601.0, 43],
  ["10", 21.0, 32.0, 603.0, 612.0, 90],
  ["2", 21.0, 32.0, 616.0, 625.0, 85],
  ["0", 21.0, 32.0, 642.0, 651.0, 45],
  ["50", 21.0, 32.0, 655.0, 664.0, 84],
  ["sop", 5.0, 38.0, 668.0, 679.0, 3],
  ["|", 86.0, 130.0, 666.0, 667.0, 7],
  ["10", 21.0, 32.0, 681.0, 690.0, 90],
  ["2", 21.0, 32.0, 694.0, 703.0, 85],
  ["20", 22.0, 32.0, 707.0, 716.0, 32],
  ["0", 21.0, 32.0, 720.0, 729.0, 45],
  ["50", 21.0, 32.0, 733.0, 742.0, 84],
  ["orl", 4.0, 38.0, 746.0, 757.0, 32],
  ["10", 21.0, 32.0, 759.0, 768.0, 90],
  ["2", 21.0, 32.0, 772.0, 781.0, 85],
  ["40", 21.0, 32.0, 798.0, 807.0, 90],
  ["50", 21.0, 32.0, 811.0, 820.0, 84],
  ["Sit", 4.0, 38.0, 824.0, 835.0, 65],
  ["10", 21.0, 32.0, 837.0, 846.0, 90],
  ["2", 21.0, 32.0, 850.0, 859.0, 68],
  ["40", 21.0, 32.0, 876.0, 885.0, 95],
  ["50", 21.0, 32.0, 889.0, 898.0, 95],
  ["10", 21.0, 32.0, 915.0, 924.0, 90],
  ["20", 21.0, 32.0, 928.0, 937.0, 70],
];

const RAIL_3X_AS_READ: Tuple[] = [
  ["[Note", 43.0, 71.0, 3.0, 19.0, 85],
  ["[HET", 42.0, 85.0, 22.0, 43.0, 33],
  ["[TT", 103.0, 128.0, 22.0, 43.0, 0],
  ["00am", 4.0, 38.0, 44.0, 53.0, 23],
  ["10", 21.0, 32.0, 57.0, 66.0, 95],
  ["20", 21.0, 32.0, 70.0, 79.0, 95],
  ["a0", 21.0, 32.0, 83.0, 92.0, 84],
  ["40", 21.0, 32.0, 96.0, 105.0, 96],
  ["50", 21.0, 32.0, 109.0, 118.0, 93],
  ["3:00am", 4.0, 38.0, 122.0, 131.0, 50],
  ["10", 21.0, 32.0, 135.0, 144.0, 95],
  ["20", 21.0, 32.0, 148.0, 157.0, 95],
  ["a0", 21.0, 32.0, 161.0, 170.0, 84],
  ["40", 21.0, 32.0, 174.0, 183.0, 96],
  ["50", 21.0, 32.0, 187.0, 196.0, 93],
  ["9:00am", 4.0, 38.0, 200.0, 209.0, 55],
  ["10", 21.0, 32.0, 213.0, 222.0, 95],
  ["20", 21.0, 32.0, 226.0, 235.0, 95],
  ["a0", 21.0, 32.0, 239.0, 248.0, 84],
  ["40", 21.0, 32.0, 252.0, 261.0, 96],
  ["50", 21.0, 32.0, 265.0, 274.0, 93],
  ["=", 86.0, 94.0, 276.0, 277.0, 66],
  ["=", 104.0, 112.0, 276.0, 277.0, 74],
  ["|", 0.0, 1.0, 278.0, 287.0, 71],
  ["0:00am", 4.0, 38.0, 278.0, 287.0, 23],
  ["10", 21.0, 32.0, 291.0, 300.0, 95],
  ["20", 21.0, 32.0, 304.0, 313.0, 95],
  ["a0", 21.0, 32.0, 317.0, 326.0, 84],
  ["40", 21.0, 32.0, 330.0, 339.0, 96],
  ["50", 21.0, 32.0, 343.0, 352.0, 93],
  ["[1:00am", 0.0, 38.0, 356.0, 365.0, 35],
  ["EE", 86.0, 128.0, 354.0, 367.0, 54],
  ["10", 21.0, 32.0, 369.0, 378.0, 95],
  ["20", 21.0, 32.0, 382.0, 391.0, 95],
  ["a0", 21.0, 32.0, 395.0, 404.0, 84],
  ["40", 21.0, 32.0, 408.0, 417.0, 96],
  ["50", 21.0, 32.0, 421.0, 430.0, 93],
  ["|", 0.0, 1.0, 434.0, 443.0, 72],
  ["2:00pm", 13.0, 38.0, 434.0, 445.0, 69],
  ["10", 21.0, 32.0, 447.0, 456.0, 95],
  ["a0", 21.0, 32.0, 473.0, 482.0, 84],
  ["40", 21.0, 32.0, 486.0, 495.0, 96],
  ["50", 21.0, 32.0, 499.0, 508.0, 93],
  ["a", 86.0, 94.0, 510.0, 511.0, 4],
  ["-", 105.3, 112.0, 510.0, 511.0, 19],
  ["1:00pm", 4.0, 38.0, 512.0, 523.0, 91],
  ["10", 21.0, 32.0, 525.0, 534.0, 95],
  ["20", 21.0, 32.0, 538.0, 547.0, 95],
  ["a0", 21.0, 32.0, 551.0, 560.0, 84],
  ["40", 21.0, 32.0, 564.0, 573.0, 96],
  ["50", 21.0, 32.0, 577.0, 586.0, 93],
  ["2:00pm", 4.0, 38.0, 590.0, 601.0, 68],
  ["10", 21.0, 32.0, 603.0, 612.0, 95],
  ["20", 21.0, 32.0, 616.0, 625.0, 95],
  ["a0", 21.0, 32.0, 629.0, 638.0, 84],
  ["40", 21.0, 32.0, 642.0, 651.0, 96],
  ["50", 21.0, 32.0, 655.0, 664.0, 93],
  ["3:00pm", 4.0, 38.0, 668.0, 679.0, 33],
  ["10", 21.0, 32.0, 681.0, 690.0, 95],
  ["20", 21.0, 32.0, 694.0, 703.0, 95],
  ["a0", 21.0, 32.0, 707.0, 716.0, 84],
  ["40", 21.0, 32.0, 720.0, 729.0, 96],
  ["50", 21.0, 32.0, 733.0, 742.0, 93],
  ["4:00pm", 4.0, 38.0, 746.0, 757.0, 91],
  ["10", 21.0, 32.0, 759.0, 768.0, 95],
  ["20", 21.0, 32.0, 772.0, 781.0, 95],
  ["a0", 21.0, 32.0, 785.0, 794.0, 84],
  ["40", 21.0, 32.0, 798.0, 807.0, 96],
  ["50", 21.0, 32.0, 811.0, 820.0, 93],
  ["5:00pm", 4.0, 38.0, 824.0, 835.0, 75],
  ["10", 21.0, 32.0, 837.0, 846.0, 95],
  ["20", 21.0, 32.0, 850.0, 859.0, 95],
  ["a0", 21.0, 32.0, 863.0, 872.0, 84],
  ["40", 21.0, 32.0, 876.0, 885.0, 96],
  ["50", 21.0, 32.0, 889.0, 898.0, 93],
  ["6:00pm", 4.0, 38.0, 902.0, 913.0, 52],
  ["10", 21.0, 32.0, 915.0, 924.0, 95],
  ["20", 21.0, 32.0, 928.0, 937.0, 93],
];

const FRAME_WIDTH = 1825;

describe('the Dentrix rail as the engine reads it', () => {
  it('is invisible to the full-page read alone', () => {
    expect(detectTimeRail(FULL_PAGE_LEFT.map(word), FRAME_WIDTH, 480)).toBeNull();
  });

  it('is read from the 3x rail pass: hours, minute marks, and the row size', () => {
    const kept = RAIL_3X_AS_READ.filter(t => RAIL_TOKEN.test(t[0]));
    expect(kept.length).toBeGreaterThan(40);
    const rail = detectTimeRail([...FULL_PAGE_LEFT.map(word), ...kept.map(word)], FRAME_WIDTH, 480);
    expect(rail).not.toBeNull();
    // 7:00am sits at y≈48, each hour is 78px, each 10-minute row 13px.
    expect(Math.round(rail!.minutesAt(48))).toBeGreaterThanOrEqual(415);
    expect(Math.round(rail!.minutesAt(48))).toBeLessThanOrEqual(425);
    expect(Math.round(rail!.minutesAt(48 + 3 * 78))).toBeGreaterThanOrEqual(595); // 10:00am
    expect(Math.round(rail!.minutesAt(48 + 3 * 78))).toBeLessThanOrEqual(605);
    expect(Math.round(rail!.minutesAt(48 + 10 * 78 + 2 * 13))).toBeGreaterThanOrEqual(1035); // 5:20pm
    expect(Math.round(rail!.minutesAt(48 + 10 * 78 + 2 * 13))).toBeLessThanOrEqual(1045);
    expect(rail!.rowMinutes).toBe(10);
    // The visible day: from the 7:00am label to the last ":20" mark after 6:00pm.
    expect(Math.round(rail!.minutesAt(rail!.yTop) / 5) * 5).toBeLessThanOrEqual(430);
    expect(Math.round(rail!.minutesAt(rail!.yBottom) / 5) * 5).toBeGreaterThanOrEqual(1095);
  });
});

describe('railCropBounds', () => {
  it('reads up to the first appointment box, capped at an eighth of the frame', () => {
    expect(railCropBounds(1825, 939, [{ x0: 130, y0: 100, x1: 370, y1: 200 }])).toEqual({ x0: 0, y0: 0, x1: 128, y1: 939 });
    expect(railCropBounds(1825, 939, [])).toEqual({ x0: 0, y0: 0, x1: 228, y1: 939 });
    expect(railCropBounds(100, 939, [{ x0: 10, y0: 0, x1: 50, y1: 20 }])).toBeNull();
  });
  it('keeps only time-shaped tokens from the rail pass', () => {
    for (const t of ['7:00am', '7:00am]', '[1:00am', '2:00pm', '10', ':10', '.30', '8 AM', '8am', '12:30']) expect(RAIL_TOKEN.test(t), t).toBe(true);
    for (const t of ['[Note', 'EE', 'a0', 'Lunch', 'HY14', '0104', 'DR02', '1', '123']) expect(RAIL_TOKEN.test(t), t).toBe(false);
  });
});

describe('isNotesOnlyColumn', () => {
  const box = (x0: number, x1: number, y0: number) => ({ x0, x1, y0, y1: y0 + 20 });
  const say = (text: string, x0: number, y0: number, confidence = 90): OcrWord => ({ text, confidence, bbox: { x0, x1: x0 + 30, y0: y0 + 4, y1: y0 + 14 } });
  const width = 400;
  const left = { xStart: 0, xEnd: 0.5 }, right = { xStart: 0.5, xEnd: 1 };
  it('needs no click for a notes column when codes are visible on the grid, but keeps holds and coded chairs', () => {
    const regions = [box(0, 190, 0), box(0, 190, 40), box(210, 400, 0)];
    const words = [say('NO', 5, 0), say('MORE', 40, 0), say('CROWNS', 80, 0), say('Moved', 5, 40), say('down', 40, 40), say('ProphyAd', 215, 0), say('HY14', 260, 0)];
    expect(isNotesOnlyColumn(words, regions, left, width)).toBe(true);
    expect(isNotesOnlyColumn(words, regions, right, width)).toBe(false);
    expect(isNotesOnlyColumn([...words, say('HOLD', 120, 40)], regions, left, width)).toBe(false);
    expect(isNotesOnlyColumn([...words, say('Early', 100, 40), say('arrival', 140, 40)], regions, left, width)).toBe(false);
  });
  it('falls back to positive note wording when no code is visible anywhere', () => {
    const regions = [box(0, 190, 0)];
    expect(isNotesOnlyColumn([say('NO', 5, 0), say('MORE', 40, 0), say('CROWNS', 80, 0)], regions, left, width)).toBe(false);
    expect(isNotesOnlyColumn([say('HCU', 5, 0), say('SENT', 40, 0)], regions, left, width)).toBe(true);
    expect(isNotesOnlyColumn([], regions, left, width)).toBe(false);
  });
});
