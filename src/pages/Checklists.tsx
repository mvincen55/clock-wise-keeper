/**
 * Office checklists — the paper Clerical / Clinical / Manager sheets as
 * live recurring task lists. Shared tasks record who checked them;
 * per-person tasks give every teammate their own box. Arrows browse past
 * periods (history is kept, like the filed sheets).
 */
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { CheckSquare, ChevronLeft, ChevronRight, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { getToday } from '@/lib/time-utils';
import type { ChecklistCadence } from '@/lib/checklist-defaults';
import {
  CADENCE_LABELS,
  CADENCES,
  periodKeyFor,
  periodLabel,
  shiftAnchor,
  useChecklistCompletions,
  useChecklists,
  useDeleteChecklistItem,
  useToggleCompletion,
  useUpsertChecklistItem,
  type ChecklistCompletion,
  type ChecklistItem,
  type ChecklistItemUpsert,
} from '@/hooks/useChecklists';

const EMPTY_ITEM: Omit<ChecklistItemUpsert, 'checklistId'> = {
  title: '',
  cadence: 'daily',
  perPerson: false,
};

function ItemDialog({
  open,
  initial,
  saving,
  onSave,
  onClose,
}: {
  open: boolean;
  initial: Omit<ChecklistItemUpsert, 'checklistId'> & { id?: string };
  saving: boolean;
  onSave: (item: Omit<ChecklistItemUpsert, 'checklistId'> & { id?: string }) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [seenInitial, setSeenInitial] = useState(initial);
  if (initial !== seenInitial) {
    setSeenInitial(initial);
    setForm(initial);
  }

  return (
    <Dialog open={open} onOpenChange={isOpen => !isOpen && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{form.id ? 'Edit Task' : 'New Task'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ck-title">Task</Label>
            <Input
              id="ck-title"
              placeholder="e.g. Spore Testing"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Repeats</Label>
            <Select
              value={form.cadence}
              onValueChange={v => setForm(f => ({ ...f, cadence: v as ChecklistCadence }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CADENCES.map(c => (
                  <SelectItem key={c} value={c}>{CADENCE_LABELS[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="ck-per-person"
              checked={form.perPerson}
              onCheckedChange={v => setForm(f => ({ ...f, perPerson: v }))}
            />
            <Label htmlFor="ck-per-person" className="font-normal">
              Each teammate checks their own box
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={saving || !form.title.trim()} onClick={() => onSave(form)}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompletionNames({ completions }: { completions: ChecklistCompletion[] }) {
  if (completions.length === 0) return null;
  const names = [...new Set(completions.map(c => c.completed_by_name || 'Someone'))];
  return (
    <p className="text-xs text-muted-foreground">
      ✓ {names.join(', ')}
    </p>
  );
}

export default function Checklists() {
  const { user } = useAuth();
  const { data, isLoading } = useChecklists();
  const toggle = useToggleCompletion();
  const upsertItem = useUpsertChecklistItem();
  const deleteItem = useDeleteChecklistItem();
  const { data: orgCtx } = useOrgContext();
  const isManager = orgCtx?.role === 'owner' || orgCtx?.role === 'manager';

  // One browsing anchor (ET date) per cadence; today by default.
  const [anchors, setAnchors] = useState<Record<ChecklistCadence, string>>({
    daily: getToday(),
    weekly: getToday(),
    monthly: getToday(),
    yearly: getToday(),
  });
  const periodKeys = CADENCES.map(c => periodKeyFor(c, anchors[c]));
  const { data: completions } = useChecklistCompletions(periodKeys);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<typeof EMPTY_ITEM & { id?: string }>(EMPTY_ITEM);
  const [dialogChecklistId, setDialogChecklistId] = useState<string | null>(null);

  const completionsByItem = useMemo(() => {
    const map = new Map<string, ChecklistCompletion[]>();
    for (const c of completions ?? []) {
      map.set(`${c.item_id}:${c.period_key}`, [...(map.get(`${c.item_id}:${c.period_key}`) ?? []), c]);
    }
    return map;
  }, [completions]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const checklists = data?.checklists ?? [];
  const items = data?.items ?? [];

  const openNew = (checklistId: string) => {
    setDialogChecklistId(checklistId);
    setEditingItem({ ...EMPTY_ITEM });
    setDialogOpen(true);
  };
  const openEdit = (item: ChecklistItem) => {
    setDialogChecklistId(item.checklist_id);
    setEditingItem({
      id: item.id,
      title: item.title,
      cadence: item.cadence as ChecklistCadence,
      perPerson: item.per_person,
    });
    setDialogOpen(true);
  };

  const handleToggle = (item: ChecklistItem, periodKey: string) => {
    const rows = completionsByItem.get(`${item.id}:${periodKey}`) ?? [];
    const own = rows.find(r => r.completed_by === user?.id);
    const existing = item.per_person ? own : own ?? rows[0];
    if (existing && existing.completed_by !== user?.id && !isManager) {
      toast.info(`Completed by ${existing.completed_by_name || 'a teammate'} — only managers can un-check it.`);
      return;
    }
    toggle.mutate(
      { item, periodKey, existing },
      { onError: err => toast.error(err.message) }
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CheckSquare className="h-6 w-6" />
          Checklists
        </h1>
        <p className="text-muted-foreground text-sm">
          Daily, weekly, monthly, and yearly duties — checked off in everyone's name, with history.
        </p>
      </div>

      {checklists.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No checklists yet. A manager's first visit seeds the office's standard
            Clerical, Clinical, and Manager checklists automatically.
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue={checklists[0].id}>
          <TabsList className="flex-wrap h-auto">
            {checklists.map(list => (
              <TabsTrigger key={list.id} value={list.id}>{list.name}</TabsTrigger>
            ))}
          </TabsList>
          {checklists.map(list => {
            const listItems = items.filter(i => i.checklist_id === list.id && i.is_active);
            return (
              <TabsContent key={list.id} value={list.id} className="space-y-4">
                {isManager && (
                  <div className="flex justify-end">
                    <Button variant="outline" size="sm" onClick={() => openNew(list.id)}>
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                      Add Task
                    </Button>
                  </div>
                )}
                {CADENCES.map(cadence => {
                  const cadenceItems = listItems.filter(i => i.cadence === cadence);
                  if (cadenceItems.length === 0) return null;
                  const anchor = anchors[cadence];
                  const periodKey = periodKeyFor(cadence, anchor);
                  const isCurrent = periodKey === periodKeyFor(cadence, getToday());
                  return (
                    <Card key={cadence}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle className="text-base">{CADENCE_LABELS[cadence]}</CardTitle>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() =>
                                setAnchors(a => ({ ...a, [cadence]: shiftAnchor(cadence, a[cadence], -1) }))
                              }
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <span className="text-sm text-muted-foreground min-w-28 text-center">
                              {periodLabel(cadence, anchor)}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              disabled={isCurrent}
                              onClick={() =>
                                setAnchors(a => ({ ...a, [cadence]: shiftAnchor(cadence, a[cadence], 1) }))
                              }
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-0.5">
                        {cadenceItems.map(item => {
                          const rows = completionsByItem.get(`${item.id}:${periodKey}`) ?? [];
                          const own = rows.find(r => r.completed_by === user?.id);
                          const checked = item.per_person ? !!own : rows.length > 0;
                          return (
                            <div
                              key={item.id}
                              className="flex items-start gap-3 py-2 border-b last:border-0"
                            >
                              <Checkbox
                                id={`ck-${item.id}-${periodKey}`}
                                className="mt-0.5"
                                checked={checked}
                                disabled={toggle.isPending}
                                onCheckedChange={() => handleToggle(item, periodKey)}
                              />
                              <div className="flex-1 min-w-0">
                                <label
                                  htmlFor={`ck-${item.id}-${periodKey}`}
                                  className={`text-sm cursor-pointer ${checked ? 'text-muted-foreground line-through' : ''}`}
                                >
                                  {item.title}
                                </label>
                                <div className="flex flex-wrap items-center gap-2">
                                  {item.per_person && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                      everyone
                                    </Badge>
                                  )}
                                  <CompletionNames completions={rows} />
                                </div>
                              </div>
                              {isManager && (
                                <div className="flex shrink-0">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => openEdit(item)}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive"
                                    onClick={() =>
                                      deleteItem.mutate(item.id, {
                                        onSuccess: () => toast.success('Task removed'),
                                        onError: err => toast.error(err.message),
                                      })
                                    }
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </CardContent>
                    </Card>
                  );
                })}
              </TabsContent>
            );
          })}
        </Tabs>
      )}

      <ItemDialog
        open={dialogOpen}
        initial={editingItem}
        saving={upsertItem.isPending}
        onSave={form => {
          if (!dialogChecklistId) return;
          upsertItem.mutate(
            { ...form, checklistId: dialogChecklistId },
            {
              onSuccess: () => {
                toast.success('Task saved');
                setDialogOpen(false);
              },
              onError: err => toast.error(`Save failed: ${err.message}`),
            }
          );
        }}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  );
}
