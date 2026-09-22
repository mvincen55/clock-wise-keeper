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
import { groupWordsIntoLines } from './privacy-detector';

/**
 * One time label on the rail. PMS rails print times several ways — "8:00",
 * "8:00 AM", "8:00am", "8 AM", "8a" — so a label needs minutes or a
 * meridiem; a bare number is never a time.
 */
const TIME_LABEL = /^(\d{1,2})(?::(\d{2}))?\s*(a|p)?(?:\.?m\.?)?$/i;

/**
 * A minute mark between hour labels — ":10", ":20" (or "10", "20" when OCR
 * drops the colon). Read only once the hour labels have anchored the rail.
 */
const MINUTE_MARK = /^[:.]?(\d{2})$/;

/** A label this many minutes off the fitted rail is a misread digit, not a label. */
const RAIL_OUTLIER_MINUTES = 20;

/** Row sizes a rail's minute marks can establish; sparser marks leave the default. */
const ROW_MINUTES = [5, 10, 15];

export interface TimeRail {
  /** Linear map: y pixel → minutes from midnight. */
  minutesAt(y: number): number;
  /** Pixel height of one minute. */
  pxPerMinute: number;
  yTop: number;
  yBottom: number;
  /** Minutes per grid row when the rail's minute marks establish it. */
  rowMinutes?: number;
}

function parseTimeLabel(text: string, dayStartMinutes: number): number | null {
  const m = text.trim().toLowerCase().match(TIME_LABEL);
  if (!m || (m[2] === undefined && m[3] === undefined)) return null;
  let h = Number(m[1]);
  const min = m[2] === undefined ? 0 : Number(m[2]);
  if (h > 23 || min > 59 || (m[3] && (h < 1 || h > 12))) return null;
  if (m[3] === 'p' && h < 12) h += 12;
  if (m[3] === 'a' && h === 12) h = 0;
  let total = h * 60 + min;
  // Schedules often print "1:00" for 1pm with no meridiem — if the value
  // lands before the working day starts, read it as afternoon.
  if (!m[3] && total < dayStartMinutes && total + 720 <= 24 * 60) total += 720;
  return total;
}

/** Least-squares minutes = a·y + b over label midpoints. */
function fitRail(pts: Array<{ y: number; m: number }>): { a: number; b: number } | null {
  const n = pts.length;
  const sumY = pts.reduce((s, p) => s + p.y, 0);
  const sumM = pts.reduce((s, p) => s + p.m, 0);
  const sumYY = pts.reduce((s, p) => s + p.y * p.y, 0);
  const sumYM = pts.reduce((s, p) => s + p.y * p.m, 0);
  const denom = n * sumYY - sumY * sumY;
  if (denom === 0) return null;
  const a = (n * sumYM - sumY * sumM) / denom;
  return { a, b: (sumM - a * sumY) / n };
}

/**
 * Find the time rail: the column of time labels along the left edge.
 * Fits y→minutes from the labels found; needs at least three to trust it.
 *
 * Labels are read per line, so a meridiem the OCR split into its own word
 * ("8:00" + "AM") is rejoined. Minute marks between hour labels (":10",
 * ":20") join the fit once the hours anchor it, and the smallest gap between
 * marks tells the grid's row size. One label clearly off the fitted rail — a
 * misread digit — is dropped rather than allowed to bend the fit.
 */
export function detectTimeRail(
  words: OcrWord[],
  frameWidth: number,
  dayStartMinutes: number
): TimeRail | null {
  const lines = groupWordsIntoLines(words.filter(w => w.bbox.x1 < frameWidth * 0.18)).map(line => ({
    y: line.words.reduce((s, w) => s + (w.bbox.y0 + w.bbox.y1) / 2, 0) / line.words.length,
    text: line.text,
    words: line.words,
  }));
  const anchors = lines
    .map(line => ({
      y: line.y,
      m:
        parseTimeLabel(line.text, dayStartMinutes) ??
        line.words.map(w => parseTimeLabel(w.text, dayStartMinutes)).find(v => v !== null) ??
        null,
    }))
    .filter((p): p is { y: number; m: number } => p.m !== null)
    .sort((a, b) => a.y - b.y);
  if (anchors.length < 3) return null;

  // A minute mark belongs to the nearest hour label above it, and must land
  // before the next label below.
  const marks: Array<{ y: number; m: number }> = [];
  for (const line of lines) {
    const mark = line.text.match(MINUTE_MARK);
    const minute = mark ? Number(mark[1]) : NaN;
    if (!mark || minute >= 60 || minute % 5 !== 0) continue;
    const above = [...anchors].reverse().find(a => a.y < line.y);
    const below = anchors.find(a => a.y > line.y);
    if (!above || (below && above.m + minute >= below.m)) continue;
    marks.push({ y: line.y, m: above.m + minute });
  }
  let pts = [...anchors, ...marks];

  let fit = fitRail(pts);
  while (fit && pts.length > 3) {
    const { a, b } = fit;
    const off = (p: { y: number; m: number }) => Math.abs(a * p.y + b - p.m);
    const worst = pts.reduce((w, p) => (off(p) > off(w) ? p : w));
    if (off(worst) <= RAIL_OUTLIER_MINUTES) break;
    pts = pts.filter(p => p !== worst);
    fit = fitRail(pts);
  }
  if (!fit || fit.a <= 0) return null; // time must increase downward
  const { a, b } = fit;

  // The grid's row size shows in the spacing of surviving minute marks.
  const kept = pts.filter(p => marks.includes(p)).map(p => p.m).sort((x, y) => x - y);
  const gaps = kept.slice(1).map((m, i) => m - kept[i]).filter(g => g > 0);
  const smallest = gaps.length ? Math.min(...gaps) : NaN;
  const rowMinutes = ROW_MINUTES.includes(smallest) ? smallest : undefined;

  const ys = pts.map(p => p.y);
  return {
    minutesAt: (y: number) => a * y + b,
    pxPerMinute: a,
    yTop: Math.min(...ys),
    yBottom: Math.max(...ys),
    ...(rowMinutes ? { rowMinutes } : {}),
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
  let header = words
    .filter(w => w.bbox.y0 < frameHeight * 0.15 && w.bbox.x0 > frameWidth * 0.1)
    .sort((a, b) => a.bbox.x0 - b.bbox.x0);
  if (header.length === 0) return [];

  // Prefer the actual schedule header row over application menus/toolbars.
  const headerRow = groupWordsIntoLines(header).map(line => ({
    words: line.words,
    score: line.words.filter(w => /^(?:(?:DR|DF|HY|HYG|HF)[#:]?\d|notes?$|memo$)/i.test(w.text)).length,
  })).sort((a, b) => b.score - a.score)[0];
  if (headerRow?.score >= 2) header = [...headerRow.words].sort((a, b) => a.bbox.x0 - b.bbox.x0);

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
