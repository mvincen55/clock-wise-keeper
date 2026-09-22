import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgEmployees } from '@/hooks/useEmployees';
import { useOrgPtoRequests, useReviewPtoRequest } from '@/hooks/usePtoRequests';
import { useOrgCorrectionRequests, useReviewCorrectionRequest, useMarkCorrectionApplied } from '@/hooks/useCorrectionRequests';
import { useOrgChangeRequests, useReviewChangeRequest } from '@/hooks/useChangeRequests';
import { useAttendanceDayStatus } from '@/hooks/useAttendanceDayStatus';
import { useTardies, useUpdateTardy } from '@/hooks/useTardies';
import { useOrgAccountabilityReports } from '@/hooks/useAccountability';
import { useIncidentReports } from '@/hooks/useIncidentReports';
import { useKnowledgeWorkspace } from '@/hooks/useKnowledge';
import { useTeamGoals } from '@/hooks/useTeamGoals';
import { useRecentDepositLogs, useSealDay, depositChecks } from '@/hooks/useDepositLog';
import { ATTENTION_WINDOW_DAYS } from '@/hooks/useAttentionItems';
import type { PunchRow } from '@/hooks/useTimeEntries';
import { PunchEditorModal } from '@/components/PunchEditorModal';
import { AttendanceActions } from '@/components/AttendanceActions';
import { TardyReviewModal } from '@/components/TardyReviewModal';
import { AccountabilitySignoffForm } from '@/components/accountability/AccountabilityReviewQueue';
import AccountabilityAuditTimeline from '@/components/accountability/AccountabilityAuditTimeline';
import IncidentReportDetail from '@/components/IncidentReportDetail';
import KnowledgeReviewDialog from '@/components/knowledge/KnowledgeReviewDialog';
import SprintVerifyDialog from '@/components/SprintVerifyDialog';
import { signatureState } from '@/lib/incidents';
import { formatClockRange, formatDate, formatTime, getToday, shiftDate } from '@/lib/time-utils';
import type { AttentionItem } from '@/lib/attention';
import ConfirmStep, { Receipts } from './ConfirmStep';
import { AskEmployeeButton, NoteButton, ParkButton, SnoozeButton } from './FollowupActions';

/**
 * One component per kind. Each hosts the record's canonical editor or the
 * existing review mutation, states the consequence before a consequential
 * write, and reports a Done line back to the room. Nothing here changes a
 * record except through those existing paths.
 */

/**
 * A reversal is a separate audited action offered only where the system
 * supports one (design §5.4). The room runs it from the Done row with a
 * confirmation and a reason.
 */
export type Reversal =
  | { kind: 'pto_approval'; requestId: string; label: string; sentence: string }
  | { kind: 'unseal'; closeoutId: string; depositDate: string; label: string; sentence: string }
  | { kind: 'withdraw_approval'; versionId: string; label: string; sentence: string }
  | { kind: 'none'; label: string };
export type Done = { text: string; reversal?: Reversal };
export type KindProps = { item: AttentionItem; onDone: (done: Done) => void };

