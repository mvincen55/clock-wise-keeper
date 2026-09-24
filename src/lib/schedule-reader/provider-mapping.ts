export interface ScheduleProvider { scheduleCode?: string | null; id: string; displayName: string; providerType: 'doctor' | 'hygienist' | 'assistant' | 'other'; employeeId: string | null; active: boolean; }
type Provider = ScheduleProvider;
import type { LayoutColumn, OcrWord, OcrBox, OperationalRole, Department } from './types';
import { chairDepartment, inferDepartment, readProviderCodes, type WorkDepartment } from './provider-codes';
import { columnsFromRegions, isNotesOnlyColumn } from './appointment-regions';

export function providerColumn(provider: Provider): Pick<LayoutColumn, 'providerId' | 'providerLabel' | 'providerRole' | 'department' | 'employeeId'> {
  const roles: Record<Provider['providerType'], OperationalRole> = { doctor: 'dentist', hygienist: 'hygienist', assistant: 'dental_assistant', other: 'other' };
  const departments: Record<Provider['providerType'], Department> = { doctor: 'doctor', hygienist: 'hygiene', assistant: 'other', other: 'other' };
  return { providerId: provider.id, providerLabel: provider.displayName, providerRole: roles[provider.providerType], department: departments[provider.providerType], employeeId: provider.employeeId };
}

/** Only short provider identifiers from the header are retained; never raw OCR. */
export function suggestColumnProvider(words: OcrWord[], column: Pick<LayoutColumn, 'xStart' | 'xEnd'>, width: number, height: number, providers: Provider[], previous: LayoutColumn[], includeAppointmentCodes = false) {
  const header = words.filter(w => w.confidence >= 80 && w.bbox.y1 <= height * 0.16 &&
    (w.bbox.x0 + w.bbox.x1) / 2 >= column.xStart * width && (w.bbox.x0 + w.bbox.x1) / 2 <= column.xEnd * width);
  const codeWords = includeAppointmentCodes ? words.filter(w => (w.bbox.x0 + w.bbox.x1) / 2 >= column.xStart * width && (w.bbox.x0 + w.bbox.x1) / 2 < column.xEnd * width) : header;
  // A hold can reserve time for an appointment in another lane. A room/header
  // name does not establish ownership: require a code or explicit review.
  const hasHold = includeAppointmentCodes && codeWords.some(w => w.confidence >= 40 && /\bhold\b/i.test(w.text));
  const codes = readProviderCodes(hasHold ? codeWords.filter(w => w.bbox.y0 > height * 0.16) : codeWords);
  const providerCode = codes.length === 1 ? codes[0] : undefined;
  const registered = providers.filter(p => providerCode && p.scheduleCode === providerCode);
  const ids = new Set(previous.filter(c => providerCode && c.providerCode === providerCode && c.providerId).map(c => c.providerId));
  const normalize = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const headerName = normalize(header.map(w => w.text).join(' '));
  const tokens = new Set(header.map(w => normalize(w.text)));
  const candidates = providers.filter(p => {
    const lastName = normalize(p.displayName.split(/\s+/).at(-1) ?? '');
    return p.active && (ids.has(p.id) || (headerName.length > 0 && normalize(p.displayName) === headerName) || (lastName.length >= 4 && tokens.has(lastName)));
  });
  const notesOnly = /\b(notes?|memo|reminders?)\b/i.test(header.map(w => w.text).join(' '));
  // No code and no name: the work itself says which department is running
  // this chair today — crowns and endo are the doctor's, prophies and perio
  // maintenance are hygiene's — with the chair's conventional name (DT-3,
  // HT-1) as the hint when the boxes name no procedure. When the registry
  // has exactly one active provider of that kind, the column is theirs; with
  // two, the closer chooses. Read afresh every capture, never remembered.
  const body = includeAppointmentCodes ? codeWords.filter(w => w.bbox.y0 > height * 0.16) : [];
  const department: WorkDepartment | null = inferDepartment(boxTexts(body)) ?? chairDepartment(header.map(w => w.text).join(' '));
  const ofDepartment = department ? providers.filter(p => p.active && p.providerType === (department === 'doctor' ? 'doctor' : 'hygienist')) : [];
  const byCode = registered.length === 1 ? (registered[0].active ? registered[0] : undefined) : registered.length > 1 ? undefined : candidates.length === 1 ? candidates[0] : undefined;
  const byWork = registered.length === 0 && candidates.length === 0 && ofDepartment.length === 1 ? ofDepartment[0] : undefined;
  return { providerCode, notesOnly, department, provider: !notesOnly && codes.length <= 1 ? (byCode ?? (hasHold && !providerCode && !department ? undefined : byWork)) : undefined };
}

/** The words of a column's body grouped into boxes by their rows, so each box can vote once. */
function boxTexts(words: OcrWord[]): string[] {
  const rows = new Map<number, string[]>();
  for (const w of [...words].sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0)) {
    const key = [...rows.keys()].find(y => Math.abs(y - w.bbox.y0) < 40) ?? w.bbox.y0;
    rows.set(key, [...(rows.get(key) ?? []), w.text]);
  }
  return [...rows.values()].map(ws => ws.join(' '));
}

/** Re-read each physical column every day. Never inherit yesterday's owner. */
export function suggestDailyColumns(words: OcrWord[], columns: LayoutColumn[], width: number, height: number, providers: Provider[], regions: OcrBox[] = []) {
  const detected = columnsFromRegions(regions,width);
  const bounds = detected.length >= 1 && readProviderCodes(words).length ? detected : columns;
  return bounds.map(col => {
    const suggestion = suggestColumnProvider(words, col, width, height, providers, columns, true);
    const provider = suggestion.provider;
    return {
      xStart: col.xStart, xEnd: col.xEnd,
      kind: suggestion.notesOnly || isNotesOnlyColumn(words,regions,col,width) ? 'non_clinical' as const : 'provider' as const,
      providerLabel: null, providerRole: null, department: null, employeeId: null,
      providerCode: suggestion.providerCode,
      ...(provider ? { ...providerColumn(provider), workingHours: columns.find(c => c.providerId === provider.id)?.workingHours } : {}),
    };
  });
}



