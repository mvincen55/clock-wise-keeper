import { useState } from 'react';
import { usePendingInvites, useRevokeInvite, type PendingInvite } from '@/hooks/useInvites';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { MEMBER_ROLE_LABELS } from '@/lib/roles';
import { ROLE_LABELS } from '@/hooks/useOperationalRoles';
import {
  formatIsoDate,
  formatExpiry,
  isInviteExpired,
  formatScheduleSummary,
  sanitizeWeeklySchedule,
} from '@/lib/invite-details';
import { MailCheck, Copy, X, CalendarDays, Clock } from 'lucide-react';
import type { OperationalRole } from '@/lib/schedule-reader/types';

function inviteLink(token: string): string {
  return `${window.location.origin}/accept-invite?token=${token}`;
}

function roleLabel(role: string): string {
  return MEMBER_ROLE_LABELS[role as keyof typeof MEMBER_ROLE_LABELS] ?? role;
}

function operationalLabel(role: string | null): string | null {
  if (!role) return null;
  return ROLE_LABELS[role as OperationalRole] ?? role;
}

function InviteRow({ invite }: { invite: PendingInvite }) {
  const { toast } = useToast();
  const revoke = useRevokeInvite();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const expired = isInviteExpired(invite.expires_at);
  const opRole = operationalLabel(invite.operational_role);
  const schedule = sanitizeWeeklySchedule(invite.weekly_schedule);
  const hasSchedule = schedule.some((d) => d.enabled);

  const copy = () => {
    navigator.clipboard.writeText(inviteLink(invite.token));
    toast({ title: 'Invite link copied' });
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium truncate">{invite.invited_name || invite.email}</span>
          <Badge variant="outline">{roleLabel(invite.role)}</Badge>
          {opRole && <Badge variant="secondary">{opRole}</Badge>}
          <Badge variant={expired ? 'destructive' : 'outline'} className="gap-1">
            <Clock className="h-3 w-3" />
            {formatExpiry(invite.expires_at)}
          </Badge>
        </div>
        {invite.invited_name && (
          <p className="text-sm text-muted-foreground truncate">{invite.email}</p>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {invite.start_date && (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />
              Starts {formatIsoDate(invite.start_date)}
            </span>
          )}
          {invite.initial_pto_hours != null && (
            <span>PTO: {invite.initial_pto_hours}h</span>
          )}
          {hasSchedule && <span>{formatScheduleSummary(schedule)}</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button size="sm" variant="outline" onClick={copy}>
          <Copy className="mr-1.5 h-3.5 w-3.5" />
          Copy link
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
          aria-label="Revoke invite"
          onClick={() => setConfirmOpen(true)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this invite?</AlertDialogTitle>
            <AlertDialogDescription>
              The invite link for {invite.email} will stop working. You can always send a new one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revoke.mutate(invite.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Shows outstanding invites so managers can track, copy, or revoke them. */
export default function PendingInvitesCard() {
  const { data: invites, isLoading } = usePendingInvites();

  if (isLoading || !invites || invites.length === 0) return null;

  return (
    <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
      <div className="flex items-center gap-2">
        <MailCheck className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Pending invites</h2>
        <Badge variant="secondary">{invites.length}</Badge>
      </div>
      <div className="space-y-2">
        {invites.map((invite) => (
          <InviteRow key={invite.id} invite={invite} />
        ))}
      </div>
    </div>
  );
}
