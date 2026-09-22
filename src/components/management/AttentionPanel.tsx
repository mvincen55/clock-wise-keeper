import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { X, CalendarClock, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDate, formatTime } from '@/lib/time-utils';
import type { AttentionItem } from '@/lib/attention';
import { BringBackButton } from './FollowupActions';
import {
  AttendanceDayActions, BypassActions, ChallengeVerifyActions, ChangeRequestActions, CloseoutActions, ContentReviewActions,
  CorrectionRequestActions, IncidentActions, LinkOnlyActions, OpenRecordLink, PtoRequestActions, RecordSignoffActions, TardyActions,
  type Done, type Reversal,
} from './AttentionKindActions';

/**
 * The item panel (design §7.2): what happened, why the rule surfaced it,
 * the deadline, one primary action with its secondaries, the recorded items
 * it is based on, and the record's own link. Focus lands on the title when
 * it opens and returns to the row when it closes.
 */
export type DoneRecord = { key: string; label: string; text: string; at: string; reversal?: Reversal };

const VERB_LABEL = { decide: 'Decide', fix: 'Fix', follow_up: 'Follow up' } as const;

function recordHref(item: AttentionItem): string | null {
  if (item.href.startsWith('/management?')) {
    return item.subject.employeeId ? `/management/people/${item.subject.employeeId}#time` : null;
  }
  return item.href;
}

function KindActions({ item, onDone }: { item: AttentionItem; onDone: (d: Done) => void }): ReactNode {
  switch (item.kind) {
    case 'pto_request': return <PtoRequestActions item={item} onDone={onDone} />;
    case 'correction_request': return <CorrectionRequestActions item={item} onDone={onDone} />;
    case 'change_request': return <ChangeRequestActions item={item} onDone={onDone} />;
    case 'content_review': return <ContentReviewActions item={item} onDone={onDone} />;
    case 'challenge_verify': return <ChallengeVerifyActions item={item} onDone={onDone} />;
    case 'incident_countersign':
    case 'incident_followup': return <IncidentActions item={item} onDone={onDone} />;
    case 'missing_clock_out':
    case 'missing_day':
    case 'unpaired_punches':
    case 'time_suspect':
    case 'clocked_in_after_close': return <AttendanceDayActions item={item} onDone={onDone} />;
    case 'tardy_unreviewed': return <TardyActions item={item} onDone={onDone} />;
    case 'record_signoff': return <RecordSignoffActions item={item} onDone={onDone} />;
    case 'staffing_answer':
    case 'close_day_unsealed':
    case 'close_day_behind':
    case 'close_day_review': return <CloseoutActions item={item} onDone={onDone} />;
    case 'bypass_followup': return <BypassActions item={item} onDone={onDone} />;
    case 'ack_escalated':
    case 'training_overdue': return <LinkOnlyActions item={item} onDone={onDone} />;
  }
}

export default function AttentionPanel({ item, onClose, onDone }: { item: AttentionItem; onClose: () => void; onDone: (record: DoneRecord) => void }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, [item.key]);
  const done = (d: Done) => onDone({ key: item.key, label: `${item.subject.name ? `${item.subject.name} · ` : ''}${item.label}`, text: d.text, at: formatTime(new Date()), reversal: d.reversal });
  const record = recordHref(item);
  const deferred = item.parkedUntil || item.snoozedUntil;

  return (
    <section aria-labelledby="attention-panel-title" className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{VERB_LABEL[item.verb]}{item.coverage ? ' · coverage' : ''}</p>
          <h2 id="attention-panel-title" ref={titleRef} tabIndex={-1} className="text-lg font-semibold leading-snug outline-none">
            {item.subject.name ? `${item.subject.name} · ` : ''}{item.label}
          </h2>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>

      {item.detail && <p className="text-sm">{item.detail}</p>}

      <div className="rounded-md bg-muted/50 p-3 text-sm">
        <p className="flex items-start gap-2"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span><span className="font-medium">Why you see this.</span> {item.why}</span></p>
        {(item.deadline || item.payroll) && (
          <p className="mt-2 flex items-start gap-2"><CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span>
            {item.deadline ? `${item.deadline.label}${item.deadline.days > 0 ? ` · ${formatDate(item.deadline.date)}` : ''}` : 'No deadline set'}
            {item.payroll ? ' · makes the pay period questionable until the record changes' : ''}
          </span></p>
        )}
      </div>

      {(item.work !== 'needs_action' || deferred) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
          <span>
            {item.work === 'waiting_on_employee' && `Waiting on ${item.subject.name ?? 'the person'}${item.waitingOn?.requestedAt ? ` · asked ${formatDate(item.waitingOn.requestedAt)}` : ''}${item.waitingOn?.dueAt ? ` · follow up ${formatDate(item.waitingOn.dueAt)}` : ''}`}
            {item.work === 'waiting_on_reviewer' && 'Waiting on another reviewer'}
            {item.work === 'followed_up' && 'Followed up'}
            {item.work === 'needs_action' && item.parkedUntil && `Parked until ${formatDate(item.parkedUntil)} · still open · still due`}
            {item.work === 'needs_action' && item.snoozedUntil && `Reminder at ${formatTime(item.snoozedUntil)} · still open`}
          </span>
          <BringBackButton item={item} />
        </div>
      )}

      <KindActions item={item} onDone={done} />

      {record && record !== item.href && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <OpenRecordLink to={record} />
          {item.subject.employeeId && <Button asChild variant="ghost" size="sm"><Link to={`/management/people/${item.subject.employeeId}`}>{item.subject.name ?? 'Person'} → record</Link></Button>}
        </div>
      )}
    </section>
  );
}
