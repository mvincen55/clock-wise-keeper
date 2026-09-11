import type { Provider } from '@/lib/providers';
import type { LayoutColumn, OcrWord, OperationalRole, Department } from '@/lib/schedule-reader/types';

export function providerColumn(provider: Provider): Pick<LayoutColumn, 'providerId' | 'providerLabel' | 'providerRole' | 'department' | 'employeeId'> {
  const roles: Record<Provider['providerType'], OperationalRole> = { doctor: 'dentist', hygienist: 'hygienist', assistant: 'dental_assistant', other: 'other' };
  const departments: Record<Provider['providerType'], Department> = { doctor: 'doctor', hygienist: 'hygiene', assistant: 'other', other: 'other' };
  return { providerId: provider.id, providerLabel: provider.displayName, providerRole: roles[provider.providerType], department: departments[provider.providerType], employeeId: provider.employeeId };
}

/** Only short provider identifiers from the header are retained; never raw OCR. */
export function suggestColumnProvider(words: OcrWord[], column: Pick<LayoutColumn, 'xStart' | 'xEnd'>, width: number, height: number, providers: Provider[], previous: LayoutColumn[]) {
  const header = words.filter(w => w.confidence >= 80 && w.bbox.y1 <= height * 0.16 &&
    (w.bbox.x0 + w.bbox.x1) / 2 >= column.xStart * width && (w.bbox.x0 + w.bbox.x1) / 2 <= column.xEnd * width);
  const codes = [...new Set(header.map(w => w.text.trim().toUpperCase()).filter(t => /^(DR|HY|HYG)\d{1,4}$/.test(t)))];
  const providerCode = codes.length === 1 ? codes[0] : undefined;
  const ids = new Set(previous.filter(c => providerCode && c.providerCode === providerCode && c.providerId).map(c => c.providerId));
  const normalize = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const headerName = normalize(header.map(w => w.text).join(' '));
  const candidates = providers.filter(p => p.active && (ids.has(p.id) || (headerName.length > 0 && normalize(p.displayName) === headerName)));
  return { providerCode, provider: candidates.length === 1 ? candidates[0] : undefined };
}
