import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useUpdateEmployeeDetails } from '@/hooks/useEmployees';
import { Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';

type Employee = { id: string; display_name: string; email: string | null };

export default function EditEmployeeDialog({ employee }: { employee: Employee }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(employee.display_name);
  const [email, setEmail] = useState(employee.email ?? '');
  const [error, setError] = useState('');
  const update = useUpdateEmployeeDetails();
  const id = useId();

  const changeOpen = (next: boolean) => {
    if (update.isPending) return;
    if (next) {
      setName(employee.display_name);
      setEmail(employee.email ?? '');
      setError('');
    }
    setOpen(next);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || update.isPending) return;
    setError('');
    try {
      await update.mutateAsync({ id: employee.id, display_name: name.trim(), email: email.trim() || null });
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit team member</DialogTitle>
          <DialogDescription>Update their name and contact email. You can leave email blank and add it later. Saving does not send an invitation or change their sign-in email.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor={`${id}-name`}>Name</Label>
            <Input id={`${id}-name`} value={name} onChange={event => setName(event.target.value)} required disabled={update.isPending} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-email`}>Email (optional)</Label>
            <Input id={`${id}-email`} type="email" value={email} onChange={event => setEmail(event.target.value)} disabled={update.isPending} />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => changeOpen(false)} disabled={update.isPending}>Cancel</Button>
            <Button type="submit" disabled={!name.trim() || update.isPending}>
              {update.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
