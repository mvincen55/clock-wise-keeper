import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import {
  letterDb,
  staffSignaturePath,
  STAFF_SIGNATURES_BUCKET,
  type StaffSignatureRow,
} from '@/lib/letters/db';
import { blobToDataUrl } from '@/lib/letters/signature-image';
import type { StaffSignatureMeta } from '@/lib/letters/types';

/**
 * STAFF profile signatures — a stored office/business asset, entirely
 * separate from patient consent signatures (which stay memory-only in the
 * Complete Forms workflow; see src/components/consents/SignatureCapture.tsx).
 *
 * Security model, enforced by RLS and storage policies (not just here):
 *   - a signature binds to the authenticated user; only they can create,
 *     replace, remove, or re-authorize it
 *   - the image lives in the private staff-signatures bucket; there are no
 *     public URLs
 *   - teammates can download the image ONLY while the owner's
 *     allow_office_use flag is on (self-service consent, revocable)
 */

function mapRow(row: StaffSignatureRow): StaffSignatureMeta {
  return {
    userId: row.user_id,
    storagePath: row.storage_path,
    allowOfficeUse: row.allow_office_use,
    updatedAt: row.updated_at,
  };
}

/** The signed-in user's own signature metadata (null = none stored). */
export function useMySignature() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['staff-signature', ctx?.org_id, user?.id],
    enabled: !!user && !!ctx,
    queryFn: async (): Promise<StaffSignatureMeta | null> => {
      const { data, error } = await letterDb
        .from('staff_signatures')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data ? mapRow(data) : null;
    },
  });
}

/** Signature metadata for the whole org (who has one, who allows use). */
export function useOrgSignatures() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['staff-signatures-org', ctx?.org_id],
    enabled: !!user && !!ctx,
    queryFn: async (): Promise<StaffSignatureMeta[]> => {
      const { data, error } = await letterDb
        .from('staff_signatures')
        .select('*')
        .eq('org_id', ctx!.org_id);
      if (error) throw error;
      return (data ?? []).map(mapRow);
    },
  });
}

/**
 * The signature IMAGE for a user, as a data URL (print portals must not
 * depend on expiring network URLs). Storage RLS decides whether the caller
 * may see it: always for the owner, teammates only behind allow_office_use.
 * Returns null when there is no signature or access is not authorized.
 */
export function useSignatureImage(userId: string | null | undefined) {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['staff-signature-image', ctx?.org_id, userId],
    enabled: !!user && !!ctx && !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<string | null> => {
      const path = staffSignaturePath(ctx!.org_id, userId!);
      const { data, error } = await supabase.storage
        .from(STAFF_SIGNATURES_BUCKET)
        .download(path);
      if (error || !data) return null;
      return await blobToDataUrl(data);
    },
  });
}

function useInvalidateSignatures() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['staff-signature'] });
    qc.invalidateQueries({ queryKey: ['staff-signatures-org'] });
    qc.invalidateQueries({ queryKey: ['staff-signature-image'] });
  };
}

/** Store or replace MY signature (a pre-normalized transparent PNG blob). */
export function useSaveMySignature() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const invalidate = useInvalidateSignatures();

  return useMutation({
    mutationFn: async (png: Blob) => {
      if (!ctx || !user) throw new Error('Not signed in');
      const path = staffSignaturePath(ctx.org_id, user.id);
      const { error: uploadError } = await supabase.storage
        .from(STAFF_SIGNATURES_BUCKET)
        .upload(path, png, { contentType: 'image/png', upsert: true });
      if (uploadError) throw uploadError;

      const { error } = await letterDb.from('staff_signatures').upsert(
        {
          org_id: ctx.org_id,
          user_id: user.id,
          storage_path: path,
        },
        { onConflict: 'org_id,user_id' },
      );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** Remove MY signature (image + metadata). */
export function useRemoveMySignature() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const invalidate = useInvalidateSignatures();

  return useMutation({
    mutationFn: async () => {
      if (!ctx || !user) throw new Error('Not signed in');
      const path = staffSignaturePath(ctx.org_id, user.id);
      const { error: removeError } = await supabase.storage
        .from(STAFF_SIGNATURES_BUCKET)
        .remove([path]);
      if (removeError) throw removeError;
      const { error } = await letterDb
        .from('staff_signatures')
        .delete()
        .eq('org_id', ctx.org_id)
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** Flip MY "teammates may print my signature on office letters" consent. */
export function useSetAllowOfficeUse() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const invalidate = useInvalidateSignatures();

  return useMutation({
    mutationFn: async (allow: boolean) => {
      if (!ctx || !user) throw new Error('Not signed in');
      const { error } = await letterDb
        .from('staff_signatures')
        .update({ allow_office_use: allow })
        .eq('org_id', ctx.org_id)
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
