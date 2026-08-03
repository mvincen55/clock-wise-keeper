import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ShieldCheck, History, Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useOrgContext } from '@/hooks/useOrgContext';
import OrgBrandingCard from '@/components/OrgBrandingCard';
import { useConsentSettings, useUpdateConsentSettings } from '@/hooks/useConsentSettings';
import { useConsentAudit, AUDIT_ACTION_LABELS } from '@/hooks/useConsentAudit';
import { useConsentForms } from '@/hooks/useConsentForms';
import { DEFAULT_CONSENT_SETTINGS, type ConsentSettings as Settings } from '@/lib/consents/types';

/**
 * Office Settings for Forms & Consents: branding (shared with the rest of
 * the product), team permissions, form rules, the privacy timeout, and the
 * template-activity audit trail. Nothing here is hard-coded per office —
 * every behavior the workflow applies comes from these rows.
 */

const PERMISSIONS: { key: keyof Settings; label: string; description: string }[] = [
  { key: 'teamCanUpload', label: 'Upload forms', description: 'Upload documents and run conversion.' },
  { key: 'teamCanEditTemplates', label: 'Edit templates', description: 'Change any master template (per-form “whole team” override still applies).' },
  { key: 'teamCanPublish', label: 'Publish forms', description: 'Make a draft the current version.' },
  { key: 'teamCanArchive', label: 'Archive forms', description: 'Archive and restore library forms.' },
  { key: 'teamCanCreateBundles', label: 'Create bundles', description: 'Create and edit treatment bundles.' },
  { key: 'teamCanOverrideFees', label: 'Override fees', description: 'Change a pulled office fee in a packet (always labeled and audited).' },
  { key: 'teamCanPrint', label: 'Print forms', description: 'Print packets and blank copies.' },
  { key: 'teamCanChangeSignatures', label: 'Change signature requirements', description: 'Adjust signature rules on forms.' },
];

const ALWAYS_OFF = [
  'Completed-form storage',
  'Patient search',
  'Saved patient profiles',
  'Form history containing patient information',
];

