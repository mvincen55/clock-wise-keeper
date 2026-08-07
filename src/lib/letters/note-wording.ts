import { formatLetterDate, resolvePlaceholders } from './letter-body';
import type { CorrespondenceSettings, NoteFields } from './types';

/**
 * School / Work note wording — office-configurable templates with
 * sentence-level dropping for the optional date fields.
 *
 * The base wording lives in correspondence_settings (blank = the built-in
 * defaults below). Placeholders: {{patient_name}}, {{date_seen}},
 * {{excused_from}}, {{excused_through}}, {{return_date}}. Any SENTENCE that
 * still carries an unresolved optional-date placeholder after merging is
 * dropped whole, so "May return on ____" never prints when the front desk
 * left the return date blank.
 *
 * Patient values flow through browser memory only (src/lib/letters/types.ts).
 */

export const DEFAULT_SCHOOL_NOTE_WORDING = [
  '{{patient_name}} was seen in our office on {{date_seen}}.',
  'Please excuse this absence from school from {{excused_from}} through {{excused_through}}.',
  '{{patient_name}} may return to school on {{return_date}}.',
].join(' ');

export const DEFAULT_WORK_NOTE_WORDING = [
  '{{patient_name}} was seen in our office on {{date_seen}}.',
  'Please excuse this absence from work from {{excused_from}} through {{excused_through}}.',
  '{{patient_name}} may return to work on {{return_date}}.',
].join(' ');

export const NOTE_SALUTATION = 'To Whom It May Concern:';

/** The placeholders whose blank value drops the containing sentence. */
const OPTIONAL_DATE_KEYS = ['excused_from', 'excused_through', 'return_date'];

const tokenPattern = (key: string) => new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`);

/** Split on sentence boundaries, keeping the terminator with the sentence. */
function sentencesOf(text: string): string[] {
  return text.match(/[^.!?]+[.!?]*/g)?.map(s => s.trim()).filter(Boolean) ?? [];
}

export function noteWordingFor(
  noteFor: NoteFields['noteFor'],
  settings: Pick<CorrespondenceSettings, 'schoolNoteWording' | 'workNoteWording'>,
): string {
  if (noteFor === 'school') {
    return settings.schoolNoteWording.trim() || DEFAULT_SCHOOL_NOTE_WORDING;
  }
  return settings.workNoteWording.trim() || DEFAULT_WORK_NOTE_WORDING;
}

/**
 * Build the note body paragraphs from the office wording and the temporary
 * fields. Returns letter-markup text (paragraphs separated by blank lines).
 */
export function buildNoteBody(
  fields: NoteFields,
  settings: Pick<CorrespondenceSettings, 'schoolNoteWording' | 'workNoteWording'>,
): string {
  const wording = noteWordingFor(fields.noteFor, settings);

  // A one-day excuse only needs "from": the range collapses to that day.
  const fromISO = fields.excusedFromISO;
  const throughISO = fields.excusedThroughISO || fields.excusedFromISO;

  const values: Record<string, string> = {
    patient_name: fields.patientName.trim(),
    date_seen: fields.dateSeenISO ? formatLetterDate(fields.dateSeenISO) : '',
    excused_from: fromISO ? formatLetterDate(fromISO) : '',
    excused_through: throughISO ? formatLetterDate(throughISO) : '',
    return_date: fields.returnDateISO ? formatLetterDate(fields.returnDateISO) : '',
  };

  // Resolve, keeping unresolved tokens so sentence-dropping can see them.
  const merged = resolvePlaceholders(wording, values, { missing: 'keep' });

  const kept = sentencesOf(merged).filter(sentence => {
    return !OPTIONAL_DATE_KEYS.some(key => tokenPattern(key).test(sentence));
  });

  // "from August 7, 2026 through August 7, 2026" reads better as "on ...".
  const collapsed = kept
    .join(' ')
    .replace(/\bfrom (\w+ \d{1,2}, \d{4}) through \1\b/g, 'on $1');

  // A required field left blank (patient name / date seen) prints as a
  // written-in blank rather than a dangling token.
  const body = resolvePlaceholders(collapsed, {}, { missing: 'blank' });

  const paragraphs = [body];
  if (fields.restrictions.trim() !== '') {
    paragraphs.push(`**Restrictions / additional notes:** ${fields.restrictions.trim()}`);
  }
  return paragraphs.join('\n\n');
}
