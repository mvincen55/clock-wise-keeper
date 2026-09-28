import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, Circle, Loader2, Pencil } from 'lucide-react';
import IncidentSignaturePanel from '@/components/IncidentSignaturePanel';
import { useOrgContext } from '@/hooks/useOrgContext';
import {
  useAttendanceIncidentEvents,
  useCommentAttendanceReport,
  useIncidentReportAmendments,
  useRecordAttendanceMeeting,
  type IncidentReport,
} from '@/hooks/useIncidentReports';
import { STATUS_CLASSES, STATUS_LABELS, attendanceSteps, attendanceWaitingOn, formatSignedAt, labelFor, type IncidentStatus } from '@/lib/incidents';
import { ruleClause } from '@/lib/late-arrivals';
import { formatClock, formatDate, formatTime, getToday } from '@/lib/time-utils';

/**
 * An attendance incident report, in full: the rule that opened it, the
 * period, every late arrival it is about with a link to the record, and
 * the workflow that closes it — a manager records the meeting, the team
 * member may add a comment, both sign. Everyone who can open it sees the
 * same facts and the same list of what is still outstanding; the buttons
 * differ by who is signed in. Nothing here edits the facts: they were
 * written by the rule and are frozen; later changes to the meeting record
 * or the comment are amendments, logged at the bottom, and reset any
 * signature they were made under.
 */
type Props = {
  report: IncidentReport;
  /** Who the report is about. */
  employeeName: string;
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value || '—'}</p>
    </div>
  );
}

