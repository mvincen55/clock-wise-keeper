export interface ScheduleProvider { scheduleCode?: string | null; id: string; displayName: string; providerType: 'doctor' | 'hygienist' | 'assistant' | 'other'; employeeId: string | null; active: boolean; }
type Provider = ScheduleProvider;
import type { LayoutColumn, OcrWord, OcrBox, OperationalRole, Department } from './types';
import { knownCodeVocabulary, providerTypeForCode, readProviderCodeEvidence, readProviderCodes, type CodeEvidence } from './provider-codes';
import { columnsFromRegions, isNotesOnlyColumn } from './appointment-regions';

export function providerColumn(provider: Provider): Pick<LayoutColumn, 'providerId' | 'providerLabel' | 'providerRole' | 'department' | 'employeeId'> {
  const roles: Record<Provider['providerType'], OperationalRole> = { doctor: 'dentist', hygienist: 'hygienist', assistant: 'dental_assistant', other: 'other' };
  const departments: Record<Provider['providerType'], Department> = { doctor: 'doctor', hygienist: 'hygiene', assistant: 'other', other: 'other' };
  return { providerId: provider.id, providerLabel: provider.displayName, providerRole: roles[provider.providerType], department: departments[provider.providerType], employeeId: provider.employeeId };
}

/**
 * How sure a suggestion is. `strong` is filled in for the closer to confirm;
 * `likely` and `possible` are offered as one-click picks and never prefilled —
 * the reader narrows the choice, the office makes it.
 */
export type CandidateStrength = 'likely' | 'possible';

export interface ProviderCandidate { providerId: string; strength: CandidateStrength; reason: string; }

/** What the reader can say about one column. Provider codes and registry names only — never other schedule text. */
export interface ColumnSuggestionSummary {
  /** Why the prefilled provider was chosen, when one was. */
  reason?: string;
  /** Every code read in the column with how many appointments carried it, strongest first. */
  codes: CodeEvidence[];
  candidates: ProviderCandidate[];
}

export interface ColumnSuggestion extends ColumnSuggestionSummary {
  providerCode?: string;
  notesOnly: boolean;
  provider?: Provider;
}

/** A column offered for review, carrying the evidence behind its suggestion. The summary is never saved. */
export type ReviewColumn = LayoutColumn & { suggestion?: ColumnSuggestionSummary };

/** The office's whole code vocabulary: registry codes first, then codes confirmed in earlier calibrations. */
export function knownProviderCodes(providers: Provider[], previous: LayoutColumn[]): string[] {
  return knownCodeVocabulary([...providers.map(p => p.scheduleCode), ...previous.map(c => c.providerCode)]);
}

const TYPE_WORD: Record<Provider['providerType'], string> = { doctor: 'doctor', hygienist: 'hygienist', assistant: 'assistant', other: 'provider' };

const evidenceText = (codes: CodeEvidence[]) => codes.map(c => `${c.code} ×${c.count}`).join(', ');

/**
 * Who a single code points at, with the reason. `contested` marks a code that
 * is spoken for but unusable — held by an inactive provider or claimed by more
 * than one — so it must not be offered around by elimination either.
 */
function resolveCode(code: string, providers: Provider[], previous: LayoutColumn[]): { provider?: Provider; reason?: string; contested: boolean } {
  const registered = providers.filter(p => p.scheduleCode === code);
  if (registered.length === 1) return registered[0].active ? { provider: registered[0], reason: `${code} is ${registered[0].displayName}'s schedule code`, contested: false } : { contested: true };
  if (registered.length > 1) return { contested: true };
  const ids = [...new Set(previous.filter(c => c.providerCode === code && c.providerId).map(c => c.providerId))];
  const remembered = ids.length === 1 ? providers.find(p => p.id === ids[0] && p.active) : undefined;
  if (remembered) return { provider: remembered, reason: `${code} was ${remembered.displayName} in the last calibration`, contested: false };
  return { contested: ids.length > 1 };
}

