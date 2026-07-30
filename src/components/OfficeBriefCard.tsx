import { Card, CardContent } from '@/components/ui/card';
import { Mail, Loader2 } from 'lucide-react';
import { useOfficeBrief } from '@/hooks/useOfficeInsights';

/**
 * The Office Brief — two or three sentences of the office's own numbers,
 * written for the reader's role and refreshed once a day. Silent when the
 * intelligence layer has nothing grounded to say.
 */
export default function OfficeBriefCard() {
  const { data, isLoading } = useOfficeBrief();

  if (isLoading) {
    return (
      <Card className="paper-surface">
        <CardContent className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Pulling today's numbers together…
        </CardContent>
      </Card>
    );
  }

  if (!data?.brief) return null;

  return (
    <Card className="paper-surface border-primary/30">
      <CardContent className="flex gap-3 p-4">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Mail className="h-4 w-4 text-primary" />
        </span>
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            The Office Brief
          </p>
          <p className="text-sm leading-relaxed">{data.brief}</p>
        </div>
      </CardContent>
    </Card>
  );
}
