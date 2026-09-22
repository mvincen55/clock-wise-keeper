// Read-only evidence shared by the count, analyst, and auditor. The caller is
// an authenticated manager; use their RLS client, never the service-role client.
export type Row = {
  id: string; employee_id?: string | null; subject_employee_id?: string | null;
  user_id?: string | null; subject_user_id?: string | null; completed_by?: string;
  display_name?: string; preferred_name?: string | null; employee_name?: string;
  completed_by_name?: string; entry_date?: string; date_start?: string; date_end?: string;
  exception_date?: string; checklist_date?: string; period_start?: string; period_end?: string;
  item_id?: string; checklist_id?: string; owner_user_id?: string | null;
  name?: string; title?: string; cadence?: string; period_key?: string; completed_at?: string;
  type?: string; kind?: string; status?: string; summary?: string; reason?: string | null;
  notes?: string | null; entry_comment?: string | null; reason_text?: string | null;
  member_reason?: string | null; manager_note?: string | null; closed_at?: string | null;
  review_due_at?: string | null; resolution_action?: string | null;
  total_minutes?: number | null; hours?: number | null; minutes_late?: number;
  incomplete_count?: number; resolved?: boolean; per_person?: boolean;
  office_closed?: boolean; is_scheduled_day?: boolean; has_punches?: boolean;
  has_day_off?: boolean; is_late?: boolean; is_absent?: boolean; is_incomplete?: boolean;
  has_edits?: boolean; timezone_suspect?: boolean; tardy_approval_status?: string;
  schedule_expected_start?: string | null; schedule_expected_end?: string | null;
  // punches
  time_entry_id?: string; punch_time?: string; punch_type?: string;
  // provider_day_metrics (schedule captures: aggregates only, never appointment text)
  provider_label?: string; business_date?: string; review_status?: string;
  first_patient_minute?: number | null; last_patient_minute?: number | null;
  available_start_minute?: number | null; available_end_minute?: number | null;
  scheduled_minutes?: number | null; net_bookable_minutes?: number | null; true_open_minutes?: number | null;
  // org_practice_settings
  timezone?: string | null;
};
type Query = {
  select(columns: string): Query; eq(column: string,value: unknown): Query;
  gte(column: string,value: string): Query; lte(column: string,value: string): Query;
  order(column: string,options?: {ascending: boolean}): Query;
  or(filter: string): Query; is(column: string,value: null): Query;
  limit(count: number): PromiseLike<{data: Row[] | null; error: unknown}>;
};
export type EvidenceDb = {from(table: string): {select(columns: string): Query}};
export type Source = 'all' | 'attendance' | 'checklists' | 'accountability';
export type Evidence = {
  id: string; source_id: string; source_table: string; who: string; person_key: string;
  kind: string; kind_label: string; period_start: string; period_end: string;
  status: string; summary: string; member_reason: string | null;
  manager_note: string | null; closed_at: string | null;
};
export const EVIDENCE_VERSION = 2;
const ROW_LIMIT = 1000;
const LABELS: Record<string, string> = {
  attendance: 'Attendance days', days_off: 'Days off', attendance_exceptions: 'Attendance exceptions',
  checklist_completions: 'Checklist completions', checklist_bypasses: 'Checklist bypasses',
  accountability: 'Accountability reports', schedule_days: 'Schedule captures',
};
/** Minutes from midnight as a clock reading, e.g. 1020 → "5:00 PM". */
export function clockLabel(minutes: number | null | undefined): string | null {
  if (minutes == null || !Number.isFinite(minutes)) return null;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 && h < 24 ? 'PM' : 'AM'}`;
}
/** An instant as the office's wall clock, e.g. "6:02 PM"; empty when unreadable. */
export function wallClock(iso: string | undefined, timeZone: string): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return '';
  try { return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(iso)); }
  catch { return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(new Date(iso)); }
}
export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
}
export function periodRange(key: string): [string, string] | null {
  if (validDate(key)) return [key, key];
  if (key.startsWith('week-') && validDate(key.slice(5))) {
    const d = new Date(key.slice(5) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 6);
    return [key.slice(5), d.toISOString().slice(0, 10)];
  }
  if (/^\d{4}-\d{2}$/.test(key) && validDate(key + '-01')) {
    const [y, m] = key.split('-').map(Number);
    return [key + '-01', new Date(Date.UTC(y, m, 0, 12)).toISOString().slice(0, 10)];
  }
  if (/^\d{4}$/.test(key) && validDate(key + '-01-01')) return [key + '-01-01', key + '-12-31'];
  return null;
}
export function overlaps(start: string, end: string, from: string, to: string) {
  return (!from || end >= from) && (!to || start <= to);
}
export function evidenceLine(r: Evidence): string {
  return `[rec:${r.id}] ${r.who.split(' ')[0]} (${r.person_key}) | ${r.kind_label} | ${r.period_start} to ${r.period_end} | ${r.status}\n${r.summary}` +
    (r.member_reason ? `\nRecorded reason: ${r.member_reason}` : '') +
    (r.manager_note ? `\nReviewer note: ${r.manager_note}` : '');
}
// ai-safe scrubs at most 20,000 characters per message. Keep complete records
// in smaller chunks so the wire scrubber cannot silently drop later evidence.
export function evidenceChunks(records: Evidence[], max = 16000): string[] {
  const chunks: string[] = []; let current = '';
  for (const row of records) {
    const line = evidenceLine(row);
    if (current && current.length + line.length + 2 > max) { chunks.push(current); current = ''; }
    current += (current ? '\n\n' : '') + line;
  }
  if (current) chunks.push(current);
  return chunks;
}
// Alphabetic citation keys cannot be mistaken for phone numbers by the PHI scrubber.
// The original UUID stays in source_id for opening the real row.
export const citationKey = (table: string, id: string) => `${table}:${id.replace(/-/g,'').replace(/[0-9a-f]/gi, c => String.fromCharCode(97 + parseInt(c,16)))}`;
const short = (v: unknown, max = 700) => v == null ? '' : String(v).slice(0, max);
const identity = (r: Row) => `${r.employee_id || r.user_id}:${r.entry_date}`;

export function normalizeEvidence(data: Record<string, Row[]>, from: string, to: string, employeeId?: string): Evidence[] {
  const employees = data.employees || [];
  const byId = new Map(employees.map(e => [e.id, e]));
  const byUser = new Map(employees.filter(e => e.user_id).map(e => [e.user_id, e]));
  const owners = new Set((data.owners || []).map(o => o.user_id));
  const target = employeeId ? byId.get(employeeId) : undefined;
  const person = (r: Row) => byId.get(r.employee_id || r.subject_employee_id || '') || byUser.get(r.user_id || r.subject_user_id || r.completed_by);
  const matches = (r: Row) => !employeeId || r.employee_id === employeeId || r.subject_employee_id === employeeId ||
    (!!target?.user_id && [r.user_id, r.subject_user_id, r.completed_by].includes(target.user_id));
  const name = (r: Row) => short(person(r)?.preferred_name || person(r)?.display_name || r.completed_by_name || r.employee_name || 'Team member', 100);
  const out: Evidence[] = [];
  function add(table: string, r: Row, kind: string, start: string | undefined, end: string | undefined, status: string | undefined, summary: string, reason?: unknown, note?: unknown) {
    if (!r.id || !start || !end || !validDate(start) || !validDate(end) || !matches(r) || !overlaps(start, end, from, to)) return;
    out.push({id: citationKey(table, r.id), source_id: r.id, source_table: table, who: name(r),
      person_key: citationKey('person', person(r)?.id || r.user_id || r.completed_by || r.id), kind,
      kind_label: LABELS[kind] || kind.replace(/_/g, ' '), period_start: start, period_end: end,
      status: status || 'unknown', summary: short(summary, 1800), member_reason: short(reason) || null,
      manager_note: short(note) || null, closed_at: r.closed_at || null});
  }
  const statuses = new Map((data.attendance_day_status || []).map(r => [identity(r), r]));
  const seen = new Set<string>();
  const daysOff = data.days_off || [];
  const timeZone = short(data.org_practice_settings?.[0]?.timezone, 60) || 'America/New_York';
  // The clock, per attendance day: first in and last out of that day's entry.
  const punchesByEntry = new Map<string, Row[]>();
  for (const p of [...(data.punches || [])].sort((a, b) => String(a.punch_time).localeCompare(String(b.punch_time)))) {
    if (p.time_entry_id) punchesByEntry.set(p.time_entry_id, [...(punchesByEntry.get(p.time_entry_id) ?? []), p]);
  }
  // The office's own schedule, per day: what the capture read off the posted grid.
  const scheduleByDate = new Map<string, Row[]>();
  for (const s of data.provider_day_metrics || []) {
    if (s.business_date && validDate(s.business_date)) scheduleByDate.set(s.business_date, [...(scheduleByDate.get(s.business_date) ?? []), s]);
  }
  const edge = (rows: Row[], key: 'first_patient_minute' | 'last_patient_minute' | 'available_start_minute' | 'available_end_minute', pick: 'min' | 'max') => {
    const values = rows.map(s => s[key]).filter((v): v is number => typeof v === 'number');
    return values.length ? (pick === 'min' ? Math.min(...values) : Math.max(...values)) : null;
  };
  const columnLine = (s: Row) => `first patient ${clockLabel(s.first_patient_minute) ?? 'none visible'}, last patient left ${clockLabel(s.last_patient_minute) ?? 'none visible'}, available ${clockLabel(s.available_start_minute) ?? 'unknown'} to ${clockLabel(s.available_end_minute) ?? 'unknown'}`;
  function attendance(r: Row, table: string, status?: Row) {
    if (owners.has(r.user_id)) return;
    const day = r.entry_date;
    if (!day || !validDate(day)) return;
    const off = daysOff.filter(o => ((r.employee_id && o.employee_id === r.employee_id) || (!r.employee_id && r.user_id && o.user_id === r.user_id)) && !!o.date_start && !!o.date_end && o.date_start <= day && o.date_end >= day);
    const closed = !!status?.office_closed;
    const unscheduled = status?.is_scheduled_day === false;
    const hasWork = status?.has_punches || (Number(r.total_minutes) > 0);
    const today = new Intl.DateTimeFormat('en-CA', {timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    let state = hasWork ? 'work_recorded' : 'no_work_recorded';
    if (closed) state = 'office_closed';
    else if (unscheduled) state = hasWork ? 'work_on_unscheduled_day' : 'not_scheduled';
    else if (off.length || status?.has_day_off) state = off.some(o => o.type === 'unscheduled') ? 'recorded_callout' : 'recorded_day_off';
    else if (day >= today && !hasWork) state = 'day_not_finished';
    else if (status?.is_late && hasWork) state = 'late_arrival';
    else if (status?.is_incomplete && hasWork) state = day >= today ? 'shift_in_progress' : 'incomplete_punches';
    else if (status?.is_absent && status?.is_scheduled_day) state = 'recorded_absence';
    const parts = [
      `Work minutes: ${r.total_minutes ?? 'not available'}.`,
      `Schedule: ${status ? (unscheduled ? 'not scheduled' : `${status.schedule_expected_start || '?'} to ${status.schedule_expected_end || '?'}`) : 'not available; do not infer late/absent'}.`,
      `Office closed: ${closed}.`,
    ];
    if (state === 'late_arrival') parts.push(`Minutes late: ${status?.minutes_late ?? 0}; review: ${status?.tardy_approval_status || 'unknown'}.`);
    if (status?.is_incomplete && hasWork) parts.push(day >= today ? 'Current shift may still be in progress.' : 'Punches are recorded as incomplete.');
    if (off.length) parts.push(`Recorded time off: ${off.map(o => o.type).join(', ')}. Count the day-off record and this attendance day as the same event, not two absences.`);
    if (status?.timezone_suspect) parts.push('Time zone flagged for review; timing is uncertain.');
    if (status?.has_edits) parts.push('Record has corrections; a correction is not misconduct.');
    const punches = table === 'time_entries' ? punchesByEntry.get(r.id) ?? [] : [];
    const firstIn = punches.find(p => p.punch_type === 'in');
    const lastOut = [...punches].reverse().find(p => p.punch_type === 'out');
    if (punches.length) parts.push(`Clock: in ${wallClock(firstIn?.punch_time, timeZone) || 'not recorded'}, out ${wallClock(lastOut?.punch_time, timeZone) || 'not recorded'} (${punches.length} punches).`);
    // The schedule beside the clock: the office's own posted schedule for the
    // same day, read locally at close of day. Context, not a verdict.
    const schedule = scheduleByDate.get(day);
    if (schedule?.length) {
      parts.push(`Office schedule capture that day: first patient ${clockLabel(edge(schedule, 'first_patient_minute', 'min')) ?? 'none visible'}, last patient left ${clockLabel(edge(schedule, 'last_patient_minute', 'max')) ?? 'none visible'}; on the grid: ${schedule.map(s => short(s.provider_label, 60)).filter(Boolean).join(', ') || 'no provider named'}.`);
      const own = schedule.find(s => !!s.employee_id && s.employee_id === r.employee_id);
      if (own) parts.push(`Their own column: ${columnLine(own)}.`);
    }
    add(table, r, 'attendance', day, day, state, parts.join(' '), r.entry_comment);
  }
  for (const r of data.time_entries || []) { seen.add(identity(r)); attendance(r, 'time_entries', statuses.get(identity(r))); }
  for (const r of data.attendance_day_status || []) if (!seen.has(identity(r))) attendance(r, 'attendance_day_status', r);
  for (const r of daysOff) add('days_off', r, 'days_off', r.date_start, r.date_end, r.type,
    `${r.type === 'unscheduled' ? 'Recorded call-out' : r.type === 'scheduled_with_notice' ? 'Scheduled time off with notice' : 'Recorded time off'}; ${r.hours ?? 'unspecified'} hours. A multi-day row is one record, not one day.`, r.notes);
  for (const r of data.attendance_exceptions || []) add('attendance_exceptions', r, 'attendance_exceptions', r.exception_date, r.exception_date, r.status,
    `${r.type}; resolution: ${r.resolution_action || 'not recorded'}. May describe the same attendance day; do not double-count.`, r.reason_text);
  // Only office-owned checklist items AND office-owned lists are admitted.
  // Personal goals/tasks never become manager analytics through completion rows.
  const lists = new Map((data.checklists || []).filter(r => !r.owner_user_id).map(r => [r.id, r]));
  const items = new Map((data.checklist_items || []).filter(r => !r.owner_user_id && lists.has(r.checklist_id || '')).map(r => [r.id, r]));
  for (const r of data.checklist_completions || []) {
    const item = items.get(r.item_id || ''), period = periodRange(r.period_key || '');
    if (!item || !period) continue;
    add('checklist_completions', r, 'checklist_completions', period[0], period[1], 'completed',
      `${short(lists.get(item.checklist_id || '')?.name,150)}: ${short(item.title,400)}. ${item.cadence}; ${item.per_person ? 'per-person task' : 'shared team task; completed by this person, not required separately of every employee'}. Period ${r.period_key}; checked at ${r.completed_at}. Missing completion history alone does not prove a missed task.`);
  }
  for (const r of data.checklist_bypasses || []) add('checklist_bypasses', r, 'checklist_bypasses', r.checklist_date, r.checklist_date,
    r.resolved ? 'reason_recorded' : 'awaiting_reason', `${r.incomplete_count} required items were incomplete at clock-out. This is a historical snapshot, not proof they remain incomplete now.`, r.reason);
  for (const r of data.accountability_reports || []) add('accountability_reports', r, 'accountability', r.period_start, r.period_end, r.status,
    `${r.kind}: ${short(r.summary,1000)}. ${r.review_due_at ? `Review due ${r.review_due_at}.` : ''}`, r.member_reason, r.manager_note);
  // One record per provider per captured day. A provider linked to a team
  // member is that person; an unlinked provider keeps the label the office
  // gave the column (a staff name, never a patient).
  for (const r of data.provider_day_metrics || []) add('provider_day_metrics', { ...r, employee_name: r.provider_label }, 'schedule_days', r.business_date, r.business_date, r.review_status,
    `Schedule capture for ${short(r.provider_label, 100) || 'a provider'}: ${columnLine(r)}; ${r.scheduled_minutes ?? 'unknown'} min booked of ${r.net_bookable_minutes ?? 'unknown'} bookable, ${r.true_open_minutes ?? 'unknown'} min open. Read from the office's own posted schedule at close of day, not from the time clock.`);
  return out.sort((a,b) => b.period_start.localeCompare(a.period_start) || a.id.localeCompare(b.id));
}

