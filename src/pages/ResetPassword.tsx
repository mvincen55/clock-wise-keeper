import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, KeyRound, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { safeInviteNext } from '@/lib/invite-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const nextPath = safeInviteNext(params.get('next'));
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setComplete(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Password could not be updated.';
      toast({ title: 'Password reset failed', description: message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md card-elevated">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary">
            {complete
              ? <CheckCircle2 className="h-7 w-7 text-primary-foreground" />
              : <KeyRound className="h-7 w-7 text-primary-foreground" />}
          </div>
          <CardTitle>{complete ? 'Password updated' : 'Choose a new password'}</CardTitle>
          <CardDescription>
            {complete
              ? 'Return to the invitation to finish joining the office.'
              : 'Use the recovery link from your email, then create a password for this staff account.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {complete ? (
            <Button className="w-full" onClick={() => navigate(nextPath, { replace: true })}>
              Continue to invitation
            </Button>
          ) : user ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  minLength={8}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={event => setConfirmPassword(event.target.value)}
                  minLength={8}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update password
              </Button>
            </form>
          ) : (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                This recovery link is missing, expired, or has already been used. Return to the invitation and request another reset email.
              </p>
              <Button variant="outline" className="w-full" onClick={() => navigate(nextPath, { replace: true })}>
                Return to invitation
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
