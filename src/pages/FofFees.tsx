/**
 * Fee schedule management for the FOF builder: the office fee schedule + carrier
 * allowed-fee schedules with spreadsheet import. Insurance specifics
 * (coverage %s, benefits) are entered per form in the builder.
 * De-identified configuration only — no patient data on this page.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
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
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { ArrowLeft, Copy, Download, FileSpreadsheet, Loader2, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import FeeImportDialog from '@/components/fof/FeeImportDialog';
import { formatCents, parseCurrencyInput } from '@/lib/fof/money';
import { categorizeCdtCode } from '@/lib/fof/cdt';
import { friendlyCdtName } from '@/lib/fof/cdt-names';
import { partitionRulesByProcedure, procedureTerms } from '@/lib/fof/rule-relevance';
import { useCodeKnowledge } from '@/hooks/useAssistantMemory';
import type { FeeCategory } from '@/lib/fof/insurance';
import { useOrgContext } from '@/hooks/useOrgContext';
import {
  useDeleteFeeSchedule,
  useDeleteFeeScheduleItem,
  useFeeScheduleItems,
  useFeeSchedules,
  useUpsertFeeSchedule,
  useUpsertFeeScheduleItem,
  type FeeSchedule,
  type FeeScheduleItem,
} from '@/hooks/useFeeSchedules';

const CATEGORY_LABELS: Record<FeeCategory, string> = {
  preventive: 'Preventive',
  basic: 'Basic',
  major: 'Major',
  workup: 'Work Up (billed at visit)',
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
  const [notes, setNotes] = useState(item?.notes ?? '');

  // Re-sync when a different item opens
  const [lastKey, setLastKey] = useState('');
  const key = `${open}-${item?.id ?? 'new'}`;
  if (key !== lastKey) {
    setLastKey(key);
    setCode(item?.code ?? '');
    setDescription(item?.description ?? '');
    setFee(item ? formatCents(item.feeCents) : '');
    setCategory(item?.category ?? 'other');
    setNotes(item?.notes ?? '');
  }

  const feeCents = parseCurrencyInput(fee);
  const canSave = code.trim() !== '' && feeCents !== null;
  const patientName = friendlyCdtName(code);
  // What the assistant already follows for this code, so nothing it has
  // been taught is invisible from the place you'd look for it.
  const { data: knowledge } = useCodeKnowledge(code, scheduleId);
  // Standing rules are global, so only the ones that actually name this
  // procedure belong here — a surgical-guide rule says nothing about a
  // crown. The rest are counted, not hidden.
  const { matching: rulesHere, others: globalRules } = useMemo(
    () =>
      partitionRulesByProcedure(
        knowledge?.wordingRules ?? [],
        procedureTerms(code, patientName, description)
      ),
    [knowledge?.wordingRules, code, patientName, description]
  );

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
            {/* The description is usually practice-management shorthand
                ("CrnAllCer"); this is the wording a patient actually reads
                on the printed form. */}
            {patientName ? (
              <p className="text-xs text-muted-foreground">
                Patients see: <span className="font-medium text-foreground">{patientName}</span>
              </p>
            ) : (
              code.trim() !== '' && (
                <p className="text-xs text-muted-foreground">
                  No patient-friendly name for this code — the form falls back to the
                  description above, so keep it readable.
                </p>
              )
            )}
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
          <div className="space-y-1.5">
            <Label htmlFor="item-notes">Wording & policy notes</Label>
            <Textarea
              id="item-notes"
              rows={3}
              placeholder="How we talk about this procedure, office policy details, insurance quirks…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              The whole team sees these — and the AI follows them, both in the FOF's
              wording and in Ask AI answers.
            </p>
          </div>

          {(knowledge?.elsewhere.length || rulesHere.length || globalRules.length) ? (
            <div className="space-y-2 rounded-md border bg-muted/40 p-2.5">
              {(knowledge?.elsewhere ?? []).length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold">Notes on this code elsewhere</p>
                  {knowledge!.elsewhere.map((note, i) => (
                    <div key={i} className="rounded border bg-background px-2 py-1">
                      <Badge variant={note.isUniversal ? 'default' : 'secondary'} className="text-[10px] font-normal">
                        {note.isUniversal ? 'All patients' : note.scheduleName}
                      </Badge>
                      <p className="mt-1 whitespace-pre-wrap text-xs text-foreground/80">{note.notes}</p>
                    </div>
                  ))}
                </div>
              )}

              {rulesHere.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold">
                    Standing rules that mention {patientName ? patientName.toLowerCase() : 'this code'}
                  </p>
                  <ul className="space-y-0.5">
                    {rulesHere.map((rule, i) => (
                      <li key={i} className="text-xs text-foreground/80">
                        • {rule}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* The remaining rules are still in force — say so plainly
                  rather than listing them here, where they'd read as
                  guidance about this procedure. */}
              {globalRules.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {rulesHere.length > 0 ? 'Plus ' : ''}
                  {globalRules.length} other standing wording rule
                  {globalRules.length === 1 ? '' : 's'} the AI follows across all codes —
                  see them in the FOF Assistant.
                </p>
              )}
            </div>
          ) : null}
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
                  notes: notes.trim(),
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

  // One line per code, single-line text so tabs/newlines can't break rows.
  const oneLine = (text: string) => text.replace(/[\t\n\r]+/g, ' ').trim();

  const exportExcel = () => {
    const rows = (items ?? []).map(i => ({
      Code: i.code,
      Description: i.description,
      Category: CATEGORY_LABELS[i.category],
      Fee: i.feeCents / 100,
      Source: i.isOfficeFee ? 'Office fee' : 'Contracted',
      Notes: i.notes,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 8 }, { wch: 44 }, { wch: 24 }, { wch: 10 }, { wch: 12 }, { wch: 50 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fees');
    const safeName = schedule.name.replace(/[^A-Za-z0-9 _()-]+/g, '').trim() || 'Fee Schedule';
    XLSX.writeFile(wb, `${safeName}.xlsx`);
    toast.success(`Exported ${rows.length} codes to Excel`);
  };

  const copyAll = async () => {
    const lines = [
      ['Code', 'Description', 'Category', 'Fee', 'Source', 'Notes'].join('\t'),
      ...(items ?? []).map(i =>
        [
          i.code,
          oneLine(i.description),
          CATEGORY_LABELS[i.category],
          (i.feeCents / 100).toFixed(2),
          i.isOfficeFee ? 'Office fee' : 'Contracted',
          oneLine(i.notes),
        ].join('\t')
      ),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      toast.success(`Copied ${items?.length ?? 0} codes — paste straight into Excel or Sheets`);
    } catch {
      toast.error('Could not access the clipboard — try again in this tab');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input
          className="flex-1 min-w-48"
          placeholder="Search code or description…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <Button variant="outline" disabled={(items ?? []).length === 0} onClick={exportExcel}>
          <Download className="h-4 w-4 mr-1.5" />
          Export Excel
        </Button>
        <Button variant="outline" disabled={(items ?? []).length === 0} onClick={copyAll}>
          <Copy className="h-4 w-4 mr-1.5" />
          Copy All
        </Button>
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
                  <td className="p-2 max-w-64">
                    <div className="truncate">{item.description}</div>
                    {item.notes && (
                      <div className="truncate text-xs text-muted-foreground" title={item.notes}>
                        {item.notes}
                      </div>
                    )}
                  </td>
                  <td className="p-2 text-muted-foreground">{CATEGORY_LABELS[item.category]}</td>
                  <td className="p-2 text-right whitespace-nowrap">
                    {formatCents(item.feeCents)}
                    {item.isOfficeFee && (
                      <span
                        className="ml-1.5 text-xs text-muted-foreground"
                        title="No contracted rate for this code — this is the office fee, so there is no write-off. Estimates follow the current office fee."
                      >
                        office fee
                      </span>
                    )}
                  </td>
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

export default function FofFees() {
  const { data: schedules, isLoading } = useFeeSchedules();
  const { data: ctx } = useOrgContext();
  const upsertSchedule = useUpsertFeeSchedule();
  const deleteSchedule = useDeleteFeeSchedule();

  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';

  const [openScheduleId, setOpenScheduleId] = useState<string | null>(null);
  const [importFor, setImportFor] = useState<FeeSchedule | null>(null);
  const [newScheduleName, setNewScheduleName] = useState('');
  const [newScheduleKind, setNewScheduleKind] = useState<'carrier' | 'payment'>('carrier');

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/fof"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h1 className="text-2xl font-bold">Fee Schedules</h1>
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
                      {schedule.kind === 'office'
                        ? 'Office Fee Schedule'
                        : schedule.kind === 'payment'
                          ? 'Payment table'
                          : 'Carrier'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {schedule.itemCount ?? 0} codes
                    </span>
                    {schedule.kind === 'carrier' && (
                      <div className="flex items-center gap-1.5 pl-2">
                        <Switch
                          id={`innet-${schedule.id}`}
                          disabled={!isManager || upsertSchedule.isPending}
                          checked={schedule.isInNetwork}
                          onCheckedChange={v =>
                            upsertSchedule.mutate(
                              { ...schedule, isInNetwork: v },
                              { onError: err => toast.error(err.message) }
                            )
                          }
                        />
                        <Label
                          htmlFor={`innet-${schedule.id}`}
                          className="text-xs text-muted-foreground font-normal"
                        >
                          In network (auto write-offs)
                        </Label>
                      </div>
                    )}
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
                <div className="space-y-1.5 pt-1">
                  <div className="flex gap-2">
                    <Input
                      placeholder={
                        newScheduleKind === 'payment'
                          ? 'New payment table name (e.g. DD MA Fee Schedule Plan)'
                          : 'New carrier schedule name (e.g. Cigna PPO)'
                      }
                      value={newScheduleName}
                      onChange={e => setNewScheduleName(e.target.value)}
                    />
                    <Select
                      value={newScheduleKind}
                      onValueChange={v => setNewScheduleKind(v as 'carrier' | 'payment')}
                    >
                      <SelectTrigger className="w-44 shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="carrier">Carrier fees</SelectItem>
                        <SelectItem value="payment">Plan payment table</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      disabled={!newScheduleName.trim() || upsertSchedule.isPending}
                      onClick={() =>
                        upsertSchedule.mutate(
                          { name: newScheduleName.trim(), kind: newScheduleKind },
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
                  <p className="text-xs text-muted-foreground">
                    Carrier fees = the plan's allowed fees. Plan payment table = the set
                    dollar amounts a fee-schedule plan pays per code (used with the "Plan
                    Payment Schedule" picker on the FOF).
                  </p>
                </div>
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
    </div>
  );
}