/** Only short provider identifiers from the header are retained; never raw OCR. */
export function suggestColumnProvider(words: OcrWord[], column: Pick<LayoutColumn, 'xStart' | 'xEnd'>, width: number, height: number, providers: Provider[], previous: LayoutColumn[], includeAppointmentCodes = false): ColumnSuggestion {
  const header = words.filter(w => w.confidence >= 80 && w.bbox.y1 <= height * 0.16 &&
    (w.bbox.x0 + w.bbox.x1) / 2 >= column.xStart * width && (w.bbox.x0 + w.bbox.x1) / 2 <= column.xEnd * width);
  const codeWords = includeAppointmentCodes ? words.filter(w => (w.bbox.x0 + w.bbox.x1) / 2 >= column.xStart * width && (w.bbox.x0 + w.bbox.x1) / 2 < column.xEnd * width) : header;
  // A hold can reserve time for an appointment in another lane. A room/header
  // name does not establish ownership: require a code or explicit review.
  const hasHold = includeAppointmentCodes && codeWords.some(w => w.confidence >= 40 && /\bhold\b/i.test(w.text));
  const codes = readProviderCodeEvidence(hasHold ? codeWords.filter(w => w.bbox.y0 > height * 0.16) : codeWords, knownProviderCodes(providers, previous));
  // One code owns the column outright. With several, a clear majority is only
  // ever offered as a pick — mixed lanes are the office's call.
  const dominant = codes.length > 1 && codes[0].count >= 2 && codes[0].count >= 2 * codes[1].count ? codes[0].code : undefined;
  const providerCode = codes.length === 1 ? codes[0].code : dominant;
  const active = providers.filter(p => p.active);
  const normalize = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const headerName = normalize(header.map(w => w.text).join(' '));
  const tokens = new Set(header.map(w => normalize(w.text)));
  const byName = active.filter(p => {
    const lastName = normalize(p.displayName.split(/\s+/).at(-1) ?? '');
    return (headerName.length > 0 && normalize(p.displayName) === headerName) || (lastName.length >= 4 && tokens.has(lastName));
  });
  const notesOnly = /\b(notes?|memo|reminders?)\b/i.test(header.map(w => w.text).join(' '));

  const candidates: ProviderCandidate[] = [];
  const offer = (provider: Provider, strength: CandidateStrength, reason: string) => {
    if (!candidates.some(c => c.providerId === provider.id)) candidates.push({ providerId: provider.id, strength, reason });
  };
  let provider: Provider | undefined;
  let reason: string | undefined;

  if (notesOnly) return { providerCode, notesOnly, provider: undefined, codes, candidates };

  if (providerCode && codes.length === 1) {
    const resolved = resolveCode(providerCode, providers, previous);
    if (resolved.provider) {
      provider = resolved.provider;
      reason = resolved.reason;
    } else if (!resolved.contested) {
      // A code nobody owns yet: its prefix still says which kind of provider
      // to look among, and a registry with one such provider left is a hint.
      const type = providerTypeForCode(providerCode);
      const open = active.filter(p => p.providerType === type && !p.scheduleCode);
      const word = type ? TYPE_WORD[type] : 'provider';
      if (open.length === 1) offer(open[0], 'likely', `${providerCode} reads like a ${word} code and ${open[0].displayName} is the only ${word} without a schedule code yet`);
      else for (const p of open) offer(p, 'possible', `a ${word} without a schedule code yet`);
    }
  } else if (providerCode && dominant) {
    const resolved = resolveCode(providerCode, providers, previous);
    if (resolved.provider) offer(resolved.provider, 'likely', `mostly ${providerCode} (${evidenceText(codes)}); ${resolved.reason ?? ''}`);
    for (const c of codes.slice(1)) { const r = resolveCode(c.code, providers, previous); if (r.provider) offer(r.provider, 'possible', `${c.code} ×${c.count} read here`); }
  } else if (codes.length > 1) {
    for (const c of codes) { const r = resolveCode(c.code, providers, previous); if (r.provider) offer(r.provider, 'possible', `${c.code} ×${c.count} read here`); }
  } else if (byName.length === 1 && !hasHold) {
    provider = byName[0];
    reason = `the column header matches ${provider.displayName}`;
  } else {
    for (const p of byName) offer(p, 'possible', 'name matches the column header');
  }

  return { providerCode, notesOnly, provider, reason, codes, candidates };
}

/** Everything about a suggestion that may accompany a column into review. */
export function summarizeSuggestion(suggestion: ColumnSuggestion): ColumnSuggestionSummary {
  return { reason: suggestion.reason, codes: suggestion.codes, candidates: suggestion.candidates };
}

/** Re-read each physical column every day. Never inherit yesterday's owner. */
export function suggestDailyColumns(words: OcrWord[], columns: LayoutColumn[], width: number, height: number, providers: Provider[], regions: OcrBox[] = []): ReviewColumn[] {
  const detected = columnsFromRegions(regions,width);
  const bounds = detected.length >= 1 && readProviderCodes(words, knownProviderCodes(providers, columns)).length ? detected : columns;
  return bounds.map(col => {
    const suggestion = suggestColumnProvider(words, col, width, height, providers, columns, true);
    const provider = suggestion.provider;
    return {
      xStart: col.xStart, xEnd: col.xEnd,
      kind: suggestion.notesOnly || isNotesOnlyColumn(words,regions,col,width) ? 'non_clinical' as const : 'provider' as const,
      providerLabel: null, providerRole: null, department: null, employeeId: null,
      providerCode: suggestion.providerCode,
      ...(provider ? { ...providerColumn(provider), workingHours: columns.find(c => c.providerId === provider.id)?.workingHours } : {}),
      suggestion: summarizeSuggestion(suggestion),
    };
  });
}

/** Strip review-only evidence before a column is used for metrics or saved. */
export function stripSuggestion<T extends ReviewColumn>(column: T): Omit<T, 'suggestion'> {
  const { suggestion: _evidence, ...rest } = column;
  return rest;
}

/** Active providers not assigned to any clinical column yet — the ones a closer is still looking for. */
export function unplacedProviders<T extends Provider>(providers: T[], columns: Array<Pick<LayoutColumn, 'kind' | 'providerId'>>): T[] {
  return providers.filter(p => p.active && !columns.some(c => c.kind !== 'non_clinical' && c.providerId === p.id));
}
