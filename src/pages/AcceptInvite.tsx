import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Clock, Loader2, Mail, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { classifyInviteSignUp, inviteAcceptancePath } from '@/lib/invite-auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { memberRoleLabel } from '@/lib/roles';

type Step = 'loading' | 'signup' | 'accepting' | 'success' | 'error';
type AccountState = 'unknown' | 'existing' | 'confirmation_requested';

interface InviteRecord {
  email: string;
  role: string;
  invited_name?: string | null;
  expires_at: string;
  accepted_at?: string | null;
  orgs?: { name?: string | null } | null;
}

const normalizeEmail = (value?: string | null) => value?.trim().toLowerCase() || '';

const canonicalEmail = (value?: string | null) => {
  const normalized = normalizeEmail(value);
  const [local, domain] = normalized.split('@');
  if (!local || !domain) return normalized;
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return `${local.split('+')[0].replace(/\./g, '')}@gmail.com`;
  }
  return normalized;
};

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export default function AcceptInvite() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('loading');
  const [invite, setInvite] = useState<InviteRecord | null>(null);
  const [orgName, setOrgName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetSending, setResetSending] = useState(false);
  const [accountState, setAccountState] = useState<AccountState>('unknown');
  const acceptStartedRef = useRef(false);

  const acceptancePath = token ? inviteAcceptancePath(token) : '/accept-invite';
  const emailRedirectTo = `${window.location.origin}${acceptancePath}`;

  const acceptInvite = useCallback(async () => {
    if (!token || acceptStartedRef.current) return;

    acceptStartedRef.current = true;
    setStep('accepting');
    try {
      const { data, error } = await supabase.functions.invoke('accept-invite', {
        body: { token },
      });
      if (error) {
        const details = 'context' in error ? await error.context.text() : '';
        let parsed: { error?: string; code?: string; signedInEmail?: string; inviteEmail?: string } | null = null;
        try {
          parsed = details ? JSON.parse(details) : null;
        } catch {
          parsed = null;
        }
        if (parsed?.code === 'email_mismatch' && parsed.signedInEmail && parsed.inviteEmail) {
          throw new Error(`You're signed in as ${parsed.signedInEmail} but this invite is for ${parsed.inviteEmail}. Please sign out first.`);
        }
        throw new Error(parsed?.error || error.message);
      }
      if (data?.error) throw new Error(data.error);

      // Re-run the normal allowlist evaluation now that accept-invite has
      // activated this email and created the office membership.
      await supabase.auth.refreshSession();
      setStep('success');
    } catch (error: unknown) {
      acceptStartedRef.current = false;
      setErrorMsg(errorMessage(error, 'Failed to accept invite'));
      setStep('error');
    }
  }, [token]);

  // Lookup is token-driven only. Auth changes never start a second request,
  // so a stale request cannot push the page back to a permanent spinner.
  useEffect(() => {
    let cancelled = false;
    acceptStartedRef.current = false;
    setInvite(null);
    setErrorMsg('');
    setAccountState('unknown');
    setStep('loading');

    if (!token) {
      setErrorMsg('No invite token provided.');
      setStep('error');
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('accept-invite', {
          body: { token, lookup: true },
        });
        if (cancelled) return;

        const inv = data?.invite as InviteRecord | undefined;
        if (error || !inv) {
          setErrorMsg('Invite not found or already used.');
          setStep('error');
          return;
        }
        if (new Date(inv.expires_at) < new Date()) {
          setErrorMsg('This invite has expired.');
          setStep('error');
          return;
        }
        if (inv.accepted_at) {
          setErrorMsg('This invite has already been accepted.');
          setStep('error');
          return;
        }

        setInvite(inv);
        setEmail(inv.email);
        setFullName(inv.invited_name?.trim() || '');
        setOrgName(inv.orgs?.name?.trim() || 'Organization');
      } catch {
        if (cancelled) return;
        setErrorMsg('The invitation could not be loaded. Please try the link again.');
        setStep('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  // Once both invite lookup and auth evaluation settle, either accept the
  // token-backed invite or show the account forms. The auth provider retains
  // a not-yet-allowlisted session only on this route long enough to finish.
  useEffect(() => {
    if (!invite || authLoading) return;

    if (user && canonicalEmail(user.email) === canonicalEmail(invite.email)) {
      void acceptInvite();
      return;
    }

    if (user) {
      setErrorMsg(`You're signed in as ${user.email} but this invite is for ${invite.email}. Please sign out first.`);
      setStep('error');
      return;
    }

    setStep('signup');
  }, [acceptInvite, authLoading, invite, user]);

  const handleSignUp = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: newPassword,
        options: {
          data: { full_name: fullName },
          emailRedirectTo,
        },
      });
      if (error) {
        if (/already registered|already exists|user.*exists/i.test(error.message)) {
          setAccountState('existing');
          setNewPassword('');
          toast({
            title: 'Account already exists',
            description: 'Sign in below or reset the password for this email.',
          });
          return;
        }
        throw error;
      }

      const outcome = classifyInviteSignUp(data.user, Boolean(data.session));
      if (outcome === 'existing_account') {
        setAccountState('existing');
        setNewPassword('');
        toast({
          title: 'Account already exists',
          description: 'Sign in below or reset the password for this email.',
        });
      } else if (outcome === 'signed_in') {
        await acceptInvite();
      } else {
        setAccountState('confirmation_requested');
        toast({
          title: 'Confirmation requested',
          description: `Open the email sent to ${email}, then this invitation will continue automatically.`,
        });
      }
    } catch (error: unknown) {
      toast({
        title: 'Sign up failed',
        description: errorMessage(error, 'The account could not be created.'),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: signInPassword,
      });
      if (error) throw error;

      // Do not wait for the global allowlist check. This token-backed function
      // activates the invited email, then refreshSession re-runs that check.
      await acceptInvite();
    } catch (error: unknown) {
      toast({
        title: 'Sign in failed',
        description: errorMessage(error, 'The account could not be signed in.'),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!token) return;
    setResetSending(true);
    try {
      const next = inviteAcceptancePath(token);
      const redirect = new URL('/reset-password', window.location.origin);
      redirect.searchParams.set('next', next);
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirect.toString(),
      });
      if (error) throw error;
      setAccountState('existing');
      toast({
        title: 'Password reset requested',
        description: `Open the reset link sent to ${email}.`,
      });
    } catch (error: unknown) {
      toast({
        title: 'Reset email failed',
        description: errorMessage(error, 'The reset email could not be requested.'),
        variant: 'destructive',
      });
    } finally {
      setResetSending(false);
    }
  };

  const handleResendConfirmation = async () => {
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo },
      });
      if (error) throw error;
      toast({
        title: 'Confirmation requested again',
        description: `Check ${email}, including spam or junk.`,
      });
    } catch (error: unknown) {
      toast({
        title: 'Confirmation email failed',
        description: errorMessage(error, 'The confirmation email could not be requested.'),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 'loading' || step === 'accepting') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="space-y-3 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">
            {step === 'accepting' ? 'Joining organization...' : 'Loading invite...'}
          </p>
        </div>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="card-elevated w-full max-w-md">
          <CardContent className="space-y-4 pt-8 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
            <h2 className="text-xl font-bold">Welcome to {orgName}!</h2>
            <p className="text-muted-foreground">You've successfully joined the organization.</p>
            <Button onClick={() => navigate('/')} className="w-full">Go to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="card-elevated w-full max-w-md">
          <CardContent className="space-y-4 pt-8 text-center">
            <XCircle className="mx-auto h-12 w-12 text-destructive" />
            <h2 className="text-xl font-bold">Invite Error</h2>
            <p className="text-muted-foreground">{errorMsg}</p>
            <Link to="/auth"><Button variant="outline" className="w-full">Go to Sign In</Button></Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="card-elevated w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary">
            <Clock className="h-7 w-7 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Join {orgName}</CardTitle>
          <CardDescription>
            You've been invited as <strong>{memberRoleLabel(invite?.role)}</strong>. Create an account or sign in to accept.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {accountState === 'existing' && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
              <div className="flex gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold">This email already has a Purple Envelope account</p>
                  <p className="text-sm text-muted-foreground">
                    Sign in with the existing password below, or request a reset link. A new confirmation email is not needed.
                  </p>
                </div>
              </div>
            </div>
          )}

          {accountState === 'confirmation_requested' && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
              <div className="flex gap-3">
                <Mail className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold">Confirmation requested</p>
                    <p className="text-sm text-muted-foreground">
                      Open the confirmation link sent to {email}. It returns to this invitation automatically.
                    </p>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={handleResendConfirmation} disabled={submitting}>
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Resend confirmation
                  </Button>
                </div>
              </div>
            </div>
          )}

          {accountState !== 'existing' && accountState !== 'confirmation_requested' && (
            <form onSubmit={handleSignUp} className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Create Account</h3>
              <div className="space-y-2">
                <Label htmlFor="invite-full-name">Full Name</Label>
                <Input
                  id="invite-full-name"
                  value={fullName}
                  onChange={event => setFullName(event.target.value)}
                  placeholder="Jane Smith"
                  autoComplete="name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email</Label>
                <Input id="invite-email" type="email" value={email} disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-new-password">Create Password</Label>
                <Input
                  id="invite-new-password"
                  type="password"
                  value={newPassword}
                  onChange={event => setNewPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign Up & Join
              </Button>
            </form>
          )}

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Already registered?</span>
            </div>
          </div>

          <form onSubmit={handleSignIn} className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Sign In & Join</h3>
            <div className="space-y-2">
              <Label htmlFor="invite-sign-in-email">Email</Label>
              <Input id="invite-sign-in-email" type="email" value={email} disabled className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-existing-password">Existing Password</Label>
              <Input
                id="invite-existing-password"
                type="password"
                value={signInPassword}
                onChange={event => setSignInPassword(event.target.value)}
                placeholder="Your existing password"
                autoComplete="current-password"
                minLength={6}
                required
              />
            </div>
            <Button type="submit" variant="outline" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In & Join
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={handleResetPassword}
              disabled={resetSending}
            >
              {resetSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Forgot password? Send reset link
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
