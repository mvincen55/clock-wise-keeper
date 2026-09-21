/**
 * Missed appointments as Dentrix posts them: 9100 is the office's no-show
 * code and 9101 its late-cancellation code. Management → Missed appointments
 * imports pasted Dentrix text and keeps one row per posting in
 * `missed_appointment_events`. Two kinds of paste are understood:
 *
 *   - the appointment export ("Appt_Date<TAB>Appt_Provider", sometimes with
 *     PatID and ProvID columns): every row is one posting of the code chosen
 *     in the dialog, and the provider is a name ("Lucia Bizarro");
 *   - a day sheet: only the lines carrying a 9100/9101 code count, the code
 *     comes from the line, and the provider is a Dentrix provider ID (HY14,
 *     DR02) matched to the office's provider registry by schedule code.
 *
 * Nothing about the patient survives parsing. The export's PatID column is
 * dropped by name (so is any column the importer does not recognise), a day
 * sheet line gives up only its date, code, and provider ID, and a skipped
 * line is reported by number, never by content.
 *
 * Postings are keyed by (date, code, provider, ordinal): identical postings
 * on one day for one provider are numbered, so the same paste imported
 * twice adds nothing, and a later, longer export adds only what is new.
 */
import { format } from 'date-fns';

export const MISSED_APPOINTMENT_CODES = ['9100', '9101'] as const;
export type MissedAppointmentCode = (typeof MISSED_APPOINTMENT_CODES)[number];

export const MISSED_APPOINTMENT_CODE_LABELS: Record<MissedAppointmentCode, string> = {
  '9100': 'No-show',
  '9101': 'Late cancellation',
};

export const MISSED_APPOINTMENT_DEPARTMENTS = ['doctor', 'hygiene', 'other'] as const;
export type MissedAppointmentDepartment = (typeof MISSED_APPOINTMENT_DEPARTMENTS)[number];

export const MISSED_APPOINTMENT_DEPARTMENT_LABELS: Record<MissedAppointmentDepartment, string> = {
  doctor: 'Doctor',
  hygiene: 'Hygiene',
  other: 'Other',
};

export function isMissedAppointmentCode(value: unknown): value is MissedAppointmentCode {
  return typeof value === 'string' && (MISSED_APPOINTMENT_CODES as readonly string[]).includes(value);
}

/** One row of `missed_appointment_events`. */
export type MissedAppointmentEvent = {
  id: string;
  org_id: string;
  business_date: string;
  code: MissedAppointmentCode;
  /** The office's name for the provider when matched, otherwise Dentrix's label. */
  provider_name: string;
  provider_id: string | null;
  department: MissedAppointmentDepartment;
  /** The patient's primary provider code (ProvID) when the export carried it. */
  primary_provider_code: string | null;
  ordinal: number;
  source: string;
  imported_by: string | null;
  created_at: string;
  updated_at: string;
};

/** The slice of the provider registry the importer matches against. */
export type MissedAppointmentProviderRef = {
  id: string;
  displayName: string;
  providerType: string;
  scheduleCode?: string | null;
  active: boolean;
};

/** One posting read from a paste. Never carries anything about the patient. */
export type ParsedMissedAppointment = {
  line: number;
  business_date: string;
  /** Set when the paste itself says which code (a day sheet, or a code column). */
  code: MissedAppointmentCode | null;
  /** Dentrix's label for the provider: a name in the export, an ID on a day sheet. */
  provider_label: string;
  primary_provider_code: string | null;
};

export type MissedAppointmentPasteFormat = 'appointment_export' | 'day_sheet' | 'empty';

