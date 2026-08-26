import type { PunchRow } from '@/hooks/useTimeEntries';

export type ClockStatus = 'clocked_out' | 'clocked_in';

export function getClockStatus(allPunches: PunchRow[]): ClockStatus {
  // Voided punches never count toward status, whichever list a caller passes.
  const punches = allPunches.filter(p => !p.voided_at);
  if (!punches.length) return 'clocked_out';
  const last = punches[punches.length - 1];
  if (last.punch_type === 'out') return 'clocked_out';
  return 'clocked_in';
}

export function getRunningMinutes(allPunches: PunchRow[]): number {
  let total = 0;
  const sorted = allPunches
    .filter(p => !p.voided_at)
    .sort((a, b) => new Date(a.punch_time).getTime() - new Date(b.punch_time).getTime());
  for (let i = 0; i < sorted.length; i += 2) {
    const inP = sorted[i];
    const outP = sorted[i + 1];
    if (inP?.punch_type === 'in') {
      const end = outP?.punch_type === 'out' ? new Date(outP.punch_time).getTime() : Date.now();
      total += (end - new Date(inP.punch_time).getTime()) / 60000;
    }
  }
  return Math.round(total);
}
