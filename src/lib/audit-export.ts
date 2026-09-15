import { formatTime, getAppTimezone } from '@/lib/time-utils';
import { auditFieldChanges, auditReason, effectiveEventType, hasBeforeAndAfter, isNoOpUpdate, type AuditLike } from '@/lib/audit-summary';

export type AuditExportEvent = AuditLike & {
  event_type: string;
  created_at: string;
  actor_id: string | null;
};

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
    punch_voided: 'Punch Voided',
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

export type AuditCsvRow = {
  date: string; time: string; event: string; field: string; before: string; after: string; actor: string; reason: string;
};

/**
 * One CSV row per changed field. An update that changed nothing the audit
 * tracks is reported as "No change" rather than as a time "edited" to
 * itself; a void logged by the DB trigger as a punch_edit is reported as a
 * Punch Voided with its void reason.
 */
export function auditCsvRows(events: AuditExportEvent[], actorNames: Map<string, string>): AuditCsvRow[] {
  const tz = getAppTimezone();
  const rows: AuditCsvRow[] = [];
  for (const a of events) {
    const ts = new Date(a.created_at);
    const base = {
      date: ts.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: tz }),
      time: ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: tz }),
      event: eventTypeLabel(effectiveEventType(a)),
      actor: actorNames.get(a.actor_id || '') || 'System',
      reason: auditReason(a) || '',
    };
    // Per-field rows only for updates; an insert or delete stays one row.
    const details = (a.event_details && typeof a.event_details === 'object' ? a.event_details : {}) as Record<string, unknown>;
    const changes = hasBeforeAndAfter(a) || details.field_changed ? auditFieldChanges(a) : [];
    if (changes.length) {
      for (const c of changes) rows.push({ ...base, field: c.field, before: c.before, after: c.after });
    } else if (isNoOpUpdate(a)) {
      rows.push({ ...base, field: 'No change', before: '—', after: '—' });
    } else {
      rows.push({
        ...base,
        field: details.field_changed ? String(details.field_changed).replace(/_/g, ' ') : '',
        before: formatAuditValue(details.old_value ?? a.before_json),
        after: formatAuditValue(details.new_value ?? a.after_json),
      });
    }
  }
  return rows;
}

function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function buildAuditCsv(events: AuditExportEvent[], actorNames: Map<string, string>): string {
  const header = ['Date', 'Time', 'Event', 'Field', 'Before', 'After', 'Actor', 'Reason'];
  const lines = auditCsvRows(events, actorNames).map(r =>
    [r.date, r.time, r.event, r.field, r.before, r.after, r.actor, r.reason].map(escapeCsv).join(','));
  return [header.join(','), ...lines].join('\n');
}
