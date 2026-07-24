import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Upload } from 'lucide-react';
import {
  useOrgBranding,
  useUpsertOrgBranding,
  uploadOrgLogo,
  type OrgBranding,
} from '@/hooks/useOrgBranding';
import { useOrgContext } from '@/hooks/useOrgContext';

/**
 * Manager editor for the org's identity: names, address, contact info,
 * logo, brand colors, and the office Google Calendar. Everything printed
 * or shown that names the practice reads from these rows.
 */
export default function OrgBrandingCard({ isManager }: { isManager: boolean }) {
  const { data: branding, isLoading } = useOrgBranding();
  const { data: ctx } = useOrgContext();
  const upsert = useUpsertOrgBranding();
  const [form, setForm] = useState<OrgBranding | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (branding && !form) setForm(branding);
  }, [branding, form]);

  if (isLoading || !form) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const set = (field: keyof OrgBranding) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => (f ? { ...f, [field]: e.target.value } : f));

  const handleLogoFile = async (file: File) => {
    if (!ctx) return;
    setUploading(true);
    try {
      const url = await uploadOrgLogo(ctx.org_id, file);
      setForm(f => (f ? { ...f, logoUrl: url } : f));
      toast.success('Logo uploaded — save to apply');
    } catch (err) {
      toast.error(`Upload failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Practice Identity &amp; Branding</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="brand-legal">Legal / Printed Name</Label>
            <Input id="brand-legal" value={form.legalName} onChange={set('legalName')} disabled={!isManager} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brand-display">Short Display Name</Label>
            <Input id="brand-display" value={form.displayName} onChange={set('displayName')} disabled={!isManager} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brand-addr1">Address Line 1</Label>
            <Input id="brand-addr1" value={form.addressLine1} onChange={set('addressLine1')} disabled={!isManager} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brand-addr2">Address Line 2</Label>
            <Input id="brand-addr2" value={form.addressLine2} onChange={set('addressLine2')} disabled={!isManager} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brand-phone">Phone</Label>
            <Input id="brand-phone" value={form.phone} onChange={set('phone')} disabled={!isManager} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brand-website">Website</Label>
            <Input id="brand-website" value={form.website} onChange={set('website')} disabled={!isManager} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brand-color">Brand Color</Label>
            <div className="flex gap-2">
              <input
                id="brand-color"
                type="color"
                className="h-9 w-12 rounded border cursor-pointer disabled:cursor-default"
                value={form.brandColor}
                onChange={set('brandColor')}
                disabled={!isManager}
              />
              <Input value={form.brandColor} onChange={set('brandColor')} disabled={!isManager} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brand-tint">Brand Tint (light background)</Label>
            <div className="flex gap-2">
              <input
                id="brand-tint"
                type="color"
                className="h-9 w-12 rounded border cursor-pointer disabled:cursor-default"
                value={form.brandTint}
                onChange={set('brandTint')}
                disabled={!isManager}
              />
              <Input value={form.brandTint} onChange={set('brandTint')} disabled={!isManager} />
            </div>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="brand-gcal">Office Google Calendar ID</Label>
            <Input
              id="brand-gcal"
              value={form.googleCalendarId}
              onChange={set('googleCalendarId')}
              disabled={!isManager}
              placeholder="c_…@group.calendar.google.com"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Logo (printed on forms and the deposit log)</Label>
            <div className="flex items-center gap-3">
              {form.logoUrl !== '' && (
                <img src={form.logoUrl} alt={form.displayName || 'Practice logo'} className="h-10 max-w-40 object-contain rounded border bg-white p-1" />
              )}
              {isManager && (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) handleLogoFile(file);
                      e.target.value = '';
                    }}
                  />
                  <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                    {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                    {form.logoUrl !== '' ? 'Replace Logo' : 'Upload Logo'}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
        {isManager && (
          <div className="flex justify-end">
            <Button
              disabled={upsert.isPending}
              onClick={() =>
                upsert.mutate(form, {
                  onSuccess: () => toast.success('Branding saved'),
                  onError: err => toast.error(`Save failed: ${err.message}`),
                })
              }
            >
              {upsert.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Branding
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
