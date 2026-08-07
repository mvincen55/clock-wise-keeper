import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import {
  Eye, Loader2, Pencil, Printer, RotateCcw, Save, ShieldCheck,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import BrandPrintStyle from '@/components/BrandPrintStyle';
import ScaledPrintPreview from '@/components/ScaledPrintPreview';
import OfficeLetterheadSheet from '@/components/letterhead/OfficeLetterheadSheet';
import LetterBodyContent from '@/components/letterhead/LetterBodyContent';
import LetterBodyEditor from '@/components/letterhead/LetterBodyEditor';
import SignerSelect from '@/components/letterhead/SignerSelect';
import SaveTemplateDialog from '@/components/letterhead/SaveTemplateDialog';
import { GENERIC_BRANDING, useOrgBranding } from '@/hooks/useOrgBranding';
import { useOrgContext } from '@/hooks/useOrgContext';
import {
  useCorrespondencePermissions,
} from '@/hooks/useCorrespondenceSettings';
import { useLetterTemplates } from '@/hooks/useLetterTemplates';
import { useSignerOptions } from '@/hooks/useSignerOptions';
import { useSignatureImage } from '@/hooks/useStaffSignature';
import {
  formatLetterDate,
  placeholdersIn,
  resolvePlaceholders,
  todayISO,
  withDerivedValues,
} from '@/lib/letters/letter-body';
import { EMPTY_RECIPIENT, type LetterRecipient } from '@/lib/letters/types';

/**
 * Write on Letterhead — a one-off office letter on the canonical
 * letterhead: word processor lite, live preview of the exact printed page,
 * print without saving.
 *
 * HIPAA boundary (FOF / Broken Appointments precedent): the recipient block
 * and every fill-in value live in React state only and die on navigation.
 * The ONLY thing that can be saved is the letter's WORDING, through
 * SaveTemplateDialog (placeholders instead of patient values, scanned and
 * confirmed) — printing never writes anything anywhere.
 */

export default function WriteLetter() {
  const { data: ctx } = useOrgContext();
  const { data: branding } = useOrgBranding();
  const { canManageTemplates, settings } = useCorrespondencePermissions();
  const { data: templates, isLoading: templatesLoading } = useLetterTemplates();
  const { options: signerOptions, defaultKey } = useSignerOptions();
  const [params, setParams] = useSearchParams();

  const brand = branding ?? GENERIC_BRANDING;
  const practiceName = brand.legalName.trim() || brand.displayName.trim();

  // ------- letter state (recipient + fill values: browser memory only) ----
  const [recipient, setRecipient] = useState<LetterRecipient>({ ...EMPTY_RECIPIENT });
  const [dateISO, setDateISO] = useState(() => todayISO());
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [closingEdit, setClosingEdit] = useState<string | null>(null);
  const [salutationEdit, setSalutationEdit] = useState<string | null>(null);
  const [fill, setFill] = useState<Record<string, string>>({});
  const [signerKey, setSignerKey] = useState<string | null>(null);
  const [signerTitle, setSignerTitle] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<
    { id: string; title: string; category: string; version: number } | null
  >(null);
  const [loadedParam, setLoadedParam] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [postPrint, setPostPrint] = useState(false);
  const [mobilePane, setMobilePane] = useState<'compose' | 'preview'>('compose');

  // Load a template from ?template= (use) or ?edit= (edit office wording).
  useEffect(() => {
    if (loadedParam || templatesLoading || !templates) return;
    const useId = params.get('template');
    const editId = params.get('edit');
    const id = editId ?? useId;
    if (!id) {
      setLoadedParam(true);
      return;
    }
    const t = templates.find(t => t.id === id);
    if (t) {
      setSubject(t.subject);
      setBody(t.body);
      setClosingEdit(t.closing.trim() !== '' ? t.closing : null);
      if (editId && canManageTemplates) {
        setEditingTemplate({ id: t.id, title: t.title, category: t.category, version: t.version });
      }
    }
    setLoadedParam(true);
  }, [loadedParam, templatesLoading, templates, params, canManageTemplates]);

  // ------- derived -------
  const signer = signerOptions.find(o => o.key === (signerKey ?? defaultKey));
  const { data: inkDataUrl } = useSignatureImage(signer?.signatureUserId ?? null);
  const closing = closingEdit ?? settings.defaultClosing;
  const effectiveTitle = signerTitle ?? signer?.title ?? '';

  const placeholderKeys = useMemo(
    () => placeholdersIn([subject, body, closing].join('\n')),
    [subject, body, closing],
  );
  const fillKeys = placeholderKeys.filter(k => !['today', 'office_name'].includes(k));

  const values = useMemo(
    () =>
      withDerivedValues({
        ...fill,
        patient_name: fill.patient_name?.trim() || recipient.name.trim(),
        provider_name: fill.provider_name?.trim() || (signer?.name ?? ''),
        today: formatLetterDate(dateISO),
        office_name: practiceName,
      }),
    [fill, recipient.name, signer?.name, dateISO, practiceName],
  );

  const resolvedSubject = resolvePlaceholders(subject, values);
  const resolvedBody = resolvePlaceholders(body, values);
  const salutation =
    salutationEdit ?? (recipient.name.trim() !== '' ? `Dear ${recipient.name.trim()},` : '');

  const hasContent = body.trim() !== '' || subject.trim() !== '';
  const hasTemporaryDetails =
    Object.values(recipient).some(v => v.trim() !== '') ||
    Object.values(fill).some(v => v.trim() !== '');

  const letterSheet = (
    <OfficeLetterheadSheet
      branding={brand}
      dateText={formatLetterDate(dateISO)}
      recipient={recipient}
      salutation={salutation}
      subject={resolvedSubject}
      body={<LetterBodyContent markup={resolvedBody} />}
      signer={{
        closing,
        name: signer?.name ?? practiceName,
        title: effectiveTitle,
        signatureDataUrl: inkDataUrl ?? null,
      }}
    />
  );

  const clearPatientDetails = () => {
    setRecipient({ ...EMPTY_RECIPIENT });
    setFill({});
  };

  const startOver = () => {
    clearPatientDetails();
    setSubject('');
    setBody('');
    setClosingEdit(null);
    setSalutationEdit(null);
    setSignerTitle(null);
    setDateISO(todayISO());
    setEditingTemplate(null);
    setParams({}, { replace: true });
  };

  const doPrint = () => {
    window.print();
    setPostPrint(true);
  };

  const updateRecipient = (patch: Partial<LetterRecipient>) =>
    setRecipient(r => ({ ...r, ...patch }));

  const composeColumn = (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recipient (optional — printed only when filled)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="lw-name">Recipient name</Label>
            <Input id="lw-name" value={recipient.name} onChange={e => updateRecipient({ name: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="lw-addr1">Street address</Label>
            <Input id="lw-addr1" value={recipient.addressLine1} onChange={e => updateRecipient({ addressLine1: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="lw-addr2">Address line 2 (optional)</Label>
            <Input id="lw-addr2" value={recipient.addressLine2} onChange={e => updateRecipient({ addressLine2: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lw-city">City</Label>
            <Input id="lw-city" value={recipient.city} onChange={e => updateRecipient({ city: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <div className="space-y-1.5 w-24">
              <Label htmlFor="lw-state">State</Label>
              <Input id="lw-state" value={recipient.state} onChange={e => updateRecipient({ state: e.target.value })} />
            </div>
            <div className="space-y-1.5 flex-1">
              <Label htmlFor="lw-zip">ZIP</Label>
              <Input id="lw-zip" value={recipient.zip} onChange={e => updateRecipient({ zip: e.target.value })} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Letter</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lw-date">Date</Label>
              <Input id="lw-date" type="date" value={dateISO} onChange={e => setDateISO(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lw-subject">Subject (optional)</Label>
              <Input id="lw-subject" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Printed as a RE: line" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lw-salutation">Salutation</Label>
            <Input
              id="lw-salutation"
              value={salutation}
              onChange={e => setSalutationEdit(e.target.value)}
              placeholder='e.g. "Dear Jane Smith," — leave empty for none'
            />
          </div>
          <LetterBodyEditor value={body} onChange={setBody} showPlaceholders={canManageTemplates} />
          <div className="space-y-1.5">
            <Label htmlFor="lw-closing">Closing</Label>
            <Input id="lw-closing" value={closing} onChange={e => setClosingEdit(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {fillKeys.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Fill-in values for this letter</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              These values are merged for printing only — they are never saved with the letter.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {fillKeys.map(key => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={`lw-fill-${key}`} className="font-mono text-xs">{`{{${key}}}`}</Label>
                  <Input
                    id={`lw-fill-${key}`}
                    value={fill[key] ?? ''}
                    onChange={e => setFill(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={key === 'patient_name' && recipient.name.trim() !== '' ? recipient.name : ''}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Signature</CardTitle>
        </CardHeader>
        <CardContent>
          <SignerSelect
            value={signer?.key ?? defaultKey}
            onChange={(key, option) => {
              setSignerKey(key);
              setSignerTitle(option ? option.title || null : null);
            }}
            title={effectiveTitle}
            onTitleChange={setSignerTitle}
          />
        </CardContent>
      </Card>
    </div>
  );

  const previewColumn = (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Preview — exactly what prints</CardTitle>
      </CardHeader>
      <CardContent>
        <ScaledPrintPreview>{letterSheet}</ScaledPrintPreview>
      </CardContent>
    </Card>
  );

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">
          {editingTemplate ? `Edit letter — ${editingTemplate.title}` : 'Write on Letterhead'}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={startOver}>
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Start over
          </Button>
          {canManageTemplates && (
            <Button variant="outline" size="sm" onClick={() => setSaveOpen(true)} disabled={!hasContent}>
              <Save className="h-4 w-4 mr-1.5" />
              {editingTemplate ? 'Save changes to library' : 'Save wording to library'}
            </Button>
          )}
          <Button size="sm" onClick={doPrint} disabled={!hasContent}>
            <Printer className="h-4 w-4 mr-1.5" />
            Print
          </Button>
        </div>
      </div>

      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Print without saving</AlertTitle>
        <AlertDescription>
          Recipient details and fill-in values exist only on this screen and on paper. Saving to
          the library keeps the reusable wording only — with placeholders, never a patient's
          information.
        </AlertDescription>
      </Alert>

      {!ctx ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            You're not part of an office yet. Ask your office manager to resend your invite.
          </CardContent>
        </Card>
      ) : templatesLoading && !loadedParam ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Phones/tablets: one pane at a time. Desktop: side by side. */}
          <div className="flex gap-2 xl:hidden">
            <Button
              variant={mobilePane === 'compose' ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => setMobilePane('compose')}
            >
              <Pencil className="h-4 w-4 mr-1.5" />
              Compose
            </Button>
            <Button
              variant={mobilePane === 'preview' ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => setMobilePane('preview')}
            >
              <Eye className="h-4 w-4 mr-1.5" />
              Preview
            </Button>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <div className={mobilePane === 'compose' ? '' : 'hidden xl:block'}>{composeColumn}</div>
            <div className={mobilePane === 'preview' ? '' : 'hidden xl:block'}>{previewColumn}</div>
          </div>
        </>
      )}

      {/* Brand accent for the preview and printed letter (org rows). */}
      <BrandPrintStyle branding={brand} />

      {/* Hidden print copy, portaled outside #root so print CSS can show
          only the letter (FOF pattern). */}
      {createPortal(<div className="letter-print-root">{letterSheet}</div>, document.body)}

      <SaveTemplateDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        input={{
          subject,
          body,
          closing: closingEdit ?? '',
          existing: editingTemplate
            ? {
                id: editingTemplate.id,
                title: editingTemplate.title,
                category: editingTemplate.category as never,
                version: editingTemplate.version,
              }
            : undefined,
        }}
        onSaved={() => setEditingTemplate(null)}
      />

      <AlertDialog open={postPrint} onOpenChange={setPostPrint}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Did the letter print correctly?</AlertDialogTitle>
            <AlertDialogDescription>
              {hasTemporaryDetails
                ? 'Clearing removes the recipient details and fill-in values from this screen — they were never saved anywhere.'
                : 'Nothing about this letter was saved anywhere.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            {hasTemporaryDetails && (
              <AlertDialogAction onClick={clearPatientDetails}>
                <ShieldCheck className="mr-2 h-4 w-4" />
                Yes — clear recipient details
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
