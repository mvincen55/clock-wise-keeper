/**
 * Manager tools for the Insurance Desk.
 *
 * Everything a manager needs to keep carrier manuals trustworthy:
 *   - upload a new or revised manual (parsed locally, previewed, and only
 *     published after review — replacing archives the old version, never
 *     deletes it)
 *   - edit carrier / manual type / effective date / current-vs-archived
 *   - re-run parsing on the stored original PDF, with the same preview
 *     gate and a rollback to the previous extraction
 *   - review detected sections: rename, hide furniture that slipped
 *     through, or merge a stray fragment into the previous section
 *
 * Nothing here rewrites manual content — only structure and metadata.
 */
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  FileUp,
  History,
  Loader2,
  Merge,
  Pencil,
  RefreshCcw,
  Settings2,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import ManualParsePreview from '@/components/insurance/ManualParsePreview';
import { ConfidenceBadge } from '@/components/insurance/ParsingConfidenceNotice';
import type { OfficeDoc } from '@/hooks/useOfficeDocs';
import { useOrgContext } from '@/hooks/useOrgContext';
import {
  useReaderManual,
  useReparseManual,
  useRollbackManual,
  useUpdateManualMeta,
  useUploadManual,
} from '@/hooks/useInsuranceManuals';
import { supabase } from '@/integrations/supabase/client';
import { manualTypeLabel } from '@/lib/insurance-desk';
import { extractPagesFromFile } from '@/lib/manual-pdf';
import {
  parseManual,
  type ManualSection,
  type ParsedManual,
  type SectionOverrides,
} from '@/lib/manual-parse';

const MAX_FILE_BYTES = 8 * 1024 * 1024;

type View =
  | { name: 'list' }
  | { name: 'upload'; replaces: OfficeDoc | null }
  | { name: 'edit'; doc: OfficeDoc }
  | { name: 'sections'; doc: OfficeDoc }
  | { name: 'reparse'; doc: OfficeDoc };

// ---------------------------------------------------------------------------
// Upload / replace flow: pick file → local parse → review → publish
// ---------------------------------------------------------------------------

