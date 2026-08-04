import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  FileSearch,
  FolderCog,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import PracticeSetupSourceCard from '@/components/practice-setup/PracticeSetupSourceCard';
import {
  useInitializePracticeSetup,
  usePracticeSetup,
  useResolvePracticeSetupFinding,
} from '@/hooks/usePracticeSetup';
import { useKnowledgeWorkspace } from '@/hooks/useKnowledge';
import { useOfficeDocs } from '@/hooks/useOfficeDocs';
import { useOrgContext } from '@/hooks/useOrgContext';
import { setupProgress, type PracticeSetupSourceStatus } from '@/lib/practice-setup';

type Filter = 'all' | PracticeSetupSourceStatus;

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'All sources' },
  { value: 'pending', label: 'Needs decision' },
  { value: 'confirmed', label: 'Ready for draft' },
  { value: 'converted', label: 'Draft created' },
  { value: 'source_only', label: 'Source reference' },
  { value: 'excluded', label: 'Excluded' },
];

function findingBadge(severity: 'info' | 'review' | 'attention') {
  if (severity === 'attention') return <Badge variant="destructive">Needs attention</Badge>;
  if (severity === 'review') return <Badge className="bg-amber-600">Review</Badge>;
  return <Badge variant="secondary">Check placement</Badge>;
}

