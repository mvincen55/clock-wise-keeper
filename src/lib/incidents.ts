/**
 * Incident report vocabulary — the labels the form, the list, the
 * employee record, and the printed sheet all read from, so one wording
 * change lands everywhere.
 *
 * Workplace safety (sharps sticks, exposures, falls, chemical and
 * equipment events) plus one category the office never files by hand:
 * `attendance`, opened by the late-arrival rule when a team member's
 * unexcused late arrivals meet the office threshold. No patient
 * identifiers belong in any incident report.
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
  'attendance',
] as const;
export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];

/** Opened by the late-arrival rule, never chosen on the form. */
export const ATTENDANCE_CATEGORY: IncidentCategory = 'attendance';

/** The categories a person can file: everything but the automatic one. */
export const FILEABLE_CATEGORIES: IncidentCategory[] = INCIDENT_CATEGORIES.filter(c => c !== ATTENDANCE_CATEGORY);

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
  attendance: 'Attendance',
};

export function isAttendanceReport(report: { category: string }): boolean {
  return report.category === ATTENDANCE_CATEGORY;
}

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

export const STATUSES = [
  'open',
  'under_review',
  'closed',
  // the attendance workflow, in order
  'meeting_required',
  'meeting_completed',
  'awaiting_signatures',
] as const;
export type IncidentStatus = (typeof STATUSES)[number];

/** The statuses a manager sets by hand on a safety report. */
export const SAFETY_STATUSES: IncidentStatus[] = ['open', 'under_review', 'closed'];

/** Meeting required → Meeting completed → Awaiting signatures → Closed. */
export const ATTENDANCE_STATUSES: IncidentStatus[] = ['meeting_required', 'meeting_completed', 'awaiting_signatures', 'closed'];

export const STATUS_LABELS: Record<IncidentStatus, string> = {
  open: 'Open',
  under_review: 'Under review',
  closed: 'Closed',
  meeting_required: 'Meeting required',
  meeting_completed: 'Meeting completed',
  awaiting_signatures: 'Awaiting signatures',
};

export const STATUS_CLASSES: Record<IncidentStatus, string> = {
  open: 'bg-warning/20 text-warning',
  under_review: 'bg-accent/20 text-accent',
  closed: 'bg-success/20 text-success',
  meeting_required: 'bg-warning/20 text-warning',
  meeting_completed: 'bg-accent/20 text-accent',
  awaiting_signatures: 'bg-accent/20 text-accent',
};

/**
 * What still stands between an attendance report and closure, and whose
 * it is. Every step shows to both people; `mine` says which ones the
 * viewer can do something about. The order is the workflow's order.
 */
export type AttendanceStep = {
  key: 'meeting' | 'employee_signature' | 'manager_signature' | 'closed';
  label: string;
  done: boolean;
  owner: 'manager' | 'employee' | 'system';
  mine: boolean;
  /** When it is not done yet, why the viewer cannot do it right now (empty when they can). */
  blocked: string;
};

export type AttendanceReportLike = {
  status: string;
  meeting_recorded_at: string | null;
  employee_signed_at: string | null;
  manager_signed_at: string | null;
  closed_at?: string | null;
};

export function attendanceSteps(
  report: AttendanceReportLike,
  viewer: { isSubject: boolean; canManage: boolean }
): AttendanceStep[] {
  const meeting = !!report.meeting_recorded_at;
  const employee = !!report.employee_signed_at;
  const manager = !!report.manager_signed_at;
  const closed = report.status === 'closed';
  return [
    {
      key: 'meeting', label: 'Meeting recorded by a manager', done: meeting, owner: 'manager',
      mine: !meeting && viewer.canManage, blocked: '',
    },
    {
      key: 'employee_signature', label: 'Team member signature', done: employee, owner: 'employee',
      mine: !employee && viewer.isSubject,
      blocked: employee ? '' : meeting ? '' : 'after the meeting is recorded',
    },
    {
      key: 'manager_signature', label: 'Manager signature', done: manager, owner: 'manager',
      mine: !manager && viewer.canManage,
      blocked: manager ? '' : meeting ? '' : 'after the meeting is recorded',
    },
    { key: 'closed', label: 'Closed', done: closed, owner: 'system', mine: false, blocked: closed ? '' : 'once both signatures are on the report' },
  ];
}

