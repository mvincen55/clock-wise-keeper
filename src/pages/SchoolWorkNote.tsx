import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Briefcase, GraduationCap, Printer, RotateCcw, ShieldCheck } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import BrandPrintStyle from '@/components/BrandPrintStyle';
import ScaledPrintPreview from '@/components/ScaledPrintPreview';
import OfficeLetterheadSheet from '@/components/letterhead/OfficeLetterheadSheet';
import LetterBodyContent from '@/components/letterhead/LetterBodyContent';
import SignerSelect from '@/components/letterhead/SignerSelect';
import { GENERIC_BRANDING, useOrgBranding } from '@/hooks/useOrgBranding';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useCorrespondenceSettings } from '@/hooks/useCorrespondenceSettings';
import { useSignerOptions } from '@/hooks/useSignerOptions';
import { useSignatureImage } from '@/hooks/useStaffSignature';
import { formatLetterDate, todayISO } from '@/lib/letters/letter-body';
import { buildNoteBody, NOTE_SALUTATION } from '@/lib/letters/note-wording';
import { DEFAULT_CORRESPONDENCE_SETTINGS, type NoteFields } from '@/lib/letters/types';

/**
 * School / Work Note — a temporary patient excuse note on the canonical
 * office letterhead, built for front-desk speed: pick School or Work, type
 * the name, print, clear.
 *
 * HIPAA boundary (FOF / Complete Forms philosophy): every field on this
 * page lives in React state only and dies on navigation, refresh, or the
 * Clear step. There is deliberately NO save button, no note history, no
 * storage of any kind — the completed note exists on paper only. Only
 * de-identified office configuration (wording, signers, branding) is read.
 */

const emptyFields = (noteFor: NoteFields['noteFor']): NoteFields => ({
  noteFor,
  patientName: '',
  dateSeenISO: todayISO(),
  excusedFromISO: '',
  excusedThroughISO: '',
  returnDateISO: '',
  restrictions: '',
});

export default function SchoolWorkNote() {
  const { data: ctx } = useOrgContext();
  const { data: branding } = useOrgBranding();
  const { data: settings = DEFAULT_CORRESPONDENCE_SETTINGS } = useCorrespondenceSettings();
  const { options: signerOptions, defaultKey } = useSignerOptions();

  const brand = branding ?? GENERIC_BRANDING;
  const practiceName = brand.legalName.trim() || brand.displayName.trim();

  // ------- note state (patient values: browser memory only) -------
  const [fields, setFields] = useState<NoteFields>(() => emptyFields('school'));
  const [signerKey, setSignerKey] = useState<string | null>(null);
  const [signerTitle, setSignerTitle] = useState<string | null>(null);
  const [postPrint, setPostPrint] = useState(false);

  const signer = signerOptions.find(o => o.key === (signerKey ?? defaultKey));
  const { data: inkDataUrl } = useSignatureImage(signer?.signatureUserId ?? null);
  const effectiveTitle = signerTitle ?? signer?.title ?? '';

  const set = (patch: Partial<NoteFields>) => setFields(f => ({ ...f, ...patch }));
  const clearPatient = () => setFields(f => emptyFields(f.noteFor));

  const body = buildNoteBody(fields, settings);
  const canPrint = fields.patientName.trim() !== '';

  const noteSheet = (
    <OfficeLetterheadSheet
      branding={brand}
      dateText={formatLetterDate(todayISO())}
      salutation={NOTE_SALUTATION}
      body={<LetterBodyContent markup={body} />}
      signer={{
        closing: settings.defaultClosing,
        name: signer?.name ?? practiceName,
        title: effectiveTitle,
        signatureDataUrl: inkDataUrl ?? null,
      }}
    />
  );

  const doPrint = () => {
    window.print();
    setPostPrint(true);
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">School / Work Note</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={clearPatient}>
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Start over
          </Button>
          <Button size="sm" onClick={doPrint} disabled={!canPrint}>
            <Printer className="h-4 w-4 mr-1.5" />
            Print
          </Button>
        </div>
      </div>

      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Print &amp; clear — nothing is saved</AlertTitle>
        <AlertDescription>
          Everything typed here is temporary. The note exists only on this screen and on paper;
          there is no save, no history, and nothing is sent anywhere.
        </AlertDescription>
      </Alert>

      {!ctx ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            You're not part of an office yet. Ask your office manager to resend your invite.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Note for</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className="text-left group"
                  onClick={() => set({ noteFor: 'school' })}
                  aria-pressed={fields.noteFor === 'school'}
                >
                  <Card className={`h-full transition-colors ${fields.noteFor === 'school' ? 'border-primary' : 'group-hover:border-primary/40'}`}>
                    <CardContent className="pt-4 pb-3 space-y-1">
                      <GraduationCap className="h-5 w-5 text-primary" />
                      <p className="font-semibold text-sm">School</p>
                    </CardContent>
                  </Card>
                </button>
                <button
                  type="button"
                  className="text-left group"
                  onClick={() => set({ noteFor: 'work' })}
                  aria-pressed={fields.noteFor === 'work'}
                >
                  <Card className={`h-full transition-colors ${fields.noteFor === 'work' ? 'border-primary' : 'group-hover:border-primary/40'}`}>
                    <CardContent className="pt-4 pb-3 space-y-1">
                      <Briefcase className="h-5 w-5 text-primary" />
                      <p className="font-semibold text-sm">Work</p>
                    </CardContent>
                  </Card>
                </button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Patient (temporary — cleared after printing)</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="note-name">Patient name</Label>
                  <Input id="note-name" value={fields.patientName} onChange={e => set({ patientName: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="note-seen">Date seen</Label>
                  <Input id="note-seen" type="date" value={fields.dateSeenISO} onChange={e => set({ dateSeenISO: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="note-return">May return on (optional)</Label>
                  <Input id="note-return" type="date" value={fields.returnDateISO} onChange={e => set({ returnDateISO: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="note-from">Excused from (optional)</Label>
                  <Input id="note-from" type="date" value={fields.excusedFromISO} onChange={e => set({ excusedFromISO: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="note-through">Excused through (optional)</Label>
                  <Input id="note-through" type="date" value={fields.excusedThroughISO} onChange={e => set({ excusedThroughISO: e.target.value })} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="note-restrictions">Restrictions / additional note (optional)</Label>
                  <Textarea
                    id="note-restrictions"
                    rows={2}
                    value={fields.restrictions}
                    onChange={e => set({ restrictions: e.target.value })}
                    placeholder="e.g. No physical education for 48 hours."
                  />
                </div>
              </CardContent>
            </Card>

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

          <Card className="self-start">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Preview — exactly what prints</CardTitle>
            </CardHeader>
            <CardContent>
              <ScaledPrintPreview>{noteSheet}</ScaledPrintPreview>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Brand accent for the preview and printed note (org rows). */}
      <BrandPrintStyle branding={brand} />

      {/* Hidden print copy, portaled outside #root so print CSS can show
          only the note (FOF pattern). */}
      {createPortal(<div className="letter-print-root">{noteSheet}</div>, document.body)}

      <AlertDialog open={postPrint} onOpenChange={setPostPrint}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Did the note print correctly?</AlertDialogTitle>
            <AlertDialogDescription>
              Choosing "Yes" clears the patient information from this screen — it was never saved
              anywhere.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={clearPatient}>
              <ShieldCheck className="mr-2 h-4 w-4" />
              Yes — clear patient information
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
