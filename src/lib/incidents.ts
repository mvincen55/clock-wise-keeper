/**
 * Incident report vocabulary — the labels the form, the list, the
 * employee record, and the printed sheet all read from, so one wording
 * change lands everywhere.
 *
 * Workplace safety only: sharps sticks, exposures, falls, chemical and
 * equipment events. No patient identifiers belong in an incident report.
 */

export const INCIDENT_CATEGORIES = [
  'sharps_injury',
  'blood_body_fluid_exposure',
  'slip_trip_fall',
  'chemical_exposure',
  'equipment_malfunction',
  'patient_related',
  'ergonomic_strain',
  'illness',
  'other',
] as const;
export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<IncidentCategory, string> = {
  sharps_injury: 'Sharps / needlestick',
  blood_body_fluid_exposure: 'Blood or body fluid exposure',
  slip_trip_fall: 'Slip, trip, or fall',
  chemical_exposure: 'Chemical exposure',
  equipment_malfunction: 'Equipment malfunction',
  patient_related: 'Patient-related event',
  ergonomic_strain: 'Strain or ergonomic injury',
  illness: 'Illness',
  other: 'Other',
};

/** Categories where the device/instrument line is the point of the record. */
export const DEVICE_CATEGORIES: IncidentCategory[] = [
  'sharps_injury',
  'blood_body_fluid_exposure',
  'equipment_malfunction',
];

export const SEVERITIES = ['minor', 'moderate', 'severe'] as const;
export type IncidentSeverity = (typeof SEVERITIES)[number];

export const SEVERITY_LABELS: Record<IncidentSeverity, string> = {
  minor: 'Minor',
  moderate: 'Moderate',
  severe: 'Severe',
};

export const SEVERITY_CLASSES: Record<IncidentSeverity, string> = {
  minor: 'bg-muted text-muted-foreground',
  moderate: 'bg-warning/20 text-warning',
  severe: 'bg-destructive/20 text-destructive',
};

export const PPE_OPTIONS = ['yes', 'no', 'partial', 'unknown', 'na'] as const;
export type PpeWorn = (typeof PPE_OPTIONS)[number];

export const PPE_LABELS: Record<PpeWorn, string> = {
  yes: 'Yes',
  no: 'No',
  partial: 'Partial',
  unknown: 'Not sure',
  na: 'Not applicable',
};

export const TREATMENTS = [
  'none',
  'first_aid',
  'provider_visit',
  'emergency_room',
  'declined',
  'pending',
] as const;
export type MedicalTreatment = (typeof TREATMENTS)[number];

export const TREATMENT_LABELS: Record<MedicalTreatment, string> = {
  none: 'None needed',
  first_aid: 'First aid on site',
  provider_visit: 'Saw a provider',
  emergency_room: 'Emergency room / urgent care',
  declined: 'Treatment declined',
  pending: 'Still to be arranged',
};

export const STATUSES = ['open', 'under_review', 'closed'] as const;
export type IncidentStatus = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<IncidentStatus, string> = {
  open: 'Open',
  under_review: 'Under review',
  closed: 'Closed',
};

export const STATUS_CLASSES: Record<IncidentStatus, string> = {
  open: 'bg-warning/20 text-warning',
  under_review: 'bg-accent/20 text-accent',
  closed: 'bg-success/20 text-success',
};

/** Safe lookup for a value that came back from the database as plain text. */
export function labelFor<T extends string>(
  labels: Record<T, string>,
  value: string | null | undefined,
  fallback = '—'
): string {
  if (!value) return fallback;
  return (labels as Record<string, string>)[value] ?? value;
}

/** 'HH:MM:SS' or 'HH:MM' from a time column → '2:45 PM'. Empty when unset. */
export function formatClockTime(time: string | null | undefined): string {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return '';
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** Yesterday's calendar date in America/New_York as YYYY-MM-DD. */
export function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}
