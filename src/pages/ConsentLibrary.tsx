import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search, Upload, FilePlus2, MoreHorizontal, Eye, Pencil, Copy, Layers,
  Archive, ArchiveRestore, Printer, FileSignature, DollarSign, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useOrgBranding, GENERIC_BRANDING } from '@/hooks/useOrgBranding';
import {
  useConsentForms, useArchiveConsentForm, useDuplicateConsentForm,
} from '@/hooks/useConsentForms';
import { useConsentBundles, useSaveConsentBundle } from '@/hooks/useConsentBundles';
import { useConsentPermissions } from '@/hooks/useConsentSettings';
import { ConsentPreviewDialog } from '@/components/consents/ConsentPrinting';
import ConsentPrintSheet from '@/components/consents/ConsentPrintSheet';
import UploadConvertDialog from '@/components/consents/UploadConvertDialog';
import { templateWarnings, duplicateFormNames } from '@/lib/consents/validation';
import {
  FORM_CATEGORIES, FORM_CATEGORY_LABELS, categoryLabel, effectiveContent, workingContent,
  type ConsentForm,
} from '@/lib/consents/types';
import { format } from 'date-fns';

// Form Library: every office form on one searchable surface. Archived forms
// stay reachable here (managers) but never appear in the Complete Forms
// selection workflow.

type QuickFilter = 'all' | 'needs_review' | 'draft' | 'unpublished' | 'no_signature' | 'unlinked' | 'archived';

const QUICK_FILTER_LABELS: Record<QuickFilter, string> = {
  all: 'All forms',
  needs_review: 'Needs review',
  draft: 'Drafts',
  unpublished: 'Unpublished changes',
  no_signature: 'Missing signature lines',
  unlinked: 'No linked procedure',
  archived: 'Archived',
};

function SignatureChips({ form }: { form: ConsentForm }) {
  const chips: string[] = [];
  if (form.requiresPatientSignature) chips.push('Patient');
  if (form.requiresGuardianSignature) chips.push('Guardian');
  if (form.requiresDoctorSignature) chips.push('Doctor');
  if (form.requiresWitnessSignature) chips.push('Witness');
  if (form.hygienistMayComplete) chips.push('Hygienist OK');
  if (chips.length === 0) chips.push('No signatures');
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <FileSignature className="h-3 w-3" />
      {chips.join(' · ')}
    </span>
  );
}

