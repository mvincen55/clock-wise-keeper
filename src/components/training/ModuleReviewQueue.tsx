import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Check, ChevronDown, Fingerprint, Loader2, ShieldAlert, X } from 'lucide-react';
import {
  useBulkReviewModules,
  useDraftModules,
  useModuleFindings,
  type ModuleFinding,
} from '@/hooks/useTraining';

const SEVERITY_TONE: Record<string, string> = {
  high: 'bg-destructive text-destructive-foreground',
  medium: 'bg-warning text-warning-foreground',
  low: 'bg-muted text-muted-foreground',
};

function FindingRow({ finding }: { finding: ModuleFinding }) {
  return (
    <div className="rounded-md border border-border/60 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={SEVERITY_TONE[finding.severity] ?? SEVERITY_TONE.low}>
          {finding.severity}
        </Badge>
        <span className="text-xs text-muted-foreground">{finding.category}</span>
        <span
          title={finding.fingerprint}
          className="ml-auto flex items-center gap-1 font-mono text-[11px] text-muted-foreground"
        >
          <Fingerprint className="h-3 w-3" />
          {finding.fingerprint.slice(0, 12)}
        </span>
      </div>
      {finding.note && <p className="mt-1.5 text-sm">{finding.note}</p>}
      {finding.suggested_fix && (
        <p className="mt-1 text-xs text-muted-foreground">Fix: {finding.suggested_fix}</p>
      )}
    </div>
  );
}

/** The queue of drafts the auditor held back — approve or reject in bulk. */
export default function ModuleReviewQueue() {
  const { data: drafts = [], isLoading } = useDraftModules();
  const ids = useMemo(() => drafts.map(d => d.id), [drafts]);
  const { data: findingsByModule } = useModuleFindings(ids);
  const review = useBulkReviewModules();

  const [selected, setSelected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const inQueue = selected.filter(id => ids.includes(id));
  const allChecked = ids.length > 0 && inQueue.length === ids.length;

  const toggle = (id: string) =>
    setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const run = async (action: 'approve' | 'reject') => {
    try {
      const count = await review.mutateAsync({ ids: inQueue, action });
      setSelected([]);
      toast.success(
        action === 'approve'
          ? `${count} module${count === 1 ? '' : 's'} published to the library.`
          : `${count} module${count === 1 ? '' : 's'} archived.`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update those modules');
    }
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading the queue…</p>;

  if (drafts.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <ShieldAlert className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Nothing waiting for review. Modules the auditor flags land here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 p-3">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={allChecked}
            onCheckedChange={checked => setSelected(checked ? ids : [])}
          />
          Select all ({drafts.length})
        </label>
        <span className="text-xs text-muted-foreground">{inQueue.length} selected</span>
        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            disabled={inQueue.length === 0 || review.isPending}
            onClick={() => run('approve')}
          >
            {review.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-1.5 h-4 w-4" />
            )}
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={inQueue.length === 0 || review.isPending}
            onClick={() => run('reject')}
          >
            <X className="mr-1.5 h-4 w-4" />
            Reject
          </Button>
        </div>
      </div>

      {drafts.map(module => {
        const findings = findingsByModule?.get(module.id) ?? [];
        const open = expanded === module.id;
        return (
          <Card key={module.id}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  className="mt-1"
                  checked={selected.includes(module.id)}
                  onCheckedChange={() => toggle(module.id)}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{module.title}</p>
                  <p className="text-sm text-muted-foreground">{module.summary}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {module.audience_tags.map(tag => (
                      <Badge key={tag} variant="outline">
                        {tag}
                      </Badge>
                    ))}
                    {findings.length > 0 && (
                      <Badge variant="secondary">
                        {findings.length} finding{findings.length === 1 ? '' : 's'}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {findings.length > 0 && (
                <Collapsible open={open} onOpenChange={o => setExpanded(o ? module.id : null)}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-2 px-0 text-muted-foreground">
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
                      />
                      Auditor findings & fingerprints
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 space-y-2">
                    {findings.map(f => (
                      <FindingRow key={f.id} finding={f} />
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
