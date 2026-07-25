import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { Tables } from '@/integrations/supabase/types';

/**
 * Org branding — the practice's identity as rows (genericization Phase 1).
 * Every screen, print surface, and (future) email that names the practice
 * reads from here; nothing office-specific stays in code. De-identified
 * configuration only — no patient data.
 */

export interface OrgBranding {
  /** Short name for headings and logo alt text. */
  displayName: string;
  /** Long form printed on forms and document footers. */
  legalName: string;
  addressLine1: string;
  addressLine2: string;
  phone: string;
  website: string;
  emailSenderName: string;
  brandColor: string;
  brandTint: string;
  /** Storage public URL or data: URI; empty = no logo printed. */
  logoUrl: string;
  /** Office Google Calendar consumed by google-calendar-events. */
  googleCalendarId: string;
}

/** Blank identity + the shipped document palette. */
export const GENERIC_BRANDING: OrgBranding = {
  displayName: '',
  legalName: '',
  addressLine1: '',
  addressLine2: '',
  phone: '',
  website: '',
  emailSenderName: '',
  brandColor: '#53406e',
  brandTint: '#f3f0f8',
  logoUrl: '',
  googleCalendarId: '',
};

export interface OrgDepositSettings {
  /** "Deposit To" line pre-printed on the bank copy; empty = omitted. */
  accountLine: string;
  bankSplitCashLabel: string;
  bankSplitCardsLabel: string;
  bankTotalLabel: string;
  /** Callout printed on both copies; empty = omitted. */
  envelopeNote: string;
  officeCopyNote: string;
}

export const GENERIC_DEPOSIT_SETTINGS: OrgDepositSettings = {
  accountLine: '',
  bankSplitCashLabel: 'Bank — cash & checks',
  bankSplitCardsLabel: 'Bank — card deposits',
  bankTotalLabel: 'Bank Total',
  envelopeNote: '',
  officeCopyNote: 'Office Copy — file with the day sheet',
};

type BrandingRow = Tables<'org_branding'>;
type DepositSettingsRow = Tables<'org_deposit_settings'>;

function mapBrandingRow(row: BrandingRow): OrgBranding {
  return {
    displayName: row.display_name,
    legalName: row.legal_name,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    phone: row.phone,
    website: row.website,
    emailSenderName: row.email_sender_name,
    brandColor: row.brand_color,
    brandTint: row.brand_tint,
    logoUrl: row.logo_url,
    googleCalendarId: row.google_calendar_id,
  };
}

function mapDepositSettingsRow(row: DepositSettingsRow): OrgDepositSettings {
  return {
    accountLine: row.account_line,
    bankSplitCashLabel: row.bank_split_cash_label,
    bankSplitCardsLabel: row.bank_split_cards_label,
    bankTotalLabel: row.bank_total_label,
    envelopeNote: row.envelope_note,
    officeCopyNote: row.office_copy_note,
  };
}

export function useOrgBranding() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['org-branding', ctx?.org_id],
    enabled: !!user && !!ctx,
    queryFn: async (): Promise<OrgBranding> => {
      if (!ctx) return GENERIC_BRANDING;
      // The migration backfills a row per org; the fallback only covers
      // an org created before its admin ever saves branding.
      const { data, error } = await supabase
        .from('org_branding')
        .select('*')
        .eq('org_id', ctx.org_id)
        .maybeSingle();
      if (error) throw error;
      return data ? mapBrandingRow(data) : GENERIC_BRANDING;
    },
  });
}

export function useUpsertOrgBranding() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<OrgBranding>) => {
      if (!ctx) throw new Error('Not authenticated');
      const { error } = await supabase.from('org_branding').upsert(
        {
          org_id: ctx.org_id,
          ...(updates.displayName !== undefined && { display_name: updates.displayName }),
          ...(updates.legalName !== undefined && { legal_name: updates.legalName }),
          ...(updates.addressLine1 !== undefined && { address_line1: updates.addressLine1 }),
          ...(updates.addressLine2 !== undefined && { address_line2: updates.addressLine2 }),
          ...(updates.phone !== undefined && { phone: updates.phone }),
          ...(updates.website !== undefined && { website: updates.website }),
          ...(updates.emailSenderName !== undefined && { email_sender_name: updates.emailSenderName }),
          ...(updates.brandColor !== undefined && { brand_color: updates.brandColor }),
          ...(updates.brandTint !== undefined && { brand_tint: updates.brandTint }),
          ...(updates.logoUrl !== undefined && { logo_url: updates.logoUrl }),
          ...(updates.googleCalendarId !== undefined && { google_calendar_id: updates.googleCalendarId }),
        },
        { onConflict: 'org_id' }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-branding'] });
      qc.invalidateQueries({ queryKey: ['fof-settings'] });
    },
  });
}

export function useOrgDepositSettings() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['org-deposit-settings', ctx?.org_id],
    enabled: !!user && !!ctx,
    queryFn: async (): Promise<OrgDepositSettings> => {
      if (!ctx) return GENERIC_DEPOSIT_SETTINGS;
      const { data, error } = await supabase
        .from('org_deposit_settings')
        .select('*')
        .eq('org_id', ctx.org_id)
        .maybeSingle();
      if (error) throw error;
      return data ? mapDepositSettingsRow(data) : GENERIC_DEPOSIT_SETTINGS;
    },
  });
}

export function useUpsertOrgDepositSettings() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<OrgDepositSettings>) => {
      if (!ctx) throw new Error('Not authenticated');
      const { error } = await supabase.from('org_deposit_settings').upsert(
        {
          org_id: ctx.org_id,
          ...(updates.accountLine !== undefined && { account_line: updates.accountLine }),
          ...(updates.bankSplitCashLabel !== undefined && { bank_split_cash_label: updates.bankSplitCashLabel }),
          ...(updates.bankSplitCardsLabel !== undefined && { bank_split_cards_label: updates.bankSplitCardsLabel }),
          ...(updates.bankTotalLabel !== undefined && { bank_total_label: updates.bankTotalLabel }),
          ...(updates.envelopeNote !== undefined && { envelope_note: updates.envelopeNote }),
          ...(updates.officeCopyNote !== undefined && { office_copy_note: updates.officeCopyNote }),
        },
        { onConflict: 'org_id' }
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-deposit-settings'] }),
  });
}

/** Upload/replace the org logo; returns the public URL to store. */
export async function uploadOrgLogo(orgId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const path = `${orgId}/logo-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('org-branding').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('org-branding').getPublicUrl(path);
  return data.publicUrl;
}
