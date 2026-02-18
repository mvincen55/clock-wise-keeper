import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Clock, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type Step = 'loading' | 'signup' | 'accepting' | 'success' | 'error';

export default function AcceptInvite() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('loading');
  const [invite, setInvite] = useState<any>(null);
  const [orgName, setOrgName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Step 1: Load invite details
  useEffect(() => {
    if (!token) {
      setErrorMsg('No invite token provided.');
      setStep('error');
      return;
    }
    (async () => {
      const { data: inv } = await supabase
        .from('org_invites')
        .select('*, orgs:org_id(name)')
        .eq('token', token)
        .maybeSingle();

      if (!inv) {
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
      setOrgName((inv as any).orgs?.name || 'Organization');

      // If user is already logged in, go straight to accept
      if (user && user.email?.toLowerCase() === inv.email.toLowerCase()) {
        acceptInvite();
      } else if (user) {
        setErrorMsg(`You're signed in as ${user.email} but this invite is for ${inv.email}. Please sign out first.`);
        setStep('error');
      } else {
        setStep('signup');
      }
    })();
  }, [token]);

  // If user logs in after signup, auto-accept
  useEffect(() => {
    if (user && invite && step === 'signup') {
      acceptInvite();
    }
  }, [user, invite]);

  const acceptInvite = async () => {
    setStep('accepting');
    try {
      const { data, error } = await supabase.functions.invoke('accept-invite', {
        body: { token },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setStep('success');
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to accept invite');
      setStep('error');
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) throw error;
      toast({
        title: 'Check your email',
        description: 'Click the confirmation link then return here.',
      });
    } catch (e: any) {
      toast({ title: 'Sign up failed', description: e.message, variant: 'destructive' });
    }
    setSubmitting(false);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // useEffect will auto-accept
    } catch (e: any) {
      toast({ title: 'Sign in failed', description: e.message, variant: 'destructive' });
    }
    setSubmitting(false);
  };

  if (step === 'loading' || step === 'accepting') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">{step === 'accepting' ? 'Joining organization...' : 'Loading invite...'}</p>
        </div>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md card-elevated">
          <CardContent className="pt-8 text-center space-y-4">
            <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
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
        <Card className="w-full max-w-md card-elevated">
          <CardContent className="pt-8 text-center space-y-4">
            <XCircle className="h-12 w-12 text-destructive mx-auto" />
            <h2 className="text-xl font-bold">Invite Error</h2>
            <p className="text-muted-foreground">{errorMsg}</p>
            <Link to="/auth"><Button variant="outline" className="w-full">Go to Sign In</Button></Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // signup step
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md card-elevated">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary">
            <Clock className="h-7 w-7 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Join {orgName}</CardTitle>
          <CardDescription>You've been invited as <strong>{invite?.role}</strong>. Create an account or sign in to accept.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Sign Up form */}
          <form onSubmit={handleSignUp} className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Create Account</h3>
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jane Smith" required />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={email} disabled className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 6 characters" minLength={6} required />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign Up & Join
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">or</span></div>
          </div>

          <form onSubmit={handleSignIn} className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Already have an account?</h3>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password" minLength={6} required />
            </div>
            <Button type="submit" variant="outline" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In & Join
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
