import { useState } from 'react';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import InviteEmployeeModal from '@/components/InviteEmployeeModal';
import { usePendingInvites } from '@/hooks/usePendingInvites';
import { useOperationalRoles } from '@/hooks/useOperationalRoles';

export default function EmployeeInviteAction({ employee }: {
  employee: { id: string; display_name: string; email: string | null; user_id: string | null };
}) {
  const [open, setOpen] = useState(false);
  const { data: invites, isLoading, isError } = usePendingInvites();
  const { data: roles } = useOperationalRoles();
  if (employee.user_id) return null;
  const email = employee.email?.trim().toLowerCase();
  if (!email) return <span className="self-center text-xs text-muted-foreground">Add an email in Edit details to send an invite.</span>;
  const pending = invites?.find(i => i.email.trim().toLowerCase() === email);
  const employeeRoles = roles?.get(employee.id) ?? [];
  const defaults = {
    email, invited_name: employee.display_name, role: 'employee' as const,
    operational_role: employeeRoles.find(r => r.is_primary)?.operational_role ?? null,
    secondary_roles: employeeRoles.filter(r => !r.is_primary).map(r => r.operational_role),
    start_date: null, initial_pto_hours: null, weekly_schedule: [],
  };
  return <>
    <Button variant="outline" size="sm" disabled={isLoading || isError} onClick={() => setOpen(true)}>
      <Mail className="mr-2 h-4 w-4" />{pending ? 'Resend invite' : 'Send invite'}
    </Button>
    {isError && <span role="alert" className="self-center text-xs text-destructive">Could not load invitations. Refresh to try again.</span>}
    {open && <InviteEmployeeModal initial={pending} defaults={defaults} open={open} onOpenChange={setOpen} />}
  </>;
}
