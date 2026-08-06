import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Users, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useProviders, useAddProvider, useUpdateProvider } from '@/hooks/useProviders';
import { PROVIDER_TYPES, PROVIDER_TYPE_LABELS, type ProviderType } from '@/lib/providers';

/**
 * Manager-only provider registry — the single editable source of truth for
 * treating providers (doctors, hygienists, and other clinicians). FOF and the
 * Forms workflow read from here. Inactive providers are kept so historical
 * documents preserve the name that appeared when they were produced.
 */
export default function ProviderRegistryCard() {
  const { toast } = useToast();
  const { data: providers = [], isLoading } = useProviders();
  const add = useAddProvider();
  const update = useUpdateProvider();
  const [name, setName] = useState('');
  const [type, setType] = useState<ProviderType>('doctor');

  const onAdd = async () => {
    if (!name.trim()) return;
    try {
      await add.mutateAsync({ displayName: name, providerType: type });
      setName('');
      toast({ title: 'Provider added' });
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Could not add provider', variant: 'destructive' });
    }
  };

  const setActive = (id: string, active: boolean) =>
    update.mutate(
      { id, active },
      { onError: (e: unknown) => toast({ title: 'Error', description: e instanceof Error ? e.message : 'Failed', variant: 'destructive' }) },
    );

  const active = providers.filter((p) => p.active);
  const inactive = providers.filter((p) => !p.active);

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
              {active.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{p.displayName}</span>
                    <Badge variant="secondary">{PROVIDER_TYPE_LABELS[p.providerType]}</Badge>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setActive(p.id, false)} disabled={update.isPending}>
                    Deactivate
                  </Button>
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
    </Card>
  );
}
