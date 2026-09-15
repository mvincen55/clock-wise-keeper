/**
 * Live fields in handbook text (pure, testable).
 *
 * An office writes `{{fee D0120 | $65}}` or `{{setting broken_appointments.fee | $75}}`
 * in its handbook and the reader shows the current value from the office
 * fee schedule or the Broken Appointments settings, falling back to the
 * text after the bar when the value is unavailable. Fees can name a pair or
 * a range exactly as a reference table does ("D4341 / D4342", "D2391 - D2394").
 */
import { codesInCell, formatFee, liveFeeLabel, type FeeByCode } from '@/lib/handbook-fees';

export type LiveField =
  | { kind: 'fee'; codes: string[]; fallback: string }
  | { kind: 'setting'; key: LiveSettingKey; fallback: string };

export type LiveSettingKey =
  | 'broken_appointments.fee'
  | 'broken_appointments.notice_hours'
  | 'broken_appointments.prepay_floor'
  | 'broken_appointments.history_years';

export const LIVE_SETTING_KEYS: LiveSettingKey[] = [
  'broken_appointments.fee',
  'broken_appointments.notice_hours',
  'broken_appointments.prepay_floor',
  'broken_appointments.history_years',
];

/** Values a reader can supply; anything missing falls back to the text. */
export interface LiveValues {
  fees?: FeeByCode | null;
  settings?: {
    feeAmount: number;
    noticeBusinessHours: number;
    vipPrepayFloor: number;
    historyWindowYears: number;
  } | null;
}

export const LIVE_FIELD = /\{\{\s*(fee|setting)\s+([^{}|]+?)\s*(?:\|\s*([^{}]*?)\s*)?\}\}/i;
const LIVE_FIELD_GLOBAL = new RegExp(LIVE_FIELD.source, 'gi');

/** Split text into plain strings and live fields, in order. */
export function splitLiveFields(text: string): (string | LiveField)[] {
  const parts: (string | LiveField)[] = [];
  let last = 0;
  for (const match of text.matchAll(LIVE_FIELD_GLOBAL)) {
    const field = parseLiveField(match[0]);
    if (!field) continue;
    if (match.index! > last) parts.push(text.slice(last, match.index));
    parts.push(field);
    last = match.index! + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function parseLiveField(token: string): LiveField | null {
  const match = token.match(LIVE_FIELD);
  if (!match) return null;
  const fallback = (match[3] ?? '').trim();
  if (match[1].toLowerCase() === 'fee') {
    const codes = codesInCell(match[2]);
    return codes.length > 0 ? { kind: 'fee', codes, fallback } : null;
  }
  const key = match[2].trim().toLowerCase() as LiveSettingKey;
  return LIVE_SETTING_KEYS.includes(key) ? { kind: 'setting', key, fallback } : null;
}

/** The current value, or null when the office has not supplied one. */
export function resolveLiveField(field: LiveField, values: LiveValues): string | null {
  if (field.kind === 'fee') return values.fees ? liveFeeLabel(field.codes, values.fees) : null;
  const settings = values.settings;
  if (!settings) return null;
  switch (field.key) {
    case 'broken_appointments.fee': return formatFee(Math.round(settings.feeAmount * 100));
    case 'broken_appointments.notice_hours': return String(settings.noticeBusinessHours);
    case 'broken_appointments.prepay_floor': return formatFee(Math.round(settings.vipPrepayFloor * 100));
    case 'broken_appointments.history_years': return String(settings.historyWindowYears);
  }
}

/** What the value is, for a tooltip. */
export function describeLiveField(field: LiveField): string {
  if (field.kind === 'fee') return `Current office fee for ${field.codes.join(', ')}, from the fee schedule`;
  const label: Record<LiveSettingKey, string> = {
    'broken_appointments.fee': 'Broken appointment fee, from the Broken Appointments settings',
    'broken_appointments.notice_hours': 'Notice required, in business hours, from the Broken Appointments settings',
    'broken_appointments.prepay_floor': 'VIP prepayment floor, from the Broken Appointments settings',
    'broken_appointments.history_years': 'History window, in years, from the Broken Appointments settings',
  };
  return label[field.key];
}

/** Plain text with every live field replaced by its fallback: for search and excerpts. */
export function stripLiveFields(text: string): string {
  return text.replace(LIVE_FIELD_GLOBAL, (token) => parseLiveField(token)?.fallback ?? '');
}
