import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Check, Mail } from 'lucide-react';
import { useMessagesCloseout } from '@/hooks/useMessagesCloseout';

/**
 * The end-of-night item, shown as the system's own answer rather than a box to
 * tick. If it doesn't apply today, this renders nothing — no ghost item, no
 * explanation for something the person never had to do.
 */
export default function MessagesCloseoutCard() {
  const { applies, satisfied, outstanding, label, isLoading } = useMessagesCloseout();
  if (isLoading || !applies) return null;

  return (
    <Card className="card-elevated">
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
            satisfied ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
          }`}
        >
          {satisfied ? <Check className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">
            {satisfied
              ? 'All caught up for today.'
              : `${outstanding.length} still waiting${
                  outstanding.some(o => o.needs_reply) ? ' — some need a reply' : ''
                }.`}
          </p>
        </div>
        {!satisfied && (
          <Link to="/inbox/requests" className="text-xs font-medium text-primary hover:underline">
            Open
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
