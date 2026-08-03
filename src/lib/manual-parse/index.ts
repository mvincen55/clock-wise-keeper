export * from './types';
export { assemblePageLines, assembleLines, bodyFontSize } from './lines';
export { classifyRepeats, normalizeRepeatKey, resolvePrintedPage } from './repeats';
export { detectToc } from './toc';
export { detectHeadings, reconcileWithToc, normalizeTitle } from './headings';
export { buildBlocks, type ContentBlock } from './blocks';
export {
  applySectionOverrides,
  parseManual,
  slugify,
  type EffectiveSections,
} from './parse';
export { structureFromLegacyText, type LegacyStructured } from './legacy';
