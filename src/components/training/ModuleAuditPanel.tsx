import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  useAuditFindings,
  useResolveFinding,
  useRunAudit,
  type AuditFinding,
} from '@/hooks/useTrainingAudit';

const TONE: Record<AuditFinding['severity'], string> = {
  critical: 'destructive',
  warning: 'secondary',
  info: 'outline',
};

/**
 * What the reviewer flagged on one module. Owners and managers decide — the
 * module is never blocked or changed automatically.
 */
export default function ModuleAuditPanel({ moduleId }: { moduleId: string }) {
  const { data: findings = [] } = useAuditFindings();
  const resolve = useResolveFinding();
  const runAudit = useRunAudit();

  const mine = findings.filter(f => f.module_id === moduleId);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            {mine.length ? (
              <AlertTriangle className="h-4 w-4 text-destructive" />
            ) : (
              <ShieldCheck className="h-4 w-4 text-primary" />
            )}
            Review
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            disabled={runAudit.isPending}
            onClick={async () => {
              await runAudit.mutateAsync(moduleId);
              toast.success('Review finished.');
            }}
          >
            {runAudit.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Re-check against office rules
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {mine.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nothing flagged against the office's rules.
          </p>
        )}
        {mine.map(f => (
          <div key={f.id} className="space-y-1.5 rounded-lg border border-border/60 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={TONE[f.severity] as 'default' | 'secondary' | 'outline' | 'destructive'}>
                {f.severity}
              </Badge>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {f.category}
              </span>
            </div>
            {f.quote && (
              <p className="break-words border-l-2 border-border pl-2 text-sm italic text-muted-foreground">
                "{f.quote}"
              </p>
            )}
            <p className="break-words text-sm">{f.note}</p>
            {f.suggested_fix && (
              <p className="break-words text-sm text-muted-foreground">
                Suggested fix: {f.suggested_fix}
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => resolve.mutate({ id: f.id, status: 'fixed' })}
              >
                Handled
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => resolve.mutate({ id: f.id, status: 'dismissed' })}
              >
                Not an issue
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
