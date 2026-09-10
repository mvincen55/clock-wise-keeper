import type { PaymentClass } from './payment-policy';

interface GroupingLine {
  id: string; classification: PaymentClass | 'review'; visit: string; tooth?: string; explicitGroup?: string;
  groupingHint?: 'same_tooth' | 'same_visit' | 'separate';
}

/** A treatment phase can span appointments. Appointment numbers are not phase IDs.
 * Explicit staff grouping takes precedence. With no tooth/appointment evidence,
 * keep the line separate rather than joining unrelated treatments by class alone.
 */
export function treatmentGroupIds(lines: GroupingLine[]): Map<string, string> {
  const parent = lines.map((_, i) => i);
  const root = (i: number): number => parent[i] === i ? i : (parent[i] = root(parent[i]));
  const teeth = lines.map(line => new Set((line.tooth ?? '').toUpperCase().split(/[\s,;/]+/).filter(Boolean)));
  for (let i = 0; i < lines.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = lines[i], b = lines[j];
      if (a.explicitGroup?.trim() || b.explicitGroup?.trim() || a.classification !== b.classification) continue;
      if (a.groupingHint === 'separate' || b.groupingHint === 'separate') continue;
      const sharedAppointment = a.visit.trim() !== '' && a.visit.trim() === b.visit.trim();
      const courseSpansAppointments = ['implant', 'restoration', 'denture'].includes(a.classification) && a.groupingHint !== 'same_visit' && b.groupingHint !== 'same_visit';
      const sharedTooth = courseSpansAppointments && [...teeth[i]].some(tooth => teeth[j].has(tooth));
      if (sharedAppointment || sharedTooth) parent[root(i)] = root(j);
    }
  }
  const anchors = new Map<number, string>();
  lines.forEach((line, i) => {
    const key = root(i), previous = anchors.get(key);
    if (!previous || line.id < previous) anchors.set(key, line.id);
  });
  return new Map(lines.map((line, i) => [line.id, line.explicitGroup?.trim() || `${line.classification}:course:${anchors.get(root(i))}`]));
}
