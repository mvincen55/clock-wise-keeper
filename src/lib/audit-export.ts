import { formatTime, getAppTimezone } from '@/lib/time-utils';
import { auditReason, describeAuditEvent, effectiveEventType, type AuditLike } from '@/lib/audit-summary';
import { staffCodeLabel } from '@/lib/staff-code';

export type AuditExportEvent = AuditLike & {
  event_type: string;
  created_at: string;
  actor_id: string | null;
  user_id?: string | null;
  employee_id?: string | null;
};

/** Staff codes by employee id and by login id; people are never named. */
export type AuditCodeMaps = { byEmployee: ReadonlyMap<string, string>; byUser: ReadonlyMap<string, string> };

/** Human-readable event type labels */
export function eventTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    clock_in: 'Clock In',
    clock_out: 'Clock Out',
    break_start: 'Break Start',
    break_end: 'Break End',
    manual_edit: 'Manual Edit',
    punch_edit: 'Punch Edit',
    punch_added: 'Punch Added',
    punch_added_manually: 'Punch Added Manually',
    punch_deleted: 'Punch Deleted',
    punch_voided: 'Punch Removed',
    punch_created: 'Punch Recorded',
    time_fix: 'Time Fix',
    system_adjustment: 'System Adjustment',
    day_off_added: 'Day Off Added',
    day_off_removed: 'Day Off Removed',
    comment_edit: 'Comment Edit',
    remote_toggle: 'Remote Toggle',
    request_create: 'Request Created',
    request_approved: 'Request Approved',
    request_denied: 'Request Denied',
  };
  return labels[type] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** Try to format a value as a human-readable time if it looks like an ISO timestamp */
export function formatAuditValue(val: unknown): string {
  if (val == null) return '—';
  if (typeof val === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(val)) return formatTime(val);
    if (/^\d{2}:\d{2}(:\d{2})?$/.test(val)) {
      const [h, m] = val.split(':').map(Number);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
    }
    return val;
  }
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if (obj.punch_time) return formatTime(String(obj.punch_time));
    const keys = Object.keys(obj);
    if (keys.length <= 3) return keys.map(k => `${k}: ${formatAuditValue(obj[k])}`).join(', ');
    return keys.length + ' fields changed';
  }
  return String(val);
}

/** The staff code of the employee an audit row is about, and of whoever acted (null = the system). */
export function auditCodes(a: AuditExportEvent, codes: AuditCodeMaps): { employee: string; actor: string | null } {
  const employee = staffCodeLabel(
    (a.employee_id && codes.byEmployee.get(a.employee_id)) || (a.user_id && codes.byUser.get(a.user_id)) || null);
  const actor = a.actor_id ? staffCodeLabel(codes.byUser.get(a.actor_id)) : null;
  return { employee, actor };
}

export type AuditCsvRow = {
  date: string; time: string; employee: string; event: string; what: string; by: string; reason: string;
};

/**
 * One row per audit event, described in plain English and attributed by
 * staff code only. A void the DB trigger logged as a punch_edit is reported
 * as a removal with its void reason; a write that changed nothing says so.
 */
export function auditCsvRows(events: AuditExportEvent[], codes: AuditCodeMaps): AuditCsvRow[] {
  const tz = getAppTimezone();
  return events.map(a => {
    const ts = new Date(a.created_at);
    const names = auditCodes(a, codes);
    return {
      date: ts.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: tz }),
      time: ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: tz }),
      employee: names.employee,
      event: eventTypeLabel(effectiveEventType(a)),
      what: describeAuditEvent(a, names),
      by: names.actor || 'System',
      reason: auditReason(a) || '',
    };
  });
}

function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function buildAuditCsv(events: AuditExportEvent[], codes: AuditCodeMaps): string {
  const header = ['Date', 'Time', 'Employee', 'Event', 'What happened', 'By', 'Reason'];
  const lines = auditCsvRows(events, codes).map(r =>
    [r.date, r.time, r.employee, r.event, r.what, r.by, r.reason].map(escapeCsv).join(','));
  return [header.join(','), ...lines].join('\n');
}
