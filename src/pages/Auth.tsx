import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, ShieldAlert, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { EnvelopeMark } from '@/marketing/EnvelopeMark';

function safeNext(raw: string | null): string {
  if (!raw) return '/';
  // Only allow same-origin relative paths.
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

const FIELD =
  'pe-focus w-full rounded-none border border-ink/25 bg-white px-3.5 py-3 text-[15px] text-ink outline-none transition-colors focus:border-plum';
const LABEL = 'mb-2 block font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft';

/**
 * The one Purple Envelope sign-in surface, served at both /login and /auth.
 * Auth behaviour is unchanged — same password sign-in, same server-side
 * allowlist gate, same ?next= return destination — plus the real Supabase
 * password-recovery flow that lands on /reset-password.
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
  const [resetting, setResetting] = useState(false);
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
    setResetting(true);
    const redirectTo = `${window.location.origin}/reset-password?next=${encodeURIComponent(nextPath)}`;
    // Deliberately generic response — never confirm whether an account exists.
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo }).catch(() => undefined);
    setResetting(false);
    setResetSent(true);
  };

  return (
    <div className="grid min-h-screen bg-paper font-sans text-ink lg:grid-cols-[1fr_1fr]">
      {/* ── Brand field ───────────────────────────────────────── */}
      <div className="relative order-1 flex flex-col justify-between overflow-hidden bg-plum p-6 text-paper sm:p-10 lg:order-none lg:p-12">
        <div className="pe-blueprint-invert pointer-events-none absolute inset-0 opacity-70" aria-hidden />
        <Link to="/" aria-label="Purple Envelope home" className="pe-focus relative inline-flex items-center gap-2.5">
          <EnvelopeMark stroke={5} className="h-[22px] w-[31px] text-paper" />
          <span className="font-display text-[13px] font-extrabold uppercase tracking-[0.12em] text-paper">
            Purple Envelope
          </span>
        </Link>

        <div className="relative my-10 lg:my-0">
          <EnvelopeMark stroke={2} className="hidden h-auto w-full max-w-[22rem] text-paper/80 lg:block" />
          <p className="pe-display mt-0 text-[clamp(1.9rem,5vw,3.4rem)] text-paper lg:mt-12">
            For independent dental offices.
          </p>
          <p className="mt-5 max-w-[42ch] text-[15px] leading-relaxed text-paper/70">
            Daily workflows, training, office knowledge, requests and accountability — one account for the whole
            office.
          </p>
        </div>

        <p className="relative font-mono text-[10.5px] uppercase tracking-[0.2em] text-paper/55">
          Practice guidance, not patient records
        </p>
      </div>

      {/* ── Form ──────────────────────────────────────────────── */}
      <div className="order-2 flex flex-col px-5 py-8 sm:px-10 lg:order-none">
        <div className="flex items-center justify-end">
          <Link
            to="/"
            className="pe-focus inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft transition-colors hover:text-plum"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to site
          </Link>
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          {mode === 'signin' ? (
            <>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-plum">Sign in</p>
              <h1 className="pe-display mt-4 text-[clamp(1.9rem,5vw,2.6rem)] text-ink">Open your office</h1>
              <p className="mt-4 text-[14.5px] leading-relaxed text-ink-soft">
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

              <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                <label className="block">
                  <span className={LABEL}>Email</span>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@yourpractice.com"
                    required
                    className={FIELD}
                  />
                </label>
                <label className="block">
                  <span className={LABEL}>Password</span>
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    minLength={6}
                    required
                    className={FIELD}
                  />
                </label>
                <button
                  type="submit"
                  disabled={submitting}
                  className="pe-focus inline-flex w-full items-center justify-center gap-2 rounded-none bg-plum px-6 py-4 font-mono text-[11px] uppercase tracking-[0.18em] text-white transition-colors hover:bg-plum-deep disabled:opacity-60"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Sign in
                </button>
              </form>

              <button
                type="button"
                onClick={() => {
                  setMode('forgot');
                  setResetSent(false);
                }}
                className="pe-focus mt-6 self-start border-b border-plum pb-0.5 text-left font-mono text-[10.5px] uppercase tracking-[0.16em] text-plum"
              >
                Forgot password?
              </button>

              <p className="mt-8 border-t border-ink/15 pt-5 text-[13px] leading-relaxed text-ink-soft">
                Purple Envelope is invitation-only. If you don’t have an account yet, an owner or office manager can
                send or resend your invitation.
              </p>
            </>
          ) : (
            <>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-plum">Password reset</p>
              <h1 className="pe-display mt-4 text-[clamp(1.9rem,5vw,2.6rem)] text-ink">Reset your password</h1>

              {resetSent ? (
                <>
                  <p className="mt-5 border-l-2 border-plum bg-plum-tint/60 p-4 text-[14px] leading-relaxed text-ink">
                    If that email belongs to a Purple Envelope account, a reset link is on its way. The link opens a
                    page where you choose a new password.
                  </p>
                  <button
                    type="button"
                    onClick={() => setMode('signin')}
                    className="pe-focus mt-7 w-full rounded-none border border-ink px-6 py-4 font-mono text-[11px] uppercase tracking-[0.18em] text-ink transition-colors hover:bg-ink hover:text-paper"
                  >
                    Back to sign in
                  </button>
                </>
              ) : (
                <>
                  <p className="mt-4 text-[14.5px] leading-relaxed text-ink-soft">
                    Enter the email your office uses for you. We’ll send a link to set a new password.
                  </p>
                  <form onSubmit={handleReset} className="mt-8 space-y-5">
                    <label className="block">
                      <span className={LABEL}>Email</span>
                      <input
                        id="reset-email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@yourpractice.com"
                        required
                        className={FIELD}
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={resetting}
                      className="pe-focus inline-flex w-full items-center justify-center gap-2 rounded-none bg-plum px-6 py-4 font-mono text-[11px] uppercase tracking-[0.18em] text-white transition-colors hover:bg-plum-deep disabled:opacity-60"
                    >
                      {resetting && <Loader2 className="h-4 w-4 animate-spin" />}
                      Send reset link
                    </button>
                  </form>
                  <button
                    type="button"
                    onClick={() => setMode('signin')}
                    className="pe-focus mt-6 self-start border-b border-ink/30 pb-0.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-soft"
                  >
                    Back to sign in
                  </button>
                </>
              )}
            </>
          )}
        </div>

        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
          <Link to="/privacy" className="pe-focus underline underline-offset-4 hover:text-plum">
            Privacy &amp; Terms
          </Link>
        </p>
      </div>
    </div>
  );
}