export type MissedAppointmentParseResult = {
  format: MissedAppointmentPasteFormat;
  rows: ParsedMissedAppointment[];
  /** Line numbers only: a day-sheet line names a patient, so its text is never echoed. */
  skipped: { line: number; reason: string }[];
  /** Columns the paste carried that the importer threw away, PatID above all. */
  droppedColumns: string[];
  lineCount: number;
};

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const US_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "9/8/2025", "09/08/2025", "9/8/25", or "2025-09-08" → "2025-09-08"; null when it is not a real date. */
export function normalizeDentrixDate(raw: string): string | null {
  const s = raw.trim();
  let y: number;
  let m: number;
  let d: number;
  const iso = ISO_DATE.exec(s);
  if (iso) {
    y = Number(iso[1]); m = Number(iso[2]); d = Number(iso[3]);
  } else {
    const us = US_DATE.exec(s);
    if (!us) return null;
    m = Number(us[1]); d = Number(us[2]); y = Number(us[3]);
    if (us[3].length === 2) y += 2000;
  }
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  if (d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** A standalone 9100/9101 on a line: not part of an amount, a phone number, or a procedure code. */
const POSTING_CODE = /(?<![\dA-Za-z.$-])(9100|9101)(?![\d.])/;
const DATE_ANYWHERE = /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g;
/** A Dentrix provider ID as the day sheet prints it (HY14, DR02); a CDT code (D0120) has one letter and never matches. */
const DAY_SHEET_PROVIDER_ID = /\b[A-Z]{2,4}\d{1,3}\b/g;
/** A provider ID as a lone export column (ProvID: DR02). */
const PROVIDER_CODE_TOKEN = /^[A-Z]{1,4}\d{1,4}$/;
const DIGITS_ONLY = /^\d+$/;

type ColumnRole = 'date' | 'provider' | 'primary' | 'code' | 'patient' | 'other';

function columnRole(name: string): ColumnRole {
  const n = name.toLowerCase().replace(/[^a-z]/g, '');
  if (!n) return 'other';
  if (/^(appt)?date$/.test(n)) return 'date';
  if (/^(appt)?prov(ider)?(name)?$/.test(n)) return 'provider';
  if (/^prov(ider)?id$/.test(n) || /^primary/.test(n)) return 'primary';
  if (/^(appt)?(status|code|proccode|procedurecode)$/.test(n)) return 'code';
  if (/pat|patient|name|phone|chart|guar/.test(n)) return 'patient';
  return 'other';
}

function splitExportLine(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map(s => s.trim());
  if (/ {2,}/.test(line)) return line.split(/ {2,}/).map(s => s.trim());
  if (line.includes(',') && normalizeDentrixDate(line.split(',')[0] ?? '')) {
    return line.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
  }
  return [line.trim()];
}

function looksLikeHeader(cells: string[]): boolean {
  if (cells.some(c => normalizeDentrixDate(c))) return false;
  return cells.some(c => columnRole(c) !== 'other');
}

function looksLikeDaySheet(lines: string[]): boolean {
  if (lines.some(l => /day sheet/i.test(l))) return true;
  return lines.some(l => POSTING_CODE.test(l) && /no ?show|cancel/i.test(l));
}

/** A day sheet line: the posting's date (the procedure date when two are printed), its code, and its provider ID. */
function parseDaySheetLine(line: string, n: number): ParsedMissedAppointment | { skip: string } | null {
  const code = POSTING_CODE.exec(line)?.[1];
  if (!isMissedAppointmentCode(code)) return null;
  const dates = line.match(DATE_ANYWHERE) ?? [];
  const date = normalizeDentrixDate(dates[1] ?? dates[0] ?? '');
  if (!date) return { skip: 'no date' };
  const ids = line.match(DAY_SHEET_PROVIDER_ID) ?? [];
  const provider = ids[ids.length - 1];
  if (!provider) return { skip: 'no provider ID' };
  return { line: n, business_date: date, code, provider_label: provider, primary_provider_code: null };
}

function cleanProviderCode(raw: string | undefined): string | null {
  const code = (raw ?? '').trim().toUpperCase();
  return code && /^[A-Z0-9]{2,20}$/.test(code) ? code : null;
}

/**
 * Parse pasted Dentrix text into postings. Every row is one posting; what the
 * paste said about the patient is gone by the time this returns.
 */
export function parseDentrixMissedAppointments(text: string): MissedAppointmentParseResult {
  const lines = text.split(/\r?\n/);
  const nonBlank = lines.map((l, i) => ({ text: l, n: i + 1 })).filter(l => l.text.trim().length > 0);
  const result: MissedAppointmentParseResult = { format: 'empty', rows: [], skipped: [], droppedColumns: [], lineCount: nonBlank.length };
  if (!nonBlank.length) return result;

  if (looksLikeDaySheet(nonBlank.map(l => l.text))) {
    result.format = 'day_sheet';
    result.droppedColumns = ['patient name', 'phone', 'charges', 'payments'];
    for (const { text: line, n } of nonBlank) {
      const parsed = parseDaySheetLine(line, n);
      if (!parsed) continue;
      if ('skip' in parsed) result.skipped.push({ line: n, reason: parsed.skip });
      else result.rows.push(parsed);
    }
    return result;
  }

  result.format = 'appointment_export';
  const dropped = new Set<string>();
  let roles: ColumnRole[] | null = null;
  let body = nonBlank;
  const headerCells = splitExportLine(nonBlank[0].text);
  if (looksLikeHeader(headerCells)) {
    roles = headerCells.map(columnRole);
    headerCells.forEach((name, i) => {
      if (roles![i] === 'patient' || roles![i] === 'other') dropped.add(name || `column ${i + 1}`);
    });
    body = nonBlank.slice(1);
  }

  for (const { text: line, n } of body) {
    const cells = splitExportLine(line);
    let dateRaw: string | undefined;
    let provider = '';
    let primary: string | null = null;
    let code: MissedAppointmentCode | null = null;

    if (cells.length === 1) {
      // Single-space separated ("1/13/2026 Scott L. Harelick 13943 DR02"): the
      // date leads, the name follows, and trailing IDs peel off the end.
      const tokens = cells[0].split(/\s+/);
      dateRaw = tokens.shift();
      while (tokens.length) {
        const last = tokens[tokens.length - 1];
        if (isMissedAppointmentCode(last)) { code = last; tokens.pop(); continue; }
        if (DIGITS_ONLY.test(last)) { dropped.add('patient ID'); tokens.pop(); continue; }
        if (PROVIDER_CODE_TOKEN.test(last) && tokens.length > 1) { primary = cleanProviderCode(last); tokens.pop(); continue; }
        break;
      }
      provider = tokens.join(' ');
    } else if (roles) {
      cells.forEach((cell, i) => {
        const role = roles![i] ?? 'other';
        if (role === 'date') dateRaw = cell;
        else if (role === 'provider') provider = cell;
        else if (role === 'primary') primary = cleanProviderCode(cell);
        else if (role === 'code' && isMissedAppointmentCode(cell)) code = cell;
        else if (i >= roles!.length && cell) dropped.add(`column ${i + 1}`);
      });
    } else {
      dateRaw = cells[0];
      provider = cells[1] ?? '';
      cells.slice(2).forEach((cell, i) => {
        if (!cell) return;
        if (isMissedAppointmentCode(cell)) code = cell;
        else if (DIGITS_ONLY.test(cell)) dropped.add('patient ID');
        else if (PROVIDER_CODE_TOKEN.test(cell)) primary = cleanProviderCode(cell);
        else dropped.add(`column ${i + 3}`);
      });
    }

    const date = normalizeDentrixDate(dateRaw ?? '');
    if (!date) { result.skipped.push({ line: n, reason: 'no date' }); continue; }
    const label = provider.replace(/\s+/g, ' ').trim();
    if (!label) { result.skipped.push({ line: n, reason: 'no provider' }); continue; }
    result.rows.push({ line: n, business_date: date, code, provider_label: label, primary_provider_code: primary });
  }
  result.droppedColumns = [...dropped];
  return result;
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

const NAME_STOPWORDS = new Set(['dr', 'doctor', 'dds', 'dmd', 'md', 'rdh', 'hygienist', 'hyg']);

function nameTokens(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 1 && !NAME_STOPWORDS.has(t));
}

function tokenScore(displayToken: string, labelToken: string): number {
  if (displayToken === labelToken) return 2;
  if (displayToken.length >= 3 && labelToken.length >= 3 && (labelToken.startsWith(displayToken) || displayToken.startsWith(labelToken))) return 1;
  return 0;
}

/**
 * Find the registry provider a Dentrix label means. A provider ID matches by
 * schedule code ("HY14" → Cori). A name matches when every word of the
 * registry name is in it ("Scott L. Harelick" → "Dr. Scott", "Hygienist
 * TEMPORARY" → "Temp Hyg"); an unknown name ("Holli Braga") matches nobody,
 * and a tie between two providers is left for the manager to settle.
 */
export function matchMissedAppointmentProvider(label: string, providers: MissedAppointmentProviderRef[]): MissedAppointmentProviderRef | null {
  const wanted = label.trim().toUpperCase();
  if (!wanted) return null;
  const byCode = providers.filter(p => (p.scheduleCode ?? '').trim().toUpperCase() === wanted);
  if (byCode.length) return byCode.find(p => p.active) ?? byCode[0];

  const labelTokens = nameTokens(label);
  if (!labelTokens.length) return null;
  const scored: { p: MissedAppointmentProviderRef; score: number }[] = [];
  for (const p of providers) {
    const tokens = nameTokens(p.displayName);
    if (!tokens.length) continue;
    let score = 0;
    let every = true;
    for (const dt of tokens) {
      const best = Math.max(...labelTokens.map(lt => tokenScore(dt, lt)));
      if (!best) { every = false; break; }
      score += best;
    }
    if (every) scored.push({ p, score });
  }
  if (!scored.length) return null;
  const top = Math.max(...scored.map(s => s.score));
  const tied = scored.filter(s => s.score === top);
  if (tied.length === 1) return tied[0].p;
  const active = tied.filter(s => s.p.active);
  return active.length === 1 ? active[0].p : null;
}

export function departmentForProvider(provider: MissedAppointmentProviderRef | null): MissedAppointmentDepartment {
  if (!provider) return 'other';
  if (provider.providerType === 'doctor') return 'doctor';
  if (provider.providerType === 'hygienist') return 'hygiene';
  return 'other';
}

/** How one Dentrix label is recorded: which registry provider (if any) and which department. */
export type MissedAppointmentProviderChoice = {
  providerId: string | null;
  providerName: string;
  department: MissedAppointmentDepartment;
  matched: boolean;
};

export function choiceForProvider(label: string, provider: MissedAppointmentProviderRef | null): MissedAppointmentProviderChoice {
  return provider
    ? { providerId: provider.id, providerName: provider.displayName, department: departmentForProvider(provider), matched: true }
    : { providerId: null, providerName: label, department: 'other', matched: false };
}

/** Distinct labels in the paste, most frequent first, each with its automatic match. */
export function defaultProviderChoices(rows: ParsedMissedAppointment[], providers: MissedAppointmentProviderRef[]): Record<string, MissedAppointmentProviderChoice> {
  const choices: Record<string, MissedAppointmentProviderChoice> = {};
  for (const row of rows) {
    if (choices[row.provider_label]) continue;
    choices[row.provider_label] = choiceForProvider(row.provider_label, matchMissedAppointmentProvider(row.provider_label, providers));
  }
  return choices;
}

export function providerLabelCounts(rows: ParsedMissedAppointment[]): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.provider_label, (counts.get(row.provider_label) ?? 0) + 1);
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

// ---------------------------------------------------------------------------
// The import plan
// ---------------------------------------------------------------------------

export type MissedAppointmentInsert = {
  org_id: string;
  business_date: string;
  code: MissedAppointmentCode;
  provider_name: string;
  provider_id: string | null;
  department: MissedAppointmentDepartment;
  primary_provider_code: string | null;
  ordinal: number;
  source: 'dentrix_import';
  imported_by: string;
};

export type MissedAppointmentImportPlan = {
  /** Rows not yet recorded, ready to insert. */
  inserts: MissedAppointmentInsert[];
  /** Postings the office already has (same day, code, provider, ordinal). */
  alreadyRecorded: number;
  /** Postings left out because their day already has postings and newDaysOnly was on. */
  skippedForRecordedDays: number;
  recordedDaysSkipped: string[];
  byCode: Record<MissedAppointmentCode, number>;
  days: string[];
};

export type ExistingMissedAppointment = Pick<MissedAppointmentEvent, 'business_date' | 'code' | 'provider_name' | 'ordinal'>;

/**
 * Turn parsed rows into inserts. Identical postings on one day for one
 * provider get ordinals 1..n in a stable order, so re-importing the same
 * paste adds nothing and a longer one adds only its extra postings.
 * `newDaysOnly` skips every day that already has postings: a day sheet
 * credits a posting to the chair's provider where the appointment export
 * names the appointment's provider, so on a day both were imported the same
 * posting would otherwise be counted twice.
 */
export function planMissedAppointmentImport(args: {
  rows: ParsedMissedAppointment[];
  code: MissedAppointmentCode;
  choices: Record<string, MissedAppointmentProviderChoice>;
  orgId: string;
  userId: string;
  existing: ExistingMissedAppointment[];
  newDaysOnly: boolean;
}): MissedAppointmentImportPlan {
  const recordedDays = new Set(args.existing.map(e => e.business_date));
  const existingKeys = new Set(args.existing.map(e => `${e.business_date}|${e.code}|${e.provider_name}|${e.ordinal}`));
  const groups = new Map<string, { row: ParsedMissedAppointment; code: MissedAppointmentCode; choice: MissedAppointmentProviderChoice }[]>();
  const skippedDays = new Set<string>();
  let skippedForRecordedDays = 0;

  for (const row of args.rows) {
    const code = row.code ?? args.code;
    if (args.newDaysOnly && recordedDays.has(row.business_date)) {
      skippedForRecordedDays += 1;
      skippedDays.add(row.business_date);
      continue;
    }
    const choice = args.choices[row.provider_label] ?? choiceForProvider(row.provider_label, null);
    const key = `${row.business_date}|${code}|${choice.providerName}`;
    const group = groups.get(key) ?? [];
    group.push({ row, code, choice });
    groups.set(key, group);
  }

  const plan: MissedAppointmentImportPlan = {
    inserts: [], alreadyRecorded: 0, skippedForRecordedDays, recordedDaysSkipped: [...skippedDays].sort(),
    byCode: { '9100': 0, '9101': 0 }, days: [],
  };
  const days = new Set<string>();
  for (const [key, group] of groups) {
    group.sort((a, b) =>
      (a.row.primary_provider_code ?? '￿').localeCompare(b.row.primary_provider_code ?? '￿') || a.row.line - b.row.line,
    );
    group.forEach(({ row, code, choice }, i) => {
      const ordinal = i + 1;
      if (existingKeys.has(`${key}|${ordinal}`)) { plan.alreadyRecorded += 1; return; }
      plan.inserts.push({
        org_id: args.orgId, business_date: row.business_date, code, provider_name: choice.providerName,
        provider_id: choice.providerId, department: choice.department, primary_provider_code: row.primary_provider_code,
        ordinal, source: 'dentrix_import', imported_by: args.userId,
      });
      plan.byCode[code] += 1;
      days.add(row.business_date);
    });
  }
  plan.inserts.sort((a, b) => a.business_date.localeCompare(b.business_date) || a.code.localeCompare(b.code) || a.provider_name.localeCompare(b.provider_name) || a.ordinal - b.ordinal);
  plan.days = [...days].sort();
  return plan;
}

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------

export type MissedAppointmentMonthRow = {
  month: string;
  label: string;
  noShows: number;
  lateCancels: number;
  doctor: number;
  hygiene: number;
  other: number;
  total: number;
};

export type MissedAppointmentProviderRow = {
  key: string;
  providerName: string;
  department: MissedAppointmentDepartment;
  noShows: number;
  lateCancels: number;
  total: number;
};

export type MissedAppointmentTotals = {
  noShows: number;
  lateCancels: number;
  doctor: number;
  hygiene: number;
  other: number;
  total: number;
  days: number;
};

export type MissedAppointmentSummary = {
  totals: MissedAppointmentTotals;
  byMonth: MissedAppointmentMonthRow[];
  byProvider: MissedAppointmentProviderRow[];
};

/** "2025-09" → "Sep 2025". */
export function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return format(new Date(y, m - 1, 1), 'MMM yyyy');
}

