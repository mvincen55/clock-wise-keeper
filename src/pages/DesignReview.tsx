import { Link } from 'react-router-dom';
import NotFound from './NotFound';

/**
 * TEMPORARY — visual review index for the second-pass redesign.
 *
 * Not linked from any navigation and refuses to render on the production
 * hostnames. Delete this file and its route in src/App.tsx when the review is
 * finished; nothing else imports it.
 */
export const REDESIGN_VERSION = 'v2 — editorial second pass';

const PRODUCTION_HOSTS = ['purpleenvelope.app', 'www.purpleenvelope.app', 'purpleenvelope.lovable.app', 'timekeepers.me'];

const ROUTES: { to: string; label: string; note: string }[] = [
  { to: '/', label: 'Home', note: 'Oversized grotesque hero, envelope field, ruled index bands' },
  { to: '/login', label: 'Login', note: 'Purple/paper split, envelope mark, real forgot-password flow' },
  { to: '/start', label: 'Start', note: 'Editorial intake sheet on the live submit-lead backend' },
  { to: '/security', label: 'Security', note: 'Verified now / explicit boundary / not yet' },
];

export default function DesignReview() {
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  if (PRODUCTION_HOSTS.includes(host)) return <NotFound />;

  return (
    <div className="min-h-screen bg-paper px-5 py-14 font-sans text-ink sm:px-10">
      <div className="mx-auto max-w-3xl">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-plum">Internal · preview only</p>
        <h1 className="pe-display mt-4 text-[clamp(2rem,7vw,4rem)] text-ink">Design review index</h1>
        <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">
          {REDESIGN_VERSION} · host {host || 'unknown'}
        </p>
        <p className="mt-6 max-w-[54ch] text-[15px] leading-relaxed text-ink-soft">
          Four redesigned public surfaces. Everything underneath — auth, allowlist, protected routes, the lead backend
          — is unchanged. This page is excluded from production hosts and is safe to delete.
        </p>

        <div className="mt-12 border-t-2 border-ink">
          {ROUTES.map((r, i) => (
            <Link
              key={r.to}
              to={r.to}
              className="pe-focus grid grid-cols-[3rem_1fr] gap-x-5 border-b border-ink/16 py-6 transition-colors hover:bg-ink/[0.04]"
            >
              <span className="pe-display text-[1.6rem] leading-none text-plum/40">{`0${i + 1}`}</span>
              <div>
                <p className="pe-display text-[1.3rem] text-ink">{r.label}</p>
                <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-soft">{r.to}</p>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">{r.note}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
