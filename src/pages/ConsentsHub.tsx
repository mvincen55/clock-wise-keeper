import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Library, FilePlus2, Layers, ClipboardList, Settings2, ArrowRight,
  FileWarning, FileClock, FileSignature, Link2Off, Archive, Sparkles, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useConsentForms, useInstallSampleLibrary } from '@/hooks/useConsentForms';
import { useConsentBundles } from '@/hooks/useConsentBundles';
import { useConsentPermissions } from '@/hooks/useConsentSettings';
import HubLinkGrid, { HubSection } from '@/components/HubLinkGrid';
import { ConsentPrivacyNote } from '@/components/consents/ConsentPrivacyNote';
import { workingContent } from '@/lib/consents/types';
import { formatDistanceToNow } from 'date-fns';

// Forms & Consents home: the doors to the five sections, plus the
// housekeeping widgets a manager actually acts on. Template activity only —
// completed patient packets are never stored, so nothing here can show one.

const SECTIONS: HubSection[] = [
  {
    title: 'Forms & Consents',
    links: [
      { to: '/consents/library', icon: Library, label: 'Form Library', description: 'Search, preview, and manage every office form.' },
      { to: '/consents/builder', icon: FilePlus2, label: 'Create Form', description: 'Build a form, or convert an uploaded document.' },
      { to: '/consents/bundles', icon: Layers, label: 'Treatment Bundles', description: 'Group the forms each treatment needs.' },
      { to: '/consents/complete', icon: ClipboardList, label: 'Complete Forms', description: 'Guided packet: select, fill, print, and clear.' },
      { to: '/consents/settings', icon: Settings2, label: 'Office Settings', description: 'Permissions, signature rules, privacy, and audit.', managerOnly: true },
    ],
  },
];

function WidgetCard({
  icon: Icon,
  label,
  count,
  to,
  tone = 'default',
}: {
  icon: typeof FileWarning;
  label: string;
  count: number;
  to: string;
  tone?: 'default' | 'warn';
}) {
  return (
    <Link to={to} className="group">
      <Card className="card-elevated h-full transition-colors group-hover:border-primary/40">
        <CardContent className="flex items-center gap-3 p-4">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone === 'warn' && count > 0 ? 'bg-warning/15' : 'bg-primary/10'}`}>
            <Icon className={`h-4 w-4 ${tone === 'warn' && count > 0 ? 'text-warning' : 'text-primary'}`} />
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-bold leading-none">{count}</p>
            <p className="mt-1 text-xs text-muted-foreground leading-snug">{label}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function ConsentsHub() {
  const { data: forms = [], isLoading: formsLoading } = useConsentForms();
  const { data: bundles = [] } = useConsentBundles();
  const { isManager } = useConsentPermissions();
  const installSamples = useInstallSampleLibrary();
  const { toast } = useToast();

  const widgets = useMemo(() => {
    const active = forms.filter(f => f.status !== 'archived');
    return {
      needsReview: active.filter(f => f.needsReview).length,
      drafts: forms.filter(f => f.status === 'draft').length,
      unpublishedChanges: active.filter(f => f.status === 'published' && f.draftContent).length,
      missingSignatures: active.filter(f => {
        const content = workingContent(f);
        return content ? !content.blocks.some(b => b.type === 'signature') : false;
      }).length,
      unlinked: active.filter(
        f => f.procedureCodes.length === 0 && !['office_policy', 'financial', 'other'].includes(f.category),
      ).length,
      archived: forms.filter(f => f.status === 'archived').length,
    };
  }, [forms]);

  const recentForms = useMemo(
    () =>
      [...forms]
        .filter(f => f.status !== 'archived')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 5),
    [forms],
  );

  const topBundles = useMemo(
    () =>
      [...bundles]
        .filter(b => b.status === 'active')
        .sort((a, b) => b.useCount - a.useCount)
        .slice(0, 4),
    [bundles],
  );

  const empty = !formsLoading && forms.length === 0;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Forms &amp; Consents</h1>
          <p className="text-muted-foreground">
            Treatment consents and financial forms — completed, printed, and never stored.
          </p>
        </div>
        <Button asChild>
          <Link to="/consents/complete">
            <ClipboardList className="mr-2 h-4 w-4" />
            Complete Forms
          </Link>
        </Button>
      </div>

      <ConsentPrivacyNote text="Templates and settings only. Patient details entered while completing forms are temporary and are cleared after printing — nothing patient-specific is ever stored." />

      {empty && isManager && (
        <Card className="card-elevated border-primary/30">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium">Start with the sample library</p>
                <p className="text-sm text-muted-foreground max-w-md">
                  13 starter templates and 5 treatment bundles — extraction, implant, root canal,
                  periodontal, denture. All clearly marked as samples to review before clinical use.
                </p>
              </div>
            </div>
            <Button
              onClick={() =>
                installSamples.mutate(undefined, {
                  onSuccess: count =>
                    toast({
                      title: count > 0 ? 'Sample library installed' : 'Samples already installed',
                      description: count > 0 ? 'Review each form before clinical use.' : undefined,
                    }),
                  onError: err => toast({ title: 'Could not install samples', description: String(err), variant: 'destructive' }),
                })
              }
              disabled={installSamples.isPending}
            >
              {installSamples.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Install samples
            </Button>
          </CardContent>
        </Card>
      )}

      <HubLinkGrid sections={SECTIONS} isManager={isManager} />

      {forms.length > 0 && (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Needs attention
            </h2>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
              <WidgetCard icon={FileWarning} label="Forms needing review" count={widgets.needsReview} to="/consents/library?filter=needs_review" tone="warn" />
              <WidgetCard icon={FileClock} label="Draft forms" count={widgets.drafts} to="/consents/library?filter=draft" />
              <WidgetCard icon={FileClock} label="Unpublished changes" count={widgets.unpublishedChanges} to="/consents/library?filter=unpublished" tone="warn" />
              <WidgetCard icon={FileSignature} label="Missing signature lines" count={widgets.missingSignatures} to="/consents/library?filter=no_signature" tone="warn" />
              <WidgetCard icon={Link2Off} label="Not connected to a procedure" count={widgets.unlinked} to="/consents/library?filter=unlinked" />
              <WidgetCard icon={Archive} label="Archived forms" count={widgets.archived} to="/consents/library?filter=archived" />
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="card-elevated">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Recently updated</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {recentForms.map(form => (
                  <Link
                    key={form.id}
                    to={`/consents/builder/${form.id}`}
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <span className="truncate">
                      {form.name}
                      {form.isSample && <Badge variant="outline" className="ml-2 text-[10px]">Sample</Badge>}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(form.updatedAt), { addSuffix: true })}
                    </span>
                  </Link>
                ))}
                {recentForms.length === 0 && (
                  <p className="text-sm text-muted-foreground">No forms yet.</p>
                )}
              </CardContent>
            </Card>

            <Card className="card-elevated">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Most-used bundles</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {topBundles.map(bundle => (
                  <Link
                    key={bundle.id}
                    to="/consents/complete"
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <span className="truncate">
                      {bundle.name}
                      {bundle.isSample && <Badge variant="outline" className="ml-2 text-[10px]">Sample</Badge>}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {bundle.useCount > 0 ? `Used ${bundle.useCount}×` : 'Not used yet'}
                    </span>
                  </Link>
                ))}
                {topBundles.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No bundles yet.{' '}
                    <Link to="/consents/bundles" className="text-primary underline-offset-2 hover:underline">
                      Create one <ArrowRight className="inline h-3 w-3" />
                    </Link>
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
