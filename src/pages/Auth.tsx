import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, ShieldAlert, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Wordmark } from '@/marketing/primitives';

function safeNext(raw: string | null): string {
  if (!raw) return '/';
  // Only allow same-origin relative paths.
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

/**
 * The one Purple Envelope sign-in surface, served at both /login and /auth.
 * Auth behaviour is unchanged — same password sign-in, same server-side
 * allowlist gate, same ?next= return destination. Only the presentation is
 * part of the public brand.
 */
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
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <Loader2 className="h-8 w-8 animate-spin text-plum" />
      </div>
    );
  }

  if (user && isAllowed) return <Navigate to={nextPath} replace />;

  const returningToTraining = nextPath.startsWith('/training');

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
    <div className="grid min-h-screen bg-paper font-sans text-ink lg:grid-cols-[1fr_1.05fr]">
      {/* Form side */}
      <div className="flex flex-col px-5 py-8 sm:px-10">
        <div className="flex items-center justify-between">
          <Link to="/" aria-label="Purple Envelope home">
            <Wordmark />
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-[13px] text-ink-soft transition-colors hover:text-plum"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to site
          </Link>
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-14">
          <h1 className="font-display text-[2rem] font-medium leading-tight tracking-[-0.02em] text-ink">
            Sign in to your office
          </h1>
          <p className="mt-2 text-[14.5px] leading-relaxed text-ink-soft">
            {returningToTraining
              ? 'Training uses the same Purple Envelope account you use at work. Sign in and we’ll take you straight there.'
              : 'Use the account your office set up for you.'}
          </p>

          {denied && (
            <div className="mt-6 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <p className="text-[13px] font-medium text-destructive">
                Access denied. This account isn’t part of an office yet — ask your owner or manager to send you an
                invitation.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-medium text-ink">Email</span>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@yourpractice.com"
                required
                className="w-full rounded-lg border border-line bg-white px-3.5 py-3 text-[14.5px] text-ink outline-none transition-colors focus:border-plum"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-medium text-ink">Password</span>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                minLength={6}
                required
                className="w-full rounded-lg border border-line bg-white px-3.5 py-3 text-[14.5px] text-ink outline-none transition-colors focus:border-plum"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-plum px-6 py-3.5 text-[14.5px] font-medium text-white transition-colors hover:bg-plum-deep disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign in
            </button>
          </form>

          <p className="mt-6 text-[13px] leading-relaxed text-ink-soft">
            Trouble signing in? Your owner or office manager can resend your invitation or reset your access.
          </p>
        </div>

        <p className="text-[12px] text-ink-soft">
          Only your business, never your patients ·{' '}
          <Link to="/privacy" className="underline underline-offset-4 hover:text-plum">
            Privacy &amp; Terms
          </Link>
        </p>
      </div>

      {/* Brand side */}
      <div className="relative hidden overflow-hidden bg-plum-deep p-12 text-paper lg:flex lg:flex-col lg:justify-between">
        <div className="pe-grain pointer-events-none absolute inset-0 opacity-[0.15]" aria-hidden />
        <div />
        <div className="relative max-w-md">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-paper/50">Purple Envelope</p>
          <p className="mt-6 font-display text-[2.4rem] font-medium leading-[1.05] tracking-[-0.02em]">
            Run the office. Without living at the office.
          </p>
          <p className="mt-6 text-[15px] leading-relaxed text-paper/65">
            Practice operations for independent dental offices: daily workflows, training, office knowledge, requests
            and accountability in one place.
          </p>
        </div>
        <p className="relative font-display text-[15px] text-paper/60">Only your business, never your patients.</p>
      </div>
    </div>
  );
}
