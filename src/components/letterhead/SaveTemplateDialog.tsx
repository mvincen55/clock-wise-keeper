import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, ShieldCheck } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useOrgBranding } from '@/hooks/useOrgBranding';
import { useActiveProviders } from '@/hooks/useProviders';
import { useCorrespondenceSettings } from '@/hooks/useCorrespondenceSettings';
import { useMyProfile } from '@/hooks/useMyProfile';
import { useCreateLetterTemplate, useUpdateLetterTemplate } from '@/hooks/useLetterTemplates';
import { scanForPatientIdentifiers, PII_KIND_LABELS, type PiiHit } from '@/lib/consents/pii';
import {
  LETTER_CATEGORIES,
  LETTER_CATEGORY_LABELS,
  type LetterCategory,
  type LetterTemplateContent,
} from '@/lib/letters/types';

/**
 * The ONLY door into the saved letter library. Saving means "keep this
 * WORDING for reuse" — never "keep this patient's letter." Three layers:
 *
 *   1. The payload type (LetterTemplateContent) has no recipient fields, so
 *      a filled recipient block cannot even be passed in.
 *   2. The storable text is scanned locally (src/lib/consents/pii.ts — no
 *      AI, nothing leaves the browser) and a likely patient identifier
 *      BLOCKS the save with the exact excerpts to fix.
 *   3. Even a clean scan requires the person to confirm the wording is
 *      reusable office content — the scanner is a safety net, not magic.
 */

export interface SaveTemplateInput {
  /** Wording only — recipient/patient values are not accepted here. */
  subject: string;
  body: string;
  closing: string;
  /** Editing an existing template (else a new one is created). */
  existing?: { id: string; title: string; category: LetterCategory; version: number };
}

export default function SaveTemplateDialog({
  open,
  onOpenChange,
  input,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  input: SaveTemplateInput;
  onSaved?: (id: string) => void;
}) {
  const { toast } = useToast();
  const { data: branding } = useOrgBranding();
  const { data: settings } = useCorrespondenceSettings();
  const { data: myProfile } = useMyProfile();
  const providers = useActiveProviders();
  const create = useCreateLetterTemplate();
  const update = useUpdateLetterTemplate();

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<LetterCategory>('general');
  const [confirmed, setConfirmed] = useState(false);
  const [hits, setHits] = useState<PiiHit[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(input.existing?.title ?? '');
    setCategory(input.existing?.category ?? 'general');
    setConfirmed(false);
    setHits(null);
  }, [open, input.existing?.title, input.existing?.category]);

  // The office's own identity strings are never "patient information".
  const allowList = useMemo(
    () =>
      [
        branding?.displayName,
        branding?.legalName,
        branding?.addressLine1,
        branding?.addressLine2,
        branding?.phone,
        branding?.website,
        settings?.defaultSignerName,
        myProfile?.fullName,
        ...providers.map(p => p.displayName),
      ].filter((s): s is string => !!s && s.trim() !== ''),
    [branding, settings?.defaultSignerName, myProfile?.fullName, providers],
  );

  const runScan = (): PiiHit[] => {
    const storable = [title, input.subject, input.body, input.closing].join('\n');
    return scanForPatientIdentifiers(storable, allowList).hits;
  };

  const saveNow = async () => {
    const found = runScan();
    if (found.length > 0) {
      setHits(found);
      return;
    }
    const content: LetterTemplateContent = {
      title,
      category,
      subject: input.subject,
      body: input.body,
      closing: input.closing,
    };
    try {
      let id: string;
      if (input.existing) {
        await update.mutateAsync({ id: input.existing.id, content, version: input.existing.version });
        id = input.existing.id;
      } else {
        id = await create.mutateAsync(content);
      }
      toast({
        title: input.existing ? 'Letter updated' : 'Letter saved to the library',
        description: 'Reusable wording only — nothing patient-specific was stored.',
      });
      onOpenChange(false);
      onSaved?.(id);
    } catch (e) {
      toast({
        title: "Couldn't save the letter",
        description:
          e instanceof Error && /row-level security/i.test(e.message)
            ? 'Your office allows only managers to save letters to the library.'
            : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const saving = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {hits ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                This looks like patient information
              </DialogTitle>
              <DialogDescription>
                It can't be saved to the office letter library. Possible patient information found:
              </DialogDescription>
            </DialogHeader>
            <ul className="space-y-1.5 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
              {hits.map((hit, i) => (
                <li key={i}>
                  <span className="font-medium">{PII_KIND_LABELS[hit.kind]}:</span>{' '}
                  <span className="font-mono text-xs">“{hit.excerpt}”</span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              Replace patient-specific wording with a placeholder such as{' '}
              <code className="rounded bg-muted px-1 font-mono text-xs">{'{{patient_name}}'}</code>{' '}
              — the placeholder saves; the real value stays temporary when the letter is used.
              Nothing was saved.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setHits(null)}>
                Back
              </Button>
              <Button onClick={() => onOpenChange(false)}>Return to editing</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Save to the office letter library?</DialogTitle>
              <DialogDescription>
                Saved letters are reusable wording available to the whole office.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-title">Letter name</Label>
                <Input
                  id="tpl-title"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Insurance appeal introduction"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-category">Category</Label>
                <Select value={category} onValueChange={v => setCategory(v as LetterCategory)}>
                  <SelectTrigger id="tpl-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LETTER_CATEGORIES.map(c => (
                      <SelectItem key={c} value={c}>
                        {LETTER_CATEGORY_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Alert>
                <ShieldCheck className="h-4 w-4" />
                <AlertTitle>Save the office's words — never a patient's letter</AlertTitle>
                <AlertDescription className="text-xs">
                  Do not save patient names, addresses, dates of birth, chart numbers, treatment
                  details, or any other patient-specific information in this letter. Use
                  placeholders like {'{{patient_name}}'} instead — recipient details entered while
                  writing are never saved.
                </AlertDescription>
              </Alert>

              <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
                <Checkbox
                  checked={confirmed}
                  onCheckedChange={v => setConfirmed(v === true)}
                  className="mt-0.5"
                  aria-label="Confirm no patient information"
                />
                <span>
                  I checked this wording — it's reusable office content and contains no patient
                  information.
                </span>
              </label>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={saveNow} disabled={title.trim() === '' || !confirmed || saving}>
                {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Review & Save
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
