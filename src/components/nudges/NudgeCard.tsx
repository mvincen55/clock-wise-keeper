import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import AddToMyListButton from '@/components/copilot/AddToMyListButton';
import { Badge } from '@/components/ui/badge';
import { ArrowUpRight, Check, X } from 'lucide-react';
import { useResolveNudge, type OfficeNudge } from '@/hooks/useOfficeNudges';
import {
  humanizeKey,
  humanizeText,
  humanizeValue,
  isIdRef,
  nudgeDestination,
} from '@/lib/nudge-display';
import { formatDate } from '@/lib/time-utils';

/**
 * One nudge: a quiet note from the office assistant, the recorded data it
 * was built from, the record it points at, and the member's verdict on it.
 * Nudges render on the surface they concern (design §3.7); this card is the
 * one way any surface shows them.
 */
const KIND_LABEL: Record<string, string> = {
  goal_task_due: 'Goal step due',
  training_due: 'Training due',
  plan_stall: 'Plan gone quiet',
  sprint_suggestion: 'Sprint idea',
  sprint_verify: 'Sprint needs a verdict',
  sprint_announced: 'Sprint announced',
  sprint_won: 'Sprint won',
  sprint_missed: 'Sprint fell short',
  sprint_pending_verification: 'Sprint awaiting verification',
  sprint_progress: 'Sprint progress',
  close_day_insight: 'Close the Day insight',
  incident_follow_through: 'Incident follow-through',
};

/**
 * The receipts behind a nudge: the recorded data it was built from, in
 * words. Row ids stay out of sight — they power the card's link instead,
 * and when ids were all a nudge cited, the link alone is the receipt.
 */
function BasedOn({ refs }: { refs: Record<string, unknown> }) {
  const cited = Object.entries(refs).filter(([, v]) => v !== null && v !== '');
  const readable = cited.filter(([k, v]) => !isIdRef(k, v));

  if (cited.length > 0 && readable.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">Based on</p>
      {readable.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No data cited — this one is a general note.
        </p>
      ) : (
        <dl className="grid gap-1.5 rounded-lg border bg-muted/40 p-3 sm:grid-cols-2">
          {readable.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3">
              <dt className="text-xs text-muted-foreground">{humanizeKey(k)}</dt>
              <dd className="text-xs font-medium">{humanizeValue(v)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** Clicks on the card's own controls must not also open the destination. */
function onInteractive(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && !!target.closest('button, a, input, label');
}

export default function NudgeCard({ nudge }: { nudge: OfficeNudge }) {
  const resolve = useResolveNudge();
  const navigate = useNavigate();
  const resolved = nudge.status === 'acted_on' || nudge.status === 'dismissed';
  const destination = nudgeDestination(nudge);
  const content = humanizeText(nudge.content);

  return (
    <Card
      className={
        destination
          ? 'card-elevated cursor-pointer transition-colors hover:border-primary/40'
          : 'card-elevated'
      }
      onClick={destination ? e => { if (!onInteractive(e.target)) navigate(destination.to); } : undefined}
    >
      <CardContent className="space-y-3 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{KIND_LABEL[nudge.kind] ?? humanizeKey(nudge.kind)}</Badge>
          <span className="text-xs text-muted-foreground">
            {formatDate(nudge.created_at)}
          </span>
          {resolved && (
            <Badge variant="outline">
              {nudge.status === 'acted_on' ? 'On it' : 'Not for me'}
            </Badge>
          )}
        </div>

        <p className="text-sm leading-relaxed">{content}</p>

        <BasedOn refs={nudge.data_refs} />

        {destination && (
          <Link
            to={destination.to}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {destination.label}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        )}

        {!resolved && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm"
              onClick={() => resolve.mutate({ id: nudge.id, status: 'acted_on' })}
              disabled={resolve.isPending}
            >
              <Check className="mr-1.5 h-3.5 w-3.5" />
              On it
            </Button>
            {/* One-tap capture: the nudge becomes a real item on their list. */}
            <AddToMyListButton surface="nudge" title={content.slice(0, 100)} />
            <Button
              size="sm"
              variant="outline"
              onClick={() => resolve.mutate({ id: nudge.id, status: 'dismissed' })}
              disabled={resolve.isPending}
            >
              <X className="mr-1.5 h-3.5 w-3.5" />
              Not for me
            </Button>
          </div>
        )}

      </CardContent>
    </Card>
  );
}
