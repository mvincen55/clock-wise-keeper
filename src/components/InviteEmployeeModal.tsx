import { useState } from 'react';
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
import { Switch } from '@/components/ui/switch';
import { usePendingInvites } from '@/hooks/usePendingInvites';
import type { OperationalRole } from '@/lib/schedule-reader/types';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type ScheduleDay = { weekday: number; enabled: boolean; start_time: string; end_time: string };

const DEFAULT_SCHEDULE: ScheduleDay[] = DAY_NAMES.map((_, weekday) => ({
  weekday,
  enabled: weekday >= 1 && weekday <= 5,
  start_time: '08:00',
  end_time: '17:00',
}));

type InviteInitial = {
  email: string;
  role: 'employee' | 'manager';
  invited_name: string | null;
  operational_role: string | null;
  secondary_roles: string[];
  start_date: string | null;
  initial_pto_hours: number | null;
  weekly_schedule: ScheduleDay[];
};

/**
 * Invite a team member — or, given `initial` (an open invite), update its
 * details and resend the email. send-org-invite reuses the same invite row
 * and token for an un-accepted email, so "update & resend" is one call.
 */
export default function InviteEmployeeModal({
  initial,
  open: controlledOpen,
  onOpenChange,
}: {
  initial?: InviteInitial;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
} = {}) {
  const { data: ctx } = useOrgContext();
  const { toast } = useToast();
  const updateMode = !!initial;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const seedSchedule = (): ScheduleDay[] => {
    if (!initial?.weekly_schedule?.length) return DEFAULT_SCHEDULE;
    return DAY_NAMES.map((_, weekday) => {
      const saved = initial.weekly_schedule.find(d => d.weekday === weekday);
      return saved ?? { weekday, enabled: false, start_time: '08:00', end_time: '17:00' };
    });
  };
  const [name, setName] = useState(initial?.invited_name ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [role, setRole] = useState<'employee' | 'manager'>(initial?.role ?? 'employee');
  const [operationalRole, setOperationalRole] = useState<OperationalRole | ''>(
    (initial?.operational_role as OperationalRole | null) ?? ''
  );
  const [secondaryRoles, setSecondaryRoles] = useState<OperationalRole[]>(
    (initial?.secondary_roles as OperationalRole[] | undefined) ?? []
  );
  const [submitting, setSubmitting] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [emailed, setEmailed] = useState(false);
  const [warning, setWarning] = useState('');
  const [startDate, setStartDate] = useState(initial?.start_date ?? '');
  const [ptoHours, setPtoHours] = useState(
    initial?.initial_pto_hours === null || initial?.initial_pto_hours === undefined
      ? ''
      : String(initial.initial_pto_hours)
  );
  const [schedule, setSchedule] = useState<ScheduleDay[]>(seedSchedule);
  const { refetch: refetchInvites } = usePendingInvites();

  const updateDay = (weekday: number, patch: Partial<ScheduleDay>) =>
    setSchedule(days => days.map(d => (d.weekday === weekday ? { ...d, ...patch } : d)));

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
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-org-invite', {
        body: {
          email: email.toLowerCase().trim(),
          role,
          name: name.trim(),
          operationalRole,
          secondaryRoles: secondaryRoles.filter(r => r !== operationalRole),
          startDate: startDate || null,
          initialPtoHours: ptoHours.trim() === '' ? null : Number(ptoHours),
          schedule: schedule.filter(d => d.enabled),
          origin: window.location.origin,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setInviteLink(data.link);
      refetchInvites();
      setEmailed(!!data.emailed);
      setWarning(data.warning || '');
      toast(
        data.emailed
          ? {
              title: updateMode ? 'Invite updated & resent' : 'Invite sent',
              description: `An invite email is on its way to ${email.toLowerCase().trim()}.`,
            }
          : {
              title: updateMode ? 'Invite updated' : 'Invite created',
              description: data.warning || 'Share the link manually.',
              variant: 'destructive',
            }
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
    setSchedule(DEFAULT_SCHEDULE);
    setInviteLink('');
    setEmailed(false);
    setWarning('');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v && !updateMode) reset(); }}>
      {!updateMode && (
        <DialogTrigger asChild>
          <Button variant="outline"><Mail className="mr-2 h-4 w-4" />Invite</Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{updateMode ? 'Update invite & resend' : 'Invite Team Member'}</DialogTitle>
        </DialogHeader>

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
            {updateMode ? (
              <Button variant="outline" onClick={() => { setInviteLink(''); setOpen(false); }} className="w-full">
                Done
              </Button>
            ) : (
              <Button variant="outline" onClick={reset} className="w-full">Invite Another</Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Their name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Berry" maxLength={80} />
            </div>
            <div className="space-y-2">
              <Label>Email address (their username) *</Label>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="jane@company.com"
                readOnly={updateMode}
                className={updateMode ? 'bg-muted' : undefined}
              />
              <p className="text-xs text-muted-foreground">
                {updateMode
                  ? 'The invite stays tied to this address. For a different email, revoke this invite and send a new one.'
                  : "They'll sign in with this address."}
              </p>
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
            <div className="space-y-4 rounded-lg border bg-muted/20 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Onboarding details (optional)
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Start date</Label>
                  <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Current PTO (hours)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.25"
                    value={ptoHours}
                    onChange={e => setPtoHours(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Weekly schedule</Label>
                <div className="space-y-1.5">
                  {schedule.map(day => (
                    <div key={day.weekday} className="flex items-center gap-2">
                      <Switch
                        checked={day.enabled}
                        onCheckedChange={v => updateDay(day.weekday, { enabled: v })}
                        aria-label={DAY_NAMES[day.weekday]}
                      />
                      <span className="w-16 text-xs text-muted-foreground">{DAY_NAMES[day.weekday].slice(0, 3)}</span>
                      <Input
                        type="time"
                        value={day.start_time}
                        disabled={!day.enabled}
                        onChange={e => updateDay(day.weekday, { start_time: e.target.value })}
                        className="h-8 flex-1 text-xs"
                      />
                      <span className="text-xs text-muted-foreground">to</span>
                      <Input
                        type="time"
                        value={day.end_time}
                        disabled={!day.enabled}
                        onChange={e => updateDay(day.weekday, { end_time: e.target.value })}
                        className="h-8 flex-1 text-xs"
                      />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Used to set up their starting schedule and PTO balance the moment they join. You can change it later.
                </p>
              </div>
            </div>
            <Button
              onClick={handleInvite}
              disabled={submitting || !email.trim() || !name.trim() || !operationalRole}
              className="w-full"
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {updateMode ? 'Update & Resend Email' : 'Send Invite Email'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
