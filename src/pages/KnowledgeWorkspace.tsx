import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  BookOpenCheck,
  CheckCircle2,
  FileEdit,
  FilePlus2,
  LibraryBig,
  Loader2,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import KnowledgeEditorDialog from '@/components/knowledge/KnowledgeEditorDialog';
import KnowledgeReviewDialog from '@/components/knowledge/KnowledgeReviewDialog';
import { useAuth } from '@/hooks/useAuth';
import {
  useCreateKnowledgeRevision,
  useEnsureKnowledgeCategories,
  useKnowledgeWorkspace,
  usePublishKnowledgeVersion,
  type KnowledgeWorkspaceItem,
} from '@/hooks/useKnowledge';
import { useOrgContext } from '@/hooks/useOrgContext';
import {
  KNOWLEDGE_STATUS_LABELS,
  knowledgeAreaLabel,
  knowledgeAudienceLabel,
  knowledgeKindLabel,
  knowledgeStatusBadgeClass,
  workflowActionForStatus,
  type KnowledgeArea,
  type KnowledgeStatus,
} from '@/lib/knowledge';

type Filter = 'all' | 'needs_action' | 'published' | KnowledgeArea;

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'needs_action', label: 'Needs action' },
  { value: 'handbook', label: 'Handbook' },
  { value: 'playbook', label: 'Playbook' },
  { value: 'published', label: 'Published' },
];

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Not yet';
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function actionLabel(status: KnowledgeStatus): string {
  const action = workflowActionForStatus(status);
  if (action === 'edit') return 'Edit draft';
  if (action === 'review') return 'Review';
  if (action === 'publish') return 'Publish';
  if (action === 'revise') return 'Create revision';
  return 'View';
}