const first = (item: AttentionItem) => (item.subject.name ?? 'the person').split(/[ ,]/)[0];
const dollars = (cents: number | null | undefined) => cents === null || cents === undefined ? '—' : `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

export function OpenRecordLink({ to, label = 'Open the record' }: { to: string; label?: string }) {
  return (
    <Button asChild variant="outline" size="sm">
      <Link to={to}><ExternalLink className="mr-1.5 h-4 w-4" />{label}</Link>
    </Button>
  );
}

function Loading() {
  return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Reading the record…</div>;
}

/* ------------------------------------------------------------------ PTO */
export function PtoRequestActions({ item, onDone }: KindProps) {
  const { data: requests } = useOrgPtoRequests('pending');
  const { data: employees } = useOrgEmployees();
  const review = useReviewPtoRequest();
  const [step, setStep] = useState<'idle' | 'approve' | 'decline'>('idle');
  const req = requests?.find(r => r.id === item.recordId);
  if (!requests) return <Loading />;
  if (!req) return <p className="text-sm text-muted-foreground">This request is no longer pending.</p>;
  const emp = employees?.find(e => e.id === req.employee_id);
  const hasLogin = !!emp?.user_id;
  const dates = req.start_date === req.end_date ? formatDate(req.start_date) : `${formatDate(req.start_date)} – ${formatDate(req.end_date)}`;
  const hours = req.hours_requested;
  const deducts = req.pto_type !== 'unpaid' && hours !== null && hours > 0;
  const approveSentence = hasLogin
    ? `Approve ${hours !== null ? `${hours} hours of ` : ''}${req.pto_type.toUpperCase()} for ${item.subject.name}, ${dates}? This records the days off on the office calendar${deducts ? `, deducts ${hours}h from the PTO balance` : req.pto_type === 'unpaid' ? ' (unpaid leave never deducts PTO)' : ' (no hours were requested, so nothing is deducted)'}, and notifies ${first(item)}.`
    : `Approve this request for ${item.subject.name}, ${dates}? ${first(item)} has no login yet, so the days are not put on the calendar by this approval: record them from Team Attendance afterwards.`;
  const run = async (status: 'approved' | 'denied', note: string) => {
    try {
      await review.mutateAsync({ id: req.id, status, manager_note: note || undefined });
      onDone(status === 'approved'
        ? { text: `Approved · ${first(item)} notified${deducts ? ` · PTO ledger −${hours}h` : ''}`,
            reversal: { kind: 'pto_approval', requestId: req.id, label: 'Reverse decision', sentence: `Reverse this approval? The days come off the office calendar${deducts ? `, ${hours}h are credited back` : ''}, the request reads cancelled, and ${first(item)} is notified. This is a new audited action; the approval stays in the trail.` } }
        : { text: `Declined · reason on record · ${first(item)} notified` });
    } catch {
      /* the hook already toasts */
    }
  };
  return (
    <div className="space-y-3">
      <Receipts rows={[['Dates', dates, 'PTO request'], ['Hours', hours === null ? 'not stated' : `${hours}h`, 'PTO request'], ['Type', req.pto_type, 'PTO request'], ['Note', req.note || '—', `from ${item.subject.name ?? 'the person'}`]]} />
      {step === 'idle' && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setStep('approve')}>Approve</Button>
          <Button size="sm" variant="outline" onClick={() => setStep('decline')}>Decline</Button>
        </div>
      )}
      {step === 'approve' && (
        <ConfirmStep sentence={approveSentence} confirmLabel="Confirm approval" pending={review.isPending}
          reason={{ label: 'Note (optional)', min: 0, optional: true }} onConfirm={note => run('approved', note)} onCancel={() => setStep('idle')} />
      )}
      {step === 'decline' && (
        <ConfirmStep sentence={`Decline this request? ${first(item)} is notified with your reason.`} confirmLabel="Confirm decline" destructive pending={review.isPending}
          reason={{ label: `Reason (required · ${first(item)} will see it)`, min: 5 }} onConfirm={note => run('denied', note)} onCancel={() => setStep('idle')} />
      )}
    </div>
  );
}

/* ----------------------------------------------------------- corrections */
export function CorrectionRequestActions({ item, onDone }: KindProps) {
  const { data: requests } = useOrgCorrectionRequests('pending');
  const { data: employees } = useOrgEmployees();
  const review = useReviewCorrectionRequest();
  const markApplied = useMarkCorrectionApplied();
  const [step, setStep] = useState<'idle' | 'approve' | 'decline'>('idle');
  const [editor, setEditor] = useState<{ entryId: string | null; punches: PunchRow[]; entryDate: string } | null>(null);
  const [loadingEditor, setLoadingEditor] = useState(false);
  const req = requests?.find(r => r.id === item.recordId);
  if (!requests) return <Loading />;
  if (!req && !editor) return <p className="text-sm text-muted-foreground">This request is no longer pending.</p>;
  const entryDate = typeof req?.proposed_change?.entry_date === 'string' ? req.proposed_change.entry_date : null;
  const punches = req?.target_table === 'punches';
  const emp = employees?.find(e => e.id === (req?.employee_id ?? ''));

  const openEditor = async (employeeId: string, date: string) => {
    setLoadingEditor(true);
    try {
      const { data: entry } = await supabase.from('time_entries').select('id').eq('employee_id', employeeId).eq('entry_date', date).maybeSingle();
      let rows: PunchRow[] = [];
      if (entry) {
        const { data: p } = await supabase.from('punches').select('*').eq('time_entry_id', entry.id).order('seq', { ascending: true });
        rows = (p || []) as PunchRow[];
      }
      setEditor({ entryId: entry?.id ?? null, punches: rows, entryDate: date });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load the day');
    } finally {
      setLoadingEditor(false);
    }
  };
  const run = async (status: 'approved' | 'denied', note: string) => {
    if (!req) return;
    try {
      await review.mutateAsync({ id: req.id, status, resolution_note: note });
      if (status === 'denied') { onDone({ text: `Declined · reason on record · ${first(item)} notified` }); return; }
      if (punches) {
        if (!entryDate) { toast.error('This request names no date. Fix the day from Team Attendance, then it reads as applied.'); onDone({ text: 'Approved · apply it from Team Attendance' }); return; }
        setStep('idle');
        await openEditor(req.employee_id, entryDate);
      } else {
        onDone({ text: 'Approved and applied' });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not review the request');
    }
  };
  return (
    <div className="space-y-3">
      {req && (
        <Receipts rows={[['Concerns', req.target_table === 'punches' ? `punches${entryDate ? ` · ${formatDate(entryDate)}` : ''}` : req.target_table, 'correction request'], ['Requested change', String(req.proposed_change?.description ?? req.proposed_change?.action ?? '—'), 'correction request'], ['Reason', req.reason, `from ${item.subject.name ?? 'the person'}`]]} />
      )}
      {req && step === 'idle' && !editor && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={loadingEditor} onClick={() => setStep('approve')}>{punches ? 'Review in the punch editor' : 'Approve and apply'}</Button>
          <Button size="sm" variant="outline" onClick={() => setStep('decline')}>Decline</Button>
        </div>
      )}
      {req && step === 'approve' && (
        <ConfirmStep
          sentence={punches
            ? `Approve this correction? It opens the punch editor on ${first(item)}’s ${entryDate ? formatDate(entryDate) : 'day'}; the original punches stay on record and the change is audited. ${first(item)} is notified.`
            : `Approve this correction? The change is applied to the request it names and ${first(item)} is notified.`}
          confirmLabel="Confirm approval" pending={review.isPending}
          reason={{ label: 'Resolution note (required)', min: 1, placeholder: 'What you approved and why' }}
          onConfirm={note => run('approved', note)} onCancel={() => setStep('idle')} />
      )}
      {req && step === 'decline' && (
        <ConfirmStep sentence={`Decline this correction? The punches stay as recorded and ${first(item)} is notified with your reason.`} confirmLabel="Confirm decline" destructive pending={review.isPending}
          reason={{ label: `Reason (required · ${first(item)} will see it)`, min: 10 }} onConfirm={note => run('denied', note)} onCancel={() => setStep('idle')} />
      )}
      {editor && req && (
        <PunchEditorModal
          open
          onClose={() => { setEditor(null); onDone({ text: 'Approved · not yet applied · fix the punches from Team Attendance' }); }}
          entryId={editor.entryId}
          entryDate={editor.entryDate}
          punches={editor.punches}
          employeeId={req.employee_id}
          employeeName={emp?.display_name}
          onSaved={async result => {
            if (result) {
              try {
                await markApplied.mutateAsync({ id: req.id, audit_event_ids: result.audit_event_ids });
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Punches saved, but the request status did not update');
              }
            }
            setEditor(null);
            onDone({ text: `Applied · punches edited · audit on record`, reversal: { kind: 'none', label: 'Edit the day again from Team Attendance (a new audited edit)' } });
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------- change requests */
export function ChangeRequestActions({ item, onDone }: KindProps) {
  const { data: requests } = useOrgChangeRequests('pending');
  const review = useReviewChangeRequest();
  const [step, setStep] = useState<'idle' | 'approve' | 'deny'>('idle');
  const req = requests?.find(r => r.id === item.recordId);
  if (!requests) return <Loading />;
  if (!req) return <p className="text-sm text-muted-foreground">This request is no longer pending.</p>;
  const payload = req.payload ?? {};
  const run = async (status: 'approved' | 'denied', reason: string) => {
    try {
      await review.mutateAsync({ id: req.id, status, review_reason: reason });
      onDone({ text: `${status === 'approved' ? 'Approved' : 'Denied'} · reason on record · ${first(item)} notified` });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not review the request');
    }
  };
  return (
    <div className="space-y-3">
      <Receipts rows={[['Type', req.request_type.replace(/_/g, ' '), 'change request'], ...(payload.entry_date ? [['Date', String(payload.entry_date), 'change request'] as [string, string, string]] : []), ['Description', String(payload.description ?? '—'), `from ${item.subject.name ?? 'the person'}`]]} />
      {step === 'idle' && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setStep('approve')}>Approve</Button>
          <Button size="sm" variant="outline" onClick={() => setStep('deny')}>Deny</Button>
        </div>
      )}
      {step !== 'idle' && (
        <ConfirmStep
          sentence={step === 'approve'
            ? `Approve this ${req.request_type.replace(/_/g, ' ')} request? This records the decision and notifies ${first(item)}; any schedule or punch change is made in its own editor.`
            : `Deny this request? ${first(item)} is notified with your reason.`}
          confirmLabel={step === 'approve' ? 'Confirm approval' : 'Confirm denial'} destructive={step === 'deny'} pending={review.isPending}
          reason={{ label: `Reason (required · ${first(item)} will see it)`, min: 1 }}
          onConfirm={reason => run(step === 'approve' ? 'approved' : 'denied', reason)} onCancel={() => setStep('idle')} />
      )}
    </div>
  );
}

/* --------------------------------------------------------- content review */
export function ContentReviewActions({ item, onDone }: KindProps) {
  const { data } = useKnowledgeWorkspace();
  const [open, setOpen] = useState(false);
  const entry = data?.items.find(i => i.versions.some(v => v.id === item.recordId)) ?? null;
  const version = entry?.versions.find(v => v.id === item.recordId) ?? null;
  const reported = useRef(false);
  useEffect(() => {
    if (!version || reported.current) return;
    if (version.status === 'approved') { reported.current = true; onDone({ text: `Approved · version ${version.version_number} ready to publish`, reversal: { kind: 'withdraw_approval', versionId: version.id, label: 'Withdraw approval', sentence: `Withdraw your approval? Version ${version.version_number} returns to review and its submitter is notified. The approval stays in the audit trail.` } }); }
    else if (version.status === 'draft') { reported.current = true; onDone({ text: 'Returned with requested changes' }); }
  }, [version, onDone]);
  if (!data) return <Loading />;
  if (!entry || !version) return <p className="text-sm text-muted-foreground">This version is no longer in review.</p>;
  return (
    <div className="space-y-3">
      <Receipts rows={[['Version', `${version.version_number} · ${version.status.replace('_', ' ')}`, 'Policies & Procedures'], ['Summary', version.change_summary || version.summary || '—', 'version'], ['Audience', version.audience_roles.join(', ') || '—', 'version setting']]} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setOpen(true)}>Review</Button>
        <OpenRecordLink to="/management/knowledge" label="Open the workspace" />
      </div>
      <KnowledgeReviewDialog open={open} onOpenChange={setOpen} item={entry.workingVersion?.id === version.id ? entry : { ...entry, workingVersion: version }} />
    </div>
  );
}

/* ------------------------------------------------------------- challenge */
export function ChallengeVerifyActions({ item, onDone }: KindProps) {
  const { data } = useTeamGoals();
  const [open, setOpen] = useState(false);
  const goal = data?.live.find(g => g.id === item.recordId) ?? data?.past.find(g => g.id === item.recordId) ?? null;
  const reported = useRef(false);
  useEffect(() => {
    if (!goal || reported.current || goal.status === 'pending_verification') return;
    reported.current = true;
    onDone({ text: goal.status === 'won' ? 'Verified · won' : goal.status === 'missed' ? 'Verified · missed' : `Recorded · ${goal.status}` });
  }, [goal, onDone]);
  if (!data) return <Loading />;
  if (!goal) return <p className="text-sm text-muted-foreground">This challenge is no longer awaiting verification.</p>;
  return (
    <div className="space-y-3">
      <Receipts rows={[['Target', `${goal.progress} of ${goal.target_count} ${goal.metric}`, 'challenge'], ['Ended', formatDate(goal.ends_on), 'challenge'], ['Reward', goal.reward || '—', 'challenge']]} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setOpen(true)}>Verify</Button>
      </div>
      <SprintVerifyDialog sprint={goal} open={open} onOpenChange={setOpen} />
    </div>
  );
}

/* -------------------------------------------------------------- incidents */
export function IncidentActions({ item, onDone }: KindProps) {
  const { data: reports } = useIncidentReports();
  const [open, setOpen] = useState(false);
  const report = reports?.find(r => r.id === item.recordId) ?? null;
  const reported = useRef(false);
  useEffect(() => {
    if (!report || reported.current) return;
    if (item.kind === 'incident_countersign' && signatureState({ employee_signed_at: report.employee_signed_at, manager_signed_at: report.manager_signed_at }) === 'complete') {
      reported.current = true; onDone({ text: 'Countersigned · the report is complete' });
    }
    if (item.kind === 'incident_followup' && (report.status === 'closed' || !report.follow_up_required)) {
      reported.current = true; onDone({ text: 'Follow-up closed' });
    }
  }, [report, item.kind, onDone]);
  if (!reports) return <Loading />;
  if (!report) return <p className="text-sm text-muted-foreground">This report is no longer open to you.</p>;
  return (
    <div className="space-y-3">
      <Receipts rows={[['Category', report.category, 'incident report'], ['Date', `${formatDate(report.incident_date)}${report.incident_time ? ` · ${report.incident_time.slice(0, 5)}` : ''}`, 'incident report'], ['Status', report.status, 'incident report'], ...(report.follow_up_required ? [['Follow-up', report.follow_up_notes || 'required', 'review'] as [string, string, string]] : [])]} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setOpen(true)}>{item.kind === 'incident_countersign' ? 'Open and countersign' : 'Open the report'}</Button>
        <OpenRecordLink to={`/incident-reports?report=${report.id}`} label="Incident reports" />
      </div>
      <IncidentReportDetail report={open ? report : null} employeeName={item.subject.name ?? 'Team member'} onClose={() => setOpen(false)} />
    </div>
  );
}

/* -------------------------------------------------------- attendance days */
export function AttendanceDayActions({ item }: KindProps) {
  const today = getToday();
  const { data: rows } = useAttendanceDayStatus(shiftDate(today, -ATTENTION_WINDOW_DAYS), today);
  const row = rows?.find(r => r.id === item.recordId) ?? null;
  if (!rows) return <Loading />;
  if (!row) return <p className="text-sm text-muted-foreground">This day is no longer flagged.</p>;
  const caption = item.kind === 'missing_day' ? 'Record what happened' : item.kind === 'clocked_in_after_close' ? 'Verify first; add a clock-out only with a confirmed time and a reason' : 'Fix the day';
  return (
    <div className="space-y-3">
      <Receipts rows={[
        ['Schedule', row.is_scheduled_day ? formatClockRange(row.schedule_expected_start, row.schedule_expected_end) : 'not scheduled', 'schedule'],
        ['Punches', row.has_punches ? (row.is_incomplete ? 'open pair (no clock-out)' : 'on record') : 'none', `punches, ${formatDate(row.entry_date)}`],
        ['Day off', row.has_day_off ? 'on file' : 'none recorded', 'days off'],
        ['Status', row.status_code.replace(/_/g, ' '), 'attendance recompute'],
      ]} />
      <div className="space-y-2">
        <p className="text-sm font-medium">{caption}</p>
        <div className="flex flex-wrap items-center gap-2">
          <AttendanceActions row={row} alwaysShow editButton employeeName={item.subject.name ?? undefined} />
          {item.kind === 'clocked_in_after_close' && <SnoozeButton item={item} label="Still working" />}
          {item.kind !== 'clocked_in_after_close' && <AskEmployeeButton item={item} />}
        </div>
      </div>
      <OpenRecordLink to={item.href} label="Open in Team Attendance" />
    </div>
  );
}

/* --------------------------------------------------------------- tardies */
export function TardyActions({ item, onDone }: KindProps) {
  const { user } = useAuth();
  const today = getToday();
  const { data: tardies } = useTardies(shiftDate(today, -ATTENTION_WINDOW_DAYS), today);
  const update = useUpdateTardy();
  const [open, setOpen] = useState(false);
  const tardy = tardies?.find(t => t.id === item.recordId) ?? null;
  if (!tardies) return <Loading />;
  if (!tardy) return <p className="text-sm text-muted-foreground">This late arrival has been reviewed.</p>;
  return (
    <div className="space-y-3">
      <Receipts rows={[['Expected', tardy.expected_start_time.slice(0, 5), 'schedule'], ['Arrived', formatTime(tardy.actual_start_time), 'punches'], ['Late', `${tardy.minutes_late} min`, 'attendance recompute'], ['Reason', tardy.reason_text ? `“${tardy.reason_text}”` : 'none given yet', `from ${item.subject.name ?? 'the person'}`]]} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setOpen(true)}>Review</Button>
        <ParkButton item={item} />
        <OpenRecordLink to={item.href} label="Open in Team Attendance" />
      </div>
      <TardyReviewModal
        open={open}
        tardy={tardy}
        employeeName={item.subject.name ?? undefined}
        onClose={() => setOpen(false)}
        onSubmit={async (id, status, reason) => {
          await update.mutateAsync({ id, updates: { approval_status: status, reason_text: reason, approved_by: status === 'approved' ? user?.id ?? null : null, approved_at: status === 'approved' ? new Date().toISOString() : null } });
          onDone({ text: `Reviewed · ${status} · reason on record`, reversal: { kind: 'none', label: 'Change the review from Team Attendance' } });
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------ sign-off */
export function RecordSignoffActions({ item, onDone }: KindProps) {
  const { data: reports } = useOrgAccountabilityReports(true);
  const report = reports?.find(r => r.id === item.recordId) ?? null;
  if (!reports) return <Loading />;
  if (!report) return <p className="text-sm text-muted-foreground">This record is no longer with you.</p>;
  return (
    <div className="space-y-3">
      <Receipts rows={[['Summary', report.summary, 'record'], ...(report.member_reason ? [[`${item.subject.name ?? 'Member'}’s note`, `“${report.member_reason}”`, `signed ${report.member_signed_name ?? ''}`] as [string, string, string]] : []), ['Review due', report.review_due_at ? formatDate(report.review_due_at.slice(0, 10)) : '—', 'escalation policy']]} />
      <AccountabilityAuditTimeline report={report} />
      <AccountabilitySignoffForm report={report} onSigned={() => onDone({ text: 'Signed off and closed · no reversal; a new record opens if the rule trips again' })} />
      <div className="flex flex-wrap gap-2">
        <ParkButton item={item} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- closeouts */
export function CloseoutActions({ item, onDone }: KindProps) {
  const { data: logs } = useRecentDepositLogs(14);
  const seal = useSealDay();
  const [step, setStep] = useState<'idle' | 'seal'>('idle');
  const log = logs?.find(l => l.id === item.recordId) ?? null;
  if (!logs) return <Loading />;
  const depositTotal = log ? log.cash_cents + depositChecks(log).reduce((a, b) => a + b, 0) + log.ins_cc_cents + log.pt_cc_cents + log.illumitrac_cents + log.outside_financing_cents + log.other_collections_cents : null;
  const canSeal = item.kind === 'close_day_unsealed' && !!log && !log.sealed_at;
  const run = async () => {
    if (!log) return;
    try {
      await seal.mutateAsync({ closeoutId: log.id, depositDate: log.deposit_date, seal: true });
      onDone({ text: `Sealed ${formatDate(log.deposit_date)}`, reversal: { kind: 'unseal', closeoutId: log.id, depositDate: log.deposit_date, label: 'Unseal', sentence: `Unseal ${formatDate(log.deposit_date)}? The record reopens for editing. This is a new audited action; the seal stays in the trail.` } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not seal the day');
    }
  };
  return (
    <div className="space-y-3">
      {log && (
        <Receipts rows={[
          ['Deposit', dollars(depositTotal), 'Close the Day, step 1'],
          ['Production', dollars(log.production_cents), 'Close the Day, step 2'],
          ['Staffing', log.staffing_assessment ? log.staffing_assessment.replace(/_/g, ' ') : 'not answered', 'Close the Day, step 4'],
          ['Last saved', `${formatDate(log.updated_at)} ${formatTime(log.updated_at)}`, 'Close the Day'],
        ]} />
      )}
      {item.kind === 'staffing_answer' && log?.staffing_note && <p className="text-sm">“{log.staffing_note}”</p>}
      {step === 'idle' && (
        <div className="flex flex-wrap gap-2">
          {canSeal && <Button size="sm" onClick={() => setStep('seal')}>Seal {formatDate(log!.deposit_date)}</Button>}
          {item.kind === 'staffing_answer' && <NoteButton item={item} label="Followed up" />}
          <OpenRecordLink to={item.href} label={item.kind === 'close_day_unsealed' && !log ? 'Start Close the Day' : 'Open Close the Day'} />
        </div>
      )}
      {step === 'seal' && log && (
        <ConfirmStep
          sentence={`Seal ${formatDate(log.deposit_date)}? This locks what is on file: deposit ${dollars(depositTotal)}, production ${dollars(log.production_cents)}, staffing ${log.staffing_assessment ? `“${log.staffing_assessment.replace(/_/g, ' ')}”` : 'not answered'}. Unsealing later is a separate audited action.`}
          confirmLabel={`Seal ${formatDate(log.deposit_date)}`} pending={seal.isPending} onConfirm={run} onCancel={() => setStep('idle')} />
      )}
    </div>
  );
}

/* -------------------------------------------------------------- bypasses */
export function BypassActions({ item, onDone }: KindProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{item.detail}</p>
      <div className="flex flex-wrap gap-2">
        <NoteButton item={item} label="Add a note" onDone={() => onDone({ text: 'Follow-up noted · the reason stays owed on the record' })} />
        <ParkButton item={item} />
        <OpenRecordLink to={item.href} label="Open the person’s record" />
      </div>
    </div>
  );
}

/* --------------------------------------------------------- link + park */
export function LinkOnlyActions({ item }: KindProps) {
  const label = item.kind === 'ack_escalated' ? 'Open the acknowledgment' : item.kind === 'training_overdue' ? 'Open the assignment' : 'Open the record';
  return (
    <div className="space-y-3">
      {item.detail && <p className="text-sm text-muted-foreground">{item.detail}</p>}
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm"><Link to={item.href}>{label}</Link></Button>
        {item.verb === 'follow_up' && <ParkButton item={item} />}
      </div>
    </div>
  );
}
