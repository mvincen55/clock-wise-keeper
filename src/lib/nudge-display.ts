import { CATEGORY_LABELS } from '@/lib/incidents';
import { formatDate } from '@/lib/time-utils';

/**
 * Nudge display vocabulary — turns the machine data a nudge carries
 * (snake_case kinds, category codes, row ids, ISO dates) into the words
 * and links a member actually reads. The raw data stays in data_refs;
 * this only decides what to draw and where a tap should land.
 */

export type NudgeLike = {
  kind: string;
  surface?: string | null;
  data_refs?: Record<string, unknown> | null;
};

/** Where a nudge takes you when tapped, and the words on the way in. */
export type NudgeDestination = { to: string; label: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refString(refs: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = refs[key];
    if (typeof v === 'string' && v) return v;
  }
  return null;
}

const SURFACE_ROUTES: Record<string, NudgeDestination> = {
  dashboard: { to: '/', label: 'Open your dashboard' },
  clock: { to: '/timesheet', label: 'Open your timesheet' },
  checklists: { to: '/checklists', label: 'Open checklists' },
  goals: { to: '/goals', label: 'Open your goals' },
  training: { to: '/training?tab=mine', label: 'Open your training' },
  huddle: { to: '/morning-huddle', label: 'Open the morning huddle' },
  deposit: { to: '/deposit-log', label: 'Open Close the Day' },
};

/**
 * Every nudge should open the record it is about. Most specific wins:
 * a cited row id beats the kind, the kind beats the surface the nudge
 * was aimed at. Null only when nothing at all can be resolved.
 */
export function nudgeDestination(nudge: NudgeLike): NudgeDestination | null {
  const refs = nudge.data_refs ?? {};
  const kind = nudge.kind ?? '';

  const incidentId = refString(refs, 'incident_id', 'incident_report_id', 'report_id');
  if (incidentId || kind.startsWith('incident')) {
    return {
      to:
        incidentId && UUID_RE.test(incidentId)
          ? `/incident-reports?report=${incidentId}`
          : '/incident-reports',
      label: 'Open the incident report',
    };
  }
  if (kind.startsWith('training')) return { to: '/training?tab=mine', label: 'Open your training' };
  if (kind.startsWith('goal') || kind.startsWith('plan') || typeof refs.goal_id === 'string') {
    return { to: '/goals', label: 'Open your goals' };
  }
  if (kind.startsWith('sprint')) return { to: '/', label: 'See the sprint on your dashboard' };
  if (kind.startsWith('close_day') || kind.startsWith('deposit')) {
    return { to: '/deposit-log', label: 'Open Close the Day' };
  }
  if (kind.startsWith('checklist')) return { to: '/checklists', label: 'Open checklists' };
  if (kind.startsWith('huddle')) return { to: '/morning-huddle', label: 'Open the morning huddle' };

  return SURFACE_ROUTES[nudge.surface ?? ''] ?? null;
}

/**
 * Row ids are for the link, never for the eye. An entry is an id when
 * its key says so or its value is a UUID, whatever the key is called.
 */
export function isIdRef(key: string, value: unknown): boolean {
  if (/(^|_)(id|uuid|ref)$/i.test(key)) return true;
  return typeof value === 'string' && UUID_RE.test(value);
}

/** 'incident_date' → 'Incident date'. */
export function humanizeKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}

/** Known value codes → the same wording the rest of the app uses. */
const VALUE_LABELS: Record<string, string> = { ...CATEGORY_LABELS };

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const SNAKE_TOKEN_RE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/i;

/** One recorded value, in words: codes spelled out, dates as dates. */
export function humanizeValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(humanizeValue).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  const text = String(value);
  const known = VALUE_LABELS[text.toLowerCase()];
  if (known) return known;
  if (DATE_ONLY_RE.test(text) || TIMESTAMP_RE.test(text)) return formatDate(text);
  if (SNAKE_TOKEN_RE.test(text)) {
    const spaced = text.replace(/_/g, ' ');
    return spaced.replace(/^./, c => c.toUpperCase());
  }
  return text;
}

const SNAKE_IN_PROSE_RE = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/gi;

/**
 * Nudge sentences are written by machines and sometimes quote their own
 * codes — "(sharps_injury)". Spell those out in place; leave prose alone.
 */
export function humanizeText(text: string): string {
  return text.replace(SNAKE_IN_PROSE_RE, token => VALUE_LABELS[token.toLowerCase()] ?? token.replace(/_/g, ' '));
}
