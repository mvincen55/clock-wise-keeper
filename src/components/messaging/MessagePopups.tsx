import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MessageSquare } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { resolveNotificationDestination } from '@/lib/notification-routing';
import { isConversationOnScreen } from '@/lib/active-conversation';
import type { Notification } from '@/hooks/useNotifications';

/**
 * Corner popups for incoming messages.
 *
 * The notify_new_message trigger already writes a notification row for every
 * message recipient; this component listens for those inserts in realtime and
 * surfaces each one twice over:
 *
 *   - an in-app toast in the corner of the window, with an Open action that
 *     jumps straight into the conversation;
 *   - a desktop notification in the corner of the screen when the tab is
 *     hidden, so a message still reaches someone working in another window
 *     (permission is requested from the chat surfaces, never at page load).
 *
 * A conversation the person is already reading (Messages page or chat dock,
 * tracked in lib/active-conversation) never pops — it would only repeat what
 * is on screen.
 */
export default function MessagePopups() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  // The realtime callback lives across renders; give it the fresh navigate.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('message-popups')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_user_id=eq.${user.id}`,
        },
        payload => {
          const n = payload.new as Notification;
          if (n.notification_type !== 'message') return;

          // A message just landed: freshen every chat surface right away
          // instead of waiting out the polling interval.
          qc.invalidateQueries({ queryKey: ['messages'] });
          qc.invalidateQueries({ queryKey: ['conversations'] });

          const conversationId = n.related_table === 'conversations' ? n.related_id : null;
          // "Away" means the app window is not the one being worked in —
          // another app has focus, or the tab is hidden entirely. A tab that
          // is visible on screen but unfocused still counts as away: the
          // person asked for a notice on the computer, not just in the tab.
          const away = !document.hasFocus() || document.visibilityState !== 'visible';
          if (!away && isConversationOnScreen(conversationId)) return;

          const dest = resolveNotificationDestination(n).to;
          toast(n.title, {
            description: n.message,
            icon: <MessageSquare className="h-4 w-4" />,
            duration: 8000,
            action: { label: 'Open', onClick: () => navigateRef.current(dest) },
          });

          if (away && 'Notification' in window && Notification.permission === 'granted') {
            // tag: one bubble per conversation — a burst of messages updates
            // in place instead of stacking.
            const desktop = new Notification(n.title, {
              body: n.message,
              tag: conversationId ?? n.id,
            });
            desktop.onclick = () => {
              window.focus();
              navigateRef.current(dest);
              desktop.close();
            };
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, qc]);

  return null;
}