export default function ConsentLibrary() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const { data: forms = [], isLoading } = useConsentForms();
  const { data: bundles = [] } = useConsentBundles();
  const { data: branding = GENERIC_BRANDING } = useOrgBranding();
  const { can, isManager } = useConsentPermissions();
  const archiveForm = useArchiveConsentForm();
  const duplicateForm = useDuplicateConsentForm();
  const saveBundle = useSaveConsentBundle();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [signature, setSignature] = useState<string>('all');
  const [kind, setKind] = useState<string>('all'); // financial vs clinical
  const quick = (params.get('filter') as QuickFilter) ?? 'all';

  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewForm, setPreviewForm] = useState<ConsentForm | null>(null);
  const [bundlePickForm, setBundlePickForm] = useState<ConsentForm | null>(null);

  const duplicates = useMemo(() => duplicateFormNames(forms), [forms]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return forms.filter(form => {
      if (quick === 'archived') {
        if (form.status !== 'archived') return false;
      } else {
        if (form.status === 'archived') return false;
        if (quick === 'needs_review' && !form.needsReview) return false;
        if (quick === 'draft' && form.status !== 'draft') return false;
        if (quick === 'unpublished' && !(form.status === 'published' && form.draftContent)) return false;
        if (quick === 'no_signature') {
          const content = workingContent(form);
          if (!content || content.blocks.some(b => b.type === 'signature')) return false;
        }
        if (quick === 'unlinked' && (form.procedureCodes.length > 0 || ['office_policy', 'financial', 'other'].includes(form.category))) return false;
      }
      if (category !== 'all' && form.category !== category) return false;
      if (kind === 'financial' && !form.isFinancial) return false;
      if (kind === 'clinical' && form.isFinancial) return false;
      if (signature === 'patient' && !form.requiresPatientSignature) return false;
      if (signature === 'doctor' && !form.requiresDoctorSignature) return false;
      if (signature === 'witness' && !form.requiresWitnessSignature) return false;
      if (signature === 'none' && (form.requiresPatientSignature || form.requiresDoctorSignature || form.requiresWitnessSignature)) return false;
      if (term) {
        const haystack = `${form.name} ${categoryLabel(form.category)} ${form.procedureCodes.join(' ')}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [forms, quick, category, kind, signature, search]);

  const setQuick = (value: QuickFilter) => {
    const next = new URLSearchParams(params);
    if (value === 'all') next.delete('filter');
    else next.set('filter', value);
    setParams(next, { replace: true });
  };

  const addToBundle = (bundleId: string) => {
    const bundle = bundles.find(b => b.id === bundleId);
    const form = bundlePickForm;
    if (!bundle || !form) return;
    if (bundle.items.some(i => i.formId === form.id)) {
      toast({ title: 'Already in that bundle' });
      setBundlePickForm(null);
      return;
    }
    saveBundle.mutate(
      {
        id: bundle.id,
        name: bundle.name,
        description: bundle.description,
        procedureCodes: bundle.procedureCodes,
        items: [
          ...bundle.items.map(i => ({ formId: i.formId, requirement: i.requirement, conditionLabel: i.conditionLabel })),
          { formId: form.id, requirement: 'optional' as const },
        ],
      },
      {
        onSuccess: () => {
          toast({ title: `Added to ${bundle.name}`, description: 'Added as optional — adjust in Treatment Bundles.' });
          setBundlePickForm(null);
        },
        onError: err => toast({ title: 'Could not update bundle', description: String(err), variant: 'destructive' }),
      },
    );
  };

  const previewContent = previewForm ? effectiveContent(previewForm) ?? workingContent(previewForm) : null;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Form Library</h1>
          <p className="text-muted-foreground">
            Every office form, versioned and print-ready.{' '}
            <Link to="/consents" className="text-primary underline-offset-2 hover:underline">Forms &amp; Consents home</Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can('upload') && (
            <Button variant="outline" onClick={() => setUploadOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />Upload &amp; convert
            </Button>
          )}
          {can('editTemplates') && (
            <Button onClick={() => navigate('/consents/builder')}>
              <FilePlus2 className="mr-2 h-4 w-4" />Create form
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, category, or procedure code…"
            className="pl-8"
          />
        </div>
        <Select value={quick} onValueChange={v => setQuick(v as QuickFilter)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(QUICK_FILTER_LABELS)
              .filter(([value]) => value !== 'archived' || isManager)
              .map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {FORM_CATEGORIES.map(c => (
              <SelectItem key={c} value={c}>{FORM_CATEGORY_LABELS[c]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={signature} onValueChange={setSignature}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Signatures" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any signatures</SelectItem>
            <SelectItem value="patient">Needs patient signature</SelectItem>
            <SelectItem value="doctor">Needs doctor signature</SelectItem>
            <SelectItem value="witness">Needs witness</SelectItem>
            <SelectItem value="none">No signatures</SelectItem>
          </SelectContent>
        </Select>
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="clinical">Clinical</SelectItem>
            <SelectItem value="financial">Financial</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading the library…</p>}
      {!isLoading && filtered.length === 0 && (
        <Card className="card-elevated">
          <CardContent className="p-8 text-center text-muted-foreground">
            {forms.length === 0
              ? 'No forms yet. Upload an existing form, create one, or install the sample library from the Forms & Consents home.'
              : 'Nothing matches these filters.'}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {filtered.map(form => {
          const content = workingContent(form);
          const warnings = templateWarnings({ ...form, hasDraft: !!form.draftContent }, content);
          const isDupe = duplicates.has(form.name.trim().toLowerCase());
          const canEditThis = can('editTemplates') || form.editableBy === 'everyone';
          return (
            <Card key={form.id} className="card-elevated">
              <CardContent className="p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium leading-tight truncate">{form.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {categoryLabel(form.category)}
                      {form.procedureCodes.length > 0 && <> · {form.procedureCodes.join(', ')}</>}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Form actions">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setPreviewForm(form)}>
                        <Eye className="mr-2 h-4 w-4" />Preview
                      </DropdownMenuItem>
                      {canEditThis && (
                        <DropdownMenuItem onClick={() => navigate(`/consents/builder/${form.id}`)}>
                          <Pencil className="mr-2 h-4 w-4" />Edit
                        </DropdownMenuItem>
                      )}
                      {can('editTemplates') && (
                        <DropdownMenuItem
                          onClick={() =>
                            duplicateForm.mutate(form, {
                              onSuccess: copy => navigate(`/consents/builder/${copy.id}`),
                            })
                          }
                        >
                          <Copy className="mr-2 h-4 w-4" />Duplicate
                        </DropdownMenuItem>
                      )}
                      {can('createBundles') && form.status !== 'archived' && (
                        <DropdownMenuItem onClick={() => setBundlePickForm(form)}>
                          <Layers className="mr-2 h-4 w-4" />Add to bundle
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => setPreviewForm(form)}>
                        <Printer className="mr-2 h-4 w-4" />Print blank copy
                      </DropdownMenuItem>
                      {can('archive') && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className={form.status === 'archived' ? '' : 'text-destructive focus:text-destructive'}
                            onClick={() =>
                              archiveForm.mutate(
                                { form, archive: form.status !== 'archived' },
                                {
                                  onSuccess: () =>
                                    toast({ title: form.status === 'archived' ? 'Form restored' : 'Form archived' }),
                                },
                              )
                            }
                          >
                            {form.status === 'archived'
                              ? <><ArchiveRestore className="mr-2 h-4 w-4" />Restore</>
                              : <><Archive className="mr-2 h-4 w-4" />Archive</>}
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={form.status === 'published' ? 'default' : form.status === 'archived' ? 'outline' : 'secondary'}>
                    {form.status === 'published' ? `Published · v${form.currentVersion}` : form.status === 'archived' ? 'Archived' : 'Draft'}
                  </Badge>
                  {form.isSample && <Badge variant="outline">Sample — review before use</Badge>}
                  {form.needsReview && <Badge variant="outline" className="border-warning text-warning">AI conversion — needs review</Badge>}
                  {form.status === 'published' && form.draftContent && <Badge variant="secondary">Unpublished changes</Badge>}
                  {form.isFinancial && (
                    <Badge variant="outline"><DollarSign className="mr-0.5 h-3 w-3" />Financial</Badge>
                  )}
                  {form.includesCost && !form.isFinancial && (
                    <Badge variant="outline"><DollarSign className="mr-0.5 h-3 w-3" />Shows cost</Badge>
                  )}
                  {isDupe && (
                    <Badge variant="outline" className="border-warning text-warning">Duplicate name</Badge>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <SignatureChips form={form} />
                  <span className="text-xs text-muted-foreground">
                    {form.editableBy === 'everyone' ? 'Whole team can edit' : 'Managers edit'} · Updated {format(new Date(form.updatedAt), 'MMM d, yyyy')}
                  </span>
                </div>

                {warnings.filter(w => w.severity === 'warning').slice(0, 2).map(w => (
                  <p key={w.code} className="flex items-start gap-1.5 text-xs text-warning">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{w.message}
                  </p>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Preview / print blank copy */}
      {previewForm && previewContent && (
        <ConsentPreviewDialog
          open
          onOpenChange={open => { if (!open) setPreviewForm(null); }}
          title={previewForm.name}
          description="Blank copy — exactly what prints, with ruled lines to complete by hand."
          branding={branding}
          printLabel="Print blank copy"
          canPrint={can('print')}
          sheet={
            <ConsentPrintSheet
              form={previewForm}
              content={previewContent}
              branding={branding}
              fill={null}
              versionDate={previewForm.updatedAt}
            />
          }
        />
      )}

      {/* Add to bundle picker */}
      <Dialog open={!!bundlePickForm} onOpenChange={open => { if (!open) setBundlePickForm(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add “{bundlePickForm?.name}” to a bundle</DialogTitle>
            <DialogDescription>It is added as optional; adjust the requirement in Treatment Bundles.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            {bundles.filter(b => b.status === 'active').map(bundle => (
              <button
                key={bundle.id}
                onClick={() => addToBundle(bundle.id)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-muted"
              >
                <span>{bundle.name}</span>
                <span className="text-xs text-muted-foreground">{bundle.items.length} forms</span>
              </button>
            ))}
            {bundles.filter(b => b.status === 'active').length === 0 && (
              <p className="p-2 text-sm text-muted-foreground">
                No bundles yet — create one in Treatment Bundles first.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBundlePickForm(null)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UploadConvertDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  );
}