function UploadFlow({
  replaces,
  onDone,
  onBack,
}: {
  replaces: OfficeDoc | null;
  onDone: () => void;
  onBack: () => void;
}) {
  const upload = useUploadManual();
  const { data: ctx } = useOrgContext();
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedManual | null>(null);
  const [title, setTitle] = useState(replaces?.title ?? '');
  const [carrier, setCarrier] = useState(replaces?.carrier ?? '');
  const [manualType, setManualType] = useState(replaces?.manual_type ?? '');
  const [effectiveDate, setEffectiveDate] = useState('');

  const chooseFile = async (chosen: File | null) => {
    setFile(chosen);
    setParsed(null);
    if (!chosen) return;
    if (chosen.size > MAX_FILE_BYTES) {
      toast.error('File is larger than 8 MB.');
      setFile(null);
      return;
    }
    if (chosen.type !== 'application/pdf' && !/\.pdf$/i.test(chosen.name)) {
      toast.error('Choose a PDF — carrier manuals are parsed from the original PDF.');
      setFile(null);
      return;
    }
    setParsing(true);
    try {
      const pages = await extractPagesFromFile(chosen);
      const result = parseManual(pages);
      setParsed(result);
      // Detected metadata only fills fields the manager hasn't typed.
      if (!title.trim() && result.meta.detectedTitle) setTitle(result.meta.detectedTitle);
      if (!carrier.trim() && result.meta.detectedCarrier) setCarrier(result.meta.detectedCarrier);
      if (!manualType && result.meta.detectedManualType) {
        setManualType(result.meta.detectedManualType);
      }
      if (!effectiveDate && result.meta.detectedEffectiveDate) {
        setEffectiveDate(result.meta.detectedEffectiveDate);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The PDF could not be parsed.');
      setFile(null);
    } finally {
      setParsing(false);
    }
  };

  const publish = () => {
    if (!file || !parsed || !title.trim() || !ctx?.org_id) return;
    upload.mutate(
      {
        orgId: ctx.org_id,
        title: title.trim(),
        carrier: carrier.trim() || null,
        manualType: manualType || null,
        effectiveDate: effectiveDate || null,
        replacesDocId: replaces?.id ?? null,
        file,
        parsed,
      },
      {
        onSuccess: result => {
          toast.success(
            `Published "${title.trim()}" — ${result.sections ?? 0} sections across ${parsed.meta.pageCount} pages.` +
              (replaces ? ` "${replaces.title}" moved to the archive.` : '')
          );
          onDone();
        },
        onError: err => toast.error(err.message),
      }
    );
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to manuals
      </button>
      {replaces && (
        <p className="rounded-lg bg-primary/5 px-3 py-2 text-xs text-foreground/80">
          Uploading a revision of <span className="font-medium">{replaces.title}</span>. The
          current version is archived — not deleted — once the new one is published.
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="manual-file">Manual PDF</Label>
        <Input
          id="manual-file"
          type="file"
          accept=".pdf,application/pdf"
          onChange={e => void chooseFile(e.target.files?.[0] ?? null)}
        />
        <p className="text-xs text-muted-foreground">
          Parsed on this device — structure is detected from the PDF's own layout, and the
          original file is stored for the source-page view.
        </p>
      </div>

      {parsing && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Reading the PDF page by page…
        </div>
      )}
      {parsed && <ManualParsePreview parsed={parsed} />}

      {parsed && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="manual-title">Title</Label>
            <Input
              id="manual-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. 2026 DD MA Processing Manual"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="manual-carrier">Carrier</Label>
            <Input
              id="manual-carrier"
              value={carrier}
              onChange={e => setCarrier(e.target.value)}
              placeholder="e.g. Delta Dental of Massachusetts"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Manual type</Label>
            <Select value={manualType || 'unset'} onValueChange={v => setManualType(v === 'unset' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Choose…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">Not set</SelectItem>
                <SelectItem value="processing">Processing manual</SelectItem>
                <SelectItem value="provider">Provider manual</SelectItem>
                <SelectItem value="reference">Reference guide</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="manual-effective">Effective date</Label>
            <Input
              id="manual-effective"
              type="date"
              value={effectiveDate}
              onChange={e => setEffectiveDate(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onBack}>
          Cancel
        </Button>
        <Button onClick={publish} disabled={!parsed || !title.trim() || upload.isPending}>
          {upload.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          {replaces ? 'Publish revision' : 'Publish manual'}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metadata editing
// ---------------------------------------------------------------------------

function EditMeta({ doc, onBack }: { doc: OfficeDoc; onBack: () => void }) {
  const update = useUpdateManualMeta();
  const [title, setTitle] = useState(doc.title);
  const [carrier, setCarrier] = useState(doc.carrier ?? '');
  const [manualType, setManualType] = useState(doc.manual_type ?? '');
  const [effectiveDate, setEffectiveDate] = useState(doc.effective_date ?? '');
  const [docStatus, setDocStatus] = useState<'current' | 'archived'>(
    doc.doc_status === 'archived' ? 'archived' : 'current'
  );

  const save = () => {
    update.mutate(
      {
        id: doc.id,
        title,
        carrier: carrier.trim() || null,
        manualType: manualType || null,
        effectiveDate: effectiveDate || null,
        docStatus,
      },
      {
        onSuccess: () => {
          toast.success('Manual details saved.');
          onBack();
        },
        onError: err => toast.error(err.message),
      }
    );
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to manuals
      </button>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Title</Label>
          <Input value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Carrier</Label>
          <Input
            value={carrier}
            onChange={e => setCarrier(e.target.value)}
            placeholder="e.g. Delta Dental of Massachusetts"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Manual type</Label>
          <Select value={manualType || 'unset'} onValueChange={v => setManualType(v === 'unset' ? '' : v)}>
            <SelectTrigger>
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unset">Not set</SelectItem>
              <SelectItem value="processing">Processing manual</SelectItem>
              <SelectItem value="provider">Provider manual</SelectItem>
              <SelectItem value="reference">Reference guide</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Effective date</Label>
          <Input type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={docStatus} onValueChange={v => setDocStatus(v as 'current' | 'archived')}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">Current</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onBack}>
          Cancel
        </Button>
        <Button onClick={save} disabled={update.isPending || !title.trim()}>
          {update.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save details
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section review: rename / hide / merge
// ---------------------------------------------------------------------------

function SectionReview({ doc, onBack }: { doc: OfficeDoc; onBack: () => void }) {
  const { data: reader, isLoading } = useReaderManual(doc);
  const update = useUpdateManualMeta();
  const stored = useMemo<SectionOverrides>(() => {
    const raw = doc.section_overrides;
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as SectionOverrides) : {};
  }, [doc.section_overrides]);
  const [overrides, setOverrides] = useState<SectionOverrides>(stored);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // The review list shows RAW detected sections (before overrides), so a
  // hidden section can be un-hidden and a merge undone.
  const rawSections: ManualSection[] = reader?.rawSections ?? [];

  const setOverride = (id: string, patch: Partial<SectionOverrides[string]>) => {
    setOverrides(prev => {
      const next = { ...prev, [id]: { ...prev[id], ...patch } };
      // Drop empty override records so the stored JSON stays clean.
      const record = next[id];
      if (!record.title && !record.hidden && !record.mergeIntoPrevious) delete next[id];
      return next;
    });
  };

  const save = () => {
    update.mutate(
      { id: doc.id, sectionOverrides: overrides },
      {
        onSuccess: () => {
          toast.success('Section corrections saved.');
          onBack();
        },
        onError: err => toast.error(err.message),
      }
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 self-start text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to manuals
      </button>
      <p className="text-xs text-muted-foreground">
        Correct what the parser detected: rename a mistitled section, hide a stray header
        fragment, or merge a fragment into the section above it. Content is never edited —
        only navigation.
      </p>
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
          {rawSections.map(section => {
            const override = overrides[section.id] ?? {};
            const isRenaming = renaming === section.id;
            return (
              <div
                key={section.id}
                className={`rounded-lg px-2 py-1.5 text-sm ${
                  override.hidden
                    ? 'bg-muted/60 text-muted-foreground line-through'
                    : override.mergeIntoPrevious
                      ? 'bg-muted/40 text-muted-foreground'
                      : 'hover:bg-muted/40'
                }`}
                style={{ marginLeft: (section.level - 1) * 12 }}
              >
                {isRenaming ? (
                  <form
                    className="flex items-center gap-1.5"
                    onSubmit={e => {
                      e.preventDefault();
                      setOverride(section.id, { title: renameValue.trim() || undefined });
                      setRenaming(null);
                    }}
                  >
                    <Input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      className="h-7 text-xs"
                    />
                    <Button type="submit" size="sm" variant="outline" className="h-7 px-2 text-xs">
                      Save
                    </Button>
                  </form>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate">
                      {override.title ?? section.title}
                      {override.title && (
                        <span className="ml-1.5 text-[10px] text-muted-foreground no-underline">
                          (was “{section.title}”)
                        </span>
                      )}
                    </span>
                    {section.page > 0 && (
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        p.{section.page}
                      </span>
                    )}
                    <button
                      type="button"
                      title="Rename section"
                      onClick={() => {
                        setRenaming(section.id);
                        setRenameValue(override.title ?? section.title);
                      }}
                      className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title={override.mergeIntoPrevious ? 'Undo merge' : 'Merge into previous section'}
                      onClick={() =>
                        setOverride(section.id, {
                          mergeIntoPrevious: !override.mergeIntoPrevious || undefined,
                          hidden: undefined,
                        })
                      }
                      className={`shrink-0 rounded p-1 hover:bg-muted ${
                        override.mergeIntoPrevious ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Merge className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title={override.hidden ? 'Show section' : 'Hide section (headers, stray fragments)'}
                      onClick={() =>
                        setOverride(section.id, {
                          hidden: !override.hidden || undefined,
                          mergeIntoPrevious: undefined,
                        })
                      }
                      className={`shrink-0 rounded p-1 hover:bg-muted ${
                        override.hidden ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {override.hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {rawSections.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              No sections to review.
            </p>
          )}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onBack}>
          Cancel
        </Button>
        <Button onClick={save} disabled={update.isPending}>
          {update.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save corrections
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Re-parse from the stored original
// ---------------------------------------------------------------------------

function ReparseFlow({ doc, onBack }: { doc: OfficeDoc; onBack: () => void }) {
  const reparse = useReparseManual();
  const rollback = useRollbackManual();
  const [working, setWorking] = useState(false);
  const [parsed, setParsed] = useState<ParsedManual | null>(null);
  const hasPrevious = Boolean(
    doc.parse_meta && typeof doc.parse_meta === 'object' && !Array.isArray(doc.parse_meta) &&
      (doc.parse_meta as Record<string, unknown>).previous
  );

  const runParse = async () => {
    if (!doc.file_path) return;
    setWorking(true);
    try {
      const { data, error } = await supabase.storage.from('office-docs').download(doc.file_path);
      if (error) throw new Error('The stored PDF could not be downloaded.');
      const pages = await extractPagesFromFile(data);
      setParsed(parseManual(pages));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Re-parsing failed.');
    } finally {
      setWorking(false);
    }
  };

  const publish = () => {
    if (!parsed) return;
    reparse.mutate(
      { docId: doc.id, parsed },
      {
        onSuccess: result => {
          toast.success(
            `Re-parsed "${doc.title}" — ${result.sections ?? 0} sections. The previous extraction is kept for rollback.`
          );
          onBack();
        },
        onError: err => toast.error(err.message),
      }
    );
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to manuals
      </button>

      {!doc.file_path || doc.mime_type !== 'application/pdf' ? (
        <p className="rounded-xl border border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
          This document has no stored PDF, so it can't be re-parsed. Upload a revised manual
          instead — the current text stays until the new version is published.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Re-parsing reads the stored original PDF with the current parser and shows the
            result before anything changes. The existing extraction keeps serving readers
            until you publish, and stays available for rollback afterwards.
          </p>
          {!parsed && (
            <Button onClick={() => void runParse()} disabled={working}>
              {working ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="mr-2 h-4 w-4" />
              )}
              {working ? 'Parsing the stored PDF…' : 'Run parser'}
            </Button>
          )}
          {parsed && (
            <>
              <ManualParsePreview parsed={parsed} />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setParsed(null)}>
                  Discard
                </Button>
                <Button onClick={publish} disabled={reparse.isPending}>
                  {reparse.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  Publish new parse
                </Button>
              </div>
            </>
          )}
        </>
      )}

      {hasPrevious && (
        <div className="rounded-xl border border-border bg-muted/20 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-foreground/80">
            <History className="h-3.5 w-3.5 text-primary/70" />
            Previous extraction available
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            If the new parse reads worse than the old one, restore the previous extraction.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            disabled={rollback.isPending}
            onClick={() =>
              rollback.mutate(doc.id, {
                onSuccess: () => {
                  toast.success('Restored the previous extraction.');
                  onBack();
                },
                onError: err => toast.error(err.message),
              })
            }
          >
            {rollback.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Restore previous extraction
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The dialog shell + manual list
// ---------------------------------------------------------------------------

export default function ManageManualsDialog({
  open,
  onClose,
  manuals,
}: {
  open: boolean;
  onClose: () => void;
  manuals: OfficeDoc[];
}) {
  const [view, setView] = useState<View>({ name: 'list' });

  const close = () => {
    setView({ name: 'list' });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={isOpen => !isOpen && close()}>
      <DialogContent className="flex max-h-[90dvh] w-[min(44rem,96vw)] max-w-none flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" />
            Manage manuals
          </DialogTitle>
          <DialogDescription>
            Upload, revise, and correct carrier manuals. Staff always read the published
            version; nothing changes without review.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
          {view.name === 'list' && (
            <div className="space-y-2">
              <div className="flex justify-end">
                <Button size="sm" onClick={() => setView({ name: 'upload', replaces: null })}>
                  <FileUp className="mr-1.5 h-4 w-4" />
                  Upload manual
                </Button>
              </div>
              {manuals.length === 0 && (
                <p className="rounded-xl border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
                  No carrier manuals yet. Upload the first one to build the Insurance Desk.
                </p>
              )}
              {manuals.map(doc => (
                <div key={doc.id} className="rounded-xl border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{doc.title}</span>
                    {doc.doc_status === 'archived' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        <Archive className="h-3 w-3" />
                        Archived
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                        Current
                      </span>
                    )}
                    {doc.parse_confidence && (
                      <ConfidenceBadge confidence={doc.parse_confidence as 'high' | 'medium' | 'low'} />
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[
                      doc.carrier,
                      manualTypeLabel(doc),
                      doc.effective_date ? `effective ${doc.effective_date}` : null,
                      doc.parse_status === 'legacy'
                        ? 'legacy extraction — re-parse recommended'
                        : `${doc.section_count ?? 0} sections · ${doc.page_count ?? 0} pages`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setView({ name: 'edit', doc })}>
                      <Pencil className="mr-1 h-3 w-3" />
                      Details
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setView({ name: 'sections', doc })}>
                      <Eye className="mr-1 h-3 w-3" />
                      Review sections
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setView({ name: 'reparse', doc })}>
                      <RefreshCcw className="mr-1 h-3 w-3" />
                      Re-parse
                    </Button>
                    {doc.doc_status !== 'archived' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setView({ name: 'upload', replaces: doc })}
                      >
                        <FileUp className="mr-1 h-3 w-3" />
                        Upload revision
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              <p className="pt-1 text-[11px] text-muted-foreground">
                Documents can also be moved or removed in Ask AI → Documents. Never upload
                documents containing patient information.
              </p>
            </div>
          )}

          {view.name === 'upload' && (
            <UploadFlow
              replaces={view.replaces}
              onBack={() => setView({ name: 'list' })}
              onDone={() => setView({ name: 'list' })}
            />
          )}
          {view.name === 'edit' && <EditMeta doc={view.doc} onBack={() => setView({ name: 'list' })} />}
          {view.name === 'sections' && (
            <SectionReview doc={view.doc} onBack={() => setView({ name: 'list' })} />
          )}
          {view.name === 'reparse' && (
            <ReparseFlow doc={view.doc} onBack={() => setView({ name: 'list' })} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
