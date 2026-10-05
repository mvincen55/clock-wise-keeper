import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, KeyRound, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { MIN_PASSWORD_LENGTH, needsPasswordChange, passwordChangedMetadata, passwordProblem } from '@/lib/password-change';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

/**
 * Where a login that was set up with a temporary password lands on its first
 * sign-in (PasswordGate), and where anyone signed in can change their password.
 * Saving writes the new password and clears `must_change_password` in the same
 * request, so the gate lifts as soon as the session refreshes.
 */
export default function ChoosePassword() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const firstTime = needsPasswordChange(user);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const problem = passwordProblem(password, confirmPassword);
    if (problem) {
      toast({ title: 'Check the password', description: problem, variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password, data: passwordChangedMetadata() });
      if (error) throw error;
      setComplete(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Password could not be saved.';
      toast({ title: 'Password not saved', description: message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md card-elevated">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary">
            {complete
              ? <CheckCircle2 className="h-7 w-7 text-primary-foreground" />
              : <KeyRound className="h-7 w-7 text-primary-foreground" />}
          </div>
          <CardTitle>{complete ? 'Password saved' : firstTime ? 'Choose your password' : 'Change your password'}</CardTitle>
          <CardDescription>
            {complete
              ? 'Use it from now on. The temporary password no longer works.'
              : firstTime
                ? `Your office set this account up with a temporary password. Pick one only you know, at least ${MIN_PASSWORD_LENGTH} characters.`
                : `Pick a new password of at least ${MIN_PASSWORD_LENGTH} characters.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {complete ? (
            <Button className="w-full" onClick={() => navigate('/', { replace: true })}>
              Open the office
            </Button>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-center text-sm text-muted-foreground">Signed in as {user?.email ?? 'your account'}</p>
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  minLength={MIN_PASSWORD_LENGTH}
                  required
                  autoFocus
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
                  minLength={MIN_PASSWORD_LENGTH}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save password
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => { void signOut(); }}>
                Not you? Sign out
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
