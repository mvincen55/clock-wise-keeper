/**
 * Schedule Reader pipeline orchestrator.
 *
 * One entry point: processScheduleFrame(). Order matters and is load-bearing:
 *
 *   1. OCR (local tesseract worker — the heavy lifting runs in a real Web
 *      Worker off the UI thread; assets are same-origin, no CDN fallback)
 *   2. PRIVACY CHECK — before any schedule analysis. If likely
 *      patient-identifying content is found, processing STOPS, the frame is
 *      destroyed, nothing is saved. There is no redact-and-continue path.
 *   3. Layout match against the office's saved profile
 *   4. Status sampling + note classification (codes only)
 *   5. Metrics build, then the deterministic Metrics Referee
 *
 * On every exit path — success, privacy failure, low confidence, error — the
 * OCR word arrays are wiped before returning. The caller destroys the frame.
 * Nothing in this module performs network I/O.
 */
import { recognizeFrame } from './ocr';
import { buildKnownNames, checkPrivacy, groupWordsIntoLines } from './privacy-detector';
import { detectTimeRail, matchLayout, wordsInColumn, type TimeRail } from './layout-detector';
import { classifyNote } from './note-classifier';
import {
  buildProviderMetrics,
  reduceRow,
  sampleColumnStatuses,
  type RowStatus,
} from './metrics-builder';
import { computeRollup, refereeMetrics } from './metrics-referee';
import { wipeOcrWords } from './destroy-capture';
import {
  ScheduleReaderError,
  type CaptureFrame,
  type ClassifiedBlock,
  type LayoutProfile,
  type OcrWord,
  type PhraseRule,
  type ScheduleAnalysis,
} from './types';

export interface ProcessOptions {
  profile: LayoutProfile;
  businessDate: string;
  /** Employee/provider names allowed on screen (needed for column mapping). */
  knownStaffNames: string[];
  phraseRules: PhraseRule[];
  /** Support staff on site per provider label (from attendance), if known. */
  supportStaffByProvider?: Record<string, number>;
}

/** Grid rows for the day from the profile's time grid + the detected rail. */
function gridRows(
  rail: TimeRail | null,
  frameHeight: number,
  profile: LayoutProfile
): Array<{ yTop: number; yBottom: number; minutes: number }> {
  const grid = profile.signature.timeGrid;
  const mpr = grid.minutesPerRow;
  const dayMinutes = grid.dayEndMinutes - grid.dayStartMinutes;
  const rowCount = Math.max(0, Math.floor(dayMinutes / mpr));

  if (rail) {
    const yFor = (minutes: number) => {
      // Invert minutesAt via the fitted slope.
      const y0 = rail.yTop + (minutes - rail.minutesAt(rail.yTop)) / rail.pxPerMinute;
      return y0;
    };
    return Array.from({ length: rowCount }, (_, i) => {
      const start = grid.dayStartMinutes + i * mpr;
      return { yTop: yFor(start), yBottom: yFor(start + mpr), minutes: mpr };
    });
  }

  // No rail found — fall back to the profile's relative band.
  const yStart = grid.yStart * frameHeight;
  const yEnd = grid.yEnd * frameHeight;
  const pxPerRow = rowCount === 0 ? 0 : (yEnd - yStart) / rowCount;
  return Array.from({ length: rowCount }, (_, i) => ({
    yTop: yStart + i * pxPerRow,
    yBottom: yStart + (i + 1) * pxPerRow,
    minutes: mpr,
  }));
}

/** Classify visible notes in a column and size them against blocked runs. */
function classifyColumnNotes(
  colWords: OcrWord[],
  rows: Array<{ yTop: number; yBottom: number }>,
  rowStatuses: RowStatus[],
  minutesPerRow: number,
  phraseRules: PhraseRule[],
  providerLabel: string | null,
  department: ClassifiedBlock['department']
): ClassifiedBlock[] {
  const blocks: ClassifiedBlock[] = [];
  const lines = groupWordsIntoLines(colWords);

  for (const line of lines) {
    const { code, confidence } = classifyNote(line.text);
    const ruleHit = classifyNote(line.text, phraseRules);
    const finalCode = ruleHit.code !== 'UNCLASSIFIED' ? ruleHit.code : code;
    const finalConfidence = ruleHit.code !== 'UNCLASSIFIED' ? ruleHit.confidence : confidence;
    if (finalCode === 'UNCLASSIFIED') continue;

    // Attribute the note to the blocked run containing its midpoint; the run's
    // span is the block's minutes. A note outside any blocked run covers at
    // least one row.
    const midY =
      line.words.length === 0
        ? 0
        : line.words.reduce((s, w) => s + (w.bbox.y0 + w.bbox.y1) / 2, 0) / line.words.length;
    const rowIndex = rows.findIndex(r => midY >= r.yTop && midY < r.yBottom);

    let minutes = minutesPerRow;
    if (rowIndex >= 0 && rowStatuses[rowIndex] === 'blocked') {
      let start = rowIndex;
      while (start > 0 && rowStatuses[start - 1] === 'blocked') start -= 1;
      let end = rowIndex;
      while (end < rowStatuses.length - 1 && rowStatuses[end + 1] === 'blocked') end += 1;
      minutes = (end - start + 1) * minutesPerRow;
    }

    blocks.push({
      code: finalCode,
      minutes,
      providerLabel,
      department,
      confidence: finalConfidence,
      userConfirmed: false,
    });
  }
  return blocks;
}

