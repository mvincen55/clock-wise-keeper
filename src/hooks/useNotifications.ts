import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useEffect } from 'react';

export type Notification = {
  id: string;
  org_id: string;
  recipient_user_id: string;
  actor_user_id: string | null;
  notification_type: string;
  title: string;
  message: string;
  related_table: string | null;
  related_id: string | null;
  is_read: boolean;
  created_at: string;
};

export function useNotifications() {
  const { user } = useAuth();
  const qc = useQueryClient();

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('notifications-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_user_id=eq.${user.id}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ['notifications'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, qc]);

  return useQuery({
    queryKey: ['notifications', user?.id],
    enabled: !!user,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as Notification[];
    },
  });
}

export function useUnreadCount() {
  const { data: notifications } = useNotifications();
  return notifications?.filter(n => !n.is_read).length || 0;
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useMarkAllRead() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('recipient_user_id', user.id)
        .eq('is_read', false);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

/** Helper to create a notification - used by other hooks */
export async function createNotification(params: {
  org_id: string;
  recipient_user_id: string;
  actor_user_id?: string;
  notification_type: string;
  title: string;
  message: string;
  related_table?: string;
  related_id?: string;
}) {
  const { error } = await supabase.from('notifications').insert({
    org_id: params.org_id,
    recipient_user_id: params.recipient_user_id,
    actor_user_id: params.actor_user_id || null,
    notification_type: params.notification_type,
    title: params.title,
    message: params.message,
    related_table: params.related_table || null,
    related_id: params.related_id || null,
  });
  if (error) {
    console.error('Failed to create notification:', error.message, params);
  }
}
