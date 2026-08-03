/**
 * Metrics builder — from classified grid rows to provider-day metrics.
 *
 * The builder is split so the arithmetic is pure and testable:
 *   - `sampleColumnStatuses` reads pixel colors from the in-memory canvas and
 *     maps them to statuses via the calibrated legend (canvas-dependent).
 *   - `buildProviderMetrics` turns status rows + classified blocks into the
 *     aggregate metrics (pure — this is what the tests drive).
 *
 * Definitions (see docs/close-the-day-spec.md):
 *   gross available     — the provider's visible working window
 *   intentional         — lunch/meetings/off/etc., from classified blocks
 *   net bookable        — gross − intentional
 *   true open           — bookable but unused: cancellation / no-show / other
 *   unclassified        — visible but unexplained; NEVER counted as true open
 *   recovered           — only from visible evidence or manual confirmation;
 *                         never inferred here (stays null)
 */
import {
  CONFIDENCE_THRESHOLD,
  INTENTIONAL_CODES,
  type BlockCode,
  type ClassifiedBlock,
  type Department,
  type OperationalRole,
  type ProviderDayMetrics,
  type ScheduleStatus,
  type StatusLegendEntry,
  type WorkloadClass,
} from './types';
import { round4 } from './metrics-referee';

/** One grid row of one provider, after reducing that provider's columns. */
export type RowStatus = ScheduleStatus | null; // null = color matched nothing in the legend

/** Scheduled runs this long or longer count as "no planned buffer". */
export const BUFFER_RUN_THRESHOLD_MINUTES = 120;

// ---------------------------------------------------------------------------
// Canvas sampling
// ---------------------------------------------------------------------------

function legendMatch(
  legend: StatusLegendEntry[],
  r: number,
  g: number,
  b: number
): ScheduleStatus | null {
  let best: { status: ScheduleStatus; dist: number } | null = null;
  for (const entry of legend) {
    const dist = Math.max(Math.abs(entry.r - r), Math.abs(entry.g - g), Math.abs(entry.b - b));
    if (dist <= entry.tolerance && (!best || dist < best.dist)) {
      best = { status: entry.status, dist };
    }
  }
  return best?.status ?? null;
}

/**
 * Classify each grid row of a column by its dominant legend color.
 * Samples a coarse pixel grid per cell — enough for solid PMS status blocks.
 */
export function sampleColumnStatuses(
  ctx: CanvasRenderingContext2D,
  col: { pxStart: number; pxEnd: number },
  rows: Array<{ yTop: number; yBottom: number }>,
  legend: StatusLegendEntry[]
): RowStatus[] {
  return rows.map(row => {
    const x0 = Math.max(0, Math.floor(col.pxStart) + 2);
    const w = Math.max(1, Math.floor(col.pxEnd - col.pxStart) - 4);
    const y0 = Math.max(0, Math.floor(row.yTop) + 1);
    const h = Math.max(1, Math.floor(row.yBottom - row.yTop) - 2);
    let data: Uint8ClampedArray;
    try {
      data = ctx.getImageData(x0, y0, w, h).data;
    } catch {
      return null;
    }

    const votes = new Map<ScheduleStatus, number>();
    let samples = 0;
    const stepX = Math.max(1, Math.floor(w / 8));
    const stepY = Math.max(1, Math.floor(h / 4));
    for (let y = 0; y < h; y += stepY) {
      for (let x = 0; x < w; x += stepX) {
        const i = (y * w + x) * 4;
        const status = legendMatch(legend, data[i], data[i + 1], data[i + 2]);
        samples += 1;
        if (status) votes.set(status, (votes.get(status) ?? 0) + 1);
      }
    }
    if (samples === 0) return null;

    let winner: RowStatus = null;
    let winnerVotes = 0;
    for (const [status, count] of votes) {
      if (count > winnerVotes) {
        winner = status;
        winnerVotes = count;
      }
    }
    // Majority rule: an ambiguous cell stays unmatched rather than guessed.
    return winnerVotes * 2 >= samples ? winner : null;
  });
}

