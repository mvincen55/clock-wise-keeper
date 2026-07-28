import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotifications, useUnreadCount, useMarkNotificationRead, useMarkAllRead } from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const { data: notifications } = useNotifications();
  const unreadCount = useUnreadCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllRead();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

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
  };

  /** Notifications that point at a row we can open from here. */
  const linkFor = (n: { related_table: string | null; related_id: string | null }) =>
    n.related_table === 'incident_reports' && n.related_id
      ? `/incident-reports?report=${n.related_id}`
      : null;

  return (
    <div className="relative" ref={ref}>
      <Button variant="ghost" size="icon" className="relative" onClick={() => setOpen(!open)}>
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs bg-destructive text-destructive-foreground">
            {unreadCount > 9 ? '9+' : unreadCount}
          </Badge>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-popover border border-border rounded-lg shadow-lg z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="font-semibold text-sm text-foreground">Notifications</h3>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => markAllRead.mutate()}>
                <CheckCheck className="h-3 w-3 mr-1" />
                Mark all read
              </Button>
            )}
          </div>
          <ScrollArea className="max-h-[400px]">
            {!notifications?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">No notifications</p>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  className={`w-full text-left px-4 py-3 border-b border-border last:border-0 hover:bg-muted/50 transition-colors ${
                    !n.is_read ? 'bg-primary/5' : ''
                  }`}
                  onClick={() => {
                    if (!n.is_read) markRead.mutate(n.id);
                    const to = linkFor(n);
                    if (to) {
                      setOpen(false);
                      navigate(to);
                    }
                  }}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-base mt-0.5">{typeIcon[n.notification_type] || '🔔'}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${!n.is_read ? 'font-semibold text-foreground' : 'text-foreground'}`}>
                        {n.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    {!n.is_read && (
                      <div className="h-2 w-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    )}
                  </div>
                </button>
              ))
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
