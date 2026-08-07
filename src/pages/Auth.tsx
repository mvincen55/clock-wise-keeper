import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, ShieldAlert, ArrowLeft, MailCheck } from 'lucide-react';
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
 * allowlist gate, same ?next= return destination. Forgot-password uses the
 * existing Supabase recovery email, which is delivered by the project's own
 * auth-email-hook and lands on the existing /reset-password page.
 */
export default function Auth() {
  const { user, loading, isAllowed, signIn } = useAuth();
  const [params] = useSearchParams();
  const nextPath = safeNext(params.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [denied, setDenied] = useState(false);
  const [mode, setMode] = useState<'signin' | 'forgot'>('signin');
  const [resetSent, setResetSent] = useState(false);
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

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    // Deliberately does not reveal whether the address has an account.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password?next=${encodeURIComponent(nextPath)}`,
    });
    if (error && error.status !== 400) {
      toast({
        title: 'Could not send the email',
        description: 'Please try again in a moment.',
        variant: 'destructive',
      });
    } else {
      setResetSent(true);
    }
    setSubmitting(false);
  };

  const fieldClass =
    'w-full border border-line bg-white px-3.5 py-3 text-[14.5px] text-ink outline-none transition-colors focus:border-plum';
  const buttonClass =
    'inline-flex min-h-[50px] w-full items-center justify-center gap-2 border border-plum bg-plum px-6 py-3.5 text-[14.5px] font-medium text-white transition-colors hover:bg-plum-deep disabled:opacity-60';

  return (
    <div className="grid min-h-screen bg-paper font-sans text-ink lg:grid-cols-[1fr_1.05fr]">
      {/* Form side */}
      <div className="flex flex-col px-5 py-7 sm:px-10 sm:py-8">
        <div className="flex items-center justify-between gap-4">
          <Link to="/" aria-label="Purple Envelope home">
            <Wordmark />
          </Link>
          <Link
            to="/"
            className="inline-flex min-h-[44px] items-center gap-1.5 text-[13px] text-ink-soft transition-colors hover:text-plum"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to site
          </Link>
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10 sm:py-14">
          <span className="h-px w-10 bg-plum" aria-hidden />

          {mode === 'signin' ? (
            <>
              <h1 className="mt-6 font-display text-[clamp(1.75rem,6vw,2rem)] font-medium leading-tight tracking-[-0.02em] text-ink">
                Sign in to your office
              </h1>
              <p className="mt-2 text-[14.5px] leading-relaxed text-ink-soft">
                {returningToTraining
                  ? 'Training uses the same Purple Envelope account you use at work. Sign in and we’ll take you straight there.'
                  : 'Use the account your office set up for you.'}
              </p>

              {denied && (
                <div className="mt-6 flex items-start gap-3 border-l-2 border-destructive bg-destructive/10 p-3">
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
                    className={fieldClass}
                  />
                </label>
                <label className="block">
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="text-[12.5px] font-medium text-ink">Password</span>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('forgot');
                        setResetSent(false);
                      }}
                      className="text-[12.5px] text-plum underline underline-offset-4"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    minLength={6}
                    required
                    className={fieldClass}
                  />
                </label>
                <button type="submit" disabled={submitting} className={buttonClass}>
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Sign in
                </button>
              </form>

              <p className="mt-6 border-t border-line pt-5 text-[13px] leading-relaxed text-ink-soft">
                No account yet? Joining an office is by invitation — your owner or office manager can send or resend
                one to your work email.
              </p>
            </>
          ) : resetSent ? (
            <>
              <div className="mt-6 flex items-start gap-3 border-l-2 border-plum bg-plum-tint/60 p-4">
                <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-plum" />
                <p className="text-[13.5px] leading-relaxed text-ink">
                  If <span className="font-medium">{email}</span> has a Purple Envelope account, a password reset link
                  is on its way. The link opens a page where you choose a new password. It expires, so use it soon.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setResetSent(false);
                }}
                className="mt-6 inline-flex min-h-[48px] items-center justify-center border border-ink/25 px-6 py-3 text-[14px] font-medium text-ink transition-colors hover:border-plum hover:text-plum"
              >
                Back to sign in
              </button>
            </>
          ) : (
            <>
              <h1 className="mt-6 font-display text-[clamp(1.75rem,6vw,2rem)] font-medium leading-tight tracking-[-0.02em] text-ink">
                Reset your password
              </h1>
              <p className="mt-2 text-[14.5px] leading-relaxed text-ink-soft">
                Enter the email your office uses for you. We’ll send a link that lets you set a new password.
              </p>
              <form onSubmit={handleReset} className="mt-8 space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-[12.5px] font-medium text-ink">Email</span>
                  <input
                    id="reset-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@yourpractice.com"
                    required
                    className={fieldClass}
                  />
                </label>
                <button type="submit" disabled={submitting} className={buttonClass}>
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Send reset link
                </button>
              </form>
              <button
                type="button"
                onClick={() => setMode('signin')}
                className="mt-5 self-start text-[13px] text-ink-soft underline underline-offset-4 hover:text-plum"
              >
                Back to sign in
              </button>
            </>
          )}
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
        <div className="pe-grid-dark pointer-events-none absolute inset-0" aria-hidden />
        <div />
        <div className="relative max-w-md border-l-2 border-paper/30 pl-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-paper/50">Purple Envelope</p>
          <p className="mt-6 font-display text-[2.4rem] font-medium leading-[1.02] tracking-[-0.02em]">
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
