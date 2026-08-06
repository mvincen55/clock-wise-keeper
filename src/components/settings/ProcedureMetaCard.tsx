import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, ClipboardList, Plus, Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  useProcedureMeta,
  useCreateProcedureMeta,
  useUpdateProcedureMeta,
  type ProcedureMetaInput,
} from '@/hooks/useProcedureMeta';
import {
  UNIT_TYPES,
  UNIT_TYPE_LABELS,
  QUANTITY_STRATEGY_EXPLANATIONS,
  defaultRequirements,
  normalizeProcedureCode,
  validateProcedureMeta,
  type ProcedureMeta,
  type UnitType,
} from '@/lib/procedures';

type Draft = ProcedureMetaInput & { id?: string; active: boolean };

const EMPTY_DRAFT: Draft = {
  code: '',
  patientName: '',
  internalDescription: '',
  unitType: 'per_visit',
  needsTeeth: false,
  needsSurfaces: false,
  quantityStrategy: 'per_visit',
  keywords: [],
  active: true,
};

/**
 * Manager-only editor for the canonical per-office procedure metadata
 * (procedure_meta): patient-friendly name, quantity behavior, tooth/surface
 * requirements, and search keywords. Quantity behavior is explained in office
 * language, and the shared validator flags impossible combinations before the
 * database rejects them. Codes are permanent: a wrong code is deactivated and
 * re-created rather than renamed, so historical references never dangle.
 */
export default function ProcedureMetaCard() {
  const { toast } = useToast();
  const { data: rows = [], isLoading } = useProcedureMeta();
  const create = useCreateProcedureMeta();
  const update = useUpdateProcedureMeta();
  const [draft, setDraft] = useState<Draft | null>(null);

  const sorted = useMemo(
    () => [...rows].sort((a, b) => Number(b.active) - Number(a.active) || a.code.localeCompare(b.code)),
    [rows],
  );

  const problems = draft ? validateProcedureMeta(draft) : [];
  const isNew = draft ? !draft.id : false;
  const saving = create.isPending || update.isPending;

  const openNew = () => setDraft({ ...EMPTY_DRAFT });
  const openEdit = (row: ProcedureMeta) =>
    setDraft({
      id: row.id,
      code: row.code,
      patientName: row.patientName,
      internalDescription: row.internalDescription,
      unitType: row.unitType,
      needsTeeth: row.needsTeeth,
      needsSurfaces: row.needsSurfaces,
      quantityStrategy: row.quantityStrategy,
      keywords: row.keywords,
      active: row.active,
    });

  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));

  // Changing the unit type pre-fills sensible teeth/surface requirements and
  // keeps the quantity strategy aligned; managers can still adjust after.
  const setUnitType = (unitType: UnitType) =>
    patch({ unitType, quantityStrategy: unitType, ...defaultRequirements(unitType) });

  const save = async () => {
    if (!draft) return;
    const code = normalizeProcedureCode(draft.code);
    if (!code) {
      toast({ title: 'Enter a procedure code', variant: 'destructive' });
      return;
    }
    if (problems.length > 0) return;
    try {
      if (draft.id) {
        await update.mutateAsync({
          id: draft.id,
          patientName: draft.patientName,
          internalDescription: draft.internalDescription,
          unitType: draft.unitType,
          needsTeeth: draft.needsTeeth,
          needsSurfaces: draft.needsSurfaces,
          quantityStrategy: draft.quantityStrategy,
          keywords: draft.keywords,
          active: draft.active,
        });
      } else {
        await create.mutateAsync({ ...draft, code });
      }
      setDraft(null);
      toast({ title: draft.id ? 'Procedure updated' : 'Procedure added' });
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Could not save the procedure',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card className="card-elevated">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5" />
          Procedure Behavior
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              How each procedure code behaves on forms: the name patients see, whether teeth or
              surfaces are chosen, and how the quantity is counted. Codes are permanent — to fix a
              wrong code, deactivate it and add the correct one.
            </p>

            <div className="space-y-2">
              {sorted.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No procedure behavior configured yet. Codes get sensible defaults (charged once per
                  visit) until customized here.
                </p>
              )}
              {sorted.map((row) => (
                <div
                  key={row.id}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 ${row.active ? '' : 'border-dashed text-muted-foreground'}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">{row.code}</span>
                      {row.patientName && <span className="text-sm truncate">{row.patientName}</span>}
                      {!row.active && <Badge variant="outline">Inactive</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {QUANTITY_STRATEGY_EXPLANATIONS[row.quantityStrategy]}
                      {row.needsTeeth && ' Asks for teeth.'}
                      {row.needsSurfaces && ' Asks for surfaces.'}
                    </p>
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(row)}
                    aria-label={`Edit ${row.code}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            <Button variant="outline" onClick={openNew}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add procedure behavior
            </Button>
          </>
        )}
      </CardContent>

      <Dialog open={!!draft} onOpenChange={(open) => { if (!open) setDraft(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{isNew ? 'Add procedure behavior' : `Edit ${draft?.code}`}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="pm-code">Procedure code</Label>
                  {isNew ? (
                    <Input
                      id="pm-code"
                      value={draft.code}
                      onChange={(e) => patch({ code: e.target.value.toUpperCase() })}
                      placeholder="D2740"
                      className="font-mono"
                    />
                  ) : (
                    <p className="rounded-md border bg-muted/50 px-3 py-2 font-mono text-sm">{draft.code}</p>
                  )}
                  {!isNew && (
                    <p className="text-xs text-muted-foreground">
                      Codes are permanent. To correct one, deactivate this and add the right code.
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pm-name">Patient-friendly name</Label>
                  <Input
                    id="pm-name"
                    value={draft.patientName}
                    onChange={(e) => patch({ patientName: e.target.value })}
                    placeholder="Porcelain crown"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pm-desc">Internal description (team only)</Label>
                <Input
                  id="pm-desc"
                  value={draft.internalDescription}
                  onChange={(e) => patch({ internalDescription: e.target.value })}
                  placeholder="Full ceramic crown, posterior"
                />
              </div>

              <div className="space-y-1.5">
                <Label>How is this charged?</Label>
                <Select value={draft.unitType} onValueChange={(v) => setUnitType(v as UnitType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNIT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{UNIT_TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {QUANTITY_STRATEGY_EXPLANATIONS[draft.quantityStrategy]}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">
                  Ask for tooth numbers
                  <Switch checked={draft.needsTeeth} onCheckedChange={(v) => patch({ needsTeeth: v })} />
                </label>
                <label className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">
                  Ask for surfaces
                  <Switch checked={draft.needsSurfaces} onCheckedChange={(v) => patch({ needsSurfaces: v })} />
                </label>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pm-keywords">Search keywords (comma-separated)</Label>
                <Input
                  id="pm-keywords"
                  value={draft.keywords.join(', ')}
                  onChange={(e) =>
                    patch({ keywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean) })
                  }
                  placeholder="crown, cap, ceramic"
                />
              </div>

              {!isNew && (
                <label className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">
                  Active (available for new forms)
                  <Switch checked={draft.active} onCheckedChange={(v) => patch({ active: v })} />
                </label>
              )}

              {problems.length > 0 && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                  {problems.map((p) => <p key={p}>{p}</p>)}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            <Button onClick={save} disabled={saving || problems.length > 0}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {isNew ? 'Add procedure' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