export default function KnowledgeWorkspace() {
  const { user } = useAuth();
  const { data: ctx, isLoading: contextLoading } = useOrgContext();
  const { data, isLoading, error, refetch } = useKnowledgeWorkspace();
  const ensureCategories = useEnsureKnowledgeCategories();
  const publish = usePublishKnowledgeVersion();
  const createRevision = useCreateKnowledgeRevision();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<KnowledgeWorkspaceItem | null>(null);

  const items = data?.items ?? [];
  const normalizedQuery = query.trim().toLowerCase();
  const filteredItems = items.filter(item => {
    const version = item.workingVersion;
    if (!version) return false;

    const matchesFilter =
      filter === 'all' ||
      (filter === 'needs_action' && ['draft', 'in_review', 'approved'].includes(version.status)) ||
      (filter === 'published' && !!item.publishedVersion) ||
      (filter === 'handbook' && item.kind === 'policy') ||
      (filter === 'playbook' && item.kind === 'procedure');

    const matchesQuery =
      !normalizedQuery ||
      item.title.toLowerCase().includes(normalizedQuery) ||
      item.summary.toLowerCase().includes(normalizedQuery) ||
      item.category?.name.toLowerCase().includes(normalizedQuery);

    return matchesFilter && matchesQuery;
  });

  const publishedCount = items.filter(item => !!item.publishedVersion).length;
  const needsActionCount = items.filter(item =>
    ['draft', 'in_review', 'approved'].includes(item.workingVersion?.status ?? ''),
  ).length;

  if (contextLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const isAdmin = ctx?.role === 'owner' || ctx?.role === 'manager';
  if (ctx && !isAdmin) return <Navigate to="/" replace />;

  const startNew = () => {
    setSelectedItem(null);
    setEditorOpen(true);
  };

  const runItemAction = async (item: KnowledgeWorkspaceItem) => {
    const version = item.workingVersion;
    if (!version) return;
    const action = workflowActionForStatus(version.status);

    if (action === 'edit') {
      setSelectedItem(item);
      setEditorOpen(true);
      return;
    }
    if (action === 'review') {
      setSelectedItem(item);
      setReviewOpen(true);
      return;
    }
    if (action === 'publish') {
      const confirmed = window.confirm(
        `Publish version ${version.version_number} of “${item.title}”? Team members in its audience will see it immediately.`,
      );
      if (!confirmed) return;
      try {
        await publish.mutateAsync(version.id);
        toast.success('Published to the office library');
      } catch (publishError) {
        toast.error(publishError instanceof Error ? publishError.message : 'Could not publish this version');
      }
      return;
    }
    if (action === 'revise') {
      try {
        await createRevision.mutateAsync(item.id);
        const refreshedResult = await refetch();
        const refreshed = refreshedResult.data?.items.find(candidate => candidate.id === item.id);
        if (!refreshed || refreshed.workingVersion?.status !== 'draft') {
          throw new Error('The revision was created but could not be opened. Refresh and try again.');
        }
        toast.success('New revision created');
        setSelectedItem(refreshed);
        setEditorOpen(true);
      } catch (revisionError) {
        toast.error(revisionError instanceof Error ? revisionError.message : 'Could not create a revision');
      }
    }
  };

  const initializeCategories = async () => {
    try {
      await ensureCategories.mutateAsync();
      toast.success('Dental handbook and playbook categories are ready');
    } catch (setupError) {
      toast.error(setupError instanceof Error ? setupError.message : 'Could not set up categories');
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <LibraryBig className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold md:text-3xl">Knowledge Workspace</h1>
          </div>
          <p className="mt-1 max-w-3xl text-muted-foreground">
            Build, review, and publish the office Policy Handbook and Practice Playbook without editing the live version in place.
          </p>
        </div>
        <Button onClick={startNew} disabled={!data || data.categories.length === 0}>
          <FilePlus2 className="mr-2 h-4 w-4" /> New policy or procedure
        </Button>
      </header>

      {error ? (
        <Alert variant="destructive">
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>The governed knowledge workspace is not available yet</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{error instanceof Error ? error.message : 'The knowledge tables could not be loaded.'}</p>
            <p>No existing handbook, playbook, forms, or insurance manuals were changed.</p>
          </AlertDescription>
        </Alert>
      ) : isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : data ? (
        <>
          {data.categories.length === 0 && (
            <Card className="border-primary/25 bg-primary/5">
              <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">Set up the dental knowledge structure</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Start with practical dental categories for the employee handbook and office procedures. They remain fully editable later.
                  </p>
                </div>
                <Button onClick={initializeCategories} disabled={ensureCategories.isPending}>
                  {ensureCategories.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  Set up categories
                </Button>
              </CardContent>
            </Card>
          )}

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{items.length}</p>
                <p className="text-xs text-muted-foreground">Policies and procedures</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className={`text-2xl font-bold ${needsActionCount > 0 ? 'text-amber-700' : ''}`}>{needsActionCount}</p>
                <p className="text-xs text-muted-foreground">Need management action</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold text-emerald-700">{publishedCount}</p>
                <p className="text-xs text-muted-foreground">Published</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{data.categories.length}</p>
                <p className="text-xs text-muted-foreground">Dental categories</p>
              </CardContent>
            </Card>
          </section>

          <section className="space-y-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-1.5">
                {FILTERS.map(option => (
                  <Button
                    key={option.value}
                    size="sm"
                    variant={filter === option.value ? 'default' : 'outline'}
                    onClick={() => setFilter(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
              <div className="relative w-full lg:w-80">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="Search titles, summaries, categories…"
                  className="pl-9"
                />
              </div>
            </div>

            {filteredItems.length === 0 ? (
              <Card>
                <CardContent className="py-14 text-center">
                  <BookOpenCheck className="mx-auto h-10 w-10 text-muted-foreground/50" />
                  <p className="mt-3 font-medium">
                    {items.length === 0 ? 'No governed policies or procedures yet' : 'Nothing matches this view'}
                  </p>
                  <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
                    {items.length === 0
                      ? 'Uploaded documents remain source evidence. Create the first canonical policy or procedure when the category structure is ready.'
                      : 'Try another filter or search phrase.'}
                  </p>
                  {items.length === 0 && data.categories.length > 0 && (
                    <Button className="mt-4" onClick={startNew}>
                      <FilePlus2 className="mr-2 h-4 w-4" /> Create the first one
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredItems.map(item => {
                  const version = item.workingVersion;
                  if (!version) return null;
                  const isOwnReview = version.status === 'in_review' && version.created_by === user?.id;
                  return (
                    <Card key={item.id} className="transition-colors hover:border-primary/30">
                      <CardHeader className="pb-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <CardTitle className="text-lg">{item.title}</CardTitle>
                              <Badge variant="outline" className={knowledgeStatusBadgeClass(version.status)}>
                                {KNOWLEDGE_STATUS_LABELS[version.status]}
                              </Badge>
                              <Badge variant="secondary">{knowledgeKindLabel(item.kind)}</Badge>
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {item.summary || 'No summary yet.'}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant={version.status === 'approved' ? 'default' : 'outline'}
                            onClick={() => runItemAction(item)}
                            disabled={publish.isPending || createRevision.isPending}
                          >
                            {version.status === 'draft' && <FileEdit className="mr-1.5 h-4 w-4" />}
                            {version.status === 'in_review' && <CheckCircle2 className="mr-1.5 h-4 w-4" />}
                            {version.status === 'approved' && <Send className="mr-1.5 h-4 w-4" />}
                            {actionLabel(version.status)}
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="grid gap-3 border-t pt-3 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-5">
                        <div>
                          <p className="font-semibold text-foreground">Library</p>
                          <p>{knowledgeAreaLabel(item.kind === 'policy' ? 'handbook' : 'playbook')}</p>
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">Category</p>
                          <p>{item.category?.name ?? 'Uncategorized'}</p>
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">Version</p>
                          <p>{version.version_number}</p>
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">Audience</p>
                          <p>{item.audience_roles.map(knowledgeAudienceLabel).join(', ')}</p>
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">Updated</p>
                          <p>{formatDate(version.updated_at)}</p>
                        </div>
                        {isOwnReview && (
                          <p className="sm:col-span-2 lg:col-span-5 rounded-md bg-amber-50 px-2 py-1.5 text-amber-800">
                            Another owner or manager must review this version because you authored it.
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        </>
      ) : null}

      <KnowledgeEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        categories={data?.categories ?? []}
        item={selectedItem}
      />
      <KnowledgeReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        item={selectedItem}
      />
    </div>
  );
}
