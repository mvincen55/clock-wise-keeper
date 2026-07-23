/**
 * Important Numbers — the breakroom contact sheet as a searchable page.
 * Everyone can read and tap-to-call; owners/managers maintain the entries
 * (RLS enforced). Phone-looking values render as tel: links.
 */
import { useMemo, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, Pencil, Phone, Plus, Search, Trash2 } from 'lucide-react';
import { useOrgContext } from '@/hooks/useOrgContext';
import {
  SUGGESTED_SECTIONS,
  useDeleteImportantNumber,
  useImportantNumbers,
  useUpsertImportantNumber,
  type ImportantNumber,
  type ImportantNumberUpsert,
} from '@/hooks/useImportantNumbers';

const looksLikePhone = (value: string) => /^[\d\s().+x-]{7,}$/i.test(value.trim());
const telHref = (value: string) => `tel:${value.replace(/[^\d+]/g, '')}`;

const EMPTY_FORM: ImportantNumberUpsert = { section: '', label: '', value: '', notes: '' };

function EntryDialog({
  open,
  initial,
  saving,
  onSave,
  onClose,
}: {
  open: boolean;
  initial: ImportantNumberUpsert;
  saving: boolean;
  onSave: (entry: ImportantNumberUpsert) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState(initial);
  // Re-seed local state when a different entry opens.
  const [seenInitial, setSeenInitial] = useState(initial);
  if (initial !== seenInitial) {
    setSeenInitial(initial);
    setForm(initial);
  }

  const set = (field: keyof ImportantNumberUpsert) => (value: string) =>
    setForm(f => ({ ...f, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={isOpen => !isOpen && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{form.id ? 'Edit Entry' : 'New Entry'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="in-section">Section</Label>
            <Input
              id="in-section"
              list="in-section-suggestions"
              placeholder="e.g. Vendors"
              value={form.section}
              onChange={e => set('section')(e.target.value)}
            />
            <datalist id="in-section-suggestions">
              {SUGGESTED_SECTIONS.map(s => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="in-label">Name</Label>
            <Input
              id="in-label"
              placeholder="e.g. Patterson Dental"
              value={form.label}
              onChange={e => set('label')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="in-value">Number / ID</Label>
            <Input
              id="in-value"
              placeholder="e.g. 401-736-5300"
              value={form.value}
              onChange={e => set('value')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="in-notes">Notes (optional)</Label>
            <Textarea
              id="in-notes"
              placeholder="Address, email, contact person…"
              rows={2}
              value={form.notes}
              onChange={e => set('notes')(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={saving || !form.section.trim() || !form.label.trim()}
            onClick={() => onSave(form)}
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ImportantNumbers() {
  const { data: entries, isLoading } = useImportantNumbers();
  const upsert = useUpsertImportantNumber();
  const remove = useDeleteImportantNumber();
  const { data: orgCtx } = useOrgContext();
  const isManager = orgCtx?.role === 'owner' || orgCtx?.role === 'manager';

  const [query, setQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ImportantNumberUpsert>(EMPTY_FORM);
  const [deleting, setDeleting] = useState<ImportantNumber | null>(null);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = (entries ?? []).filter(
      e =>
        !q ||
        e.label.toLowerCase().includes(q) ||
        e.section.toLowerCase().includes(q) ||
        e.value.toLowerCase().includes(q) ||
        e.notes.toLowerCase().includes(q)
    );
    const bySection = new Map<string, ImportantNumber[]>();
    for (const entry of visible) {
      bySection.set(entry.section, [...(bySection.get(entry.section) ?? []), entry]);
    }
    return [...bySection.entries()];
  }, [entries, query]);

  const openNew = () => {
    setEditing({ ...EMPTY_FORM });
    setDialogOpen(true);
  };
  const openEdit = (entry: ImportantNumber) => {
    setEditing({
      id: entry.id,
      section: entry.section,
      label: entry.label,
      value: entry.value,
      notes: entry.notes,
    });
    setDialogOpen(true);
  };
  const handleSave = (form: ImportantNumberUpsert) => {
    upsert.mutate(form, {
      onSuccess: () => {
        toast.success('Saved');
        setDialogOpen(false);
      },
      onError: err => toast.error(`Save failed: ${err.message}`),
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Phone className="h-6 w-6" />
            Important Numbers
          </h1>
          <p className="text-muted-foreground text-sm">
            Practice IDs, vendors, labs, carriers, and referral offices — tap a number to call.
          </p>
        </div>
        {isManager && (
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-2" />
            Add Entry
          </Button>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search names, numbers, sections…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : sections.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {query
              ? 'Nothing matches that search.'
              : isManager
                ? 'No entries yet — use Add Entry to bring the breakroom sheet in, one section at a time.'
                : 'No entries yet. A manager can add the office contact list here.'}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {sections.map(([section, rows]) => (
            <Card key={section}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{section}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {rows.map(entry => (
                  <div key={entry.id} className="flex items-start gap-2 py-1.5 border-b last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-sm font-medium">{entry.label}</span>
                        {entry.value &&
                          (looksLikePhone(entry.value) ? (
                            <a className="text-sm text-primary hover:underline" href={telHref(entry.value)}>
                              {entry.value}
                            </a>
                          ) : (
                            <span className="text-sm font-mono">{entry.value}</span>
                          ))}
                      </div>
                      {entry.notes && (
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap">{entry.notes}</p>
                      )}
                    </div>
                    {isManager && (
                      <div className="flex shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(entry)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => setDeleting(entry)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <EntryDialog
        open={dialogOpen}
        initial={editing}
        saving={upsert.isPending}
        onSave={handleSave}
        onClose={() => setDialogOpen(false)}
      />

      <AlertDialog open={!!deleting} onOpenChange={open => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleting?.label}"?</AlertDialogTitle>
            <AlertDialogDescription>This removes the entry for everyone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleting) {
                  remove.mutate(deleting.id, {
                    onSuccess: () => toast.success('Deleted'),
                    onError: err => toast.error(`Delete failed: ${err.message}`),
                  });
                }
                setDeleting(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
