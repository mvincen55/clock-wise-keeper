/**
 * Time Punch spreadsheet parser.
 * Treats all punch values as 12-hour AM/PM time-of-day strings.
 * No UTC conversion, no timezone offsets, no 24-hour inference.
 */

import * as XLSX from 'xlsx';

export type PunchSummaryRow = {
  date: string;
  day: string;
  firstIn: string;
  lastOut: string;
  total: string;
  needsReview: boolean;
  note: string;
  pairs: { inTime: string; outTime: string; minutes: number }[];
};

/** Parse "9:38 AM" or "12:00 PM" → minutes since midnight */
export function parseTimeToMinutes(raw: string): number | null {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw.trim().toUpperCase();
  if (!cleaned) return null;

  // Match: h:mm AM/PM or hh:mm AM/PM
  const match = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const mins = parseInt(match[2], 10);
  const period = match[3];

  // 12-hour to 24-hour conversion
  if (period === 'AM' && hours === 12) hours = 0;
  else if (period === 'PM' && hours !== 12) hours += 12;

  return hours * 60 + mins;
}

/** Format minutes since midnight → "h:mm AM/PM" (no leading zero on hour) */
export function minutesToTimeStr(totalMins: number): string {
  let hours = Math.floor(totalMins / 60) % 24;
  const mins = totalMins % 60;
  const period = hours >= 12 ? 'PM' : 'AM';

  if (hours === 0) hours = 12;
  else if (hours > 12) hours -= 12;

  return `${hours}:${mins.toString().padStart(2, '0')} ${period}`;
}

/** Format duration minutes → "h:mm" */
export function minutesToDuration(totalMins: number): string {
  const h = Math.floor(Math.abs(totalMins) / 60);
  const m = Math.abs(totalMins) % 60;
  return `${h}:${m.toString().padStart(2, '0')}`;
}

/** Read cell as raw string — prevents Excel auto-parsing dates/times */
function getCellStr(sheet: XLSX.WorkSheet, row: number, col: number): string {
  const addr = XLSX.utils.encode_cell({ r: row, c: col });
  const cell = sheet[addr];
  if (!cell) return '';

  // If Excel stored it as a date/time number, format it back to time string
  if (cell.t === 'n' && cell.w) {
    // Use the formatted value Excel provides
    return cell.w.trim();
  }
  if (cell.t === 'n' && !cell.w) {
    // Raw fractional day number — convert to time
    const totalMins = Math.round(cell.v * 24 * 60);
    return minutesToTimeStr(totalMins % (24 * 60));
  }
  // String value
  return (cell.v ?? '').toString().trim();
}

/** Parse the Excel file and return summary rows */
export function parseTimePunchExcel(buffer: ArrayBuffer): PunchSummaryRow[] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false, raw: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error('No sheets found');

  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  const results: PunchSummaryRow[] = [];

  // Find header row — look for "Date" in column A
  let headerRow = -1;
  for (let r = range.s.r; r <= Math.min(range.s.r + 10, range.e.r); r++) {
    const val = getCellStr(sheet, r, 0).toLowerCase();
    if (val === 'date') { headerRow = r; break; }
  }
  if (headerRow === -1) {
    // Try first row as header
    headerRow = range.s.r;
  }

  // Map header columns
  const headers: string[] = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    headers.push(getCellStr(sheet, headerRow, c).toLowerCase().replace(/\s+/g, ''));
  }

  const dateCol = headers.indexOf('date');
  const dayCol = headers.indexOf('day');

  // Find all In/Out columns
  const inCols: number[] = [];
  const outCols: number[] = [];
  headers.forEach((h, i) => {
    if (h.match(/^in\d*$/)) inCols.push(i);
    if (h.match(/^out\d*$/)) outCols.push(i);
  });

  if (dateCol === -1) throw new Error('Could not find "Date" column');

  // Parse data rows
  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const dateStr = getCellStr(sheet, r, dateCol);
    if (!dateStr) continue;

    const dayStr = dayCol >= 0 ? getCellStr(sheet, r, dayCol) : '';

    // Read note from column I (index 8)
    const noteStr = getCellStr(sheet, r, 8);

    // Collect all punch times
    const inTimes: (string | null)[] = inCols.map(c => {
      const s = getCellStr(sheet, r, c);
      return s || null;
    });
    const outTimes: (string | null)[] = outCols.map(c => {
      const s = getCellStr(sheet, r, c);
      return s || null;
    });

    const pairs: PunchSummaryRow['pairs'] = [];
    const allInMins: number[] = [];
    const allOutMins: number[] = [];

    // Collect all punches with their times and sort chronologically
    type Punch = { time: string; minutes: number; type: 'in' | 'out' };
    const allPunches: Punch[] = [];

    inTimes.forEach(s => {
      if (s) {
        const m = parseTimeToMinutes(s);
        if (m != null) allPunches.push({ time: s, minutes: m, type: 'in' });
      }
    });
    outTimes.forEach(s => {
      if (s) {
        const m = parseTimeToMinutes(s);
        if (m != null) allPunches.push({ time: s, minutes: m, type: 'out' });
      }
    });

    // Sort by time
    allPunches.sort((a, b) => a.minutes - b.minutes);

    // Pair sequentially: find In then next Out
    let i = 0;
    let oddPunch = false;
    while (i < allPunches.length) {
      if (allPunches[i].type === 'in') {
        // Look for the next 'out' after this 'in'
        let j = i + 1;
        while (j < allPunches.length && allPunches[j].type !== 'out') j++;
        if (j < allPunches.length) {
          const duration = allPunches[j].minutes - allPunches[i].minutes;
          pairs.push({
            inTime: minutesToTimeStr(allPunches[i].minutes),
            outTime: minutesToTimeStr(allPunches[j].minutes),
            minutes: Math.max(0, duration),
          });
          allInMins.push(allPunches[i].minutes);
          allOutMins.push(allPunches[j].minutes);
          i = j + 1;
        } else {
          // Unpaired in
          allInMins.push(allPunches[i].minutes);
          oddPunch = true;
          i++;
        }
      } else {
        // Out without a preceding in — unpaired
        allOutMins.push(allPunches[i].minutes);
        oddPunch = true;
        i++;
      }
    }

    const totalMins = pairs.reduce((sum, p) => sum + p.minutes, 0);
    const firstInMin = allInMins.length ? Math.min(...allInMins) : null;
    const lastOutMin = allOutMins.length ? Math.max(...allOutMins) : null;

    results.push({
      date: dateStr,
      day: dayStr,
      firstIn: firstInMin != null ? minutesToTimeStr(firstInMin) : '—',
      lastOut: lastOutMin != null ? minutesToTimeStr(lastOutMin) : '—',
      total: minutesToDuration(totalMins),
      needsReview: oddPunch,
      note: noteStr,
      pairs,
    });
  }

  return results;
}
