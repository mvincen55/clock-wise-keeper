import { Check, Loader2 } from 'lucide-react';

export type TicketStage = 'open' | 'analyst' | 'escalated' | 'solved';

const STAGES: { key: TicketStage; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'analyst', label: 'Analyst trying' },
  { key: 'escalated', label: 'Escalated' },
  { key: 'solved', label: 'Solved' },
];

/** Turn a ticket row into the stage it's sitting at right now. */
export function stageFromTicket(
  status: string | null | undefined,
  tier: string | null | undefined,
  hasAnswer = true,
): TicketStage {
  if (status === 'resolved' || status === 'closed') return 'solved';
  if (status === 'escalated' || tier === 'senior') return 'escalated';
  return hasAnswer ? 'analyst' : 'open';
}

/**
 * A quiet, four-step read on where a problem report stands.
 * Same component in the widget and the notifications panel so the
 * story never reads differently in two places.
 */
export default function TicketTimeline({
  stage,
  working = false,
  className = '',
}: {
  stage: TicketStage;
  working?: boolean;
  className?: string;
}) {
  const current = STAGES.findIndex(s => s.key === stage);

  return (
    <ol className={`flex items-center gap-1 ${className}`} aria-label="Report status">
      {STAGES.map((s, i) => {
        const done = i < current || stage === 'solved';
        const active = i === current;
        return (
          <li key={s.key} className="flex flex-1 items-center gap-1">
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] ${
                done
                  ? 'border-primary bg-primary text-primary-foreground'
                  : active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-muted text-muted-foreground'
              }`}
            >
              {done ? (
                <Check className="h-2.5 w-2.5" />
              ) : active && working ? (
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
              ) : (
                i + 1
              )}
            </span>
            <span
              className={`truncate text-[10px] leading-tight ${
                active ? 'font-medium text-foreground' : 'text-muted-foreground'
              }`}
            >
              {s.label}
            </span>
            {i < STAGES.length - 1 && (
              <span
                className={`h-px flex-1 ${done ? 'bg-primary/50' : 'bg-border'}`}
                aria-hidden="true"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