/**
 * Process one captured frame into a validated ScheduleAnalysis.
 * Throws ScheduleReaderError with a code — never with screenshot content.
 */
export async function processScheduleFrame(
  frame: CaptureFrame,
  options: ProcessOptions
): Promise<ScheduleAnalysis> {
  const { words, confidence: ocrConfidence } = await recognizeFrame(frame.canvas);

  try {
    // Privacy gate FIRST. Failing it stops everything.
    const privacy = checkPrivacy(words, buildKnownNames(options.knownStaffNames));
    if (!privacy.passed) {
      throw new ScheduleReaderError('PRIVACY_CHECK_FAILED', {
        violationKinds: privacy.violations.length,
      });
    }

    const match = matchLayout(words, frame.width, frame.height, options.profile);
    if (match.confidence < 0.5) {
      throw new ScheduleReaderError('LAYOUT_NOT_RECOGNIZED', {
        confidence: match.confidence,
      });
    }

    const grid = options.profile.signature.timeGrid;
    const rail = detectTimeRail(words, frame.width, grid.dayStartMinutes);
    const rows = gridRows(rail, frame.height, options.profile);
    if (rows.length === 0) {
      throw new ScheduleReaderError('LAYOUT_NOT_RECOGNIZED', { reason: 'empty_time_grid' });
    }

    const ctx = frame.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new ScheduleReaderError('OCR_FAILED', { reason: 'no_canvas_context' });

    const headerBottomPx = rows[0].yTop;
    const providerColumns = match.frameColumns.filter(c => c.kind !== 'non_clinical');

    // Group columns by provider label (overflow columns share the label).
    const byProvider = new Map<string, typeof providerColumns>();
    for (const col of providerColumns) {
      const key = col.providerLabel ?? `column-${Math.round(col.pxStart)}`;
      const list = byProvider.get(key) ?? [];
      list.push(col);
      byProvider.set(key, list);
    }

    const allBlocks: ClassifiedBlock[] = [];
    const providerRows: Record<string, Array<ReturnType<typeof reduceRow>>> = {};
    const providers = [...byProvider.entries()].map(([label, cols]) => {
      const perColumnStatuses = cols.map(col =>
        sampleColumnStatuses(ctx, col, rows, options.profile.statusLegend)
      );
      const reduced = rows.map((_, i) => reduceRow(perColumnStatuses.map(s => s[i])));
      providerRows[label] = reduced;

      const blocks = cols.flatMap((col, c) =>
        classifyColumnNotes(
          wordsInColumn(words, col, headerBottomPx),
          rows,
          perColumnStatuses[c],
          grid.minutesPerRow,
          options.phraseRules,
          col.providerLabel,
          col.department
        )
      );
      allBlocks.push(...blocks);

      return buildProviderMetrics({
        providerLabel: label,
        providerRole: cols[0].providerRole ?? 'other',
        department: cols[0].department ?? 'other',
        employeeId: cols[0].employeeId,
        businessDate: options.businessDate,
        rows: reduced,
        minutesPerRow: grid.minutesPerRow,
        activeColumns: cols.length,
        blocks,
        supportStaffAssigned: options.supportStaffByProvider?.[label] ?? null,
        ocrConfidence,
        layoutConfidence: match.confidence,
      });
    });

    const rollup = computeRollup(providers);
    const verdict = refereeMetrics({ providers, blocks: allBlocks, rollup });
    if (verdict.ok === false) {
      throw new ScheduleReaderError('METRIC_VALIDATION_FAILED', {
        errorCount: verdict.errors.length,
        firstError: verdict.errors[0]?.code ?? 'unknown',
      });
    }

    return {
      businessDate: options.businessDate,
      layoutConfidence: match.confidence,
      privacy,
      providers,
      blocks: allBlocks,
      rollup,
      providerRows,
      minutesPerRow: grid.minutesPerRow,
      needsReview:
        match.needsColumnConfirmation || providers.some(p => p.reviewStatus === 'needs_review'),
    };
  } finally {
    // Raw OCR text dies here on every path. Only structured metrics leave.
    wipeOcrWords(words);
  }
}