export default function AttendanceIncidentPanel({ report, employeeName }: Props) {
  const { data: ctx } = useOrgContext();
  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';
  const isSubject = !!ctx && report.employee_id === ctx.employee_id;
  const canManage = isManager && !isSubject;
  const closed = report.status === 'closed';
  const { data: events } = useAttendanceIncidentEvents(report.id);
  const { data: amendments } = useIncidentReportAmendments(report.id);
  const record = useRecordAttendanceMeeting();
  const comment = useCommentAttendanceReport();

  const [meetingOpen, setMeetingOpen] = useState(false);
  const [meetingDate, setMeetingDate] = useState(report.meeting_date ?? getToday());
  const [summary, setSummary] = useState(report.meeting_summary);
  const [nextSteps, setNextSteps] = useState(report.meeting_next_steps);
  const [amendReason, setAmendReason] = useState('');
  const [commentDraft, setCommentDraft] = useState(report.employee_comment);
  const [commentOpen, setCommentOpen] = useState(false);

  // Re-sync drafts when the row moves (a recording, an amendment, a signature).
  useEffect(() => {
    setMeetingDate(report.meeting_date ?? getToday());
    setSummary(report.meeting_summary);
    setNextSteps(report.meeting_next_steps);
    setCommentDraft(report.employee_comment);
    setAmendReason('');
    setMeetingOpen(false);
    setCommentOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.id, report.updated_at]);

  const recorded = !!report.meeting_recorded_at;
  const anySignature = !!report.employee_signed_at || !!report.manager_signed_at;
  const rule = report.rule_threshold_count && report.rule_window_days
    ? ruleClause({ threshold_count: report.rule_threshold_count, threshold_window_days: report.rule_window_days, is_active: true })
    : 'the office late-arrival rule';
  const steps = attendanceSteps(report, { isSubject, canManage });
  const qualifying = (events ?? []).filter(e => e.role === 'qualifying');
  const followUps = (events ?? []).filter(e => e.role === 'follow_up');
  const recordLink = (entryDate: string) =>
    isSubject ? `/days-off?date=${entryDate}` : `/management/attendance?employee=${report.employee_id}&date=${entryDate}`;

  const saveMeeting = () => {
    record.mutate(
      { id: report.id, meetingDate, summary, nextSteps, amendmentReason: recorded ? amendReason : undefined },
      { onSuccess: () => setMeetingOpen(false) },
    );
  };
  const saveComment = () => {
    comment.mutate({ id: report.id, comment: commentDraft }, { onSuccess: () => setCommentOpen(false) });
  };

  return (
    <div className="space-y-4">
      {/* The facts, as the rule wrote them. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Row label="Team member" value={employeeName} />
        <Row label="Rule that opened it" value={rule} />
        <Row label="Period" value={report.period_start && report.period_end ? `${formatDate(report.period_start)} – ${formatDate(report.period_end)}` : ''} />
        <Row label="Late arrivals" value={String(report.occurrence_count ?? qualifying.length)} />
        <Row label="Total minutes late" value={String(report.total_minutes_late ?? 0)} />
        <div>
          <p className="text-xs text-muted-foreground">Status</p>
          <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[report.status as IncidentStatus] ?? 'bg-muted text-muted-foreground'}`}>
            {labelFor(STATUS_LABELS, report.status)}
          </span>
        </div>
      </div>
      <p className="text-sm whitespace-pre-wrap">{report.description}</p>

      {/* The late arrivals it is about, each linked to the attendance record. */}
      <div className="rounded-lg border">
        <div className="border-b px-3 py-2 text-sm font-medium">Late arrivals in this report</div>
        {!events ? (
          <p className="p-3 text-sm text-muted-foreground">Reading the records…</p>
        ) : (
          <ul className="divide-y">
            {qualifying.map(e => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  <Link to={recordLink(e.entry_date)} className="font-medium underline-offset-2 hover:underline">{formatDate(e.entry_date)}</Link>
                  <span className="text-muted-foreground"> · scheduled {formatClock(e.expected_start_time)}{e.actual_start_time ? `, arrived ${formatTime(e.actual_start_time)}` : ''}</span>
                </span>
                <span className="font-semibold text-destructive">{e.minutes_late} min late</span>
              </li>
            ))}
            {followUps.length > 0 && (
              <li className="bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
                Later late arrivals while this report was open. They are linked here, not counted in the totals above, and never open a second report.
              </li>
            )}
            {followUps.map(e => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  <Link to={recordLink(e.entry_date)} className="font-medium underline-offset-2 hover:underline">{formatDate(e.entry_date)}</Link>
                  <span className="text-muted-foreground"> · follow-up · scheduled {formatClock(e.expected_start_time)}{e.actual_start_time ? `, arrived ${formatTime(e.actual_start_time)}` : ''}</span>
                </span>
                <span className="font-semibold text-destructive">{e.minutes_late} min late</span>
              </li>
            ))}
            {events.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">No linked records.</li>}
          </ul>
        )}
      </div>

      {/* What remains outstanding, for everyone. */}
      <div className="rounded-lg border p-3">
        <p className="text-sm font-medium">{closed ? 'Closed' : `Outstanding · ${attendanceWaitingOn(report).toLowerCase()}`}</p>
        <ul className="mt-2 space-y-1">
          {steps.map(s => (
            <li key={s.key} className="flex items-start gap-2 text-sm">
              {s.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
              <span className={s.done ? 'text-muted-foreground' : ''}>
                {s.label}
                {!s.done && s.mine && <span className="ml-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">you</span>}
                {!s.done && !s.mine && s.blocked && <span className="ml-1 text-xs text-muted-foreground">({s.blocked})</span>}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          The report documents the threshold crossing; it is not a disciplinary decision. It stays open and visible to both of you until every step is done.
        </p>
      </div>

      {/* The meeting, recorded by a manager. */}
      <div className="rounded-lg border p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">Meeting</p>
          {recorded && (
            <p className="text-xs text-muted-foreground">
              Recorded by {report.reviewed_by_name || 'a manager'} · {formatSignedAt(report.meeting_recorded_at)}
            </p>
          )}
        </div>
        {recorded && !meetingOpen && (
          <div className="space-y-2">
            <Row label="Meeting date" value={report.meeting_date ? formatDate(report.meeting_date) : ''} />
            <div>
              <p className="text-xs text-muted-foreground">Discussion summary</p>
              <p className="text-sm whitespace-pre-wrap">{report.meeting_summary || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Agreed next steps</p>
              <p className="text-sm whitespace-pre-wrap">{report.meeting_next_steps || '—'}</p>
            </div>
            {canManage && (
              <Button variant="outline" size="sm" onClick={() => setMeetingOpen(true)}>
                <Pencil className="mr-2 h-4 w-4" /> Amend the meeting record
              </Button>
            )}
          </div>
        )}
        {!recorded && !canManage && (
          <p className="text-sm text-muted-foreground">
            {isSubject ? 'Your manager will meet with you and record the meeting here. You can add a comment below at any time before the report closes.' : 'Not recorded yet.'}
          </p>
        )}
        {(meetingOpen || (!recorded && canManage)) && (
          <div className="space-y-3">
            {recorded && (
              <p className="text-xs text-muted-foreground">
                This is an amendment. It is logged with your reason{anySignature || closed ? ', and both signatures are cleared so they can be given again over the amended wording' : ''}.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="att-meeting-date">Meeting date</Label>
                <Input id="att-meeting-date" type="date" value={meetingDate} max={getToday()} onChange={e => setMeetingDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="att-meeting-summary">Brief discussion summary</Label>
              <Textarea id="att-meeting-summary" rows={3} value={summary} onChange={e => setSummary(e.target.value)}
                placeholder="What was discussed, in a few sentences. Facts and what was said; no conclusions the meeting did not reach." />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="att-meeting-next">Agreed next steps (optional)</Label>
              <Textarea id="att-meeting-next" rows={2} value={nextSteps} onChange={e => setNextSteps(e.target.value)} placeholder="Anything both of you agreed to." />
            </div>
            {recorded && (
              <div className="space-y-1.5">
                <Label htmlFor="att-amend-reason">Reason for the amendment</Label>
                <Input id="att-amend-reason" value={amendReason} onChange={e => setAmendReason(e.target.value)} placeholder="What changed and why" />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={record.isPending || !meetingDate || summary.trim().length < 3 || (recorded && amendReason.trim().length < 3)} onClick={saveMeeting}>
                {record.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {recorded ? 'Save amendment' : 'Record the meeting'}
              </Button>
              {recorded && <Button size="sm" variant="ghost" onClick={() => setMeetingOpen(false)}>Cancel</Button>}
            </div>
            {!recorded && <p className="text-xs text-muted-foreground">Recording the meeting asks {employeeName} to read and sign; you sign too.</p>}
          </div>
        )}
      </div>

      {/* The team member's own words. */}
      <div className="rounded-lg border p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">Team member comment</p>
          {report.employee_comment_at && <p className="text-xs text-muted-foreground">{formatSignedAt(report.employee_comment_at)}</p>}
        </div>
        {!commentOpen && (
          <p className="text-sm whitespace-pre-wrap">{report.employee_comment || (isSubject ? 'You have not added a comment.' : 'No comment.')}</p>
        )}
        {isSubject && !closed && !commentOpen && (
          <Button variant="outline" size="sm" onClick={() => setCommentOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" /> {report.employee_comment ? 'Change my comment' : 'Add a comment'}
          </Button>
        )}
        {isSubject && !closed && commentOpen && (
          <div className="space-y-2">
            <Textarea rows={3} value={commentDraft} onChange={e => setCommentDraft(e.target.value)} placeholder="Your own account, in your own words. Optional." />
            {anySignature && <p className="text-xs text-muted-foreground">A signature is already on this report: changing your comment is logged as an amendment and both signatures are given again.</p>}
            <div className="flex gap-2">
              <Button size="sm" disabled={comment.isPending} onClick={saveComment}>
                {comment.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save comment
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCommentOpen(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </div>

      <IncidentSignaturePanel report={report} employeeName={employeeName} />

      {amendments && amendments.length > 0 && (
        <div className="rounded-lg border p-3">
          <p className="text-sm font-medium">Amendments</p>
          <ol className="mt-2 space-y-1.5">
            {amendments.map(a => (
              <li key={a.id} className="text-xs text-muted-foreground">
                <span className="text-foreground">{a.kind === 'meeting' ? 'Meeting record amended' : 'Team member comment changed'}</span>
                {' — '}{a.amended_by_name || 'someone'} · {formatSignedAt(a.amended_at)}
                {a.reason ? ` · ${a.reason}` : ''}
                {a.signatures_reset ? ' · signatures given again' : ''}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
