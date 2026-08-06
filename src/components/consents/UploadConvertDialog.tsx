import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as pdfjs from 'pdfjs-dist';
import {
  Upload, Loader2, RefreshCcw, Check, Pencil, FileText, Sparkles, AlertTriangle,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useOrgBranding, GENERIC_BRANDING } from '@/hooks/useOrgBranding';
import { useCreateConsentForm, usePublishConsentForm } from '@/hooks/useConsentForms';
import ScaledPrintPreview from '@/components/ScaledPrintPreview';
import BrandPrintStyle from '@/components/BrandPrintStyle';
import ConsentPrintSheet from '@/components/consents/ConsentPrintSheet';
import NoPhiNote from '@/components/NoPhiNote';
import { extractFormText, type ExtractedDoc } from '@/lib/consents/extract';
import { convertUploadedForm, type ConversionResult } from '@/lib/consents/ai';
import { inferProcedureCodes } from '@/lib/consents/convert';
import { useProcedureMeta } from '@/hooks/useProcedureMeta';
import {
  FORM_CATEGORIES, FORM_CATEGORY_LABELS, type FormCategory,
} from '@/lib/consents/types';

/**
 * Upload → convert → review, in one dialog.
 *
 * The uploaded document is read entirely in the browser (pdfjs + local OCR);
 * only its extracted TEXT goes to the consent-ai function — and only after
 * the manager confirms the upload is a blank master form. The converted
 * template is NEVER published automatically: the review step shows the
 * original beside the conversion, and the manager approves, edits, re-runs,
 * saves a draft, or cancels.
 */

type Step = 'pick' | 'working' | 'review';

async function renderPdfPreviews(file: File, maxPages = 4): Promise<string[]> {
  try {
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
    const pages = Math.min(doc.numPages, maxPages);
    const urls: string[] = [];
    for (let i = 1; i <= pages; i += 1) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 1.2 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      urls.push(canvas.toDataURL('image/png'));
    }
    doc.cleanup();
    return urls;
  } catch {
    return [];
  }
}

