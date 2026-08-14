import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { useNotifications, useUnreadCount, useMarkNotificationRead, useMarkAllRead, type Notification } from '@/hooks/useNotifications';
import { resolveNotificationDestination, type OrgRole } from '@/lib/notification-routing';
import { formatDistanceToNow } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { slaFor } from '@/lib/support-sla';
import { useTick } from '@/hooks/useTick';
import TicketTimeline, { stageFromTicket } from '@/components/support/TicketTimeline';

const typeIcon: Record<string, string> = {
  pto_request_new: '📋',
  pto_request_approved: '✅',
  pto_request_denied: '❌',
  correction_request_new: '📝',
  correction_approved: '✅',
  correction_denied: '❌',
  change_request_new: '📋',
  change_request_approved: '✅',
  change_request_denied: '❌',
  incident_report_new: '⚠️',
  incident_report_signature_needed: '✍️',
  incident_report_signed: '✅',
  incident_report_closed: '✅',
  training_assigned: '🎓',
  training_due: '🎓',
  ai_training_due: '🎓',
  goal_step_due: '🎯',
  ai_goal_task_due: '🎯',
  ai_plan_stall: '🎯',
  knowledge_acknowledgment_required: '📖',
  knowledge_acknowledgment_due: '📖',
  knowledge_acknowledgment_blocked: '📖',
  knowledge_acknowledgment_unblocked: '📖',
  knowledge_acknowledgment_question: '❓',
  knowledge_acknowledgment_question_answered: '💬',
  knowledge_acknowledgment_manager_escalation: '📖',
  knowledge_acknowledgment_owner_escalation: '📖',
  accountability_record: '🖊️',
  accountability_review_due: '🖊️',
  accountability_escalation: '🖊️',
  checklist_bypass: '📋',
  ai_sprint_verify: '🏁',
  ai_sprint_announced: '🏁',
  ai_sprint_won: '🎉',
  ai_sprint_missed: '🏁',
  ai_sprint_pending_verification: '🏁',
  ai_sprint_progress: '🏁',
  message: '💬',
  integrity_elevated: '🛡️',
  integrity_digest: '🛡️',
};

function iconFor(type: string): string {
  return typeIcon[type] || (type.startsWith('ai_') ? '✨' : '🔔');
}

/**
 * One notification row. The row itself stays readable on any device; on
 * desktop, hovering reveals the full detail without marking anything read.
 */
function NotificationRow({
  notification: n,
  role,
  onOpen,
}: {
  notification: Notification;
  role: OrgRole | undefined;
  onOpen: (n: Notification) => void;
}) {
  const destination = resolveNotificationDestination(n, { role });
  const created = new Date(n.created_at);

  const row = (
    <button
      className={`w-full text-left px-4 py-3 border-b border-border last:border-0 hover:bg-muted/50 transition-colors ${
        !n.is_read ? 'bg-primary/5' : ''
      }`}
      onClick={() => onOpen(n)}
    >
      <div className="flex items-start gap-2">
        <span className="text-base mt-0.5">{iconFor(n.notification_type)}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${!n.is_read ? 'font-semibold text-foreground' : 'text-foreground'}`}>
            {n.title}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {formatDistanceToNow(created, { addSuffix: true })}
          </p>
        </div>
        {!n.is_read && (
          <div className="h-2 w-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
        )}
      </div>
    </button>
  );

  // Hover is desktop-only by nature (the hover card never opens from touch),
  // so phones simply tap through to the destination.
  return (
    <HoverCard openDelay={350} closeDelay={100}>
      <HoverCardTrigger asChild>{row}</HoverCardTrigger>
      <HoverCardContent side="left" align="start" className="w-80 p-3 space-y-2">
        <div className="flex items-start gap-2">
          <span className="text-base">{iconFor(n.notification_type)}</span>
          <p className="text-sm font-semibold leading-snug">{n.title}</p>
        </div>
        <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">{n.message}</p>
        <p className="text-xs text-muted-foreground">
          {formatDistanceToNow(created, { addSuffix: true })} · {created.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </p>
        <div className="flex items-center gap-1.5 border-t pt-2 text-xs text-muted-foreground">
          <ArrowRight className="h-3 w-3 text-primary" />
          <span>
            Opens: <span className="font-medium text-foreground">{destination.label}</span>
          </span>
          <span className="ml-auto text-[11px] italic">Click to open</span>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const { data: notifications } = useNotifications();
  const unreadCount = useUnreadCount();
  const now = useTick(1000);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllRead();
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  // The problem reports this person filed, so they can see where each one stands
  // without having to reopen the widget and ask.
  const { data: tickets } = useQuery({
    queryKey: ['my-support-tickets', user?.id],
    enabled: !!user?.id && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('id, title, status, tier, severity, category, context_path, context_label, created_at, escalated_at, resolved_at')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  /**
   * Click → destination opens → notification becomes read. The mark-read is
   * optimistic and never gates the navigation; if it fails, the person still
   * lands where the notification points.
   */
  const openNotification = (n: Notification) => {
    const destination = resolveNotificationDestination(n, { role: ctx?.role });
    setOpen(false);
    navigate(destination.to);
    if (!n.is_read) markRead.mutate(n.id);
  };

  return (
    <div className="relative" ref={ref}>
      <Button variant="ghost" size="icon" className="relative" aria-label="Notifications" onClick={() => setOpen(!open)}>
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs bg-destructive text-destructive-foreground">
            {unreadCount > 9 ? '9+' : unreadCount}
          </Badge>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-popover border border-border rounded-lg shadow-lg z-50 flex max-h-[calc(100vh-6rem)] flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="font-semibold text-sm text-foreground">Notifications</h3>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => markAllRead.mutate()}>
                <CheckCheck className="h-3 w-3 mr-1" />
                Mark all read
              </Button>
            )}
          </div>
          {!!tickets?.length && (
            <div className="min-h-0 overflow-y-auto overscroll-contain border-b border-border px-4 py-3">
              <h4 className="mb-2 text-xs font-medium text-muted-foreground">Your problem reports</h4>
              <div className="space-y-3">
                {tickets.map(t => (
                  <div key={t.id} className="space-y-1.5">
                    <p className="truncate text-xs text-foreground">{t.title}</p>
                    <TicketTimeline
                      stage={stageFromTicket(t.status, t.tier)}
                      times={{
                        open: t.created_at,
                        escalated: t.escalated_at,
                        solved: t.resolved_at,
                      }}
                      contextPath={t.context_path}
                      contextLabel={t.context_label}
                    />

                    {(() => {
                      const sla = slaFor(t, now);
                      return (
                        <p
                          className={`text-[11px] ${
                            sla.overdue ? 'font-medium text-destructive' : 'text-muted-foreground'
                          }`}
                        >
                          {sla.label}
                        </p>
                      );
                    })()}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Native overflow instead of Radix ScrollArea: the Radix viewport
              sizes itself with h-full, which a max-height-only parent cannot
              resolve, so the list clipped without ever scrolling. */}
          <div className="min-h-0 max-h-[400px] overflow-y-auto overscroll-contain">
            {!notifications?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">No notifications</p>
            ) : (
              notifications.map(n => (
                <NotificationRow
                  key={n.id}
                  notification={n}
                  role={ctx?.role}
                  onOpen={openNotification}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
