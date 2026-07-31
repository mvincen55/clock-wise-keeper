/**
 * Layout detection — matching a captured frame to a saved layout profile.
 *
 * A layout profile is the sanitized output of one-time calibration: relative
 * column positions, expected provider labels, a status-color legend, and the
 * time grid. Here we locate those columns and the time rail in the CURRENT
 * frame. When the match is weak the caller must ask the closer to confirm the
 * column mapping rather than guessing.
 *
 * Everything is geometry over in-memory OCR words. Nothing is stored here.
 */
import type { LayoutColumn, LayoutMatch, LayoutProfile, OcrWord } from './types';
import { ScheduleReaderError } from './types';

const TIME_WORD = /^\d{1,2}:\d{2}\s*(?:am|pm)?$/i;

export interface TimeRail {
  /** Linear map: y pixel → minutes from midnight. */
  minutesAt(y: number): number;
  /** Pixel height of one minute. */
  pxPerMinute: number;
  yTop: number;
  yBottom: number;
}

function parseTimeWord(text: string, dayStartMinutes: number): number | null {
  const m = text.trim().toLowerCase().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  if (m[3] === 'pm' && h < 12) h += 12;
  if (m[3] === 'am' && h === 12) h = 0;
  let total = h * 60 + min;
  // Schedules often print "1:00" for 1pm with no meridiem — if the value
  // lands before the working day starts, read it as afternoon.
  if (!m[3] && total < dayStartMinutes && total + 720 <= 24 * 60) total += 720;
  return total;
}

/**
 * Find the time rail: the column of time labels along the left edge.
 * Fits y→minutes from the labels found; needs at least three to trust it.
 */
export function detectTimeRail(
  words: OcrWord[],
  frameWidth: number,
  dayStartMinutes: number
): TimeRail | null {
  const railWords = words
    .map(w => ({ w, minutes: TIME_WORD.test(w.text) ? parseTimeWord(w.text, dayStartMinutes) : null }))
    .filter(
      (x): x is { w: OcrWord; minutes: number } =>
        x.minutes !== null && x.w.bbox.x1 < frameWidth * 0.18
    );
  if (railWords.length < 3) return null;

  // Least-squares fit minutes = a·y + b over label midpoints.
  const pts = railWords.map(({ w, minutes }) => ({
    y: (w.bbox.y0 + w.bbox.y1) / 2,
    m: minutes,
  }));
  const n = pts.length;
  const sumY = pts.reduce((s, p) => s + p.y, 0);
  const sumM = pts.reduce((s, p) => s + p.m, 0);
  const sumYY = pts.reduce((s, p) => s + p.y * p.y, 0);
  const sumYM = pts.reduce((s, p) => s + p.y * p.m, 0);
  const denom = n * sumYY - sumY * sumY;
  if (denom === 0) return null;
  const a = (n * sumYM - sumY * sumM) / denom;
  const b = (sumM - a * sumY) / n;
  if (a <= 0) return null; // time must increase downward

  const ys = pts.map(p => p.y);
  return {
    minutesAt: (y: number) => a * y + b,
    pxPerMinute: a,
    yTop: Math.min(...ys),
    yBottom: Math.max(...ys),
  };
}

const normalizeLabel = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Locate the profile's columns in this frame.
 *
 * First preference: find each column's provider label among the header-band
 * words (top 20% of the frame). Columns whose labels are found are anchored
 * to the label position; the rest fall back to the profile's relative
 * positions, at reduced confidence.
 */
export function matchLayout(
  words: OcrWord[],
  frameWidth: number,
  frameHeight: number,
  profile: LayoutProfile
): LayoutMatch {
  const columns = profile.signature.columns;
  if (columns.length === 0) {
    throw new ScheduleReaderError('LAYOUT_NOT_RECOGNIZED', { reason: 'profile_has_no_columns' });
  }

  const headerWords = words.filter(w => w.bbox.y0 < frameHeight * 0.2);

  let anchored = 0;
  const frameColumns: LayoutMatch['frameColumns'] = columns.map(col => {
    const fallback = {
      ...col,
      pxStart: col.xStart * frameWidth,
      pxEnd: col.xEnd * frameWidth,
    };
    if (!col.providerLabel) return fallback;

    const target = normalizeLabel(col.providerLabel);
    if (target.length < 2) return fallback;
    const hit = headerWords.find(w => {
      const t = normalizeLabel(w.text);
      return t.length >= 2 && (t.includes(target) || target.includes(t));
    });
    if (!hit) return fallback;

    anchored += 1;
    const width = (col.xEnd - col.xStart) * frameWidth;
    const center = (hit.bbox.x0 + hit.bbox.x1) / 2;
    return { ...col, pxStart: center - width / 2, pxEnd: center + width / 2 };
  });

  const labeled = columns.filter(c => c.providerLabel).length;
  // With no labels to anchor on we can only trust relative geometry: cap low
  // so the closer is always asked to confirm the mapping.
  const confidence = labeled === 0 ? 0.5 : 0.5 + 0.5 * (anchored / labeled);

  return {
    profile,
    confidence,
    frameColumns,
    needsColumnConfirmation: confidence < 0.9,
  };
}

/** Words inside one column's horizontal band (excluding the header). */
export function wordsInColumn(
  words: OcrWord[],
  col: { pxStart: number; pxEnd: number },
  headerBottomPx: number
): OcrWord[] {
  return words.filter(w => {
    const cx = (w.bbox.x0 + w.bbox.x1) / 2;
    return cx >= col.pxStart && cx < col.pxEnd && w.bbox.y0 > headerBottomPx;
  });
}

/** Build a first-pass layout signature from a calibration frame (columns must then be labeled by the office). */
export function draftColumnsFromFrame(
  words: OcrWord[],
  frameWidth: number,
  frameHeight: number
): Array<Pick<LayoutColumn, 'xStart' | 'xEnd'>> {
  // Cluster header-band words by x-center gaps; each cluster is a column head.
  const header = words
    .filter(w => w.bbox.y0 < frameHeight * 0.15 && w.bbox.x0 > frameWidth * 0.1)
    .sort((a, b) => a.bbox.x0 - b.bbox.x0);
  if (header.length === 0) return [];

  const clusters: Array<{ x0: number; x1: number }> = [];
  for (const w of header) {
    const last = clusters[clusters.length - 1];
    if (last && w.bbox.x0 - last.x1 < frameWidth * 0.03) {
      last.x1 = Math.max(last.x1, w.bbox.x1);
    } else {
      clusters.push({ x0: w.bbox.x0, x1: w.bbox.x1 });
    }
  }

  // Column bounds run midway between neighboring cluster edges.
  return clusters.map((c, i) => {
    const prev = clusters[i - 1];
    const next = clusters[i + 1];
    const start = prev ? (prev.x1 + c.x0) / 2 : Math.max(0, c.x0 - frameWidth * 0.02);
    const end = next ? (c.x1 + next.x0) / 2 : Math.min(frameWidth, c.x1 + frameWidth * 0.02);
    return { xStart: start / frameWidth, xEnd: end / frameWidth };
  });
}
