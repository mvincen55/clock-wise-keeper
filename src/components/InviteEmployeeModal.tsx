import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Mail, Loader2, Copy, CheckCircle2, AlertTriangle } from 'lucide-react';

export default function InviteEmployeeModal() {
  const { data: ctx } = useOrgContext();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'employee' | 'manager'>('employee');
  const [submitting, setSubmitting] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [emailed, setEmailed] = useState(false);
  const [warning, setWarning] = useState('');

  const handleInvite = async () => {
    if (!ctx || !email.trim()) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-org-invite', {
        body: { email: email.toLowerCase().trim(), role, origin: window.location.origin },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setInviteLink(data.link);
      setEmailed(!!data.emailed);
      setWarning(data.warning || '');
      toast(
        data.emailed
          ? { title: 'Invite sent', description: `An invite email is on its way to ${email.toLowerCase().trim()}.` }
          : { title: 'Invite created', description: data.warning || 'Share the link manually.', variant: 'destructive' }
      );
    } catch (e: any) {
      toast({ title: 'Failed to create invite', description: e.message, variant: 'destructive' });
    }
    setSubmitting(false);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    toast({ title: 'Copied to clipboard' });
  };

  const reset = () => {
    setEmail('');
    setRole('employee');
    setInviteLink('');
    setEmailed(false);
    setWarning('');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline"><Mail className="mr-2 h-4 w-4" />Invite</Button>
      </DialogTrigger>
      <DialogContent>
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
              <Label>Email Address *</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@company.com" />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleInvite} disabled={submitting || !email.trim()} className="w-full">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send Invite Email
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