export default function PracticeSetup() {
  const { data: ctx, isLoading: contextLoading } = useOrgContext();
  const { data: documents = [], isLoading: docsLoading } = useOfficeDocs();
  const { data: knowledge, isLoading: knowledgeLoading } = useKnowledgeWorkspace();
  const { data: setup, isLoading: setupLoading, error } = usePracticeSetup();
  const initialize = useInitializePracticeSetup();
  const resolveFinding = useResolvePracticeSetupFinding();
  const [filter, setFilter] = useState<Filter>('all');

  const isAdmin = ctx?.role === 'owner' || ctx?.role === 'manager';
  const documentById = new Map(documents.map(document => [document.id, document]));
  const sourceById = new Map((setup?.sources ?? []).map(source => [source.id, source]));
  const duplicateCounts = new Map<string, number>();
  for (const source of setup?.sources ?? []) {
    if (!source.duplicate_key) continue;
    duplicateCounts.set(source.duplicate_key, (duplicateCounts.get(source.duplicate_key) ?? 0) + 1);
  }

  const counts = {
    pending: setup?.sources.filter(source => source.status === 'pending').length ?? 0,
    confirmed: setup?.sources.filter(source => source.status === 'confirmed').length ?? 0,
    sourceOnly: setup?.sources.filter(source => source.status === 'source_only').length ?? 0,
    excluded: setup?.sources.filter(source => source.status === 'excluded').length ?? 0,
    converted: setup?.sources.filter(source => source.status === 'converted').length ?? 0,
  };
  const progress = setupProgress(counts);
  const filteredSources = (setup?.sources ?? []).filter(source => filter === 'all' || source.status === filter);
  const openFindings = setup?.findings.filter(finding => finding.status === 'open') ?? [];

  if (contextLoading || docsLoading || setupLoading || knowledgeLoading) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }
  if (ctx && !isAdmin) return <Navigate to="/" replace />;

  const scan = async () => {
    try {
      await initialize.mutateAsync();
      toast.success(setup?.session ? 'Source inventory refreshed' : 'Practice Setup started');
    } catch (scanError) {
      toast.error(scanError instanceof Error ? scanError.message : 'Could not scan office documents');
    }
  };

  const resolve = async (findingId: string, status: 'resolved' | 'dismissed') => {
    try {
      await resolveFinding.mutateAsync({ findingId, status });
      toast.success(status === 'resolved' ? 'Finding marked resolved' : 'Finding dismissed');
    } catch (resolveError) {
      toast.error(resolveError instanceof Error ? resolveError.message : 'Could not update the finding');
    }
  };

  if (error) {
    return (
      <div className="mx-auto max-w-4xl p-4 md:p-8">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Practice Setup is not available yet</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : 'The setup tables could not be loaded.'} No source documents or published office content were changed.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!setup?.session) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
        <header>
          <div className="flex items-center gap-2">
            <FolderCog className="h-7 w-7 text-primary" />
            <h1 className="text-2xl font-bold md:text-3xl">Practice Setup</h1>
          </div>
          <p className="mt-1 text-muted-foreground">
            Turn an office's existing manuals and loose documents into a clean dental Handbook and Practice Playbook.
          </p>
        </header>

        <Card className="overflow-hidden border-primary/25">
          <CardContent className="p-0">
            <div className="bg-primary px-6 py-5 text-primary-foreground">
              <Sparkles className="h-8 w-8" />
              <h2 className="mt-3 text-xl font-semibold">Start with what the office already has</h2>
              <p className="mt-1 max-w-2xl text-sm text-primary-foreground/80">
                Purple Envelope inventories every uploaded source, suggests where it belongs, and flags likely duplicates or filing problems.
              </p>
            </div>
            <div className="space-y-4 p-6">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border p-3">
                  <p className="font-semibold">1. Review sources</p>
                  <p className="mt-1 text-xs text-muted-foreground">Decide whether each document is policy, procedure, reference, or not useful.</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="font-semibold">2. Resolve the mess</p>
                  <p className="mt-1 text-xs text-muted-foreground">Compare possible duplicates and catch documents filed in the wrong place.</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="font-semibold">3. Create drafts</p>
                  <p className="mt-1 text-xs text-muted-foreground">Convert only confirmed sources. Nothing becomes live without review and approval.</p>
                </div>
              </div>

              <Alert className="border-emerald-200 bg-emerald-50">
                <ShieldCheck className="h-4 w-4 text-emerald-700" />
                <AlertTitle>Human-confirmed by design</AlertTitle>
                <AlertDescription>
                  AI and rules may organize the work, but they cannot silently publish policy, overwrite an original file, or decide which conflicting document is correct.
                </AlertDescription>
              </Alert>

              {documents.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center">
                  <FileSearch className="mx-auto h-9 w-9 text-muted-foreground/50" />
                  <p className="mt-3 font-medium">No source documents are uploaded yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">Add existing manuals and office documents through Ask AI, then return here.</p>
                  <Button asChild className="mt-4" variant="outline"><Link to="/assistant">Open Ask AI documents</Link></Button>
                </div>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    Ready to scan {documents.length} uploaded source{documents.length === 1 ? '' : 's'}.
                  </p>
                  <Button onClick={scan} disabled={initialize.isPending}>
                    {initialize.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    Start Practice Setup
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FolderCog className="h-7 w-7 text-primary" />
            <h1 className="text-2xl font-bold md:text-3xl">Practice Setup</h1>
          </div>
          <p className="mt-1 max-w-3xl text-muted-foreground">
            Clean up source documents and turn only confirmed material into governed dental-office drafts.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link to="/management/knowledge">Knowledge Workspace</Link></Button>
          <Button onClick={scan} disabled={initialize.isPending}>
            {initialize.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Rescan sources
          </Button>
        </div>
      </header>

      <Alert className="border-primary/25 bg-primary/5">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <AlertTitle>Suggestions are not decisions</AlertTitle>
        <AlertDescription>
          Each source requires an owner or manager decision. Conversions create editable drafts only. The normal second-person review and publication workflow still applies.
        </AlertDescription>
      </Alert>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardContent className="p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-2xl font-bold">{progress}%</p>
                <p className="text-xs text-muted-foreground">Source decisions complete</p>
              </div>
              <p className="text-xs text-muted-foreground">{counts.pending} remaining</p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          </CardContent>
        </Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-bold text-amber-700">{counts.pending}</p><p className="text-xs text-muted-foreground">Need a decision</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-bold text-violet-700">{counts.confirmed}</p><p className="text-xs text-muted-foreground">Ready for draft</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-bold text-emerald-700">{counts.converted}</p><p className="text-xs text-muted-foreground">Drafts created</p></CardContent></Card>
      </section>

      {openFindings.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-700" />
            <h2 className="text-lg font-semibold">Things that need a closer look</h2>
            <Badge variant="outline">{openFindings.length}</Badge>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {openFindings.map(finding => {
              const linkedSources = setup.findingSources
                .filter(link => link.finding_id === finding.id)
                .map(link => sourceById.get(link.source_id))
                .filter(Boolean);
              const linkedTitles = linkedSources
                .map(source => source ? documentById.get(source.office_doc_id)?.title : null)
                .filter((title): title is string => !!title);
              return (
                <Card key={finding.id} className="border-amber-200">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="text-base">{finding.title}</CardTitle>
                      {findingBadge(finding.severity)}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm leading-6 text-muted-foreground">{finding.detail}</p>
                    {linkedTitles.length > 0 && (
                      <div className="rounded-md bg-muted/50 px-3 py-2 text-xs">
                        {linkedTitles.join(' · ')}
                      </div>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => resolve(finding.id, 'dismissed')} disabled={resolveFinding.isPending}>Dismiss</Button>
                      <Button size="sm" variant="outline" onClick={() => resolve(finding.id, 'resolved')} disabled={resolveFinding.isPending}>
                        <CheckCircle2 className="mr-1.5 h-4 w-4" /> Resolved
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Source document decisions</h2>
            <p className="text-sm text-muted-foreground">Original uploads stay untouched throughout setup.</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map(option => (
              <Button key={option.value} size="sm" variant={filter === option.value ? 'default' : 'outline'} onClick={() => setFilter(option.value)}>
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        {filteredSources.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No sources match this view.</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {filteredSources.map(source => {
              const document = documentById.get(source.office_doc_id);
              if (!document) return null;
              return (
                <PracticeSetupSourceCard
                  key={source.id}
                  source={source}
                  document={document}
                  categories={knowledge?.categories ?? []}
                  duplicateCount={source.duplicate_key ? duplicateCounts.get(source.duplicate_key) ?? 0 : 0}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
