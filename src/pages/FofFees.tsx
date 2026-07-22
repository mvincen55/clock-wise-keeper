/**
 * Fees & Plans management for the FOF builder: fee schedules (office UCR +
 * carrier allowed fees), spreadsheet import, and insurance plan rules.
 * De-identified configuration only — no patient data on this page.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { toast } from 'sonner';
import { ArrowLeft, FileSpreadsheet, Loader2, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import FeeImportDialog from '@/components/fof/FeeImportDialog';
import { formatCents, parseCurrencyInput } from '@/lib/fof/money';
import { categorizeCdtCode } from '@/lib/fof/cdt';
import type { FeeCategory } from '@/lib/fof/insurance';
import { useOrgContext } from '@/hooks/useOrgContext';
import {
  useDeleteFeeSchedule,
  useDeleteFeeScheduleItem,
  useDeleteInsurancePlan,
  useFeeScheduleItems,
  useFeeSchedules,
  useInsurancePlans,
  useUpsertFeeSchedule,
  useUpsertFeeScheduleItem,
  useUpsertInsurancePlan,
  type FeeSchedule,
  type FeeScheduleItem,
  type InsurancePlan,
} from '@/hooks/useFeeSchedules';

const CATEGORY_LABELS: Record<FeeCategory, string> = {
  preventive: 'Preventive',
  basic: 'Basic',
  major: 'Major',
  other: 'Other / Not covered',
};

function ItemEditorDialog({
  open,
  scheduleId,
  item,
  onClose,
}: {
  open: boolean;
  scheduleId: string;
  item: FeeScheduleItem | null;
  onClose: () => void;
}) {
  const upsert = useUpsertFeeScheduleItem();
  const [code, setCode] = useState(item?.code ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [fee, setFee] = useState(item ? formatCents(item.feeCents) : '');
  const [category, setCategory] = useState<FeeCategory>(item?.category ?? 'other');

  // Re-sync when a different item opens
  const [lastKey, setLastKey] = useState('');
  const key = `${open}-${item?.id ?? 'new'}`;
  if (key !== lastKey) {
    setLastKey(key);
    setCode(item?.code ?? '');
    setDescription(item?.description ?? '');
    setFee(item ? formatCents(item.feeCents) : '');
    setCategory(item?.category ?? 'other');
  }

  const feeCents = parseCurrencyInput(fee);
  const canSave = code.trim() !== '' && feeCents !== null;

  return (
    <Dialog open={open} onOpenChange={isOpen => !isOpen && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{item ? `Edit ${item.code}` : 'Add Code'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="item-code">Code</Label>
              <Input
                id="item-code"
                placeholder="D2740"
                value={code}
                onChange={e => {
                  const next = e.target.value.toUpperCase();
                  setCode(next);
                  if (!item) setCategory(categorizeCdtCode(next));
                }}
                disabled={!!item}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-fee">Fee</Label>
              <Input
                id="item-fee"
                inputMode="decimal"
                placeholder="$0.00"
                value={fee}
                onChange={e => setFee(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="item-desc">Description</Label>
            <Input
              id="item-desc"
              placeholder="Crown - porcelain/ceramic"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Coverage Category</Label>
            <Select value={category} onValueChange={v => setCategory(v as FeeCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(CATEGORY_LABELS) as FeeCategory[]).map(c => (
                  <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!canSave || upsert.isPending}
            onClick={() =>
              upsert.mutate(
                {
                  ...(item ? { id: item.id } : {}),
                  scheduleId,
                  code: code.trim(),
                  description: description.trim(),
                  feeCents: feeCents ?? 0,
                  category,
                },
                {
                  onSuccess: () => { toast.success('Saved'); onClose(); },
                  onError: err => toast.error(err.message),
                }
              )
            }
          >
            {upsert.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleItemsCard({ schedule, isManager }: { schedule: FeeSchedule; isManager: boolean }) {
  const { data: items, isLoading } = useFeeScheduleItems(schedule.id);
  const deleteItem = useDeleteFeeScheduleItem();
  const [search, setSearch] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<FeeScheduleItem | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = items ?? [];
    if (!q) return all;
    return all.filter(
      i => i.code.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)
    );
  }, [items, search]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          placeholder="Search code or description…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {isManager && (
          <Button variant="outline" onClick={() => { setEditing(null); setEditorOpen(true); }}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add Code
          </Button>
        )}
      </div>
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          {search ? 'No codes match your search.' : 'No codes yet — import a spreadsheet or add codes.'}
        </p>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-2">Code</th>
                <th className="text-left p-2">Description</th>
                <th className="text-left p-2">Category</th>
                <th className="text-right p-2">Fee</th>
                {isManager && <th className="p-2" />}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map(item => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="p-2 font-mono">{item.code}</td>
                  <td className="p-2 max-w-64 truncate">{item.description}</td>
                  <td className="p-2 text-muted-foreground">{CATEGORY_LABELS[item.category]}</td>
                  <td className="p-2 text-right">{formatCents(item.feeCents)}</td>
                  {isManager && (
                    <td className="p-2 text-right whitespace-nowrap">
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => { setEditing(item); setEditorOpen(true); }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                        onClick={() => deleteItem.mutate(item.id, { onError: err => toast.error(err.message) })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 100 && (
            <p className="p-2 text-xs text-muted-foreground">
              Showing first 100 of {filtered.length} — narrow with search.
            </p>
          )}
        </div>
      )}
      <ItemEditorDialog
        open={editorOpen}
        scheduleId={schedule.id}
        item={editing}
        onClose={() => setEditorOpen(false)}
      />
    </div>
  );
}

function PlanEditorDialog({
  open,
  plan,
  schedules,
  onClose,
}: {
  open: boolean;
  plan: InsurancePlan | null;
  schedules: FeeSchedule[];
  onClose: () => void;
}) {
  const upsert = useUpsertInsurancePlan();
  const [state, setState] = useState({
    name: '', feeScheduleId: NONE_SCHEDULE, preventive: '100', basic: '80', major: '50',
    deductible: '$50.00', annualMax: '$1,500.00', waived: true, network: 'in', active: true,
  });
  const [lastKey, setLastKey] = useState('');
  const key = `${open}-${plan?.id ?? 'new'}`;
  if (key !== lastKey) {
    setLastKey(key);
    setState({
      name: plan?.name ?? '',
      feeScheduleId: plan?.feeScheduleId ?? NONE_SCHEDULE,
      preventive: String(plan?.preventivePct ?? 100),
      basic: String(plan?.basicPct ?? 80),
      major: String(plan?.majorPct ?? 50),
      deductible: formatCents(plan?.deductibleCents ?? 5000),
      annualMax: formatCents(plan?.annualMaxCents ?? 150000),
      waived: plan?.deductibleWaivedPreventive ?? true,
      network: (plan?.isInNetwork ?? true) ? 'in' : 'oon',
      active: plan?.isActive ?? true,
    });
  }

  const set = (field: keyof typeof state, value: string | boolean) =>
    setState(s => ({ ...s, [field]: value }));

  const pct = (v: string) => Math.min(100, Math.max(0, parseInt(v, 10) || 0));
  const canSave = state.name.trim() !== '';

  return (
    <Dialog open={open} onOpenChange={isOpen => !isOpen && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{plan ? `Edit "${plan.name}"` : 'New Insurance Plan'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="plan-name">Plan Name</Label>
            <Input
              id="plan-name"
              placeholder="Delta Dental MA PPO"
              value={state.name}
              onChange={e => set('name', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Allowed Fee Schedule</Label>
            <Select value={state.feeScheduleId} onValueChange={v => set('feeScheduleId', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_SCHEDULE}>None (use office fees)</SelectItem>
                {schedules.filter(s => s.kind === 'carrier').map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="plan-prev">Preventive %</Label>
              <Input id="plan-prev" inputMode="numeric" value={state.preventive} onChange={e => set('preventive', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-basic">Basic %</Label>
              <Input id="plan-basic" inputMode="numeric" value={state.basic} onChange={e => set('basic', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-major">Major %</Label>
              <Input id="plan-major" inputMode="numeric" value={state.major} onChange={e => set('major', e.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="plan-ded">Deductible</Label>
              <Input id="plan-ded" inputMode="decimal" value={state.deductible} onChange={e => set('deductible', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-max">Annual Max</Label>
              <Input id="plan-max" inputMode="decimal" value={state.annualMax} onChange={e => set('annualMax', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Network</Label>
            <Select value={state.network} onValueChange={v => set('network', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="in">In-network — write-offs apply, no prepay discount</SelectItem>
                <SelectItem value="oon">Out-of-network — no write-offs, prepay discount allowed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="plan-waived" checked={state.waived} onCheckedChange={v => set('waived', v)} />
            <Label htmlFor="plan-waived">Deductible waived for preventive</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="plan-active" checked={state.active} onCheckedChange={v => set('active', v)} />
            <Label htmlFor="plan-active">Active</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!canSave || upsert.isPending}
            onClick={() =>
              upsert.mutate(
                {
                  ...(plan ? { id: plan.id } : {}),
                  name: state.name.trim(),
                  feeScheduleId: state.feeScheduleId === NONE_SCHEDULE ? null : state.feeScheduleId,
                  preventivePct: pct(state.preventive),
                  basicPct: pct(state.basic),
                  majorPct: pct(state.major),
                  deductibleCents: parseCurrencyInput(state.deductible) ?? 0,
                  annualMaxCents: parseCurrencyInput(state.annualMax) ?? 0,
                  deductibleWaivedPreventive: state.waived,
                  writeoffApplies: state.network === 'in',
                  isInNetwork: state.network === 'in',
                  isActive: state.active,
                },
                {
                  onSuccess: () => { toast.success('Plan saved'); onClose(); },
                  onError: err => toast.error(err.message),
                }
              )
            }
          >
            {upsert.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const NONE_SCHEDULE = '__none__';

export default function FofFees() {
  const { data: schedules, isLoading } = useFeeSchedules();
  const { data: plans } = useInsurancePlans();
  const { data: ctx } = useOrgContext();
  const upsertSchedule = useUpsertFeeSchedule();
  const deleteSchedule = useDeleteFeeSchedule();
  const deletePlan = useDeleteInsurancePlan();

  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';

  const [openScheduleId, setOpenScheduleId] = useState<string | null>(null);
  const [importFor, setImportFor] = useState<FeeSchedule | null>(null);
  const [planEditorOpen, setPlanEditorOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<InsurancePlan | null>(null);
  const [newScheduleName, setNewScheduleName] = useState('');

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/fof"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h1 className="text-2xl font-bold">Fees & Insurance Plans</h1>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Fee Schedules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(schedules ?? []).map(schedule => (
                <div key={schedule.id} className="rounded-lg border">
                  <div className="flex flex-wrap items-center gap-2 p-3">
                    <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                    <button
                      className="font-medium hover:underline"
                      onClick={() => setOpenScheduleId(openScheduleId === schedule.id ? null : schedule.id)}
                    >
                      {schedule.name}
                    </button>
                    <Badge variant={schedule.kind === 'office' ? 'default' : 'secondary'}>
                      {schedule.kind === 'office' ? 'Office UCR' : 'Carrier'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {schedule.itemCount ?? 0} codes
                    </span>
                    <div className="ml-auto flex gap-1.5">
                      {isManager && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setImportFor(schedule)}>
                            <Upload className="h-3.5 w-3.5 mr-1.5" />
                            Import
                          </Button>
                          {schedule.kind !== 'office' && (
                            <Button
                              size="sm" variant="ghost" className="text-destructive"
                              onClick={() => {
                                if (confirm(`Delete "${schedule.name}" and all its codes?`)) {
                                  deleteSchedule.mutate(schedule.id, { onError: err => toast.error(err.message) });
                                }
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setOpenScheduleId(openScheduleId === schedule.id ? null : schedule.id)}>
                        {openScheduleId === schedule.id ? 'Hide' : 'View'}
                      </Button>
                    </div>
                  </div>
                  {openScheduleId === schedule.id && (
                    <div className="border-t p-3">
                      <ScheduleItemsCard schedule={schedule} isManager={isManager} />
                    </div>
                  )}
                </div>
              ))}

              {isManager && (
                <div className="flex gap-2 pt-1">
                  <Input
                    placeholder="New carrier schedule name (e.g. Cigna PPO)"
                    value={newScheduleName}
                    onChange={e => setNewScheduleName(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    disabled={!newScheduleName.trim() || upsertSchedule.isPending}
                    onClick={() =>
                      upsertSchedule.mutate(
                        { name: newScheduleName.trim(), kind: 'carrier' },
                        {
                          onSuccess: () => { setNewScheduleName(''); toast.success('Schedule created'); },
                          onError: err => toast.error(err.message),
                        }
                      )
                    }
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    Add
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Insurance Plans</CardTitle>
              {isManager && (
                <Button size="sm" onClick={() => { setEditingPlan(null); setPlanEditorOpen(true); }}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  New Plan
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              {(plans ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No plans yet.</p>
              ) : (
                (plans ?? []).map(plan => (
                  <div key={plan.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
                    <div className="flex-1 min-w-48">
                      <div className="font-medium">{plan.name}{!plan.isActive && <Badge variant="outline" className="ml-2">inactive</Badge>}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {plan.isInNetwork ? 'In-network' : 'Out-of-network'} ·{' '}
                        {plan.preventivePct}/{plan.basicPct}/{plan.majorPct}% ·{' '}
                        {formatCents(plan.deductibleCents)} deductible ·{' '}
                        {formatCents(plan.annualMaxCents)} annual max ·{' '}
                        {(schedules ?? []).find(s => s.id === plan.feeScheduleId)?.name ?? 'office fees'}
                      </div>
                    </div>
                    {isManager && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => { setEditingPlan(plan); setPlanEditorOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="text-destructive"
                          onClick={() => {
                            if (confirm(`Delete plan "${plan.name}"?`)) {
                              deletePlan.mutate(plan.id, { onError: err => toast.error(err.message) });
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}

      <FeeImportDialog
        open={!!importFor}
        scheduleId={importFor?.id ?? null}
        scheduleName={importFor?.name ?? ''}
        onClose={() => setImportFor(null)}
      />
      <PlanEditorDialog
        open={planEditorOpen}
        plan={editingPlan}
        schedules={schedules ?? []}
        onClose={() => setPlanEditorOpen(false)}
      />
    </div>
  );
}
