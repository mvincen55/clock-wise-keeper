export interface ScheduleProvider { id: string; displayName: string; providerType: 'doctor' | 'hygienist' | 'assistant' | 'other'; employeeId: string | null; active: boolean; }
type Provider = ScheduleProvider;
import type { LayoutColumn, OcrWord, OperationalRole, Department } from './types';

export function providerColumn(provider: Provider): Pick<LayoutColumn, 'providerId' | 'providerLabel' | 'providerRole' | 'department' | 'employeeId'> {
  const roles: Record<Provider['providerType'], OperationalRole> = { doctor: 'dentist', hygienist: 'hygienist', assistant: 'dental_assistant', other: 'other' };
  const departments: Record<Provider['providerType'], Department> = { doctor: 'doctor', hygienist: 'hygiene', assistant: 'other', other: 'other' };
  return { providerId: provider.id, providerLabel: provider.displayName, providerRole: roles[provider.providerType], department: departments[provider.providerType], employeeId: provider.employeeId };
}

/** Only short provider identifiers from the header are retained; never raw OCR. */
export function suggestColumnProvider(words: OcrWord[], column: Pick<LayoutColumn, 'xStart' | 'xEnd'>, width: number, height: number, providers: Provider[], previous: LayoutColumn[], includeAppointmentCodes = false) {
  const header = words.filter(w => w.confidence >= 80 && w.bbox.y1 <= height * 0.16 &&
    (w.bbox.x0 + w.bbox.x1) / 2 >= column.xStart * width && (w.bbox.x0 + w.bbox.x1) / 2 <= column.xEnd * width);
  const codeWords = includeAppointmentCodes ? words.filter(w => w.confidence >= 80 && (w.bbox.x0 + w.bbox.x1) / 2 >= column.xStart * width && (w.bbox.x0 + w.bbox.x1) / 2 < column.xEnd * width) : header;
  const codes = [...new Set(codeWords.map(w => w.text.trim().toUpperCase()).filter(t => /^(DR|HY|HYG)\d{1,4}$/.test(t)))];
  const providerCode = codes.length === 1 ? codes[0] : undefined;
  const ids = new Set(previous.filter(c => providerCode && c.providerCode === providerCode && c.providerId).map(c => c.providerId));
  const normalize = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const headerName = normalize(header.map(w => w.text).join(' '));
  const tokens = new Set(header.map(w => normalize(w.text)));
  const candidates = providers.filter(p => {
    const lastName = normalize(p.displayName.split(/\s+/).at(-1) ?? '');
    return p.active && (ids.has(p.id) || (headerName.length > 0 && normalize(p.displayName) === headerName) || (lastName.length >= 4 && tokens.has(lastName)));
  });
  const notesOnly = /\b(notes?|memo|reminders?)\b/i.test(header.map(w => w.text).join(' '));
  return { providerCode, notesOnly, provider: !notesOnly && candidates.length === 1 ? candidates[0] : undefined };
}

/** Re-read each physical column every day. Never inherit yesterday's owner. */
export function suggestDailyColumns(words: OcrWord[], columns: LayoutColumn[], width: number, height: number, providers: Provider[]) {
  return columns.map(col => {
    const suggestion = suggestColumnProvider(words, col, width, height, providers, columns, true);
    const provider = suggestion.provider;
    return {
      xStart: col.xStart, xEnd: col.xEnd,
      kind: suggestion.notesOnly ? 'non_clinical' as const : 'provider' as const,
      providerLabel: null, providerRole: null, department: null, employeeId: null,
      providerCode: suggestion.providerCode,
      ...(provider ? { ...providerColumn(provider), workingHours: columns.find(c => c.providerId === provider.id)?.workingHours } : {}),
    };
  });
}