export function summarizeMissedAppointments(events: MissedAppointmentEvent[]): MissedAppointmentSummary {
  const totals: MissedAppointmentTotals = { noShows: 0, lateCancels: 0, doctor: 0, hygiene: 0, other: 0, total: 0, days: 0 };
  const months = new Map<string, MissedAppointmentMonthRow>();
  const providers = new Map<string, MissedAppointmentProviderRow>();
  const days = new Set<string>();
  for (const e of events) {
    const isNoShow = e.code === '9100';
    totals.total += 1;
    if (isNoShow) totals.noShows += 1; else totals.lateCancels += 1;
    totals[e.department] += 1;
    days.add(e.business_date);

    const month = e.business_date.slice(0, 7);
    const m = months.get(month) ?? { month, label: formatMonthLabel(month), noShows: 0, lateCancels: 0, doctor: 0, hygiene: 0, other: 0, total: 0 };
    m.total += 1;
    if (isNoShow) m.noShows += 1; else m.lateCancels += 1;
    m[e.department] += 1;
    months.set(month, m);

    const key = e.provider_id ?? `name:${e.provider_name}`;
    const p = providers.get(key) ?? { key, providerName: e.provider_name, department: e.department, noShows: 0, lateCancels: 0, total: 0 };
    p.total += 1;
    if (isNoShow) p.noShows += 1; else p.lateCancels += 1;
    providers.set(key, p);
  }
  totals.days = days.size;
  return {
    totals,
    byMonth: [...months.values()].sort((a, b) => b.month.localeCompare(a.month)),
    byProvider: [...providers.values()].sort((a, b) => b.total - a.total || a.providerName.localeCompare(b.providerName)),
  };
}

export function filterMissedAppointments(events: MissedAppointmentEvent[], start?: string, end?: string): MissedAppointmentEvent[] {
  return events.filter(e => (!start || e.business_date >= start) && (!end || e.business_date <= end));
}

/** The last twelve months through today: the first of the month eleven months back, to today. */
export function defaultMissedAppointmentRange(today: string): { start: string; end: string } {
  const [y, m] = today.split('-').map(Number);
  const startIndex = y * 12 + (m - 1) - 11;
  const sy = Math.floor(startIndex / 12);
  const sm = (startIndex % 12) + 1;
  return { start: `${sy}-${String(sm).padStart(2, '0')}-01`, end: today };
}
