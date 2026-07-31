/**
 * Schedule Reader — local-only schedule intelligence.
 *
 * Public surface of the pipeline. Everything here runs in the browser; no
 * function in this directory may upload an image or raw text. See types.ts
 * for the boundary rules and worker.ts for the pipeline order.
 */
export * from './types';
export { captureSupported, captureDisplayFrame, frameFromFile } from './capture';
export { processScheduleFrame, type ProcessOptions } from './worker';
export { destroyCapture, wipeCanvas, wipeOcrWords } from './destroy-capture';
export { refereeMetrics, computeRollup, goalProgress, round4, type MeasurableGoalSpec } from './metrics-referee';
export { classifyNote, sanitizePhrase, type NoteClassification } from './note-classifier';
export { checkPrivacy, buildKnownNames, groupWordsIntoLines } from './privacy-detector';
export {
  buildProviderMetrics,
  classifyWorkload,
  reduceRow,
  sampleColumnStatuses,
  BUFFER_RUN_THRESHOLD_MINUTES,
  type ProviderBuildInput,
  type RowStatus,
} from './metrics-builder';
export { matchLayout, detectTimeRail, draftColumnsFromFrame, wordsInColumn } from './layout-detector';
export { terminateOcr } from './ocr';
