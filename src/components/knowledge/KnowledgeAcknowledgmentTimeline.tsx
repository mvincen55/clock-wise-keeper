import {
  BellRing,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Flag,
  Loader2,
  Mail,
  PauseCircle,
  ShieldCheck,
  UserRoundCheck,
} from 'lucide-react';
import { useKnowledgeAcknowledgmentEvents } from '@/hooks/useKnowledgeAcknowledgments';
import type { KnowledgeAcknowledgmentEventType } from '@/integrations/supabase/knowledge-acknowledgment-client';

const labels: Record<KnowledgeAcknowledgmentEventType, string> = {
  assigned: 'Assigned',
  viewed: 'Opened exact version',
  blocked: 'Marked blocked',
  unblocked: 'Block cleared',
  snoozed: 'Reasoned snooze',
  question_asked: 'Question asked',
  question_resolved: 'Question answered',
  overdue: 'Working-day deadline passed',
  acknowledged: 'Acknowledged',
  waived: 'No longer required',
  reminder_in_app: 'In-app reminder',
  reminder_email_queued: 'Email reminder queued',
  manager_escalated: 'Manager follow-up',
  owner_escalated: 'Owner review',
  reactivated: 'Assignment reactivated',
};

function EventIcon({ type }: { type: KnowledgeAcknowledgmentEventType }) {
  if (type === 'acknowledged') return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (type === 'reminder_email_queued') return <Mail className="h-4 w-4 text-primary" />;
  if (type === 'reminder_in_app') return <BellRing className="h-4 w-4 text-primary" />;
  if (type === 'blocked' || type === 'snoozed') return <PauseCircle className="h-4 w-4 text-amber-700" />;
  if (type === 'question_asked' || type === 'question_resolved') return <CircleHelp className="h-4 w-4 text-violet-700" />;
  if (type === 'manager_escalated') return <UserRoundCheck className="h-4 w-4 text-orange-700" />;
  if (type === 'owner_escalated') return <ShieldCheck className="h-4 w-4 text-destructive" />;
  if (type === 'overdue') return <Flag className="h-4 w-4 text-destructive" />;
  return <Clock3 className="h-4 w-4 text-muted-foreground" />;
}

function formatMoment(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function KnowledgeAcknowledgmentTimeline({ assignmentId }: { assignmentId: string }) {
  const { data: events = [], isLoading } = useKnowledgeAcknowledgmentEvents(assignmentId);

  return (
    <section className="mt-6 rounded-xl border bg-background/80 p-4">
      <div className="flex items-center gap-2">
        <Clock3 className="h-4 w-4 text-primary" />
        <h4 className="font-semibold">Escalation receipt</h4>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Factual delivery and status history. Pauses, working-day timing, and escalation are visible instead of inferred.
      </p>

      {isLoading ? (
        <div className="flex items-center gap-2 py-5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading receipt…
        </div>
      ) : events.length === 0 ? (
        <p className="py-5 text-sm text-muted-foreground">No receipt events have been recorded yet.</p>
      ) : (
        <ol className="mt-4 space-y-3">
          {events.map((event, index) => (
            <li key={event.id} className="grid grid-cols-[24px_minmax(0,1fr)] gap-2">
              <div className="relative flex justify-center pt-0.5">
                <EventIcon type={event.event_type} />
                {index < events.length - 1 && (
                  <span className="absolute left-1/2 top-5 h-[calc(100%+6px)] w-px -translate-x-1/2 bg-border" />
                )}
              </div>
              <div className="pb-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium">{labels[event.event_type]}</p>
                  <time className="text-xs text-muted-foreground">{formatMoment(event.created_at)}</time>
                </div>
                {event.detail && <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{event.detail}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
