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

/** Assemble the request from visit-grouped CODES and safe slot labels. */
export function buildNameVisitsPayload(
  visitCodes: string[][],
  safeSlots: string[]
): NameVisitsPayload {
  return {
    slots: safeSlots,
    visits: visitCodes.map(codes => ({
      procedures: codes
        .map(safeProcedureLabel)
        .filter((label): label is string => label !== null),
    })),
  };
}
