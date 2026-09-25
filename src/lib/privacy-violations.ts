import type { PrivacyViolationKind } from '@/lib/schedule-reader/types';

/**
 * What a refused capture looked like, by kind. The reader reports kinds and
 * counts only — never the matched text — so this is all it can say, and it
 * is enough to tell a privacy view that is off from a reader that misread.
 */
const VIOLATION_LABELS: Record<PrivacyViolationKind, string> = {
  full_name: 'name-shaped text',
  initials_with_context: 'initials beside other details',
  phone_number: 'a phone number',
  date_of_birth: 'a date of birth',
  email_address: 'an email address',
  account_number: 'an account or chart number',
  insurance_identifier: 'an insurance identifier',
  long_free_text: 'a long free-text note',
  clinical_narrative: 'clinical wording',
  street_address: 'a street address',
};

/** "name-shaped text ×4, a long free-text note" from the reader's "full_name:4,long_free_text:1". */
export function describeViolations(kinds: string | undefined): string | null {
  if (!kinds) return null;
  const parts = kinds.split(',').map(entry => {
    const [kind, count] = entry.split(':');
    const label = VIOLATION_LABELS[kind as PrivacyViolationKind] ?? kind.replace(/_/g, ' ');
    const n = Number(count);
    return n > 1 ? `${label} ×${n}` : label;
  });
  return parts.length ? parts.join(', ') : null;
}
