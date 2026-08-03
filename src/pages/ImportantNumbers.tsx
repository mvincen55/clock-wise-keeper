/**
 * Important Numbers — the office directory, credentials-first, styled
 * after the printed FOF (deep purple accents, tinted hero, kicker
 * headings, quiet cards).
 *
 * First open shows EVERYTHING: Practice IDs hero, NPI/License/DEA trio,
 * then every tab's sections under elegant group headers. The pills at
 * the top (All, Office, Team, Referrals, Labs, Insurance Companies,
 * Other — manager-renamable) filter the same content.
 *
 * Permissions: everyone reads and can ADD entries or add NOTES to an
 * entry; only owners/managers change names/numbers or delete (enforced
 * in the database). Manager editing lives behind one Edit button.
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

// The FOF print palette, carried onto the screen.
const INK = 'text-[#53406e]';
const KICKER = `text-[11px] font-bold uppercase tracking-[0.14em] ${INK}`;
const KICKER_MUTED = 'text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground';
const CARD = 'rounded-xl border-[#e2dcec] shadow-sm';
const RULE = 'h-px flex-1 bg-[#ddd5e6]';

// Sections that get the credentials treatment up top.
const HERO_SECTION = 'Practice IDs';
const CREDENTIAL_SECTIONS = ['NPI Numbers', 'License Numbers', 'DEA Numbers'];
const FILTER_ALL = 'All';

const EMPTY_FORM: ImportantNumberUpsert = { tab: 'Office', section: '', label: '', value: '', notes: '' };

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="rounded p-1 text-muted-foreground/50 hover:bg-muted hover:text-foreground"
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
        className={`${large ? `text-xl font-bold tracking-tight ${INK}` : `text-sm font-medium ${INK}`} hover:underline`}
        href={telHref(value)}
      >
        {value}
      </a>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={
          large
            ? `font-mono text-xl font-bold tracking-tight ${INK}`
            : 'font-mono text-sm'
        }
      >
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
            className="bg-[#53406e] hover:bg-[#453759]"
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
  const [activeTab, setActiveTab] = useState(FILTER_ALL);
  const [editMode, setEditMode] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ImportantNumberUpsert>(EMPTY_FORM);
  const [deleting, setDeleting] = useState<ImportantNumber | null>(null);
  const [noteEntry, setNoteEntry] = useState<ImportantNumber | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [tabsDialogOpen, setTabsDialogOpen] = useState(false);
  const [tabDrafts, setTabDrafts] = useState<Record<string, string>>({});

  const currentTab = activeTab !== FILTER_ALL && tabs.includes(activeTab) ? activeTab : FILTER_ALL;
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
      return currentTab === FILTER_ALL || e.tab === currentTab;
    });
  }, [entries, query, currentTab]);

  // tab -> section -> rows, in tab order.
  const grouped = useMemo(() => {
    const byTab = new Map<string, Map<string, ImportantNumber[]>>();
    for (const entry of visibleEntries) {
      const tabKey = tabs.includes(entry.tab) ? entry.tab : tabs[tabs.length - 1] ?? 'Other';
      const sections = byTab.get(tabKey) ?? new Map<string, ImportantNumber[]>();
      const key = entry.section || 'General';
      sections.set(key, [...(sections.get(key) ?? []), entry]);
      byTab.set(tabKey, sections);
    }
    return byTab;
  }, [visibleEntries, tabs]);

  // Credentials always lead (on All and on the Office tab).
  const officeSections = grouped.get(tabs[0]) ?? new Map<string, ImportantNumber[]>();
  const showCredentials = !searching && (currentTab === FILTER_ALL || currentTab === tabs[0]);
  const heroRows = showCredentials ? officeSections.get(HERO_SECTION) ?? [] : [];
  const credentialCards = showCredentials
    ? CREDENTIAL_SECTIONS.map(name => [name, officeSections.get(name) ?? []] as const).filter(
        ([, rows]) => rows.length > 0
      )
    : [];

  /** Section cards for one tab, minus any promoted to the credential area. */
  const sectionsForTab = (tab: string): [string, ImportantNumber[]][] => {
    const sections = grouped.get(tab) ?? new Map<string, ImportantNumber[]>();
    return [...sections.entries()].filter(
      ([name]) =>
        !(showCredentials && tab === tabs[0] && (name === HERO_SECTION || CREDENTIAL_SECTIONS.includes(name)))
    );
  };

  const tabsToRender = searching || currentTab === FILTER_ALL ? tabs : [currentTab];

  const sectionSuggestions = useMemo(
    () => [...new Set((entries ?? []).map(e => e.section).filter(Boolean))].sort(),
    [entries]
  );

  const openNew = () => {
    setEditing({ ...EMPTY_FORM, tab: currentTab === FILTER_ALL ? tabs[0] ?? 'Other' : currentTab });
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

  const entryControls = (entry: ImportantNumber) =>
    isManager && editMode ? (
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
    ) : !isManager ? (
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
        title={entry.notes ? 'Edit note' : 'Add note'}
        onClick={() => {
          setNoteEntry(entry);
          setNoteDraft(entry.notes);
        }}
      >
        <StickyNote className="h-3.5 w-3.5" />
      </Button>
    ) : null;

  const renderEntry = (entry: ImportantNumber) => (
    <div
      key={entry.id}
      className="group flex break-inside-avoid items-start gap-2 border-b border-[#efeaf4] py-2 last:border-0"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-medium">{entry.label}</span>
          <ValueText value={entry.value} />
        </div>
        {entry.notes && (
          <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">{entry.notes}</p>
        )}
      </div>
      {entryControls(entry)}
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Phone className={`h-6 w-6 ${INK}`} />
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
              className={editMode ? 'bg-[#53406e] hover:bg-[#453759]' : ''}
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
          className="rounded-full border-[#e2dcec] pl-9"
          placeholder="Search names, numbers, notes…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      {!searching && (
        <div className="flex flex-wrap items-center gap-1.5">
          {[FILTER_ALL, ...tabs].map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={
                tab === (currentTab === FILTER_ALL ? FILTER_ALL : currentTab)
                  ? 'rounded-full bg-[#53406e] px-4 py-1.5 text-sm font-medium text-white shadow-sm'
                  : 'rounded-full border border-[#e2dcec] bg-card px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:border-[#c9bedb] hover:text-[#53406e]'
              }
            >
              {tab}
            </button>
          ))}
          {isManager && editMode && (
            <Button
              variant="ghost"
              size="sm"
              className={`ml-1 h-8 ${INK}`}
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
          <Loader2 className={`h-6 w-6 animate-spin ${INK}`} />
        </div>
      ) : visibleEntries.length === 0 ? (
        <Card className={CARD}>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {searching
              ? 'Nothing matches that search.'
              : currentTab === FILTER_ALL
                ? 'No entries yet — use Add Number to bring the breakroom sheet in.'
                : `Nothing under ${currentTab} yet — use Add Number to start this tab.`}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Practice credentials — the numbers the office reaches for most. */}
          {heroRows.length > 0 && (
            <Card className="rounded-xl border-[1.5px] border-[#53406e]/30 bg-[#f6f3fa] shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className={KICKER}>{HERO_SECTION}</CardTitle>
              </CardHeader>
              <CardContent>
                {/* auto-fit: entries share the full row — no empty trailing cells. */}
                <div className="grid gap-x-8 gap-y-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
                  {heroRows.map(entry => (
                    <div key={entry.id} className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
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

          {/* NPI / License / DEA side by side, equal heights so the row reads as one band. */}
          {credentialCards.length > 0 && (
            <div className="grid gap-4 md:grid-cols-3">
              {credentialCards.map(([name, rows]) => (
                <Card key={name} className={CARD}>
                  <CardHeader className="pb-2">
                    <CardTitle className={KICKER}>{name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-0.5">{rows.map(renderEntry)}</CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Every tab's sections, under FOF-style group headers. */}
          {tabsToRender.map(tab => {
            const sections = sectionsForTab(tab);
            if (sections.length === 0) return null;
            return (
              <section key={tab} className="space-y-3">
                {(searching || currentTab === FILTER_ALL) && (
                  <div className="flex items-center gap-3 pt-1">
                    <span className={KICKER}>{tab}</span>
                    <span className={RULE} />
                  </div>
                )}
                {/* One full-width card per group; rows flow into two balanced
                    columns like the printed sheet, so unequal groups never
                    leave holes beside each other. */}
                <div className="space-y-4">
                  {sections.map(([section, rows]) => (
                    <Card key={section} className={CARD}>
                      <CardHeader className="pb-2">
                        <CardTitle className={KICKER_MUTED}>{section}</CardTitle>
                      </CardHeader>
                      <CardContent className="sm:columns-2 sm:gap-x-10">
                        {rows.map(renderEntry)}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            );
          })}
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
            <div className="rounded-md bg-[#f6f3fa] px-3 py-2 text-sm">
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
              className="bg-[#53406e] hover:bg-[#453759]"
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
              className="bg-[#53406e] hover:bg-[#453759]"
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
