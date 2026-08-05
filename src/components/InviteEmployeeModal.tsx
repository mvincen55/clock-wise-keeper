import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Mail, Loader2, Copy, CheckCircle2, AlertTriangle, Check } from 'lucide-react';
import { OPERATIONAL_ROLES, ROLE_LABELS } from '@/hooks/useOperationalRoles';
import { MEMBER_ROLE_LABELS } from '@/lib/roles';
import type { OperationalRole } from '@/lib/schedule-reader/types';
import WeeklyScheduleEditor from '@/components/WeeklyScheduleEditor';
import {
  defaultWeeklySchedule,
  parseInitialPtoHours,
  parseStartDate,
  scheduleHasAnyEnabled,
  type WeekdaySchedule,
} from '@/lib/invite-details';

export default function InviteEmployeeModal() {
  const { data: ctx } = useOrgContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'employee' | 'manager'>('employee');
  const [operationalRole, setOperationalRole] = useState<OperationalRole | ''>('');
  const [secondaryRoles, setSecondaryRoles] = useState<OperationalRole[]>([]);
  const [startDate, setStartDate] = useState('');
  const [ptoHours, setPtoHours] = useState('');
  const [schedule, setSchedule] = useState<WeekdaySchedule[]>(() => defaultWeeklySchedule());
  const [submitting, setSubmitting] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [emailed, setEmailed] = useState(false);
  const [warning, setWarning] = useState('');

  const toggleSecondary = (r: OperationalRole) =>
    setSecondaryRoles(list => (list.includes(r) ? list.filter(x => x !== r) : [...list, r]));

  const handleInvite = async () => {
    if (!ctx || !email.trim()) return;
    if (!name.trim()) {
      toast({ title: 'Enter their name', description: 'The name goes on their profile the moment they join.', variant: 'destructive' });
      return;
    }
    if (!operationalRole) {
      toast({ title: 'Pick what they do', description: 'Their operational role sets up scheduling and staffing correctly from day one.', variant: 'destructive' });
      return;
    }
    if (startDate && !parseStartDate(startDate)) {
      toast({ title: 'Check the start date', description: 'Use a valid calendar date, or leave it blank.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-org-invite', {
        body: {
          email: email.toLowerCase().trim(),
          role,
          name: name.trim(),
          operationalRole,
          secondaryRoles: secondaryRoles.filter(r => r !== operationalRole),
          startDate: parseStartDate(startDate) ?? undefined,
          initialPtoHours: parseInitialPtoHours(ptoHours) ?? undefined,
          schedule: scheduleHasAnyEnabled(schedule) ? schedule : [],
          origin: window.location.origin,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setInviteLink(data.link);
      setEmailed(!!data.emailed);
      setWarning(data.warning || '');
      queryClient.invalidateQueries({ queryKey: ['pending-invites', ctx.org_id] });
      toast(
        data.emailed
          ? { title: 'Invite sent', description: `An invite email is on its way to ${email.toLowerCase().trim()}.` }
          : { title: 'Invite created', description: data.warning || 'Share the link manually.', variant: 'destructive' }
      );
    } catch (e) {
      toast({
        title: 'Failed to create invite',
        description: e instanceof Error ? e.message : 'Unexpected error',
        variant: 'destructive',
      });
    }
    setSubmitting(false);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    toast({ title: 'Copied to clipboard' });
  };

  const reset = () => {
    setName('');
    setEmail('');
    setRole('employee');
    setOperationalRole('');
    setSecondaryRoles([]);
    setStartDate('');
    setPtoHours('');
    setSchedule(defaultWeeklySchedule());
    setInviteLink('');
    setEmailed(false);
    setWarning('');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline"><Mail className="mr-2 h-4 w-4" />Invite</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Invite Team Member</DialogTitle></DialogHeader>

        {inviteLink ? (
          <div className="space-y-4">
            {emailed ? (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-success/10 border border-success/30">
                <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                <p className="text-sm">Invite email sent to <strong>{email.toLowerCase().trim()}</strong>.</p>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30">
                <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
                <p className="text-sm">{warning || 'Invite created, but the email could not be sent.'}</p>
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Backup link (share manually if needed)</Label>
              <div className="flex items-center gap-2">
                <Input value={inviteLink} readOnly className="text-xs" />
                <Button size="icon" variant="outline" onClick={copyLink}><Copy className="h-4 w-4" /></Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">The invite expires in 7 days.</p>
            <Button variant="outline" onClick={reset} className="w-full">Invite Another</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Their name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Berry" maxLength={80} />
            </div>
            <div className="space-y-2">
              <Label>Email address (their username) *</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@company.com" />
              <p className="text-xs text-muted-foreground">They'll sign in with this address.</p>
            </div>
            <div className="space-y-2">
              <Label>Permissions</Label>
              <Select value={role} onValueChange={(v) => setRole(v as 'employee' | 'manager')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">{MEMBER_ROLE_LABELS.employee}</SelectItem>
                  <SelectItem value="manager">{MEMBER_ROLE_LABELS.manager}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Managers and Team both clock in and out — only the owner doesn't.
              </p>
            </div>
            <div className="space-y-2">
              <Label>What will they do? *</Label>
              <Select value={operationalRole} onValueChange={v => {
                setOperationalRole(v as OperationalRole);
                setSecondaryRoles(list => list.filter(r => r !== v));
              }}>
                <SelectTrigger><SelectValue placeholder="Their main role in the office" /></SelectTrigger>
                <SelectContent>
                  {OPERATIONAL_ROLES.map(r => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The work, not the permissions — this sets up scheduling and staffing from day one.
                You can adjust it later from the Team page.
              </p>
            </div>
            {operationalRole && (
              <div className="space-y-2">
                <Label>Anything else they'll cover? (optional)</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  {OPERATIONAL_ROLES.filter(r => r !== operationalRole).map(r => (
                    <Button
                      key={r}
                      type="button"
                      size="sm"
                      variant={secondaryRoles.includes(r) ? 'secondary' : 'outline'}
                      className="justify-start"
                      onClick={() => toggleSecondary(r)}
                    >
                      {secondaryRoles.includes(r) && <Check className="mr-1.5 h-3 w-3" />}
                      {ROLE_LABELS[r]}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-lg border border-dashed p-3 space-y-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Onboarding details (optional)
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Start date</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="h-9"
                  />
                  <p className="text-xs text-muted-foreground">Sets their hire date &amp; PTO accrual start.</p>
                </div>
                <div className="space-y-2">
                  <Label>Current PTO (hours)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={ptoHours}
                    onChange={e => setPtoHours(e.target.value)}
                    placeholder="e.g. 40"
                    className="h-9"
                  />
                  <p className="text-xs text-muted-foreground">Their balance today, carried in as the opening number.</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Weekly schedule</Label>
                <WeeklyScheduleEditor value={schedule} onChange={setSchedule} />
              </div>
            </div>

            <Button
              onClick={handleInvite}
              disabled={submitting || !email.trim() || !name.trim() || !operationalRole}
              className="w-full"
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send Invite Email
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