export default function ConsentSettings() {
  const { toast } = useToast();
  const { data: ctx } = useOrgContext();
  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';
  const { data: settings = DEFAULT_CONSENT_SETTINGS } = useConsentSettings();
  const update = useUpdateConsentSettings();
  const { data: forms = [] } = useConsentForms();
  const { data: audit = [] } = useConsentAudit(100);

  const financialForms = forms.filter(f => f.isFinancial && f.status !== 'archived');

  const save = (patch: Partial<Settings>) =>
    update.mutate(patch, {
      onError: err => toast({ title: 'Could not save', description: String(err), variant: 'destructive' }),
    });

  if (!isManager) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Office Settings are for managers and doctors.{' '}
        <Link to="/consents" className="text-primary underline">Back to Forms &amp; Consents</Link>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Office Settings — Forms &amp; Consents</h1>
        <p className="text-muted-foreground">
          Permissions, signature rules, privacy, and the audit trail.{' '}
          <Link to="/consents" className="text-primary underline-offset-2 hover:underline">Forms &amp; Consents home</Link>
        </p>
      </div>

      {/* Branding: the same identity used across the product and every print sheet. */}
      <OrgBrandingCard isManager={isManager} />

      <Card className="card-elevated">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Team permissions</CardTitle>
          <p className="text-sm text-muted-foreground">
            Owners, managers, and doctors can always do everything. These switches grant the same
            ability to the rest of the team.
          </p>
        </CardHeader>
        <CardContent className="space-y-1">
          {PERMISSIONS.map(perm => (
            <label key={perm.key} className="flex items-center justify-between gap-3 rounded-lg p-2.5 hover:bg-muted/60">
              <span className="text-sm">
                <span className="font-medium">{perm.label}</span>
                <span className="block text-xs text-muted-foreground">{perm.description}</span>
              </span>
              <Switch
                checked={settings[perm.key] as boolean}
                onCheckedChange={v => save({ [perm.key]: v } as Partial<Settings>)}
              />
            </label>
          ))}
        </CardContent>
      </Card>

      <Card className="card-elevated">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Form rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center justify-between gap-3 rounded-lg p-2.5 hover:bg-muted/60">
            <span className="text-sm">
              <span className="font-medium">Require a witness signature by default</span>
              <span className="block text-xs text-muted-foreground">Adds a witness line to every packet's signature summary.</span>
            </span>
            <Switch checked={settings.requireWitnessDefault} onCheckedChange={v => save({ requireWitnessDefault: v })} />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-lg p-2.5 hover:bg-muted/60">
            <span className="text-sm">
              <span className="font-medium">Require a parent or guardian signature for minors</span>
              <span className="block text-xs text-muted-foreground">Applied when “patient is a minor” is checked in the workflow.</span>
            </span>
            <Switch checked={settings.requireGuardianForMinors} onCheckedChange={v => save({ requireGuardianForMinors: v })} />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-lg p-2.5 hover:bg-muted/60">
            <span className="text-sm">
              <span className="font-medium">Always offer the financial agreement</span>
              <span className="block text-xs text-muted-foreground">Step 4 of the workflow asks on every packet.</span>
            </span>
            <Switch checked={settings.alwaysOfferFinancial} onCheckedChange={v => save({ alwaysOfferFinancial: v })} />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg p-2.5">
            <span className="text-sm">
              <span className="font-medium">Financial agreement template</span>
              <span className="block text-xs text-muted-foreground">The form Step 4 fills with this packet's fees.</span>
            </span>
            <Select
              value={settings.financialFormId ?? 'auto'}
              onValueChange={v => save({ financialFormId: v === 'auto' ? null : v })}
            >
              <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Automatic (first financial form)</SelectItem>
                {financialForms.map(f => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
            Per-form rules — like “a hygienist may complete this form without a doctor signature”
            for SRP or sonic instrumentation consents — live on each form in the builder, so no
            rule is hard-coded for every office.
          </p>
        </CardContent>
      </Card>

      <Card className="card-elevated">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" />Privacy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg p-2.5">
            <span className="text-sm">
              <span className="font-medium">Clear temporary patient information after</span>
              <span className="block text-xs text-muted-foreground">Inactivity in the Complete Forms workflow.</span>
            </span>
            <Select
              value={String(settings.clearTimeoutMinutes)}
              onValueChange={v => save({ clearTimeoutMinutes: Number(v) })}
            >
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[5, 10, 15, 30, 45, 60, 90, 120].map(min => (
                  <SelectItem key={min} value={String(min)}>{min} minutes</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-lg p-2.5 hover:bg-muted/60">
            <span className="text-sm">
              <span className="font-medium">Warn before clearing</span>
              <span className="block text-xs text-muted-foreground">Shows a keep-working prompt shortly before the timeout.</span>
            </span>
            <Switch checked={settings.warnBeforeClear} onCheckedChange={v => save({ warnBeforeClear: v })} />
          </label>
          <div className="space-y-1 rounded-lg bg-muted/60 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Off by design — cannot be enabled
            </p>
            {ALWAYS_OFF.map(item => (
              <p key={item} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" />{item}
              </p>
            ))}
            <p className="pt-1 text-[11px] text-muted-foreground">
              Purple Envelope stores your business, never your patients. This application is not
              HIPAA-compliant storage, so completed patient forms are printed and cleared — never saved.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="card-elevated">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-primary" />Audit history
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Template and bundle activity, publishing, and fee overrides — who and when.
            No patient information is ever recorded here.
          </p>
        </CardHeader>
        <CardContent className="space-y-1">
          {audit.length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
          {audit.map(entry => (
            <div key={entry.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-lg px-2 py-1.5 hover:bg-muted/60">
              <p className="min-w-0 text-sm">
                <Badge variant="secondary" className="mr-2 font-normal">
                  {AUDIT_ACTION_LABELS[entry.action] ?? entry.action}
                </Badge>
                {entry.entityName}
                {entry.action === 'fee_overridden' && typeof entry.detail.printedFeeCents === 'number' && (
                  <span className="text-muted-foreground">
                    {' '}— printed at ${(entry.detail.printedFeeCents / 100).toFixed(2)}
                    {typeof entry.detail.officeFeeCents === 'number' && ` (office fee $${(entry.detail.officeFeeCents / 100).toFixed(2)})`}
                  </span>
                )}
                {typeof entry.detail.version === 'number' && (
                  <span className="text-muted-foreground"> — v{entry.detail.version}</span>
                )}
              </p>
              <p className="shrink-0 text-xs text-muted-foreground">
                {entry.actorName && <>{entry.actorName} · </>}
                {format(new Date(entry.createdAt), 'MMM d, yyyy · h:mm a')}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
