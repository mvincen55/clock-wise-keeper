import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Check, Inbox, Loader2, X } from 'lucide-react';
import { useOfficeNudges, useResolveNudge, type OfficeNudge } from '@/hooks/useOfficeNudges';
import { formatDate } from '@/lib/time-utils';

const KIND_LABEL: Record<string, string> = {
  goal_task_due: 'Goal step due',
  training_due: 'Training due',
  plan_stall: 'Plan gone quiet',
  sprint_suggestion: 'Sprint idea',
};

function prettyKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}

function prettyValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** The receipts behind a nudge: exactly the recorded data it was built from. */
function DataRefs({ refs }: { refs: Record<string, unknown> }) {
  const entries = Object.entries(refs).filter(([, v]) => v !== null && v !== '');
  if (entries.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No data cited — this one is a general note.
      </p>
    );
  }
  return (
    <dl className="grid gap-1.5 rounded-lg border bg-muted/40 p-3 sm:grid-cols-2">
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-3">
          <dt className="text-xs text-muted-foreground">{prettyKey(k)}</dt>
          <dd className="text-xs font-medium">{prettyValue(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

function NudgeCard({ nudge }: { nudge: OfficeNudge }) {
  const resolve = useResolveNudge();
  const resolved = nudge.status === 'acted_on' || nudge.status === 'dismissed';

  return (
    <Card className="card-elevated">
      <CardContent className="space-y-3 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{KIND_LABEL[nudge.kind] ?? prettyKey(nudge.kind)}</Badge>
          <span className="text-xs text-muted-foreground">
            {formatDate(nudge.created_at)}
          </span>
          {resolved && (
            <Badge variant="outline">
              {nudge.status === 'acted_on' ? 'On it' : 'Not for me'}
            </Badge>
          )}
        </div>

        <p className="text-sm leading-relaxed">{nudge.content}</p>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Based on</p>
          <DataRefs refs={nudge.data_refs} />
        </div>

        {!resolved && (
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              onClick={() => resolve.mutate({ id: nudge.id, status: 'acted_on' })}
              disabled={resolve.isPending}
            >
              <Check className="mr-1.5 h-3.5 w-3.5" />
              On it
            </Button>
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

export default function OfficeNudgesPage() {
  const [showResolved, setShowResolved] = useState(false);
  const { data: nudges, isLoading } = useOfficeNudges(showResolved);

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
        <header className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Inbox className="h-5 w-5 text-primary" />
            Nudge inbox
          </h1>
          <p className="text-sm text-muted-foreground">
            Quiet notes from the office assistant, each one showing the recorded data behind it.
            Nothing here reads your messages — only your own work records.
          </p>
        </header>

        <div className="flex items-center gap-2">
          <Switch id="show-resolved" checked={showResolved} onCheckedChange={setShowResolved} />
          <Label htmlFor="show-resolved" className="text-sm text-muted-foreground">
            Include handled notes
          </Label>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !nudges?.length ? (
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle className="text-base">Nothing waiting</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                The assistant stays quiet when there's nothing worth saying. Check back later.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {nudges.map(n => (
              <NudgeCard key={n.id} nudge={n} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
