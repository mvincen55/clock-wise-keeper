import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Info, Loader2, Save, Settings2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import BrandPrintStyle from '@/components/BrandPrintStyle';
import ScaledPrintPreview from '@/components/ScaledPrintPreview';
import OfficeLetterheadSheet from '@/components/letterhead/OfficeLetterheadSheet';
import LetterBodyContent from '@/components/letterhead/LetterBodyContent';
import { GENERIC_BRANDING, useOrgBranding } from '@/hooks/useOrgBranding';
import { useOrgContext } from '@/hooks/useOrgContext';
import {
  useCorrespondenceSettings,
  useUpdateCorrespondenceSettings,
} from '@/hooks/useCorrespondenceSettings';
import { formatLetterDate, todayISO } from '@/lib/letters/letter-body';
import {
  DEFAULT_SCHOOL_NOTE_WORDING,
  DEFAULT_WORK_NOTE_WORDING,
} from '@/lib/letters/note-wording';
import { DEFAULT_CORRESPONDENCE_SETTINGS, type CorrespondenceSettings } from '@/lib/letters/types';

/**
 * Letterhead & Correspondence settings — office-level rules for every
 * letter surface. Practice identity (logo, name, address, phone, website)
 * deliberately does NOT live here: it comes from the canonical Practice
 * Branding card on Settings, and this page only previews it on the shared
 * letterhead. Managers only (the DB enforces admin writes via RLS).
 */

const SAMPLE_BODY = [
  'This is a preview of your office letterhead. Every letter this office prints — a patient letter, a school or work note, an insurance cover letter — uses this same layout.',
  'The logo above and the identity line below come from Practice Branding in Office Settings; nothing letter-specific to configure twice.',
].join('\n\n');

export default function CorrespondenceSettingsPage() {
  const { data: ctx } = useOrgContext();
  const { data: branding } = useOrgBranding();
  const { data: saved, isLoading } = useCorrespondenceSettings();
  const update = useUpdateCorrespondenceSettings();
  const { toast } = useToast();

  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';
  const brand = branding ?? GENERIC_BRANDING;
  const practiceName = brand.legalName.trim() || brand.displayName.trim();

  const [form, setForm] = useState<CorrespondenceSettings>(DEFAULT_CORRESPONDENCE_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (saved && !loaded) {
      setForm(saved);
      setLoaded(true);
    }
  }, [saved, loaded]);

  const set = (patch: Partial<CorrespondenceSettings>) => setForm(f => ({ ...f, ...patch }));

  const saveAll = () =>
    update.mutate(form, {
      onSuccess: () => toast({ title: 'Correspondence settings saved' }),
      onError: () => toast({ title: "Couldn't save settings", variant: 'destructive' }),
    });

  if (!ctx || isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isManager) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Letterhead &amp; Correspondence settings are managed by owners and managers.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings2 className="h-6 w-6 text-primary" />
          Letterhead &amp; Correspondence
        </h1>
        <Button onClick={saveAll} disabled={update.isPending}>
          {update.isPending ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-1.5" />
          )}
          Save settings
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Letter defaults</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="cs-closing">Default closing</Label>
                <Input
                  id="cs-closing"
                  value={form.defaultClosing}
                  onChange={e => set({ defaultClosing: e.target.value })}
                  placeholder="Warm regards,"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="cs-signer">Office signer (optional)</Label>
                  <Input
                    id="cs-signer"
                    value={form.defaultSignerName}
                    onChange={e => set({ defaultSignerName: e.target.value })}
                    placeholder={practiceName || 'e.g. the office manager'}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cs-signer-title">Office signer title</Label>
                  <Input
                    id="cs-signer-title"
                    value={form.defaultSignerTitle}
                    onChange={e => set({ defaultSignerTitle: e.target.value })}
                    placeholder="e.g. Office Manager"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                The office signer appears as a typed-name option on letters and notes. Personal
                signatures stay personal: each teammate stores their own under My Signature and
                decides whether office letters may carry it.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">School / Work note wording</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Placeholders: {'{{patient_name}}'}, {'{{date_seen}}'}, {'{{excused_from}}'},{' '}
                {'{{excused_through}}'}, {'{{return_date}}'}. A sentence whose optional date is
                left blank is dropped automatically. Leave a box empty to use the built-in wording.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="cs-school">School note</Label>
                <Textarea
                  id="cs-school"
                  rows={3}
                  value={form.schoolNoteWording}
                  onChange={e => set({ schoolNoteWording: e.target.value })}
                  placeholder={DEFAULT_SCHOOL_NOTE_WORDING}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cs-work">Work note</Label>
                <Textarea
                  id="cs-work"
                  rows={3}
                  value={form.workNoteWording}
                  onChange={e => set({ workNoteWording: e.target.value })}
                  placeholder={DEFAULT_WORK_NOTE_WORDING}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Letter Library permissions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-3 rounded-lg border p-3">
                <Switch
                  id="cs-team"
                  checked={form.teamCanManageTemplates}
                  onCheckedChange={v => set({ teamCanManageTemplates: v === true })}
                />
                <Label htmlFor="cs-team" className="font-normal cursor-pointer">
                  <span className="font-medium">Team members may create and edit saved letters</span>
                  <br />
                  <span className="text-sm text-muted-foreground">
                    Off = only owners and managers manage the library. Everyone can always use
                    approved letters, write one-off letters, print, and create school/work notes.
                  </span>
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Enforced by the database, not just this switch — a team member's save is rejected
                server-side while this is off.
              </p>
            </CardContent>
          </Card>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Practice identity comes from Practice Branding</AlertTitle>
            <AlertDescription className="text-sm">
              The logo, legal name, address, phone, and website printed on the letterhead are the
              canonical branding rows — update them once in{' '}
              <Link to="/settings" className="underline">
                Office Settings
              </Link>{' '}
              and every letter follows.
            </AlertDescription>
          </Alert>
        </div>

        <Card className="self-start">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Letterhead preview</CardTitle>
          </CardHeader>
          <CardContent>
            <ScaledPrintPreview>
              <OfficeLetterheadSheet
                branding={brand}
                dateText={formatLetterDate(todayISO())}
                salutation="To Whom It May Concern:"
                body={<LetterBodyContent markup={SAMPLE_BODY} />}
                signer={{
                  closing: form.defaultClosing || 'Warm regards,',
                  name: form.defaultSignerName.trim() || practiceName,
                  title: form.defaultSignerTitle,
                }}
              />
            </ScaledPrintPreview>
          </CardContent>
        </Card>
      </div>

      <BrandPrintStyle branding={brand} />
    </div>
  );
}