/** The one line the queue and the list show: what the report waits on. */
export function attendanceWaitingOn(report: AttendanceReportLike): string {
  if (report.status === 'closed') return 'Closed';
  if (!report.meeting_recorded_at) return 'Meeting required';
  const outstanding = [
    !report.employee_signed_at ? 'team member signature' : null,
    !report.manager_signed_at ? 'manager signature' : null,
  ].filter(Boolean);
  return outstanding.length ? `Awaiting ${outstanding.join(' and ')}` : 'Closing';
}

/**
 * Signatures. A report is signed twice: the employee it happened to
 * attests to the account, then an owner or manager countersigns. Who may
 * countersign is stamped on the report when it is filed (countersign_role),
 * because it depends on the role of the person the report is ABOUT — a
 * manager's or owner's own report goes up to an owner.
 */
export const SIGNATURE_STATES = [
  'awaiting_employee',
  'awaiting_countersign',
  'complete',
] as const;
export type SignatureState = (typeof SIGNATURE_STATES)[number];

export const SIGNATURE_LABELS: Record<SignatureState, string> = {
  awaiting_employee: 'Awaiting employee signature',
  awaiting_countersign: 'Awaiting sign-off',
  complete: 'Signed',
};

export const SIGNATURE_CLASSES: Record<SignatureState, string> = {
  awaiting_employee: 'bg-warning/20 text-warning',
  awaiting_countersign: 'bg-accent/20 text-accent',
  complete: 'bg-success/20 text-success',
};

/** The two signature stamps a report carries, as the row stores them. */
export interface SignatureFields {
  employee_signed_at: string | null;
  manager_signed_at: string | null;
}

/**
 * Where the report is in the two-signature loop. The countersignature
 * finishes it — a manager may sign off on a report the employee never
 * got around to signing (someone who left, or was out sick for weeks),
 * and that still closes the loop as far as the binder is concerned.
 */
export function signatureState(report: SignatureFields): SignatureState {
  if (report.manager_signed_at) return 'complete';
  if (report.employee_signed_at) return 'awaiting_countersign';
  return 'awaiting_employee';
}

export type OrgRole = 'owner' | 'manager' | 'employee';

export interface CountersignContext {
  /** 'owner' = an owner only; 'manager' = any owner or manager. */
  countersignRole: string;
  /** The signed-in user's role in the org. */
  viewerRole: OrgRole | undefined;
  /** Is the signed-in user the person the report is about? */
  viewerIsSubject: boolean;
  /** Has the countersignature already been given? */
  alreadySigned: boolean;
  /** Active owners in the org other than the report's subject. */
  otherOwnerCount: number;
  /** Attendance reports only: the meeting must be on record and the report open. */
  attendance?: { meetingRecorded: boolean; closed: boolean };
}

export interface CountersignVerdict {
  canSign: boolean;
  /** Why not, in the words the panel shows. Empty when they can sign. */
  reason: string;
}

/**
 * Mirrors countersign_incident_report() in the database, so the panel
 * only offers a signature the server will actually accept. The server
 * decides; this decides what to draw.
 */
export function countersignEligibility(ctx: CountersignContext): CountersignVerdict {
  if (ctx.alreadySigned) return { canSign: false, reason: 'Already signed off.' };
  if (ctx.attendance?.closed) return { canSign: false, reason: 'This report is closed.' };

  if (ctx.viewerRole !== 'owner' && ctx.viewerRole !== 'manager') {
    return { canSign: false, reason: 'An owner or manager signs off on incident reports.' };
  }

  if (ctx.viewerIsSubject) {
    return {
      canSign: false,
      reason: 'This report is about you — someone else has to sign off on it.',
    };
  }

  // A report about a manager or an owner goes up to an owner. The one
  // give: if the subject is the only owner there is nobody senior left,
  // so any other admin may sign rather than strand the report.
  if (ctx.countersignRole === 'owner' && ctx.viewerRole !== 'owner' && ctx.otherOwnerCount > 0) {
    return {
      canSign: false,
      reason: 'This report is about a manager or an owner — an owner has to sign it off.',
    };
  }

  if (ctx.attendance && !ctx.attendance.meetingRecorded) {
    return { canSign: false, reason: 'Record the meeting first; signatures follow it.' };
  }

  return { canSign: true, reason: '' };
}

/** 'Signed by Dana Reyes · Jul 28, 2026 at 2:45 PM' for a stamped time. */
export function formatSignedAt(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  });
  const time = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  });
  return `${date} at ${time}`;
}

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
