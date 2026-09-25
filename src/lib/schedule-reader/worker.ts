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
import { suggestDailyColumns, type ScheduleProvider } from './provider-mapping';

import type { LayoutColumn } from './types';
import { applyProviderHours, applyProviderWideBlocks, type PlacedBlock, refineProviderAway } from './provider-hours';
import { postedColumnStatuses } from './posted-statuses';
import { applyCompletedEvidence } from './completed-evidence';
import { isEmptyBlueGridColumn, openSlotKind } from './appointment-regions';
import { applySideEvents, inkArrowHint, readSideEvents } from './side-events';
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
  type OcrBox,
  OcrWord,
  type PhraseRule,
  type ScheduleAnalysis,
} from './types';

export interface ProcessOptions {
  providers?: ScheduleProvider[];
  /** Explicit per-capture review; assignments never change the saved layout. */
  reviewColumns?: (suggested: LayoutColumn[]) => Promise<LayoutColumn[] | null>;
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

/**
 * Classify visible notes in a column and size them against blocked runs.
 * Each block comes back with the rows it was attributed to, so a
 * provider-wide block can be applied to the provider's other columns.
 */
function classifyColumnNotes(
  colWords: OcrWord[],
  rows: Array<{ yTop: number; yBottom: number }>,
  rowStatuses: RowStatus[],
  minutesPerRow: number,
  phraseRules: PhraseRule[],
  providerLabel: string | null,
  department: ClassifiedBlock['department'],
  regions: OcrBox[] = []
): PlacedBlock[] {
  const blocks: PlacedBlock[] = [];
  const lines = groupWordsIntoLines(colWords);

  for (const line of lines) {
    const { code, confidence } = classifyNote(line.text);
    const ruleHit = classifyNote(line.text, phraseRules);
    const finalCode = ruleHit.code !== 'UNCLASSIFIED' ? ruleHit.code : code;
    const finalConfidence = ruleHit.code !== 'UNCLASSIFIED' ? ruleHit.confidence : confidence;
    if (finalCode === 'UNCLASSIFIED') continue;

    // A note printed in its own box is as long as the box: the rows the box
    // covers by more than half. A note outside any box is attributed to the
    // blocked run containing its midpoint, and covers at least one row.
    const midY =
      line.words.length === 0
        ? 0
        : line.words.reduce((s, w) => s + (w.bbox.y0 + w.bbox.y1) / 2, 0) / line.words.length;
    const midX =
      line.words.length === 0
        ? 0
        : line.words.reduce((s, w) => s + (w.bbox.x0 + w.bbox.x1) / 2, 0) / line.words.length;
    const rowIndex = rows.findIndex(r => midY >= r.yTop && midY < r.yBottom);
    const box = regions.find(b => midX >= b.x0 && midX < b.x1 && midY >= b.y0 && midY < b.y1);

    let minutes = minutesPerRow;
    let rowStart = rowIndex;
    let rowEnd = rowIndex;
    const covered = box
      ? rows.map((r, i) => ({ i, share: (Math.min(r.yBottom, box.y1) - Math.max(r.yTop, box.y0)) / (r.yBottom - r.yTop) })).filter(x => x.share >= 0.5).map(x => x.i)
      : [];
    if (covered.length) {
      rowStart = covered[0];
      rowEnd = covered[covered.length - 1];
      minutes = covered.length * minutesPerRow;
    } else if (rowIndex >= 0 && rowStatuses[rowIndex] === 'blocked') {
      while (rowStart > 0 && rowStatuses[rowStart - 1] === 'blocked') rowStart -= 1;
      while (rowEnd < rowStatuses.length - 1 && rowStatuses[rowEnd + 1] === 'blocked') rowEnd += 1;
      minutes = (rowEnd - rowStart + 1) * minutesPerRow;
    }

    blocks.push({
      block: {
        code: finalCode,
        minutes,
        providerLabel,
        department,
        confidence: finalConfidence,
        userConfirmed: false,
      },
      rowStart,
      rowEnd,
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
  const { words, regions = [], railWords = [], confidence: ocrConfidence } = await recognizeFrame(frame.canvas);

  try {
    // Privacy gate FIRST. Failing it stops everything.
    const privacy = checkPrivacy(words, buildKnownNames(options.knownStaffNames), regions);
    if (!privacy.passed) {
      // Kinds and counts only, so the refusal can say what it looked like.
      // The matched text never leaves the detector.
      throw new ScheduleReaderError('PRIVACY_CHECK_FAILED', {
        violationKinds: privacy.violations.length,
        kinds: privacy.violations.map(v => `${v.kind}:${v.count}`).join(','),
      });
    }

    let match = matchLayout(words, frame.width, frame.height, options.profile);
    if (options.reviewColumns) {
      const pixels=frame.canvas.getContext('2d')?.getImageData?.(0,0,frame.width,frame.height);
      const suggested = suggestDailyColumns(words, options.profile.signature.columns, frame.width, frame.height, options.providers ?? [], regions).filter(c=>!pixels || !isEmptyBlueGridColumn(pixels,c));
      const columns = await options.reviewColumns(suggested);
      if (!columns) throw new ScheduleReaderError('PROCESSING_CANCELLED');
      if (!columns.some(c => c.kind !== 'non_clinical') || columns.some(c => c.kind !== 'non_clinical' && !c.providerId)) {
        throw new ScheduleReaderError('LAYOUT_NOT_RECOGNIZED');
      }
      match = { profile: options.profile, confidence: 1, needsColumnConfirmation: false,
        frameColumns: columns.map(c => ({ ...c, pxStart: c.xStart * frame.width, pxEnd: c.xEnd * frame.width })) };
    }
    if (match.confidence < 0.5) {
      throw new ScheduleReaderError('LAYOUT_NOT_RECOGNIZED', {
        confidence: match.confidence,
      });
    }

    const grid = options.profile.signature.timeGrid;
    const rail = detectTimeRail([...words, ...railWords], frame.width, grid.dayStartMinutes);
    const rows = gridRows(rail, frame.height, options.profile);
    if (rows.length === 0) {
      throw new ScheduleReaderError('LAYOUT_NOT_RECOGNIZED', { reason: 'empty_time_grid' });
    }

    const ctx = frame.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new ScheduleReaderError('OCR_FAILED', { reason: 'no_canvas_context' });

    const postedImage = options.profile.signature.captureMode === 'posted' ? ctx.getImageData(0, 0, frame.width, frame.height) : null;
    const headerBottomPx = rows[0].yTop;
    const providerColumns = match.frameColumns.filter(c => c.kind !== 'non_clinical');
    // Blank blue grid is not patient time: only the pale slot the software
    // paints inside a provider's hours is open. That is how Dentrix's privacy
    // view paints every day, whether or not this one has an open slot to
    // show it, and how any grid that paints a pale slot reads. Blue is then
    // closed time — before the first patient, at lunch, after the last — and
    // the grid itself is the office's record of the day's hours, so saved
    // hours are not applied over it.
    const slotKind = (col: { xStart: number; xEnd: number }, i: number) => postedImage ? openSlotKind(postedImage, col, rows[i].yTop / frame.height, rows[i].yBottom / frame.height) : null;
    const blankGridIsClosed = !!postedImage && (/dentrix/i.test(options.profile.pmsName ?? '') || providerColumns.some(col => rows.some((_, i) => slotKind(col, i) === 'tint')));
    // The notes columns beside the chairs log each cancellation and no-show.
    const sideEvents = readSideEvents(words, match.frameColumns, rows, headerBottomPx,
      inkArrowHint(regions, box => ctx.getImageData?.(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0) ?? null), regions);
    const eventsFromNotes = match.frameColumns.some(c => c.kind === 'non_clinical');

    // Group columns by provider label (overflow columns share the label).
    const byProvider = new Map<string, typeof providerColumns>();
    for (const col of providerColumns) {
      const key = col.providerLabel ?? `column-${Math.round(col.pxStart)}`;
      const list = byProvider.get(key) ?? [];
      list.push(col);
      byProvider.set(key, list);
    }

    const allBlocks: ClassifiedBlock[] = [];
    const availabilityConflicts: string[] = [];
    const providerRows: Record<string, Array<ReturnType<typeof reduceRow>>> = {};
    const providers = [...byProvider.entries()].map(([label, cols]) => {
      const perColumn = cols.map(col => applySideEvents(
        postedImage ? postedColumnStatuses(postedImage, col, rows, regions, words, options.phraseRules, blankGridIsClosed) : applyCompletedEvidence(sampleColumnStatuses(ctx, col, rows, options.profile.statusLegend), rows, regions, words, col, options.phraseRules),
        sideEvents, col, rows, regions,
      ));
      const perColumnStatuses = perColumn.map(o => o.statuses);
      const sideTotals = perColumn.reduce(
        (a, o) => ({ cancellations: a.cancellations + o.counts.cancelled, noShows: a.noShows + o.counts.no_show, recoveredRows: a.recoveredRows + o.recoveredRows }),
        { cancellations: 0, noShows: 0, recoveredRows: 0 },
      );
      const placed = cols.flatMap((col, c) =>
        classifyColumnNotes(
          wordsInColumn(words, col, headerBottomPx),
          rows,
          perColumnStatuses[c],
          grid.minutesPerRow,
          options.phraseRules,
          col.providerLabel,
          col.department,
          regions
        )
      );
      const blocks = placed.map(p => p.block);

      // Reduce the provider's chairs to one row per slot; a provider-wide
      // block read in any chair (off, lunch, meeting) then covers that span
      // in every chair, and the saved working hours block off-duty time.
      const reducedRows = rows.map((_, i) => reduceRow(perColumnStatuses.map(s => s[i])));
      refineProviderAway(placed, reducedRows);
      const withWideBlocks = applyProviderWideBlocks(reducedRows, placed);
      const availability = blankGridIsClosed
        ? {
            rows: withWideBlocks,
            // Closed on the grid in every chair, with nothing drawn there: the provider's off-duty time as the office set it.
            offDutyMinutes: withWideBlocks.filter((row, i) => row.category === 'blocked' && cols.every(col => slotKind(col, i) === 'blue')).length * grid.minutesPerRow,
            conflict: false,
          }
        : applyProviderHours(withWideBlocks, cols[0].workingHours, options.businessDate, grid.dayStartMinutes, grid.minutesPerRow);
      const reduced = availability.rows;
      providerRows[label] = reduced;

      if (availability.offDutyMinutes > 0) blocks.push({
        code: 'PROVIDER_OFF', minutes: availability.offDutyMinutes,
        providerLabel: label, department: cols[0].department,
        confidence: 1, userConfirmed: true,
        ...(blankGridIsClosed ? { source: 'grid' as const } : {}),
      });
      allBlocks.push(...blocks);

      const metrics = buildProviderMetrics({
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
        dayStartMinutes: grid.dayStartMinutes,
        sideEvents: eventsFromNotes ? { cancellations: sideTotals.cancellations, noShows: sideTotals.noShows, recoveredMinutes: sideTotals.recoveredRows * grid.minutesPerRow } : undefined,
      });
      if (availability.conflict) availabilityConflicts.push(label);
      return availability.conflict ? { ...metrics, reviewStatus: 'needs_review' as const } : metrics;
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
      availabilityConflicts,
      businessDate: options.businessDate,
      layoutConfidence: match.confidence,
      privacy,
      providers,
      blocks: allBlocks,
      rollup,
      providerRows,
      minutesPerRow: grid.minutesPerRow,
      dayStartMinutes: grid.dayStartMinutes,
      needsReview:
        match.needsColumnConfirmation || providers.some(p => p.reviewStatus === 'needs_review'),
      eventsFromNotes,
    };
  } finally {
    // Raw OCR text dies here on every path. Only structured metrics leave.
    wipeOcrWords(words);
    wipeOcrWords(railWords);
  }
}

