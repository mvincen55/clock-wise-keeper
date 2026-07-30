import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ModuleAudit } from '@/hooks/useTraining';

const SEVERITY: Record<string, string> = {
  high: 'destructive',
  medium: 'secondary',
  low: 'outline',
};

/** What the auditor found before the module was allowed to publish. */
export default function ModuleAuditPanel({ audit }: { audit: ModuleAudit }) {
  if (audit.verdict === 'clear') {
    return (
      <div className="flex items-start gap-2 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div>
          <p className="font-medium">Auditor cleared it</p>
          <p className="text-muted-foreground">
            {audit.summary || 'Nothing contradicts the office rules or documents.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-3">
      <div className="flex items-start gap-2 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div>
          <p className="font-medium">
            {audit.verdict === 'unreviewed'
              ? 'The auditor could not review this'
              : 'The auditor flagged this module'}
          </p>
          <p className="text-muted-foreground">
            {audit.summary || 'Read the findings below before publishing.'}
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {audit.findings.map((f, i) => (
          <li key={i} className="rounded-md border border-border bg-background p-2.5 text-sm">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <Badge variant={(SEVERITY[f.severity] ?? 'secondary') as never}>{f.severity}</Badge>
              {f.where && <span className="text-xs text-muted-foreground">{f.where}</span>}
            </div>
            <p>{f.issue}</p>
            {f.conflicts_with && f.conflicts_with !== 'none' && (
              <p className="mt-1 text-xs text-muted-foreground">
                <span className="font-medium">Conflicts with: </span>
                {f.conflicts_with}
              </p>
            )}
            {f.fix && (
              <p className="mt-1 text-xs text-muted-foreground">
                <span className="font-medium">Fix: </span>
                {f.fix}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
