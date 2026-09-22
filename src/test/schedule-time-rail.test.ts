import { describe, expect, it } from 'vitest';
import { detectTimeRail, type TimeRail } from '@/lib/schedule-reader/layout-detector';
import type { OcrWord } from '@/lib/schedule-reader/types';

// The working day should come from the screenshot's own time rail, not from
// a question. These pin the label shapes practice software prints and the
// OCR quirks that used to make the reader give up and ask.

const word = (text: string, y: number, x = 4, width = 30): OcrWord => ({
  text,
  confidence: 90,
  bbox: { x0: x, x1: x + width, y0: y - 6, y1: y + 6 },
});
const at = (rail: TimeRail | null, y: number) => Math.round(rail!.minutesAt(y));

describe('detectTimeRail', () => {
  it('rejoins a meridiem the OCR split into its own word ("8:00" + "AM")', () => {
    const words = [8, 9, 10, 11].flatMap((h, i) => [word(`${h}:00`, 100 + i * 60), word('AM', 100 + i * 60, 36, 18)]);
    const rail = detectTimeRail(words, 1000, 480);
    expect(rail).not.toBeNull();
    expect(at(rail, 100)).toBe(480);
    expect(at(rail, 280)).toBe(660);
    expect(rail!.yTop).toBe(100);
    expect(rail!.yBottom).toBe(280);
  });

  it('reads hour-only labels with a meridiem, across noon', () => {
    const words = [['11 AM', 100], ['12 PM', 160], ['1 PM', 220], ['2p', 280]].map(([t, y]) => word(t as string, y as number));
    const rail = detectTimeRail(words, 1000, 480);
    expect(at(rail, 100)).toBe(660);
    expect(at(rail, 280)).toBe(840);
  });

  it('reads "8:00am" glued together and "1:00" with no meridiem as afternoon', () => {
    const words = [['8:00am', 100], ['9:00am', 160], ['12:00pm', 340], ['1:00', 400]].map(([t, y]) => word(t as string, y as number));
    const rail = detectTimeRail(words, 1000, 480);
    expect(at(rail, 400)).toBe(780);
  });

  it('never treats a bare number as a time label', () => {
    expect(detectTimeRail([word('8', 100), word('9', 160), word('10', 220), word('11', 280)], 1000, 480)).toBeNull();
  });

  it('needs three labels on the left edge — labels elsewhere are appointment text', () => {
    expect(detectTimeRail([word('8:00', 100), word('9:00', 160)], 1000, 480)).toBeNull();
    expect(detectTimeRail([8, 9, 10, 11].map((h, i) => word(`${h}:00`, 100 + i * 60, 600)), 1000, 480)).toBeNull();
  });

  it('drops one misread label instead of letting it bend the rail', () => {
    const words = [8, 9, 10, 11, 12].map((h, i) => word(`${h}:00`, 100 + i * 60));
    words[2] = word('6:00', 220); // "10:00" misread — reads as 6 PM, far off the rail
    const rail = detectTimeRail(words, 1000, 480);
    expect(at(rail, 100)).toBe(480);
    expect(at(rail, 340)).toBe(720);
    expect(at(rail, 220)).toBe(600);
  });

  it('reads a Dentrix rail — "7:00am" on the hour, ":10" marks between — and learns the row size', () => {
    // Hour labels every 78px, six 13px rows per hour, starting at y=48.
    const words: OcrWord[] = [];
    for (let hr = 7; hr <= 18; hr++) {
      const base = 48 + (hr - 7) * 78;
      words.push(word(`${hr > 12 ? hr - 12 : hr}:00${hr >= 12 ? 'pm' : 'am'}`, base, 3, 37));
      for (let k = 1; k < 6; k++) words.push(word(`:${k}0`, base + k * 13, 20, 20));
    }
    const rail = detectTimeRail(words, 1825, 480);
    expect(rail).not.toBeNull();
    expect(rail!.rowMinutes).toBe(10);
    expect(at(rail, 48)).toBe(420);
    expect(at(rail, 48 + 3 * 78 + 2 * 13)).toBe(620); // 10:20
    expect(at(rail, rail!.yBottom)).toBe(1080 + 50); // the last ":50" mark
  });

  it('accepts minute marks without their colon, ignores a misread one, and leaves the row size alone when marks are sparse', () => {
    const hours = [8, 9, 10, 11].map((h, i) => word(`${h}:00`, 100 + i * 60));
    const marks = [15, 30, 45].flatMap(m => [0, 1, 2].map(i => word(String(m), 100 + i * 60 + m, 20, 20)));
    const rail = detectTimeRail([...hours, ...marks, word('16', 100 + 16, 20, 20)], 1000, 480);
    expect(rail!.rowMinutes).toBe(15);
    expect(at(rail, 100 + 60 + 30)).toBe(570);
    // Half-hour marks alone do not establish a row size; the default stands.
    const halves = [30].flatMap(m => [0, 1, 2].map(i => word(`:${m}`, 100 + i * 60 + m, 20, 20)));
    expect(detectTimeRail([...hours, ...halves], 1000, 480)!.rowMinutes).toBeUndefined();
    // Marks need hour labels to hang on; alone they are just numbers.
    expect(detectTimeRail(marks, 1000, 480)).toBeNull();
  });

  it('refuses a rail whose time runs upward', () => {
    expect(detectTimeRail([word('11:00', 100), word('10:00', 160), word('9:00', 220)], 1000, 480)).toBeNull();
  });
});
