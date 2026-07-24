/**
 * Important Numbers — the office directory, credentials-first.
 *
 * Tabs (Office, Team, Referrals, Labs, Insurance Companies, Other —
 * manager-renamable) under a global search. The Office tab leads with
 * the practice's identifiers: Practice IDs as a hero card, then NPI /
 * License / DEA side by side, then everything else.
 *
 * Permissions: everyone reads and can ADD entries or add NOTES to an
 * entry; only owners/managers change names/numbers or delete (enforced
 * in the database, not just the UI). Manager editing lives behind one
 * Edit button — per-entry controls only appear in edit mode.
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
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Check,
  Copy,
  Loader2,
  Pencil,
  Phone,
  Plus,
  Search,
  SlidersHorizontal,
  StickyNote,
  Trash2,
} from 'lucide-react';
import { useOrgContext } from '@/hooks/useOrgContext';
import {
  DEFAULT_TABS,
  useDeleteImportantNumber,
  useImportantNumberTabs,
  useImportantNumbers,
  useRenameImportantNumberTab,
  useUpdateImportantNumberNotes,
  useUpsertImportantNumber,
  type ImportantNumber,
  type ImportantNumberUpsert,
} from '@/hooks/useImportantNumbers';

const looksLikePhone = (value: string) => /^[\d\s().+x-]{7,}$/i.test(value.trim());
const telHref = (value: string) => `tel:${value.replace(/[^\d+]/g, '')}`;

// Sections that get the credentials treatment on the first tab.
const HERO_SECTION = 'Practice IDs';
const CREDENTIAL_SECTIONS = ['NPI Numbers', 'License Numbers', 'DEA Numbers'];

const EMPTY_FORM: ImportantNumberUpsert = { tab: 'Office', section: '', label: '', value: '', notes: '' };

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="rounded p-1 text-muted-foreground/60 hover:bg-muted hover:text-foreground"
      title="Copy"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function ValueText({ value, large }: { value: string; large?: boolean }) {
  if (!value) return null;
  if (looksLikePhone(value)) {
    return (
      <a
        className={`${large ? 'text-lg font-semibold' : 'text-sm'} text-primary hover:underline`}
        href={telHref(value)}
      >
        {value}
      </a>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`font-mono ${large ? 'text-lg font-semibold tracking-tight' : 'text-sm'}`}>
        {value}
      </span>
      <CopyButton value={value} />
    </span>
  );
}

function EntryDialog({
  open,
  initial,
  tabs,
  sections,
  saving,
  managerEdit,
  onSave,
  onClose,
}: {
  open: boolean;
  initial: ImportantNumberUpsert;
  tabs: string[];
  sections: string[];
  saving: boolean;
  managerEdit: boolean;
  onSave: (entry: ImportantNumberUpsert) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState(initial);
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
          <DialogTitle>{form.id ? 'Edit Entry' : 'Add Number'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tab</Label>
              <Select value={form.tab} onValueChange={set('tab')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tabs.map(t => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="in-section">Group</Label>
              <Input
                id="in-section"
                list="in-section-suggestions"
                placeholder="e.g. Vendors"
                value={form.section}
                onChange={e => set('section')(e.target.value)}
              />
              <datalist id="in-section-suggestions">
                {sections.map(s => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
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
          {!form.id && !managerEdit && (
            <p className="text-xs text-muted-foreground">
              Anyone can add a number. Only managers can change or remove one later — notes stay
              editable by everyone.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={saving || !form.label.trim() || !form.tab.trim()}
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
  const { data: tabRows } = useImportantNumberTabs();
  const upsert = useUpsertImportantNumber();
  const updateNotes = useUpdateImportantNumberNotes();
  const renameTab = useRenameImportantNumberTab();
  const remove = useDeleteImportantNumber();
  const { data: orgCtx } = useOrgContext();
  const isManager = orgCtx?.role === 'owner' || orgCtx?.role === 'manager';

  const tabs = useMemo(
    () => (tabRows && tabRows.length > 0 ? tabRows.map(t => t.name) : DEFAULT_TABS),
    [tabRows]
  );

  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ImportantNumberUpsert>(EMPTY_FORM);
  const [deleting, setDeleting] = useState<ImportantNumber | null>(null);
  const [noteEntry, setNoteEntry] = useState<ImportantNumber | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [tabsDialogOpen, setTabsDialogOpen] = useState(false);
  const [tabDrafts, setTabDrafts] = useState<Record<string, string>>({});

  const currentTab = activeTab && tabs.includes(activeTab) ? activeTab : tabs[0];
  const searching = query.trim() !== '';

  const visibleEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (entries ?? []).filter(e => {
      if (q) {
        return (
          e.label.toLowerCase().includes(q) ||
          e.section.toLowerCase().includes(q) ||
          e.value.toLowerCase().includes(q) ||
          e.notes.toLowerCase().includes(q) ||
          e.tab.toLowerCase().includes(q)
        );
      }
      return e.tab === currentTab;
    });
  }, [entries, query, currentTab]);

  const bySection = useMemo(() => {
    const map = new Map<string, ImportantNumber[]>();
    for (const entry of visibleEntries) {
      const key = entry.section || 'General';
      map.set(key, [...(map.get(key) ?? []), entry]);
    }
    return map;
  }, [visibleEntries]);

  // Office-tab layout: Practice IDs hero, credentials trio, then the rest.
  const heroRows = !searching && currentTab === tabs[0] ? bySection.get(HERO_SECTION) ?? [] : [];
  const credentialCards =
    !searching && currentTab === tabs[0]
      ? CREDENTIAL_SECTIONS.map(name => [name, bySection.get(name) ?? []] as const).filter(
          ([, rows]) => rows.length > 0
        )
      : [];
  const regularSections = [...bySection.entries()].filter(
    ([name]) =>
      searching ||
      currentTab !== tabs[0] ||
      (name !== HERO_SECTION && !CREDENTIAL_SECTIONS.includes(name))
  );

  const sectionSuggestions = useMemo(
    () => [...new Set((entries ?? []).map(e => e.section).filter(Boolean))].sort(),
    [entries]
  );

  const openNew = () => {
    setEditing({ ...EMPTY_FORM, tab: currentTab ?? 'Other' });
    setDialogOpen(true);
  };
  const openEdit = (entry: ImportantNumber) => {
    setEditing({
      id: entry.id,
      tab: entry.tab,
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

  const renderEntry = (entry: ImportantNumber) => (
    <div key={entry.id} className="group flex items-start gap-2 border-b py-2 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-medium">{entry.label}</span>
          <ValueText value={entry.value} />
        </div>
        {entry.notes && (
          <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">{entry.notes}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center">
        {isManager && editMode ? (
          <>
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
          </>
        ) : !isManager ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
            title={entry.notes ? 'Edit note' : 'Add note'}
            onClick={() => {
              setNoteEntry(entry);
              setNoteDraft(entry.notes);
            }}
          >
            <StickyNote className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Phone className="h-6 w-6" />
            Important Numbers
          </h1>
          <p className="text-sm text-muted-foreground">
            Practice credentials, team, referral offices, labs, and carriers — tap a number to call.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Add Number
          </Button>
          {isManager && (
            <Button
              variant={editMode ? 'default' : 'outline'}
              onClick={() => setEditMode(e => !e)}
            >
              <Pencil className="mr-2 h-4 w-4" />
              {editMode ? 'Done' : 'Edit'}
            </Button>
          )}
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search names, numbers, notes…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      {!searching && (
        <div className="flex flex-wrap items-center gap-1.5">
          {tabs.map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={
                tab === currentTab
                  ? 'rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground shadow-sm'
                  : 'rounded-full border bg-card px-4 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground'
              }
            >
              {tab}
            </button>
          ))}
          {isManager && editMode && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-1 h-8 text-muted-foreground"
              onClick={() => {
                setTabDrafts(Object.fromEntries((tabRows ?? []).map(t => [t.id, t.name])));
                setTabsDialogOpen(true);
              }}
            >
              <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
              Rename tabs
            </Button>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : visibleEntries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {searching
              ? 'Nothing matches that search.'
              : `Nothing under ${currentTab} yet — use Add Number to start this tab.`}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Practice IDs hero — the numbers the office reaches for most. */}
          {heroRows.length > 0 && (
            <Card className="border-primary/25 bg-primary/[0.04]">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-widest text-primary">
                  {HERO_SECTION}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                  {heroRows.map(entry => (
                    <div key={entry.id} className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          {entry.label}
                        </div>
                        <ValueText value={entry.value} large />
                        {entry.notes && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{entry.notes}</p>
                        )}
                      </div>
                      {isManager && editMode && (
                        <div className="flex shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openEdit(entry)}
                          >
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
                </div>
              </CardContent>
            </Card>
          )}

          {/* NPI / License / DEA side by side. */}
          {credentialCards.length > 0 && (
            <div className="grid gap-4 md:grid-cols-3">
              {credentialCards.map(([name, rows]) => (
                <Card key={name}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      {name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-0.5">{rows.map(renderEntry)}</CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Everything else. */}
          {regularSections.length > 0 && (
            <div className="grid items-start gap-4 md:grid-cols-2">
              {regularSections.map(([section, rows]) => (
                <Card key={section}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      {section}
                      {searching && rows[0] && (
                        <Badge variant="outline" className="text-[10px] font-normal normal-case">
                          {rows[0].tab}
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-0.5">{rows.map(renderEntry)}</CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      <EntryDialog
        open={dialogOpen}
        initial={editing}
        tabs={tabs}
        sections={sectionSuggestions}
        saving={upsert.isPending}
        managerEdit={isManager}
        onSave={handleSave}
        onClose={() => setDialogOpen(false)}
      />

      {/* Team-member notes: name/number shown read-only, notes editable. */}
      <Dialog open={!!noteEntry} onOpenChange={open => !open && setNoteEntry(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Note on {noteEntry?.label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md bg-muted px-3 py-2 text-sm">
              <span className="font-medium">{noteEntry?.label}</span>
              {noteEntry?.value && <span className="ml-2 font-mono">{noteEntry.value}</span>}
            </div>
            <Textarea
              rows={3}
              placeholder="Address, email, contact person…"
              value={noteDraft}
              onChange={e => setNoteDraft(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Notes are shared with the whole team. Names and numbers can only be changed by a
              manager.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteEntry(null)}>
              Cancel
            </Button>
            <Button
              disabled={updateNotes.isPending}
              onClick={() => {
                if (!noteEntry) return;
                updateNotes.mutate(
                  { id: noteEntry.id, notes: noteDraft },
                  {
                    onSuccess: () => {
                      toast.success('Note saved');
                      setNoteEntry(null);
                    },
                    onError: err => toast.error(`Save failed: ${err.message}`),
                  }
                );
              }}
            >
              {updateNotes.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manager tab renaming (edit mode). */}
      <Dialog open={tabsDialogOpen} onOpenChange={open => !open && setTabsDialogOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename Tabs</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {(tabRows ?? []).map(tab => (
              <Input
                key={tab.id}
                value={tabDrafts[tab.id] ?? tab.name}
                onChange={e => setTabDrafts(d => ({ ...d, [tab.id]: e.target.value }))}
              />
            ))}
            <p className="text-xs text-muted-foreground">
              Entries move with their tab when it's renamed.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTabsDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={renameTab.isPending}
              onClick={async () => {
                const changed = (tabRows ?? []).filter(
                  t => (tabDrafts[t.id] ?? t.name).trim() !== t.name
                );
                for (const tab of changed) {
                  await renameTab.mutateAsync({
                    id: tab.id,
                    oldName: tab.name,
                    newName: tabDrafts[tab.id] ?? tab.name,
                  });
                }
                toast.success(changed.length ? 'Tabs updated' : 'No changes');
                setTabsDialogOpen(false);
              }}
            >
              {renameTab.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
