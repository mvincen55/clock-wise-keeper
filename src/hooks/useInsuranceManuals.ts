/**
 * Insurance Desk data layer.
 *
 * Documents come from the shared office_docs infrastructure (same rows,
 * same RLS); these hooks add the manual-specific pieces: structured chunk
 * fetching, scoped search with carrier-synonym variants, the original-PDF
 * download for the source viewer, and the manager mutations (structured
 * upload, re-parse, rollback, metadata).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOfficeDocs, type OfficeDoc } from '@/hooks/useOfficeDocs';
import { readerDocsFor, type LibraryScope } from '@/lib/doc-library';
import {
  buildReaderManual,
  insuranceQueryVariants,
  orderManuals,
  type ManualChunkRow,
  type ReaderManual,
} from '@/lib/insurance-desk';
import type { ParsedManual, SectionOverrides } from '@/lib/manual-parse';

const INSURANCE_SCOPE: LibraryScope = { areas: ['playbook'], collections: ['insurance'] };

/** All insurance manuals in scope, current first. */
export function useInsuranceManuals() {
  const query = useOfficeDocs();
  const manuals = orderManuals(readerDocsFor(query.data ?? [], INSURANCE_SCOPE));
  return { ...query, manuals };
}

const CHUNK_COLUMNS =
  'id, doc_id, chunk_index, chunk_type, content, section_id, section_title, parent_section_title, heading_level, page_number, page_end, meta, parse_version';

/** The reader model for one manual (structured or legacy-adapted). */
export function useReaderManual(doc: OfficeDoc | null) {
  return useQuery({
    queryKey: [
      'manual-reader',
      doc?.id,
      doc?.current_parse_version,
      doc?.updated_at,
      doc?.section_overrides,
    ],
    enabled: !!doc,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<ReaderManual> => {
      const { data, error } = await supabase
        .from('office_doc_chunks')
        .select(CHUNK_COLUMNS)
        .eq('doc_id', doc!.id)
        .eq('parse_version', doc!.current_parse_version ?? 1)
        .order('chunk_index');
      if (error) throw error;
      return buildReaderManual(doc!, (data ?? []) as ManualChunkRow[]);
    },
  });
}

export interface ManualSearchHit {
  doc_id: string;
  title: string;
  chunk_index: number;
  content: string;
  rank: number;
  page_number: number | null;
  section_id: string | null;
  section_title: string | null;
  chunk_type: string;
}

/**
 * Scoped full-text search. Runs the typed query plus synonym variants in
 * parallel and merges by best rank, so "timely filing" also surfaces
 * "claim submission period" passages. `docIds` narrows to one manual;
 * null searches the whole insurance library.
 */
export function useManualSearch(query: string, docIds: string[] | null, enabled: boolean) {
  return useQuery({
    queryKey: ['manual-search', query, docIds?.join(',') ?? 'all'],
    enabled: enabled && query.trim().length >= 3,
    queryFn: async (): Promise<ManualSearchHit[]> => {
      const variants = insuranceQueryVariants(query);
      const results = await Promise.all(
        variants.map(variant =>
          supabase.rpc('search_office_doc_chunks', {
            p_query: variant,
            p_limit: 16,
            p_library_areas: INSURANCE_SCOPE.areas,
            p_collections: INSURANCE_SCOPE.collections ?? undefined,
            ...(docIds && docIds.length > 0 ? { p_doc_ids: docIds } : {}),
          })
        )
      );
      const byKey = new Map<string, ManualSearchHit>();
      for (const result of results) {
        if (result.error) throw result.error;
        for (const hit of (result.data ?? []) as ManualSearchHit[]) {
          const key = `${hit.doc_id}:${hit.chunk_index}`;
          const existing = byKey.get(key);
          if (!existing || hit.rank > existing.rank) byKey.set(key, hit);
        }
      }
      return [...byKey.values()].sort((a, b) => b.rank - a.rank).slice(0, 20);
    },
  });
}

/**
 * The original PDF for the source-page viewer, fetched once per document.
 * The object URL is cached for the tab's lifetime (a handful of manuals
 * at most) — revoking on unmount would break the cached entry for the
 * next consumer.
 */
