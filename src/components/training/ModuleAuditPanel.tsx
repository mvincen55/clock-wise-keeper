import { AlertTriangle, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ModuleAudit } from '@/hooks/useTraining';

/** Compact auditor verdict chip for a module card. Admins/managers only. */
export function ModuleAuditBadge({ audit }: { audit: ModuleAudit | null }) {
  if (!audit) return null;
  const count = audit.findings?.length ?? 0;

  const config =
    audit.verdict === 'blocked'
      ? { icon: ShieldAlert, label: 'Held for review', variant: 'destructive' as const }
      : audit.verdict === 'needs_review'
      ? { icon: AlertTriangle, label: `${count} auditor note${count === 1 ? '' : 's'}`, variant: 'outline' as const }
      : audit.verdict === 'clean'
      ? { icon: ShieldCheck, label: 'Auditor: clean', variant: 'secondary' as const }
      : { icon: AlertTriangle, label: 'Not audited', variant: 'outline' as const };

  const Icon = config.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant={config.variant} className="gap-1">
            <Icon className="h-3 w-3" />
            {config.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="text-xs">{audit.summary || 'The auditor reviewed this module.'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Full auditor read-out — every finding, what is wrong, and how to fix it. */
export default function ModuleAuditPanel({ audit }: { audit: ModuleAudit | null }) {
  if (!audit) return null;
  const findings = audit.findings ?? [];

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <p className="text-sm font-medium">Auditor review</p>
        <ModuleAuditBadge audit={audit} />
      </div>
      {audit.summary && <p className="mt-1.5 text-sm text-muted-foreground">{audit.summary}</p>}

      {findings.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Nothing contradicts your office rules and nothing was flagged as incorrect.
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {findings.map((f, i) => (
            <li key={i} className="rounded-md bg-muted/50 p-2 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant={f.severity === 'high' ? 'destructive' : 'outline'}>
                  {f.severity}
                </Badge>
                <Badge variant="secondary">{f.kind}</Badge>
                {f.where && <span className="text-muted-foreground">{f.where}</span>}
              </div>
              {f.quote && <p className="mt-1.5 italic text-muted-foreground">“{f.quote}”</p>}
              <p className="mt-1">{f.issue}</p>
              {f.fix && <p className="mt-1 text-muted-foreground">Fix: {f.fix}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
