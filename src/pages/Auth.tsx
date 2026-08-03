import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Mail, ShieldAlert } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

function safeNext(raw: string | null): string {
  if (!raw) return '/';
  // Only allow same-origin relative paths.
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

export default function Auth() {
  const { user, loading, isAllowed, signIn } = useAuth();
  const [params] = useSearchParams();
  const nextPath = safeNext(params.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [denied, setDenied] = useState(false);
  const { toast } = useToast();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user && isAllowed) return <Navigate to={nextPath} replace />;


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setDenied(false);

    const { error } = await signIn(email, password);
    if (error) {
      if (error.message === 'Access denied.') {
        setDenied(true);
      } else {
        toast({ title: 'Sign in failed', description: error.message, variant: 'destructive' });
      }
    }
    setSubmitting(false);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md card-elevated">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary">
            <Mail className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-semibold leading-none tracking-tight">Welcome back</h1>
          <CardDescription>Sign in to your office on Purple Envelope</CardDescription>
        </CardHeader>
        <CardContent>
          {denied && (
            <div className="mb-4 flex items-center gap-3 rounded-lg bg-destructive/10 border border-destructive/30 p-3">
              <ShieldAlert className="h-5 w-5 text-destructive shrink-0" />
              <p className="text-sm text-destructive font-medium">Access denied. This app is restricted.</p>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" minLength={6} required />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        Only your business, never your patients ·{' '}
        <Link to="/privacy" className="underline hover:text-foreground">Privacy &amp; Terms</Link>
      </p>
    </div>
  );
}
