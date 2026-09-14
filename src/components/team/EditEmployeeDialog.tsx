import EmployeeContactInputs from './EmployeeContactInputs';
import { employeeContactFields, type EmployeeContactFields } from '@/lib/employee-contact';
import EmployeeNameInputs from './EmployeeNameInputs';
import { employeeNameFields } from '@/lib/employee-name-fields';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useUpdateEmployeeDetails } from '@/hooks/useEmployees';
import { Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';

type Employee = Partial<Record<keyof EmployeeContactFields, string | null>> & { id: string; display_name: string; email: string | null; first_name?: string | null; middle_initial?: string | null; last_name?: string | null };

export default function EditEmployeeDialog({ employee }: { employee: Employee }) {
  const [open, setOpen] = useState(false);
  const [names, setNames] = useState(() => employeeNameFields(employee));
  const [email, setEmail] = useState(employee.email ?? '');
  const [error, setError] = useState('');
  const [contact, setContact] = useState(() => employeeContactFields(employee));
  const update = useUpdateEmployeeDetails();
  const id = useId();

  const changeOpen = (next: boolean) => {
    if (update.isPending) return;
    if (next) {
      setNames(employeeNameFields(employee));
      setEmail(employee.email ?? '');
      setError('');
      setContact(employeeContactFields(employee));
    }
    setOpen(next);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!names.first_name.trim() || !names.last_name.trim() || update.isPending) return;
    setError('');
    try {
      await update.mutateAsync({ id: employee.id, ...names, contact, email: email.trim() || null });
      toast.success('Team details saved');
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save team details. Please try again.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Pencil className="mr-1 h-3 w-3" />Edit details</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit team member</DialogTitle>
          <DialogDescription>First and last name are required. All other details are optional. Saving does not send an invitation.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <EmployeeNameInputs value={names} onChange={setNames} disabled={update.isPending} />
          <div className="space-y-1">
            <Label htmlFor={`${id}-email`}>Email (optional)</Label>
            <Input id={`${id}-email`} type="email" value={email} onChange={event => setEmail(event.target.value)} disabled={update.isPending} />
          </div>
          <p className="text-xs text-muted-foreground">Contact email is separate from their sign-in email.</p>
          <EmployeeContactInputs value={contact} onChange={setContact} disabled={update.isPending} />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => changeOpen(false)} disabled={update.isPending}>Cancel</Button>
            <Button type="submit" disabled={!names.first_name.trim() || !names.last_name.trim() || update.isPending}>
              {update.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
