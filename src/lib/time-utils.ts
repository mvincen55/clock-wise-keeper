export function minutesToHHMM(minutes: number): string {
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.abs(minutes) % 60;
  const sign = minutes < 0 ? '-' : '';
  return `${sign}${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : date;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateShort(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : date;
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
}

export function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

export function calculatePunchMinutes(punches: { punch_type: string; punch_time: string }[]): number {
  let total = 0;
  const sorted = [...punches].sort((a, b) => new Date(a.punch_time).getTime() - new Date(b.punch_time).getTime());
  
  for (let i = 0; i < sorted.length - 1; i += 2) {
    if (sorted[i].punch_type === 'in' && sorted[i + 1]?.punch_type === 'out') {
      const inTime = new Date(sorted[i].punch_time).getTime();
      const outTime = new Date(sorted[i + 1].punch_time).getTime();
      total += (outTime - inTime) / 60000;
    }
  }
  return Math.round(total);
}
