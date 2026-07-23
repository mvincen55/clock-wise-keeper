/**
 * De-identified payload for the name-visits AI function.
 *
 * HIPAA boundary: the practice has no BAA covering the AI gateway, so the
 * request may contain ONLY auto-generated wording. Everything here derives
 * from CDT codes — the builder takes codes (not builder lines), so
 * staff-typed descriptions, patient fields, and edited labels cannot leak
 * in by construction. Slot labels passed in must themselves come from the
 * code-derived safe labels (see visitWork's safeLabel in FofBuilder).
 */
import { friendlyCdtName } from './cdt-names';

export interface NameVisitsPayload {
  slots: string[];
  visits: { procedures: string[] }[];
}

/** A visit entry: bare code, or code + tooth (tooth is validated below). */
export type NameVisitsEntry = string | { code: string; tooth: string };

/**
 * De-identified wording for a procedure: the friendly CDT name when one
 * exists, otherwise the bare code. Never staff-typed text; a code-less
 * line has no safe wording and returns null (dropped from AI payloads).
 */
export function safeProcedureLabel(code: string): string | null {
  const trimmed = code.trim();
  if (!trimmed) return null;
  return friendlyCdtName(trimmed) || trimmed.toUpperCase();
}

// A tooth token is 1-32 (permanent) or a single letter A-T (primary);
// ranges/pairs may join two tokens with "-" or "*" (PMS style). Anything
// else — including any free text typed into the tooth box — fails the
// pattern and is dropped, so the tooth field can never smuggle PHI.
const TOOTH_TOKEN = '([1-9][0-9]?|[A-Ta-t])';
const TOOTH_RE = new RegExp(`^${TOOTH_TOKEN}([*-]${TOOTH_TOKEN})?$`);

/** Validated tooth wording ("tooth #30") or null when unsafe/blank. */
export function safeToothSuffix(tooth: string): string | null {
  const trimmed = tooth.trim();
  if (!trimmed || !TOOTH_RE.test(trimmed)) return null;
  return `(tooth #${trimmed.toUpperCase()})`;
}

/** Dentures/partials carry the arch in their name — no tooth numbers. */
const isDentureCode = (code: string): boolean => {
  const m = /^D(\d{4})$/i.exec(code.trim());
  return m !== null && +m[1] >= 5000 && +m[1] < 5900;
};

/**
 * Assemble the request from visit-grouped CODES (optionally with tooth
 * numbers) and safe slot labels. Entries may be bare code strings or
 * {code, tooth}; the tooth only rides along when it matches the strict
 * tooth-number pattern, and never on denture codes.
 */
export function buildNameVisitsPayload(
  visitEntries: NameVisitsEntry[][],
  safeSlots: string[]
): NameVisitsPayload {
  return {
    slots: safeSlots,
    visits: visitEntries.map(entries => ({
      procedures: entries
        .map(entry => {
          const code = typeof entry === 'string' ? entry : entry.code;
          const label = safeProcedureLabel(code);
          if (label === null) return null;
          const tooth =
            typeof entry === 'string' || isDentureCode(code)
              ? null
              : safeToothSuffix(entry.tooth);
          return tooth ? `${label} ${tooth}` : label;
        })
        .filter((label): label is string => label !== null),
    })),
  };
}
