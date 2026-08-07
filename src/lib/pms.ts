/**
 * Canonical Practice Management System registry. The office's PMS is ONE
 * setting (org_practice_settings.pms_system) that any feature may consult;
 * per-PMS knowledge (where staff find a screen, how its panels read) lives
 * here as a profile so support for another PMS is added by writing a new
 * profile — never by branching feature code on magic strings.
 *
 * Business configuration only. Nothing in this module touches patient data.
 */

export const PMS_SYSTEMS = [
  'dentrix',
  'open_dental',
  'eaglesoft',
  'curve',
  'denticon',
  'other',
  'not_configured',
] as const;

export type PmsSystem = (typeof PMS_SYSTEMS)[number];

export const PMS_LABELS: Record<PmsSystem, string> = {
  dentrix: 'Dentrix',
  open_dental: 'Open Dental',
  eaglesoft: 'Eaglesoft',
  curve: 'Curve',
  denticon: 'Denticon',
  other: 'Other',
  not_configured: 'Not configured',
};

export function normalizePmsSystem(value: string | null | undefined): PmsSystem {
  return (PMS_SYSTEMS as readonly string[]).includes(value ?? '')
    ? (value as PmsSystem)
    : 'not_configured';
}

/** What a capture assistant can be pointed at inside a PMS screen. */
export type PmsCaptureTarget = 'address' | 'appointments' | 'current_appointment';

/**
 * A PMS the capture assistant knows by sight: where the useful screen is
 * and, per target, which small panel to bring on screen. Kept to a few
 * short lines on purpose — staff need to know where to click, not read a
 * training manual.
 */
export interface PmsCaptureProfile {
  pms: PmsSystem;
  /** e.g. "Dentrix" — used in button labels ("Capture from Dentrix"). */
  shortName: string;
  /** How to reach the screen the panels live on. */
  openSteps: string[];
  /** Per-target: which exact panel to position on screen (capture only that). */
  targetHints: Record<PmsCaptureTarget, string>;
}

/**
 * Dentrix — the first PMS-specific implementation. The Address panel and
 * Appointments table both live on the Appointment Book's "More Information"
 * window (the blue "i" toolbar button).
 */
export const DENTRIX_CAPTURE_PROFILE: PmsCaptureProfile = {
  pms: 'dentrix',
  shortName: 'Dentrix',
  openSteps: [
    'Open the patient in Dentrix.',
    'In the Appointment Book, click the blue “i” (More Information) button in the top toolbar.',
    'The patient’s More Information window opens.',
  ],
  targetHints: {
    address: 'Position only the small Address panel on screen — not the whole Personal Information section.',
    appointments: 'Position only the Appointments table on screen.',
    current_appointment: 'Position only the row for today’s appointment in the Appointments table.',
  },
};

const CAPTURE_PROFILES: Partial<Record<PmsSystem, PmsCaptureProfile>> = {
  dentrix: DENTRIX_CAPTURE_PROFILE,
};

/**
 * The capture profile for an office's PMS, or null when Purple Envelope has
 * no layout knowledge for it. A null profile means: no PMS-specific help,
 * no PMS-named buttons, no layout assumptions — generic screenshot/paste
 * OCR may still be offered, and manual entry always works.
 */
export function pmsCaptureProfile(pms: PmsSystem): PmsCaptureProfile | null {
  return CAPTURE_PROFILES[pms] ?? null;
}
