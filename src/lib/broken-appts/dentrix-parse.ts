/**
 * Parsers for the two small Dentrix panels the capture assistant reads:
 * the Address panel and the Appointments table (both on the Appointment
 * Book's More Information window). Pure text-in/values-out — the OCR lines
 * arrive from browser memory and the parsed values go straight to a review
 * screen; nothing here stores or transmits anything.
 *
 * OCR is an assistant, not the source of truth: when a value looks
 * uncertain (a ZIP with a misread character, a state that isn't two
 * letters) it is returned as-is and FLAGGED, never guessed or invented.
 */

export interface ParsedAddress {
  addressLine1: string;
  /** Apt/Unit/Suite line; '' when the panel shows none (never invented). */
  addressLine2: string;
  city: string;
  state: string;
  zip: string;
  /** Field names the employee must verify before applying. */
  uncertain: Array<'addressLine1' | 'addressLine2' | 'city' | 'state' | 'zip'>;
}

const CITY_STATE_ZIP = /^(.+?)[,.]?\s+([A-Za-z]{2})\s+([0-9?OIl-]{4,10})$/;
const CLEAN_ZIP = /^\d{5}(-\d{4})?$/;

/** Strip OCR gutter noise (row markers, stray pipes) from a line. */
function cleanLine(line: string): string {
  return line.replace(/^[>|•*\-—_\s]+/, '').replace(/\s+/g, ' ').trim();
}

/**
 * Parse the Dentrix Address panel. Expected shapes (header optional):
 *
 *   Address              16 Hiller Avenue          11 Shoreview ave
 *   16 Hiller Avenue     Apt 3B                    Mattapoisett, MA 02739
 *   Fairhaven, MA 02719  Fairhaven, MA 02719
 *
 * A second line before the city line becomes Address Line 2; none exists,
 * none is invented.
 */
export function parseDentrixAddress(rawLines: string[]): ParsedAddress {
  const lines = rawLines
    .map(cleanLine)
    .filter(l => l !== '' && !/^address$/i.test(l));

  const result: ParsedAddress = {
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    zip: '',
    uncertain: [],
  };
  if (lines.length === 0) return result;

  let cityIndex = -1;
  let cityMatch: RegExpMatchArray | null = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(CITY_STATE_ZIP);
    if (m) {
      cityIndex = i;
      cityMatch = m;
      break;
    }
  }

  const streetLines = cityIndex === -1 ? lines : lines.slice(0, cityIndex);
  result.addressLine1 = streetLines[0] ?? '';
  // Extra lines between street and city: the unit line (joined if OCR split it).
  result.addressLine2 = streetLines.slice(1).join(' ').trim();

  if (cityMatch) {
    result.city = cityMatch[1].trim();
    result.state = cityMatch[2].toUpperCase();
    result.zip = cityMatch[3];
    if (!CLEAN_ZIP.test(result.zip)) result.uncertain.push('zip');
    if (!/^[A-Z]{2}$/.test(result.state)) result.uncertain.push('state');
  } else if (lines.length > 1) {
    // No recognizable "City, ST ZIP" line — surface the leftover text for
    // the employee to sort out rather than guessing at fields.
    result.city = lines[lines.length - 1];
    result.uncertain.push('city', 'state', 'zip');
    result.addressLine2 = streetLines.slice(1, -1).join(' ').trim();
  } else {
    result.uncertain.push('city', 'state', 'zip');
  }

  if (result.addressLine1 === '') result.uncertain.push('addressLine1');
  return result;
}

export interface ParsedAppt {
  /** ISO YYYY-MM-DD. */
  date: string;
  /** e.g. "8:40 AM" ('' when unreadable). */
  time: string;
  /** Provider code, e.g. "HY14" / "DR08" ('' when unreadable). */
  provider: string;
}

export interface ParsedAppointments {
  rows: ParsedAppt[];
  /** Rows dropped because they are on/before the reference date. */
  pastRowsSkipped: number;
}

const DATE_TOKEN = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/;
const TIME_TOKEN = /(\d{1,2}):(\d{2})\s*(AM|PM)?/i;
const PROVIDER_TOKEN = /\b([A-Z]{2,4}\d{1,3})\b/;

function toIso(m: number, d: number, y: number): string | null {
  const year = y < 100 ? 2000 + y : y;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Parse the Dentrix Appointments table. Rows read like
 * "2/19/2027  Friday, 8:40 AM  HY14"; header/gutter lines carry no date and
 * are skipped. Only rows AFTER `today` are returned — the workflow needs
 * the patient's upcoming appointments, not their history.
 */
export function parseDentrixAppointments(rawLines: string[], today: Date): ParsedAppointments {
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const rows: ParsedAppt[] = [];
  let pastRowsSkipped = 0;

  for (const raw of rawLines) {
    const line = cleanLine(raw);
    const dateMatch = line.match(DATE_TOKEN);
    if (!dateMatch) continue;
    const iso = toIso(Number(dateMatch[1]), Number(dateMatch[2]), Number(dateMatch[3]));
    if (!iso) continue;

    if (iso <= todayIso) {
      pastRowsSkipped++;
      continue;
    }

    const rest = line.slice((dateMatch.index ?? 0) + dateMatch[0].length);
    const timeMatch = rest.match(TIME_TOKEN);
    const time = timeMatch
      ? `${Number(timeMatch[1])}:${timeMatch[2]}${timeMatch[3] ? ` ${timeMatch[3].toUpperCase()}` : ''}`
      : '';
    const providerMatch = rest.match(PROVIDER_TOKEN);

    rows.push({ date: iso, time, provider: providerMatch?.[1] ?? '' });
  }

  // The Dentrix table lists newest-first; the letter reads better soonest-first.
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return { rows, pastRowsSkipped };
}