// ---------------------------------------------------------------------------
// Pure metric construction
// ---------------------------------------------------------------------------

/** Reduce one row across a provider's parallel columns to a single category. */
export function reduceRow(perColumn: RowStatus[]): {
  category: RowStatus;
  scheduledColumns: number;
} {
  const scheduledColumns = perColumn.filter(
    s => s === 'scheduled' || s === 'completed'
  ).length;
  if (scheduledColumns > 0) return { category: 'scheduled', scheduledColumns };
  const priority: ScheduleStatus[] = ['no_show', 'cancelled', 'moved', 'open', 'blocked'];
  for (const status of priority) {
    if (perColumn.includes(status)) return { category: status, scheduledColumns: 0 };
  }
  return { category: null, scheduledColumns: 0 };
}

export interface ProviderBuildInput {
  providerLabel: string;
  providerRole: OperationalRole;
  department: Department;
  employeeId: string | null;
  businessDate: string;
  /** Reduced row categories for the provider (one entry per grid row). */
  rows: Array<{ category: RowStatus; scheduledColumns: number }>;
  minutesPerRow: number;
  activeColumns: number;
  /** Classified note blocks attributed to this provider. */
  blocks: ClassifiedBlock[];
  /** From attendance/roles, when the caller knows it. */
  supportStaffAssigned: number | null;
  ocrConfidence: number; // 0–1
  layoutConfidence: number; // 0–1
}

function runs(rows: Array<{ category: RowStatus }>, wanted: ScheduleStatus): number[] {
  const found: number[] = [];
  let current = 0;
  for (const row of rows) {
    if (row.category === wanted) {
      current += 1;
    } else if (current > 0) {
      found.push(current);
      current = 0;
    }
  }
  if (current > 0) found.push(current);
  return found;
}

export function classifyWorkload(input: {
  density: number | null;
  continuousWithoutBufferMinutes: number | null;
  overlapMinutes: number | null;
  netBookableMinutes: number;
}): WorkloadClass | null {
  if (input.density === null) return null;
  if (input.netBookableMinutes === 0) return 'light';
  const overloaded =
    input.density > 0.95 &&
    ((input.overlapMinutes ?? 0) > 0 ||
      (input.continuousWithoutBufferMinutes ?? 0) >= BUFFER_RUN_THRESHOLD_MINUTES * 2);
  if (overloaded) return 'overloaded';
  if (input.density > 0.9 || (input.continuousWithoutBufferMinutes ?? 0) >= BUFFER_RUN_THRESHOLD_MINUTES * 2)
    return 'compressed';
  if (input.density > 0.75) return 'full';
  if (input.density > 0.45) return 'steady';
  return 'light';
}

/**
 * Build one provider's aggregate metrics from reduced rows + classified blocks.
 * Deterministic; the referee re-checks every identity computed here.
 */
