import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { Tables } from '@/integrations/supabase/types';

// Office knowledge base: internal business documents (policies, HR info,
// insurance handbooks) powering the AI assistant. Not patient data.

export type OfficeDoc = Tables<'office_docs'>;
export type OfficeDocCategory = 'policy' | 'hr' | 'insurance' | 'other';

export const DOC_CATEGORY_LABELS: Record<OfficeDocCategory, string> = {
  policy: 'Office Policy',
  hr: 'HR',
  insurance: 'Insurance',
  other: 'Other',
};

export interface AskSource {
  id: string;
  title: string;
  category: string;
}

export interface AskResult {
  answer: string;
  sources: AskSource[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: AskSource[];
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

/** Full text of one document, reassembled from its indexed chunks. */
export function useOfficeDocContent(docId: string | null) {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['office-doc-content', docId],
    enabled: !!user && !!ctx && !!docId,
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase
        .from('office_doc_chunks')
        .select('chunk_index, content')
        .eq('doc_id', docId!)
        .order('chunk_index');
      if (error) throw error;
      return (data ?? []).map(c => c.content).join('\n\n');
    },
  });
}

export interface UploadDocInput {
  title: string;
  category: OfficeDocCategory;
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
        category: input.category,
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

export function useAskDocs() {
  return useMutation({
    mutationFn: async (input: { question: string; history: ChatMessage[] }): Promise<AskResult> => {
      const { data, error } = await supabase.functions.invoke('ask-docs', {
        body: {
          question: input.question,
          history: input.history.map(m => ({ role: m.role, content: m.content })),
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data as AskResult;
    },
  });
}
