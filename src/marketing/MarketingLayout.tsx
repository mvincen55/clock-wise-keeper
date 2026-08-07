import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { Wordmark, Shell } from './primitives';
import { Menu, X } from 'lucide-react';

const NAV = [
  { to: '/features', label: 'Features' },
  { to: '/for-dental', label: 'For Dental Practices' },
  { to: '/security', label: 'Security' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/about', label: 'About' },
];

/** Signed-in members go straight to training; everyone else through login. */
export function useTrainingHref(): string {
  const { user, isAllowed } = useAuth();
  return user && isAllowed ? '/training' : '/login?next=%2Ftraining';
}

export default function MarketingLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const trainingHref = useTrainingHref();
  const { user, isAllowed } = useAuth();

  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const navLink = (to: string, label: string) => (
    <Link
      key={to + label}
      to={to}
      className={cn(
        'pe-focus font-mono text-[10.5px] uppercase tracking-[0.18em] transition-colors',
        location.pathname === to ? 'text-plum' : 'text-ink-soft hover:text-ink',
      )}
    >
      {label}
    </Link>
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-paper font-sans text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-plum focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b-2 border-ink bg-paper">
        <Shell className="flex h-16 items-center justify-between gap-6">
          <Link to="/" aria-label="Purple Envelope home" className="pe-focus shrink-0">
            <Wordmark />
          </Link>

          <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary">
            {NAV.map((n) => navLink(n.to, n.label))}
            {navLink(trainingHref, 'Training')}
          </nav>

          <div className="hidden items-center gap-0 lg:flex">
            {user && isAllowed ? (
              <Link
                to="/"
                className="pe-focus bg-plum px-5 py-2.5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-white transition-colors hover:bg-plum-deep"
              >
                Open your office
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="pe-focus border-y border-l border-ink px-4 py-2.5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink transition-colors hover:bg-ink hover:text-paper"
                >
                  Log in
                </Link>
                <Link
                  to="/start"
                  className="pe-focus bg-plum px-4 py-2.5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-white transition-colors hover:bg-plum-deep"
                >
                  Request access
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="pe-focus grid h-10 w-10 place-items-center border border-ink text-ink lg:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </Shell>
      </header>

      {open && (
        <div className="fixed inset-0 top-16 z-40 overflow-y-auto bg-paper lg:hidden">
          <Shell className="flex flex-col py-4">
            {[...NAV, { to: trainingHref, label: 'Training' }].map((n, i) => (
              <Link
                key={n.label}
                to={n.to}
                style={{ animationDelay: `${i * 30}ms` }}
                className="animate-pe-fade-up pe-row flex items-baseline gap-4 py-4"
              >
                <span className="font-mono text-[10px] text-plum">{String(i + 1).padStart(2, '0')}</span>
                <span className="pe-display text-[1.6rem] text-ink">{n.label}</span>
              </Link>
            ))}
            <div className="mt-6 flex flex-col">
              {user && isAllowed ? (
                <Link
                  to="/"
                  className="bg-plum px-5 py-4 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-white"
                >
                  Open your office
                </Link>
              ) : (
                <>
                  <Link
                    to="/start"
                    className="bg-plum px-5 py-4 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-white"
                  >
                    Request access
                  </Link>
                  <Link
                    to="/login"
                    className="border-x border-b border-ink px-5 py-4 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-ink"
                  >
                    Log in
                  </Link>
                </>
              )}
            </div>
          </Shell>
        </div>
      )}

      <main id="main">{children}</main>

      <footer className="border-t-2 border-ink bg-paper">
        <Shell className="grid gap-10 py-14 md:grid-cols-[1.6fr_1fr_1fr]">
          <div>
            <Wordmark />
            <p className="mt-5 max-w-xs text-[13.5px] leading-relaxed text-ink-soft">
              Practice operations for independent dental offices. Built inside a working private practice. Not for
              DSOs.
            </p>
            <p className="pe-display mt-6 max-w-[14ch] text-[1.5rem] text-plum">
              Only your business, never your patients.
            </p>
          </div>
          <nav aria-label="Product" className="text-[13.5px]">
            <p className="pe-row-heavy pt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft">Product</p>
            <ul className="mt-3 space-y-2.5">
              {NAV.map((n) => (
                <li key={n.to}>
                  <Link to={n.to} className="pe-focus text-ink-soft transition-colors hover:text-plum">
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Access" className="text-[13.5px]">
            <p className="pe-row-heavy pt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft">Access</p>
            <ul className="mt-3 space-y-2.5">
              <li>
                <Link to="/login" className="pe-focus text-ink-soft transition-colors hover:text-plum">
                  Log in
                </Link>
              </li>
              <li>
                <Link to={trainingHref} className="pe-focus text-ink-soft transition-colors hover:text-plum">
                  Training
                </Link>
              </li>
              <li>
                <Link to="/start" className="pe-focus text-ink-soft transition-colors hover:text-plum">
                  Request access
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="pe-focus text-ink-soft transition-colors hover:text-plum">
                  Privacy &amp; Terms
                </Link>
              </li>
            </ul>
          </nav>
        </Shell>
        <div className="border-t border-ink/15">
          <Shell className="flex flex-col gap-2 py-5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-soft sm:flex-row sm:items-center sm:justify-between">
            <span>© {new Date().getFullYear()} Purple Envelope</span>
            <span className="normal-case tracking-normal">
              Not a patient-record system. Not a replacement for your practice management software.
            </span>
          </Shell>
        </div>
      </footer>
    </div>
  );
}
