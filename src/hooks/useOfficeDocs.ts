import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { TablesUpdate } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import {
  legacyCategoryFor,
  type AiScope,
  type DocCollection,
  type LibraryArea,
  type OfficeDoc,
  type OfficeDocCategory,
} from '@/lib/doc-library';

// Office knowledge base: internal business documents (policies, HR info,
// insurance handbooks) powering the AI assistant. Not patient data.
// Placement types and labels live in @/lib/doc-library.

export type { OfficeDoc, OfficeDocCategory, LibraryArea, DocCollection };

export interface AskSource {
  id: string;
  title: string;
  category: string;
  /** Citation into the document, when the source is a structured manual. */
  section_title?: string | null;
  page_number?: number | null;
}

/** Something the assistant actually did this turn (memory save, commit, PR). */
export interface AskAction {
  type: string;
  summary: string;
  url?: string;
}

export interface AskResult {
  answer: string;
  sources: AskSource[];
  actions: AskAction[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: AskSource[];
  actions?: AskAction[];
}

export function useOfficeDocs() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['office-docs', ctx?.org_id],
    enabled: !!user && !!ctx,
    queryFn: async (): Promise<OfficeDoc[]> => {
      const { data, error } = await supabase
        .from('office_docs')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface UploadDocInput {
  title: string;
  libraryArea: LibraryArea;
  collection: DocCollection;
  file?: File;
  text?: string;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function useUploadOfficeDoc() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: UploadDocInput) => {
      const payload: Record<string, unknown> = {
        title: input.title,
        library_area: input.libraryArea,
        collection: input.collection,
        // Legacy flat category, kept in sync for backwards compatibility.
        category: legacyCategoryFor(input.collection),
      };
      if (input.file) {
        payload.filename = input.file.name;
        payload.contentType = input.file.type || 'application/octet-stream';
        payload.base64 = await fileToBase64(input.file);
      } else if (input.text?.trim()) {
        payload.text = input.text;
      } else {
        throw new Error('Choose a file or paste text');
      }
      const { data, error } = await supabase.functions.invoke('ingest-doc', { body: payload });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data as { id: string; chunks: number; chars: number };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['office-docs'] }),
  });
}

export interface UpdateDocPlacementInput {
  id: string;
  title?: string;
  libraryArea: LibraryArea;
  collection: DocCollection;
}

/**
 * Managers move a document (or fix its title) without re-uploading it.
 * The legacy category follows the collection so older surfaces stay honest.
 */
export function useUpdateOfficeDoc() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateDocPlacementInput) => {
      const update: TablesUpdate<'office_docs'> = {
        library_area: input.libraryArea,
        collection: input.collection,
        category: legacyCategoryFor(input.collection),
      };
      if (input.title?.trim()) update.title = input.title.trim();
      const { error } = await supabase.from('office_docs').update(update).eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['office-docs'] }),
  });
}

/** Library editing settings: owner-controlled "managers can edit" flag. */
export function useDocLibrarySettings() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['doc-library-settings', ctx?.org_id],
    enabled: !!user && !!ctx,
    queryFn: async (): Promise<{ managers_can_edit: boolean }> => {
      const { data, error } = await supabase
        .from('doc_library_settings')
        .select('managers_can_edit')
        .maybeSingle();
      if (error) throw error;
      return data ?? { managers_can_edit: false };
    },
  });
}

/** Owner-only (enforced by RLS): allow or revoke manager editing. */
export function useUpdateDocLibrarySettings() {
  const qc = useQueryClient();
  const { data: ctx } = useOrgContext();

  return useMutation({
    mutationFn: async (managersCanEdit: boolean) => {
      if (!ctx?.org_id) throw new Error('No organization');
      const { error } = await supabase
        .from('doc_library_settings')
        .upsert({ org_id: ctx.org_id, managers_can_edit: managersCanEdit });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['doc-library-settings'] }),
  });
}

/**
 * Replace a document's text in place (owner always; managers when allowed —
 * both checked again server-side). Re-chunks and re-indexes, so the reader,
 * search, and Ask AI all pick the change up together.
 */
export function useEditOfficeDocContent() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { docId: string; text: string }) => {
      const { data, error } = await supabase.functions.invoke('edit-doc', {
        body: { doc_id: input.docId, text: input.text },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data as { id: string; chunks: number; chars: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['office-docs'] });
      qc.invalidateQueries({ queryKey: ['library-doc-contents'] });
      qc.invalidateQueries({ queryKey: ['library-search'] });
    },
  });
}

export function useDeleteOfficeDoc() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (doc: OfficeDoc) => {
      if (doc.file_path) {
        await supabase.storage.from('office-docs').remove([doc.file_path]);
      }
      const { error } = await supabase.from('office_docs').delete().eq('id', doc.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['office-docs'] }),
  });
}

/**
 * Ask AI chat — Kimi (via OpenRouter) through the kimi-agent edge
 * function. Beyond answering from the knowledge base, managers can have
 * it remember office/site facts and make code changes to the app itself.
 */
export function useAskDocs() {
  return useMutation({
    mutationFn: async (input: {
      question: string;
      history: ChatMessage[];
      /** Contextual scope: limit document search to one library surface. */
      scope?: AiScope | null;
    }): Promise<AskResult> => {
      const { data, error } = await supabase.functions.invoke('kimi-agent', {
        body: {
          mode: 'ask',
          ...(input.scope ? { scope: input.scope } : {}),
          messages: [
            ...input.history.slice(-12).map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: input.question },
          ],
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return {
        answer: data?.reply ?? '',
        sources: Array.isArray(data?.sources) ? data.sources : [],
        actions: Array.isArray(data?.actions) ? data.actions : [],
      };
    },
  });
}
