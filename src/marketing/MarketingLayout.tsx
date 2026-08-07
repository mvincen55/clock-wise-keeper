import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { Wordmark, Shell } from './primitives';
import { Menu, X, ArrowRight } from 'lucide-react';

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
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const trainingHref = useTrainingHref();
  const { user, isAllowed } = useAuth();

  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <div className="min-h-screen bg-paper font-sans text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-plum focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      <header
        className={cn(
          'sticky top-0 z-40 border-b transition-colors duration-300',
          scrolled ? 'border-line bg-paper/90 backdrop-blur-md' : 'border-transparent bg-paper',
        )}
      >
        <Shell className="flex h-[68px] items-center justify-between gap-6">
          <Link to="/" aria-label="Purple Envelope home" className="shrink-0">
            <Wordmark />
          </Link>

          <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  'relative text-[13.5px] text-ink-soft transition-colors hover:text-ink',
                  location.pathname === n.to && 'text-ink',
                )}
              >
                {n.label}
                {location.pathname === n.to && (
                  <span className="absolute -bottom-1.5 left-0 h-px w-full bg-plum" />
                )}
              </Link>
            ))}
            <Link to={trainingHref} className="text-[13.5px] text-ink-soft transition-colors hover:text-ink">
              Training
            </Link>
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            {user && isAllowed ? (
              <Link
                to="/"
                className="rounded-full bg-plum px-4 py-2 text-[13.5px] font-medium text-white transition-colors hover:bg-plum-deep"
              >
                Open your office
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-full border border-line px-4 py-2 text-[13.5px] text-ink transition-colors hover:border-plum/40 hover:text-plum"
                >
                  Log in
                </Link>
                <Link
                  to="/start"
                  className="group inline-flex items-center gap-1.5 rounded-full bg-plum px-4 py-2 text-[13.5px] font-medium text-white transition-colors hover:bg-plum-deep"
                >
                  Start Purple Envelope
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="grid h-10 w-10 place-items-center rounded-lg border border-line text-ink lg:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </Shell>
      </header>

      {open && (
        <div className="fixed inset-0 top-[68px] z-40 overflow-y-auto bg-paper lg:hidden">
          <Shell className="flex flex-col py-6">
            {[...NAV, { to: trainingHref, label: 'Training' }].map((n, i) => (
              <Link
                key={n.label}
                to={n.to}
                style={{ animationDelay: `${i * 35}ms` }}
                className="animate-pe-fade-up border-b border-line py-4 font-display text-xl text-ink"
              >
                {n.label}
              </Link>
            ))}
            <div className="mt-6 flex flex-col gap-3">
              {user && isAllowed ? (
                <Link to="/" className="rounded-full bg-plum px-5 py-3.5 text-center font-medium text-white">
                  Open your office
                </Link>
              ) : (
                <>
                  <Link to="/start" className="rounded-full bg-plum px-5 py-3.5 text-center font-medium text-white">
                    Start Purple Envelope
                  </Link>
                  <Link to="/login" className="rounded-full border border-line px-5 py-3.5 text-center text-ink">
                    Log in
                  </Link>
                </>
              )}
            </div>
          </Shell>
        </div>
      )}

      <main id="main">{children}</main>

      <footer className="border-t border-line bg-paper-2/60">
        <Shell className="grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Wordmark />
            <p className="mt-4 max-w-xs text-[13.5px] leading-relaxed text-ink-soft">
              Practice operations software for independent dental offices. Built inside a working private practice.
            </p>
            <p className="mt-4 font-display text-[15px] text-plum">Only your business, never your patients.</p>
          </div>
          <nav aria-label="Product" className="text-[13.5px]">
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">Product</p>
            <ul className="space-y-2.5">
              {NAV.map((n) => (
                <li key={n.to}>
                  <Link to={n.to} className="text-ink-soft transition-colors hover:text-plum">
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Access" className="text-[13.5px]">
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">Access</p>
            <ul className="space-y-2.5">
              <li>
                <Link to="/login" className="text-ink-soft transition-colors hover:text-plum">
                  Log in
                </Link>
              </li>
              <li>
                <Link to={trainingHref} className="text-ink-soft transition-colors hover:text-plum">
                  Training
                </Link>
              </li>
              <li>
                <Link to="/start" className="text-ink-soft transition-colors hover:text-plum">
                  Early access
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="text-ink-soft transition-colors hover:text-plum">
                  Privacy &amp; Terms
                </Link>
              </li>
            </ul>
          </nav>
        </Shell>
        <div className="border-t border-line/70">
          <Shell className="flex flex-col gap-2 py-5 text-[12px] text-ink-soft sm:flex-row sm:items-center sm:justify-between">
            <span>© {new Date().getFullYear()} Purple Envelope</span>
            <span>Purple Envelope is not a patient-record system and is not a substitute for your practice management software.</span>
          </Shell>
        </div>
      </footer>
    </div>
  );
}
