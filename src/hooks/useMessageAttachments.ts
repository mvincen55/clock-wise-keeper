import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const ALLOWED_ATTACHMENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
] as const;

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export interface AttachmentRow {
  id: string;
  message_id: string;
  conversation_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string;
  created_at: string;
}

/** Attachments for a conversation. RLS keeps this participant-only. */
export function useConversationAttachments(conversationId: string | null) {
  return useQuery({
    queryKey: ['message-attachments', conversationId],
    enabled: !!conversationId,
    refetchInterval: 20000,
    queryFn: async (): Promise<AttachmentRow[]> => {
      const { data, error } = await supabase
        .from('message_attachments')
        .select('*')
        .eq('conversation_id', conversationId!)
        .order('created_at', { ascending: true })
        .returns<AttachmentRow[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Short-lived signed URL for a private attachment. */
export async function signedAttachmentUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('message-attachments')
    .createSignedUrl(path, 300);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export function validateAttachment(file: File): string | null {
  if (!(ALLOWED_ATTACHMENT_TYPES as readonly string[]).includes(file.type)) {
    return 'Only images (PNG, JPEG, WebP, GIF) and PDFs can be attached.';
  }
  if (file.size <= 0 || file.size > MAX_ATTACHMENT_BYTES) {
    return 'Files must be under 20MB.';
  }
  return null;
}