export async function loadEvidence(db: EvidenceDb, orgId: string, filter: {from: string; to: string; source: Source; kind?: string; employeeId?: string}) {
  const {from,to,source,kind,employeeId} = filter;
  const data: Record<string,Row[]> = {}; const warnings: string[] = [];
  async function read(table: string, columns: string, start?: string, end?: string, tune?: (q: Query) => Query, limit = ROW_LIMIT) {
    let q = db.from(table).select(columns).eq('org_id',orgId);
    if (start) {
      if (from) q = q.gte(end || start,from);
      if (to) q = q.lte(start,to);
      q = q.order(start,{ascending:false});
    } else q = q.order('id');
    if (tune) q = tune(q);
    const result = await q.limit(limit);
    if (result.error) throw new Error(`Could not load ${table.replace(/_/g,' ')}. Please retry.`);
    data[table] = result.data || [];
    if (data[table].length === limit) warnings.push(`${table.replace(/_/g,' ')} reached the ${limit}-record limit. Narrow the date range.`);
  }
  // Punch times are UTC instants; a local day can start the previous UTC
  // evening and end the next UTC morning. Read a day of slack each side and
  // let the day's own time entry decide which day a punch belongs to.
  const dayShift = (date: string, days: number) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
  await read('employees','id,user_id,display_name,preferred_name');
  if (employeeId && !data.employees.some(e => e.id === employeeId)) throw new Error('Employee is not available in this office.');
  const personFilter = (column = 'employee_id') => (q: Query) => employeeId ? q.eq(column,employeeId) : q;
  const jobs: Promise<void>[] = [];
  if (source === 'all' || source === 'attendance') {
    jobs.push(read('org_members','id,user_id',undefined,undefined,q=>q.eq('role','owner').eq('status','active')).then(()=>{data.owners=data.org_members;}));
    jobs.push(read('time_entries','id,employee_id,user_id,employee_name,entry_date,total_minutes,entry_comment','entry_date',undefined,q=>personFilter()(q).or('notes.is.null,notes.not.like.Superseded test record%')));
    jobs.push(read('attendance_day_status','id,employee_id,user_id,entry_date,is_scheduled_day,office_closed,has_punches,is_absent,is_incomplete,is_late,minutes_late,tardy_approval_status,schedule_expected_start,schedule_expected_end,has_day_off,has_edits,timezone_suspect','entry_date',undefined,personFilter()));
    jobs.push(read('days_off','id,employee_id,user_id,date_start,date_end,type,hours,notes','date_start','date_end',personFilter()));
    jobs.push(read('attendance_exceptions','id,employee_id,user_id,exception_date,type,status,reason_text,resolution_action','exception_date',undefined,personFilter()));
    jobs.push(read('punches','id,time_entry_id,employee_id,punch_time,punch_type',undefined,undefined,q=>{
      let p = personFilter()(q);
      if (from) p = p.gte('punch_time', dayShift(from, -1));
      if (to) p = p.lte('punch_time', dayShift(to, 2));
      return p;
    }, 4000));
    // The whole office's captures, whoever is selected: the last patient to
    // leave the building is context for everyone who was there.
    jobs.push(read('provider_day_metrics','id,employee_id,provider_label,business_date,review_status,first_patient_minute,last_patient_minute,available_start_minute,available_end_minute,scheduled_minutes,net_bookable_minutes,true_open_minutes','business_date'));
    jobs.push(read('org_practice_settings','id,timezone'));
  }
  if (source === 'all' || source === 'checklists') {
    jobs.push(read('checklists','id,name,owner_user_id',undefined,undefined,q=>q.is('owner_user_id',null)));
    jobs.push(read('checklist_items','id,checklist_id,title,cadence,per_person,owner_user_id',undefined,undefined,q=>q.is('owner_user_id',null)));
    jobs.push(read('checklist_completions','id,item_id,period_key,completed_by,completed_by_name,completed_at',undefined,undefined,q=>{
      // Period overlap, not UTC completion date; weekly/monthly/yearly items
      // may be checked outside the calendar day they describe.
      if (from && to) {
        const d = new Date(from+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()-6);
        q=q.or(`and(period_key.gte.${from},period_key.lte.${to}),and(period_key.gte.week-${d.toISOString().slice(0,10)},period_key.lte.week-${to}),and(period_key.gte.${from.slice(0,7)},period_key.lte.${to.slice(0,7)}),and(period_key.gte.${from.slice(0,4)},period_key.lte.${to.slice(0,4)})`);
      }
      if (employeeId) q=q.eq('completed_by',data.employees.find(e=>e.id===employeeId)?.user_id || '00000000-0000-0000-0000-000000000000');
      return q;
    }));
    jobs.push(read('checklist_bypasses','id,employee_id,user_id,checklist_date,incomplete_count,resolved,reason','checklist_date',undefined,personFilter()));
  }
  if (source === 'all' || source === 'accountability') jobs.push(read('accountability_reports','id,subject_employee_id,subject_user_id,kind,period_start,period_end,status,summary,member_reason,manager_note,closed_at,review_due_at','period_start','period_end',q=>{
    if (kind && kind !== 'all') q=q.eq('kind',kind);
    return personFilter('subject_employee_id')(q);
  }));
  await Promise.all(jobs);
  const all = normalizeEvidence(data,from,to,employeeId);
  // Allocate the context budget across sources so plentiful attendance rows
  // cannot crowd out a smaller checklist or accountability history.
  const groups = Object.keys(LABELS).map(k=>all.filter(r=>r.kind===k));
  const records: Evidence[] = []; let size=0;
  while (groups.some(g=>g.length)) {
    for (const group of groups) {
      const r=group.shift(); if (!r) continue;
      const length=evidenceLine(r).length;
      if (size+length>120000) { warnings.push('Only part of the matching history fits in one analysis. Narrow the date range for a complete read.'); groups.forEach(g=>g.splice(0)); break; }
      records.push(r); size+=length;
    }
  }
  const counts=Object.entries(LABELS).map(([key,label])=>({key,label,count:records.filter(r=>r.kind===key).length}));
  return {records,counts,warnings:[...new Set(warnings)],record_count:records.length,evidence_version:EVIDENCE_VERSION,from,to,source};
}