export function useManualPdf(doc: OfficeDoc | null, enabled: boolean) {
  return useQuery({
    queryKey: ['manual-pdf', doc?.id, doc?.file_path],
    enabled: enabled && !!doc?.file_path && doc?.mime_type === 'application/pdf',
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async (): Promise<{ blob: Blob; url: string }> => {
      const { data, error } = await supabase.storage
        .from('office-docs')
        .download(doc!.file_path!);
      if (error) throw error;
      const blob = new Blob([data], { type: 'application/pdf' });
      return { blob, url: URL.createObjectURL(blob) };
    },
  });
}

// ---------------------------------------------------------------------------
// Manager mutations
// ---------------------------------------------------------------------------

/** Wire shape for the edge function's structured payload. */
const structuredPayload = (parsed: ParsedManual) => ({
  chunks: parsed.chunks,
  meta: parsed.meta,
});

export interface UploadManualInput {
  /** The caller's org id — the storage folder RLS keys on. */
  orgId: string;
  title: string;
  carrier: string | null;
  manualType: string | null;
  effectiveDate: string | null;
  /** Manual being replaced — archived only after the new one stores. */
  replacesDocId: string | null;
  file: File;
  parsed: ParsedManual;
}

export interface IngestManualResult {
  id: string;
  chunks: number;
  sections?: number;
  confidence?: string;
  nav_mode?: string;
  parse_version?: number;
}

async function invokeIngest(payload: Record<string, unknown>): Promise<IngestManualResult> {
  const { data, error } = await supabase.functions.invoke('ingest-doc', { body: payload });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data as IngestManualResult;
}

export function useUploadManual() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UploadManualInput) => {
      // The original PDF goes straight to storage (manager RLS on the org
      // folder), so the function call carries only the structured parse —
      // never megabytes of base64.
      const safeName = input.file.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120);
      const filePath = `${input.orgId}/${crypto.randomUUID()}_${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from('office-docs')
        .upload(filePath, input.file, { contentType: input.file.type || 'application/pdf' });
      if (uploadError) throw new Error('Could not store the PDF — try again.');
      try {
        return await invokeIngest({
          title: input.title,
          library_area: 'playbook',
          collection: 'insurance',
          category: 'insurance',
          carrier: input.carrier,
          manual_type: input.manualType,
          effective_date: input.effectiveDate,
          replaces_doc_id: input.replacesDocId,
          filename: input.file.name,
          contentType: input.file.type || 'application/pdf',
          file_path: filePath,
          structured: structuredPayload(input.parsed),
        });
      } catch (e) {
        // The document row never landed — don't leave an orphan file.
        await supabase.storage.from('office-docs').remove([filePath]);
        throw e;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['office-docs'] }),
  });
}

export function useReparseManual() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { docId: string; parsed: ParsedManual }) =>
      invokeIngest({
        mode: 'reparse',
        doc_id: input.docId,
        structured: structuredPayload(input.parsed),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['office-docs'] });
      qc.invalidateQueries({ queryKey: ['manual-reader'] });
    },
  });
}

export function useRollbackManual() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (docId: string) => invokeIngest({ mode: 'rollback', doc_id: docId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['office-docs'] });
      qc.invalidateQueries({ queryKey: ['manual-reader'] });
    },
  });
}

export interface ManualMetaInput {
  id: string;
  title?: string;
  carrier?: string | null;
  manualType?: string | null;
  effectiveDate?: string | null;
  docStatus?: 'current' | 'archived';
  sectionOverrides?: SectionOverrides;
}

/** Metadata edits go straight to the table — RLS already limits to admins. */
export function useUpdateManualMeta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ManualMetaInput) => {
      const update: Record<string, unknown> = {};
      if (input.title?.trim()) update.title = input.title.trim();
      if (input.carrier !== undefined) update.carrier = input.carrier;
      if (input.manualType !== undefined) update.manual_type = input.manualType;
      if (input.effectiveDate !== undefined) update.effective_date = input.effectiveDate;
      if (input.docStatus !== undefined) update.doc_status = input.docStatus;
      if (input.sectionOverrides !== undefined) update.section_overrides = input.sectionOverrides;
      const { error } = await supabase.from('office_docs').update(update).eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['office-docs'] });
      qc.invalidateQueries({ queryKey: ['manual-reader'] });
    },
  });
}
