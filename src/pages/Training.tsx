import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BookOpen, GraduationCap, Sparkles, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getToday } from '@/lib/time-utils';
import {
  useAttemptSummaries,
  useDraftModules,
  useTrainingAssignments,
  useTrainingModules,
  type TrainingModule,
} from '@/hooks/useTraining';
import ModulePlayer from '@/components/training/ModulePlayer';
import AssignModuleDialog, { type Assignee } from '@/components/training/AssignModuleDialog';
import BuildModuleDialog from '@/components/training/BuildModuleDialog';
import ModuleReviewQueue from '@/components/training/ModuleReviewQueue';

/** Active team members, used for the assignment picker and creator names. */
function useTeamRoster() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['training-roster', ctx?.org_id],
    enabled: !!ctx,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('user_id, display_name')
        .eq('org_id', ctx!.org_id)
        .eq('employment_status', 'active')
        .order('display_name');
      if (error) throw error;
      return (data ?? []).filter(e => !!e.user_id) as Assignee[];
    },
  });
}

export default function Training() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const isAdmin = ctx?.role === 'owner' || ctx?.role === 'manager';

  const { data: modules = [], isLoading } = useTrainingModules();
  const { data: assignments = [] } = useTrainingAssignments();
  const { data: attempts = [] } = useAttemptSummaries();
  const { data: roster = [] } = useTeamRoster();

  const [openModuleId, setOpenModuleId] = useState<string | null>(null);
  const [assignTarget, setAssignTarget] = useState<TrainingModule | null>(null);
  const [buildOpen, setBuildOpen] = useState(false);
  const [tagFilter, setTagFilter] = useState<string>('all');

  const nameFor = useMemo(() => {
    const map = new Map(roster.map(m => [m.user_id, m.display_name]));
    return (id: string) => map.get(id) ?? 'a teammate';
  }, [roster]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    modules.forEach(m => m.audience_tags.forEach(t => tags.add(t)));
    return [...tags].sort();
  }, [modules]);

  const visibleModules = useMemo(
    () => (tagFilter === 'all' ? modules : modules.filter(m => m.audience_tags.includes(tagFilter))),
    [modules, tagFilter]
  );

  const myAssignments = useMemo(
    () => assignments.filter(a => a.assigned_to === user?.id),
    [assignments, user?.id]
  );

  const openModule = modules.find(m => m.id === openModuleId) ?? null;
  const openAssignment = myAssignments.find(a => a.module_id === openModuleId);
  const today = getToday();

  if (openModule) {
    return (
      <ModulePlayer
        module={openModule}
        assignment={openAssignment}
        onBack={() => setOpenModuleId(null)}
      />
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <GraduationCap className="h-6 w-6 text-primary" />
              Training
            </h1>
            <p className="text-sm text-muted-foreground">
              One library for the whole practice — how we actually do things here.
            </p>
          </div>
          {isAdmin && (
            <Button onClick={() => setBuildOpen(true)}>
              <Sparkles className="mr-1.5 h-4 w-4" />
              Build with AI
            </Button>
          )}
        </div>

        <Tabs defaultValue={new URLSearchParams(window.location.search).get('tab') === 'mine' ? 'mine' : 'library'}>
          <TabsList>
            <TabsTrigger value="library">Library</TabsTrigger>
            <TabsTrigger value="mine">
              My training
              {myAssignments.filter(a => a.status !== 'completed').length > 0 && (
                <span className="ml-1.5 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
                  {myAssignments.filter(a => a.status !== 'completed').length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="library" className="space-y-4 pt-4">
            {allTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => setTagFilter('all')}>
                  <Badge variant={tagFilter === 'all' ? 'default' : 'outline'}>All</Badge>
                </button>
                {allTags.map(tag => (
                  <button key={tag} type="button" onClick={() => setTagFilter(tag)}>
                    <Badge variant={tagFilter === tag ? 'default' : 'outline'}>{tag}</Badge>
                  </button>
                ))}
              </div>
            )}

            {isLoading && <p className="text-sm text-muted-foreground">Loading modules…</p>}
            {!isLoading && visibleModules.length === 0 && (
              <Card>
                <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
                  <BookOpen className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    No modules yet.
                    {isAdmin ? ' Build the first one with AI.' : ' Check back soon.'}
                  </p>
                </CardContent>
              </Card>
            )}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleModules.map(module => {
                const moduleAssignments = assignments.filter(a => a.module_id === module.id);
                const done = moduleAssignments.filter(a => a.status === 'completed').length;
                const passedCount = attempts.filter(a => a.module_id === module.id && a.passed).length;
                return (
                  <Card key={module.id} className="flex flex-col">
                    <CardHeader className="pb-3">
                      <div className="flex flex-wrap gap-1.5 pb-1">
                        <Badge variant={module.source === 'pathfinder' ? 'default' : 'secondary'}>
                          {module.source === 'pathfinder'
                            ? 'Built by Pathfinder'
                            : `By ${nameFor(module.created_by)}`}
                        </Badge>
                        {module.audience_tags.map(tag => (
                          <Badge key={tag} variant="outline">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      <CardTitle className="text-base leading-snug">{module.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col gap-3">
                      <p className="flex-1 text-sm text-muted-foreground">{module.summary}</p>
                      {isAdmin && moduleAssignments.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {done} of {moduleAssignments.length} completed · {passedCount} passed the
                          quiz
                        </p>
                      )}
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setOpenModuleId(module.id)}>
                          Open
                        </Button>
                        {isAdmin && (
                          <Button size="sm" variant="ghost" onClick={() => setAssignTarget(module)}>
                            <UserPlus className="mr-1.5 h-4 w-4" />
                            Assign
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="mine" className="space-y-3 pt-4">
            {myAssignments.length === 0 && (
              <Card>
                <CardContent className="p-10 text-center text-sm text-muted-foreground">
                  Nothing assigned to you right now. The library is open whenever you want it.
                </CardContent>
              </Card>
            )}
            {myAssignments.map(assignment => {
              const module = modules.find(m => m.id === assignment.module_id);
              if (!module) return null;
              const overdue =
                assignment.status !== 'completed' &&
                !!assignment.due_date &&
                assignment.due_date < today;
              return (
                <Card key={assignment.id} className={cn(overdue && 'border-warning')}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="font-medium">{module.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {assignment.status === 'completed'
                          ? 'Completed'
                          : assignment.status === 'in_progress'
                            ? 'In progress'
                            : 'Assigned'}
                        {assignment.due_date && ` · due ${assignment.due_date}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {overdue && <Badge className="bg-warning text-warning-foreground">Overdue</Badge>}
                      <Button size="sm" onClick={() => setOpenModuleId(module.id)}>
                        {assignment.status === 'completed' ? 'Review' : 'Start'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>
        </Tabs>
      </div>

      <AssignModuleDialog
        module={assignTarget}
        team={roster}
        onClose={() => setAssignTarget(null)}
      />
      <BuildModuleDialog open={buildOpen} onOpenChange={setBuildOpen} />
    </>
  );
}
