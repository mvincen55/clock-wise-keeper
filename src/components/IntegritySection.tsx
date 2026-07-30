import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ShieldCheck, Check, X, Loader2, Lock } from 'lucide-react';
import { useSecurityEvents, useResolveSecurityEvent, type SecurityEvent } from '@/hooks/useSecurityEvents';
import { usePracticeSettings, useUpdatePracticeSettings } from '@/hooks/usePracticeSettings';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/time-utils';

const KIND_LABEL: Record<string, string> = {
  auth_abuse: 'Sign-in abuse',
  function_abuse: 'Service abuse',
  ai_jailbreak: 'AI misuse attempt',
  time_anomaly: 'Time anomaly',
  deposit_discrepancy: 'Deposit discrepancy',
  destructive_action: 'Destructive action',
};

function summaryOf(event: SecurityEvent): string {
  const detail = (event.detail ?? {}) as Record<string, unknown>;
  return typeof detail.summary === 'string' ? detail.summary : KIND_LABEL[event.kind] ?? event.kind;
}

function facts(event: SecurityEvent): string[] {
  const detail = (event.detail ?? {}) as Record<string, unknown>;
  return Object.entries(detail)
    .filter(([k]) => k !== 'summary' && k !== 'note' && k !== 'signature_labels')
    .slice(0, 6)
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${Array.isArray(v) ? v.join(', ') : String(v)}`);
}

export default function IntegritySection({ isOwner }: { isOwner: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const { data: events, isLoading } = useSecurityEvents(showAll ? 'all' : 'open');
  const resolve = useResolveSecurityEvent();
  const { data: settings } = usePracticeSettings();
  const updateSettings = useUpdatePracticeSettings();
  const { toast } = useToast();

  const act = async (id: string, status: 'reviewed' | 'dismissed') => {
    try {
      await resolve.mutateAsync({ id, status });
    } catch (err: unknown) {
      toast({
        title: 'Could not update',
        description: err instanceof Error ? err.message : 'Try again',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card className="card-elevated">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Integrity &amp; Safety
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start gap-3 rounded-md bg-muted/50 p-3">
          <Lock className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Purple Envelope monitors system security and data-integrity events — sign-in attempts,
            tamper signals, and AI misuse attempts. <strong>It never reads your messages.</strong>{' '}
            Private conversations and the AI channel are never scanned, by anyone, for any reason.
          </p>
        </div>

        {isOwner && (
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm font-medium">Email managers about serious events</Label>
              <p className="text-xs text-muted-foreground">
                Owners are always emailed. Turn this on to include managers.
              </p>
            </div>
            <Switch
              checked={settings?.security_alert_managers ?? false}
              onCheckedChange={(checked) =>
                updateSettings.mutate({ security_alert_managers: checked })
              }
            />
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {showAll ? 'All recent events' : 'Events awaiting review'}
          </p>
          <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Show open only' : 'Show all'}
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !events?.length ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nothing flagged. The system is watching quietly.
          </p>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <div key={event.id} className="rounded-md border p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={event.severity === 'elevated' ? 'destructive' : 'secondary'}>
                    {event.severity === 'elevated' ? 'Elevated' : 'Watch'}
                  </Badge>
                  <span className="text-sm font-medium">
                    {KIND_LABEL[event.kind] ?? event.kind}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(event.created_at)}
                  </span>
                  {event.status !== 'open' && (
                    <Badge variant="outline" className="capitalize">
                      {event.status}
                    </Badge>
                  )}
                </div>
                <p className="text-sm">{summaryOf(event)}</p>
                <p className="text-xs text-muted-foreground">{facts(event).join(' · ')}</p>
                {event.status === 'open' && (
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => act(event.id, 'reviewed')}
                      disabled={resolve.isPending}
                    >
                      <Check className="h-4 w-4 mr-1" /> Reviewed
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => act(event.id, 'dismissed')}
                      disabled={resolve.isPending}
                    >
                      <X className="h-4 w-4 mr-1" /> Dismiss
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