export function buildProviderMetrics(input: ProviderBuildInput): ProviderDayMetrics {
  const mpr = input.minutesPerRow;
  const gross = input.rows.length * mpr;

  let scheduledUnion = 0;
  let overlap = 0;
  let cancelled = 0;
  let noShow = 0;
  let open = 0;
  let moved = 0;
  let blocked = 0;
  let unmatched = 0;

  for (const row of input.rows) {
    switch (row.category) {
      case 'scheduled':
      case 'completed':
        scheduledUnion += mpr;
        overlap += Math.max(0, row.scheduledColumns - 1) * mpr;
        break;
      case 'cancelled':
        cancelled += mpr;
        break;
      case 'no_show':
        noShow += mpr;
        break;
      case 'moved':
        moved += mpr;
        break;
      case 'open':
        open += mpr;
        break;
      case 'blocked':
        blocked += mpr;
        break;
      default:
        unmatched += mpr;
    }
  }

  // Intentional time must be EXPLAINED: only confidently classified (or
  // user-confirmed) blocks count, and never more than the visibly blocked
  // minutes. Blocked time without an explanation stays unclassified — the
  // closer resolves it, the pipeline never guesses.
  const intentionalCodes = new Set<BlockCode>(INTENTIONAL_CODES);
  const explained = input.blocks
    .filter(
      b =>
        intentionalCodes.has(b.code) &&
        (b.userConfirmed || b.confidence >= CONFIDENCE_THRESHOLD)
    )
    .reduce((sum, b) => sum + b.minutes, 0);
  const intentional = Math.min(blocked, explained);
  const unexplainedBlocked = blocked - intentional;

  const net = gross - intentional;
  const scheduled = scheduledUnion + overlap;
  const cancellationOpen = cancelled;
  const noShowOpen = noShow;
  const otherOpen = open + moved;
  const trueOpen = cancellationOpen + noShowOpen + otherOpen;
  const unclassified = unmatched + unexplainedBlocked;

  const cancellationCount = runs(input.rows, 'cancelled').length;
  const noShowCount = runs(input.rows, 'no_show').length;

  const scheduledRuns = runs(
    input.rows.map(r => ({ category: r.category === 'completed' ? 'scheduled' : r.category })),
    'scheduled'
  );
  const longestStretch = scheduledRuns.length ? Math.max(...scheduledRuns) * mpr : 0;
  const withoutBuffer = scheduledRuns
    .map(r => r * mpr)
    .filter(minutes => minutes >= BUFFER_RUN_THRESHOLD_MINUTES)
    .reduce((a, b) => a + b, 0);

  const density = net === 0 ? 0 : round4(scheduled / net);
  const disruptionEvents = cancellationCount + noShowCount;
  const eventProxy = scheduledRuns.length + disruptionEvents;
  const volatility = eventProxy === 0 ? 0 : round4(disruptionEvents / eventProxy);

  const matchedFraction = gross === 0 ? 0 : (gross - unmatched) / gross;
  const confidence = round4(
    Math.max(0, Math.min(1, input.ocrConfidence * input.layoutConfidence * matchedFraction))
  );

  const continuousWithoutBufferMinutes = withoutBuffer;
  const simultaneousColumnMinutes =
    input.activeColumns > 1
      ? input.rows.filter(r => r.scheduledColumns > 1).length * mpr
      : 0;

  return {
    providerLabel: input.providerLabel,
    providerRole: input.providerRole,
    department: input.department,
    employeeId: input.employeeId,
    businessDate: input.businessDate,

    grossAvailableMinutes: gross,
    intentionalUnavailableMinutes: intentional,
    netBookableMinutes: net,
    scheduledMinutes: scheduled,
    trueOpenMinutes: trueOpen,

    cancellationCount,
    cancellationOpenMinutes: cancellationOpen,
    noShowCount,
    noShowOpenMinutes: noShowOpen,
    otherOpenMinutes: otherOpen,
    unclassifiedMinutes: unclassified,

    recoveredMinutes: null,
    recoveredOpenPct: null,
    sameDayAdditions: null,
    overlapMinutes: overlap,
    longestBookedStretchMinutes: longestStretch,
    continuousWithoutBufferMinutes,

    activeColumns: input.activeColumns,
    simultaneousColumnMinutes,
    scheduleDensity: density,
    scheduleVolatility: volatility,

    supportStaffAssigned: input.supportStaffAssigned,
    staffingToColumnRatio:
      input.supportStaffAssigned === null
        ? null
        : round4(input.supportStaffAssigned / input.activeColumns),

    automatedWorkloadClass: classifyWorkload({
      density,
      continuousWithoutBufferMinutes,
      overlapMinutes: overlap,
      netBookableMinutes: net,
    }),
    confidence,
    reviewStatus: confidence >= CONFIDENCE_THRESHOLD ? 'auto_accepted' : 'needs_review',
  };
}
