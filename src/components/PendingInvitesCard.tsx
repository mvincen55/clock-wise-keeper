import { useMemo } from 'react';
import { usePendingInvites, useRevokeInvite, type PendingInvite } from '@/hooks/usePendingInvites';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { MailCheck, Copy, Trash2, Loader2 } from 'lucide-react';
import { ROLE_LABELS } from '@/hooks/useOperationalRoles';
import { MEMBER_ROLE_LABELS } from '@/lib/roles';

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function scheduleSummary(invite: PendingInvite) {
  const days = (invite.weekly_schedule || []).filter(d => d?.enabled);
  if (!days.length) return 'No schedule set';
  return days
    .slice()
    .sort((a, b) => a.weekday - b.weekday)
    .map(d => `${DAY_ABBR[d.weekday] ?? '?'} ${d.start_time}–${d.end_time}`)
    .join(' · ');
}

function expiryLabel(expiresAt: string) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const days = Math.ceil(ms / 86400000);
  return days === 1 ? 'Expires in 1 day' : `Expires in ${days} days`;
}

export default function PendingInvitesCard() {
  const { data: invites, isLoading } = usePendingInvites();
  const revoke = useRevokeInvite();
  const { toast } = useToast();

  const rows = useMemo(() => invites || [], [invites]);

  if (isLoading || !rows.length) return null;

  const copyLink = (token: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/accept-invite?token=${token}`);
    toast({ title: 'Invite link copied' });
  };

  const handleRevoke = async (invite: PendingInvite) => {
    try {
      await revoke.mutateAsync(invite.id);
      toast({ title: 'Invite revoked', description: `${invite.email} can no longer use that link.` });
    } catch (e) {
      toast({
        title: 'Could not revoke invite',
        description: e instanceof Error ? e.message : 'Unexpected error',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MailCheck className="h-4 w-4 text-muted-foreground" />
          Pending invites
          <Badge variant="secondary">{rows.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map(invite => (
          <div key={invite.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-muted/20 p-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{invite.invited_name || invite.email}</span>
                <Badge variant="outline">{MEMBER_ROLE_LABELS[invite.role] || invite.role}</Badge>
                {invite.operational_role && (
                  <Badge variant="secondary">
                    {ROLE_LABELS[invite.operational_role as keyof typeof ROLE_LABELS] || invite.operational_role}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground break-all">{invite.email}</p>
              <p className="text-xs text-muted-foreground">
                Start: {invite.start_date || 'Not set'} · PTO:{' '}
                {invite.initial_pto_hours === null ? 'Not set' : `${invite.initial_pto_hours} h`}
              </p>
              <p className="text-xs text-muted-foreground">{scheduleSummary(invite)}</p>
              <p className="text-xs text-muted-foreground">{expiryLabel(invite.expires_at)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => copyLink(invite.token)}>
                <Copy className="mr-1.5 h-3.5 w-3.5" />Copy link
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                disabled={revoke.isPending}
                onClick={() => handleRevoke(invite)}
              >
                {revoke.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                <span className="ml-1.5">Revoke</span>
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
