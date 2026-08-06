import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Users, Plus, Pencil, ArrowUp, ArrowDown, Link2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useProviders, useAddProvider, useUpdateProvider } from '@/hooks/useProviders';
import { useOrgStaff } from '@/hooks/useStaffCodes';
import { PROVIDER_TYPES, PROVIDER_TYPE_LABELS, type Provider, type ProviderType } from '@/lib/providers';

/**
 * Manager-only provider registry — the single editable source of truth for
 * treating providers (doctors, hygienists, and other clinicians). FOF and the
 * Forms workflow read from here. Inactive providers are kept so historical
 * documents preserve the name that appeared when they were produced.
 *
 * Same-org employee links and name hygiene are enforced by the database
 * (enforce_provider_integrity); the UI just makes the operations available.
 */
export default function ProviderRegistryCard() {
  const { toast } = useToast();
  const { data: providers = [], isLoading } = useProviders();
  const { data: staff = [] } = useOrgStaff();
  const add = useAddProvider();
  const update = useUpdateProvider();
  const [name, setName] = useState('');
  const [type, setType] = useState<ProviderType>('doctor');
  const [editing, setEditing] = useState<Provider | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftType, setDraftType] = useState<ProviderType>('doctor');
  const [draftEmployee, setDraftEmployee] = useState<string>('none');

  const fail = (e: unknown) =>
    toast({ title: 'Error', description: e instanceof Error ? e.message : 'Failed', variant: 'destructive' });

  const onAdd = async () => {
    if (!name.trim()) return;
    try {
      await add.mutateAsync({ displayName: name, providerType: type });
      setName('');
      toast({ title: 'Provider added' });
    } catch (e) {
      fail(e);
    }
  };

  const setActive = (id: string, active: boolean) =>
    update.mutate({ id, active }, { onError: fail });

  const openEdit = (p: Provider) => {
    setEditing(p);
    setDraftName(p.displayName);
    setDraftType(p.providerType);
    setDraftEmployee(p.employeeId ?? 'none');
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!draftName.trim()) {
      toast({ title: 'Provider name is required', variant: 'destructive' });
      return;
    }
    try {
      await update.mutateAsync({
        id: editing.id,
        displayName: draftName,
        providerType: draftType,
        employeeId: draftEmployee === 'none' ? null : draftEmployee,
      });
      setEditing(null);
      toast({ title: 'Provider updated' });
    } catch (e) {
      fail(e);
    }
  };

  const active = providers.filter((p) => p.active);
  const inactive = providers.filter((p) => !p.active);

  // Swap sort_order with the neighbor so the registry (and the FOF doctor
  // dropdown derived from it) reflects the office's preferred order.
  const move = (p: Provider, dir: -1 | 1) => {
    const idx = active.findIndex((a) => a.id === p.id);
    const neighbor = active[idx + dir];
    if (!neighbor) return;
    update.mutate({ id: p.id, sortOrder: neighbor.sortOrder }, { onError: fail });
    update.mutate({ id: neighbor.id, sortOrder: p.sortOrder }, { onError: fail });
  };

  const staffName = (employeeId: string | null) =>
    employeeId ? staff.find((s) => s.employeeId === employeeId)?.displayName ?? null : null;

  return (
    <Card className="card-elevated">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Treating Providers
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              The single source of truth for treating providers used on FOFs and Forms. Deactivate a
              provider to hide them from new documents while keeping their name on past records.
            </p>

            <div className="space-y-2">
              {active.length === 0 && <p className="text-sm text-muted-foreground">No active providers yet.</p>}
              {active.map((p, i) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium">{p.displayName}</span>
                    <Badge variant="secondary">{PROVIDER_TYPE_LABELS[p.providerType]}</Badge>
                    {staffName(p.employeeId) && (
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        <Link2 className="h-3 w-3" />
                        {staffName(p.employeeId)}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(p, -1)}
                      disabled={i === 0 || update.isPending} aria-label={`Move ${p.displayName} up`}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(p, 1)}
                      disabled={i === active.length - 1 || update.isPending} aria-label={`Move ${p.displayName} down`}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(p)}
                      aria-label={`Edit ${p.displayName}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setActive(p.id, false)} disabled={update.isPending}>
                      Deactivate
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[10rem] space-y-1">
                <label className="text-xs text-muted-foreground">Name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dr. Smith"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAdd(); } }} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Type</label>
                <Select value={type} onValueChange={(v) => setType(v as ProviderType)}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROVIDER_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{PROVIDER_TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={onAdd} disabled={add.isPending || !name.trim()}>
                {add.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
                Add
              </Button>
            </div>

            {inactive.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground">Inactive (kept for historical records)</p>
                {inactive.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed p-2.5 text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{p.displayName}</span>
                      <Badge variant="outline">{PROVIDER_TYPE_LABELS[p.providerType]}</Badge>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setActive(p.id, true)} disabled={update.isPending}>
                      Reactivate
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit provider</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="prov-name">Name</Label>
              <Input id="prov-name" value={draftName} onChange={(e) => setDraftName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={draftType} onValueChange={(v) => setDraftType(v as ProviderType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROVIDER_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{PROVIDER_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Linked team member (optional)</Label>
              <Select value={draftEmployee} onValueChange={setDraftEmployee}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not linked</SelectItem>
                  {staff.map((s) => (
                    <SelectItem key={s.employeeId} value={s.employeeId}>{s.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Links this provider to a team member of this office for attribution. Providers without
                a login stay unlinked.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={update.isPending}>
              {update.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