export default function UploadConvertDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: branding = GENERIC_BRANDING } = useOrgBranding();
  const createForm = useCreateConsentForm();
  const publishForm = usePublishConsentForm();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('pick');
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [confirmedBlank, setConfirmedBlank] = useState(false);
  const [progress, setProgress] = useState('');
  const [extracted, setExtracted] = useState<ExtractedDoc | null>(null);
  const [originalPages, setOriginalPages] = useState<string[]>([]);
  const [conversion, setConversion] = useState<ConversionResult | null>(null);
  const [category, setCategory] = useState<FormCategory>('other');
  const [procedureCodesText, setProcedureCodesText] = useState('');
  const [suggestedCodes, setSuggestedCodes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const { data: procedureMeta = [] } = useProcedureMeta();

  const reset = () => {
    setStep('pick');
    setFile(null);
    setName('');
    setConfirmedBlank(false);
    setProgress('');
    setExtracted(null);
    setOriginalPages([]);
    setConversion(null);
    setProcedureCodesText('');
    setSuggestedCodes([]);
    setSaving(false);
  };

  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const pickFile = (picked: File | null) => {
    setFile(picked);
    if (picked && !name.trim()) {
      setName(picked.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim());
    }
  };

  const runConversion = useCallback(async (doc: ExtractedDoc, formName: string) => {
    setProgress('Converting to a digital template…');
    const result = await convertUploadedForm(formName, doc.text);
    setConversion(result);
    setCategory(result.category);
    // Infer connected procedures from the title/text and the office's own
    // metadata: strong matches pre-fill (still editable), loose matches wait
    // for a manager's confirmation.
    const inferred = inferProcedureCodes(
      formName,
      doc.text,
      procedureMeta.map(m => ({
        code: m.code,
        patientName: m.patientName,
        internalDescription: m.internalDescription,
        keywords: m.keywords,
      })),
    );
    setProcedureCodesText(inferred.confident.join(', '));
    setSuggestedCodes(inferred.suggested);
    setStep('review');
  }, [procedureMeta]);

  const start = async () => {
    if (!file) return;
    setStep('working');
    try {
      setProgress('Reading the document…');
      const [doc, previews] = await Promise.all([
        extractFormText(file, setProgress),
        file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
          ? renderPdfPreviews(file)
          : file.type.startsWith('image/')
            ? Promise.resolve([URL.createObjectURL(file)])
            : Promise.resolve([]),
      ]);
      if (!doc.text.trim()) {
        throw new Error('No readable text found in this document. Try a clearer scan or a text PDF.');
      }
      setExtracted(doc);
      setOriginalPages(previews);
      await runConversion(doc, name.trim() || file.name);
    } catch (err) {
      toast({
        title: 'Could not convert this document',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
      setStep('pick');
    }
  };

  const rerun = async () => {
    if (!extracted) return;
    setStep('working');
    try {
      await runConversion(extracted, name.trim() || 'Uploaded form');
    } catch {
      setStep('review');
    }
  };

  /** Create the template. approve=true also publishes v1 after the review. */
  const save = async (mode: 'approve' | 'edit' | 'draft') => {
    if (!conversion) return;
    setSaving(true);
    try {
      const form = await createForm.mutateAsync({
        name: name.trim() || 'Uploaded form',
        category,
        content: conversion.content,
        procedureCodes: procedureCodesText
          .split(/[,\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean),
        source: 'upload',
        // Approve = the manager just reviewed it side by side. Draft keeps
        // the needs-review flag so the library shows it prominently.
        needsReview: mode === 'draft',
      });
      if (mode === 'approve') {
        await publishForm.mutateAsync({
          form,
          content: conversion.content,
          changeNotes: `Approved ${conversion.engine === 'ai' ? 'AI' : 'basic'} conversion of uploaded document "${file?.name ?? ''}".`,
        });
        toast({ title: 'Form published', description: 'The converted template is live in your library.' });
        close(false);
      } else if (mode === 'edit') {
        toast({ title: 'Draft created', description: 'Opening the builder to fine-tune it.' });
        close(false);
        navigate(`/consents/builder/${form.id}`);
      } else {
        toast({ title: 'Saved as draft', description: 'It stays flagged for review until published.' });
        close(false);
      }
    } catch (err) {
      toast({ title: 'Could not save the form', description: String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className={step === 'review' ? 'max-w-6xl max-h-[92vh] flex flex-col' : 'max-w-lg'}>
        <DialogHeader>
          <DialogTitle>Upload &amp; convert a form</DialogTitle>
          <DialogDescription>
            PDF, Word (.docx), scan, or photo — converted into an editable, versioned template.
          </DialogDescription>
        </DialogHeader>

        {step === 'pick' && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-8 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5"
            >
              {file ? (
                <>
                  <FileText className="h-6 w-6 text-primary" />
                  <span className="font-medium text-foreground">{file.name}</span>
                  <span className="text-xs">{(file.size / 1024).toFixed(0)} KB — click to choose a different file</span>
                </>
              ) : (
                <>
                  <Upload className="h-6 w-6" />
                  <span>Click to choose a file</span>
                  <span className="text-xs">PDF · DOCX · JPG/PNG scan · TXT — multi-page welcome</span>
                </>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md,image/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={e => pickFile(e.target.files?.[0] ?? null)}
            />
            <div className="space-y-1.5">
              <Label htmlFor="upload-form-name">Form name</Label>
              <Input
                id="upload-form-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Extraction Consent"
              />
            </div>
            <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
              <Checkbox
                checked={confirmedBlank}
                onCheckedChange={v => setConfirmedBlank(v === true)}
                className="mt-0.5"
              />
              <span>
                This is a <strong>blank master form</strong> — not a completed patient form. No patient
                names, tooth numbers, or clinical details are filled in.
              </span>
            </label>
            <NoPhiNote what="This document's text" />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
              <Button onClick={start} disabled={!file || !confirmedBlank}>
                <Sparkles className="mr-2 h-4 w-4" />Convert
              </Button>
            </div>
          </div>
        )}

        {step === 'working' && (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">{progress}</p>
          </div>
        )}

        {step === 'review' && conversion && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={conversion.engine === 'ai' ? 'default' : 'secondary'}>
                {conversion.engine === 'ai' ? 'AI conversion' : 'Basic conversion'}
              </Badge>
              <Select value={category} onValueChange={v => setCategory(v as FormCategory)}>
                <SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORM_CATEGORIES.map(c => (
                    <SelectItem key={c} value={c}>{FORM_CATEGORY_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                className="h-8 w-64"
                aria-label="Form name"
              />
              {conversion.notice && (
                <p className="flex w-full items-start gap-1.5 text-xs text-warning">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{conversion.notice}
                </p>
              )}
              <div className="flex w-full flex-wrap items-center gap-2">
                <Input
                  value={procedureCodesText}
                  onChange={e => setProcedureCodesText(e.target.value)}
                  className="h-8 w-72"
                  placeholder="Connected procedures (CDT codes)"
                  aria-label="Connected procedures"
                />
                {suggestedCodes
                  .filter(c => !procedureCodesText.toUpperCase().includes(c))
                  .map(code => (
                    <Button
                      key={code}
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() =>
                        setProcedureCodesText(t => (t.trim() ? `${t.trim().replace(/,\s*$/, '')}, ${code}` : code))
                      }
                    >
                      + {code}?
                    </Button>
                  ))}
                {(procedureCodesText || suggestedCodes.length > 0) && (
                  <p className="w-full text-[11px] text-muted-foreground">
                    Inferred from the form's title and text — edit freely. Suggestions with a “?” need your confirmation.
                  </p>
                )}
              </div>
            </div>

            <div className="grid flex-1 min-h-0 gap-4 md:grid-cols-2">
              <div className="flex min-h-0 flex-col">
                <p className="pb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Original upload
                </p>
                <div className="flex-1 overflow-y-auto rounded-lg border bg-muted/50 p-3 space-y-3">
                  {originalPages.length > 0 ? (
                    originalPages.map((src, i) => (
                      <img key={i} src={src} alt={`Original page ${i + 1}`} className="w-full rounded border bg-white" />
                    ))
                  ) : (
                    <pre className="whitespace-pre-wrap text-xs">{extracted?.text}</pre>
                  )}
                </div>
              </div>
              <div className="flex min-h-0 flex-col">
                <p className="pb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Converted template (as it will print)
                </p>
                <div className="flex-1 overflow-y-auto rounded-lg border bg-muted/50 p-3">
                  <BrandPrintStyle branding={branding} />
                  <ScaledPrintPreview>
                    <ConsentPrintSheet
                      form={{ id: 'preview', name: name || 'Uploaded form', isSample: false, isFinancial: category === 'financial', currentVersion: 0 }}
                      content={conversion.content}
                      branding={branding}
                      fill={null}
                    />
                  </ScaledPrintPreview>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => close(false)} disabled={saving}>Cancel</Button>
              <Button variant="outline" onClick={rerun} disabled={saving}>
                <RefreshCcw className="mr-2 h-4 w-4" />Re-run conversion
              </Button>
              <Button variant="outline" onClick={() => save('draft')} disabled={saving}>
                Save as draft
              </Button>
              <Button variant="outline" onClick={() => save('edit')} disabled={saving}>
                <Pencil className="mr-2 h-4 w-4" />Edit in builder
              </Button>
              <Button onClick={() => save('approve')} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                Approve &amp; publish
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
