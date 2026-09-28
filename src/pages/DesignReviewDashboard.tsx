import { useParams, Link } from 'react-router-dom';
import NotFound from './NotFound';
import OwnerDashboard from '@/components/dashboard/OwnerDashboard';
import ManagerDashboard from '@/components/dashboard/ManagerDashboard';
import MemberDashboard from '@/components/dashboard/MemberDashboard';
import { scenarioBySlug } from '@/components/dashboard/scenarios';
import { PRODUCTION_HOSTS } from './DesignReview';

/**
 * TEMPORARY — role dashboard previews for design review.
 *
 * Renders each composition from static fixtures. It grants no permissions,
 * touches no session, issues no queries, and refuses to render on production
 * hosts. Delete with the rest of the /design-review surface.
 */
export default function DesignReviewDashboard() {
  const { role } = useParams<{ role: string }>();
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  if (PRODUCTION_HOSTS.includes(host)) return <NotFound />;

  // Legacy slug from the previous review round.
  const scenario = scenarioBySlug(role === 'team' ? 'hygienist' : role);
  if (!scenario) return <NotFound />;

  const { view } = scenario;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-muted/40 px-4 py-3 sm:px-6 md:px-8" data-review-notes>
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <p className="text-[12.5px] font-semibold uppercase tracking-wide text-muted-foreground">
              Preview · fixture data · no session, no queries
            </p>
            <p className="mt-1 truncate text-[15px] font-semibold">{scenario.title}</p>
            <p className="text-[13px] text-muted-foreground">
              Tier: {scenario.tier} · Primary: {scenario.primary} · Backup: {scenario.secondary}
            </p>
          </div>
          <Link to="/design-review" className="text-[13.5px] font-medium text-primary hover:underline">
            Back to index
          </Link>
        </div>
      </div>

      <div data-review-root>
        {view.kind === 'owner' ? (
          <OwnerDashboard view={view} />
        ) : view.kind === 'manager' ? (
          <ManagerDashboard view={view} />
        ) : (
          <MemberDashboard view={view} />
        )}
      </div>

      {/* Review notes — never part of the real dashboard. */}
      <div className="border-t border-border bg-muted/30 px-4 py-8 sm:px-6 md:px-8" data-review-notes>
        <div className="mx-auto grid max-w-[1400px] gap-8 md:grid-cols-2">
          <div>
            <p className="border-b border-border pb-2 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
              Real data source behind each widget
            </p>
            <dl className="mt-3 space-y-2 text-[13.5px]">
              {scenario.sources.map(([widget, source]) => (
                <div key={widget} className="flex flex-wrap gap-x-2">
                  <dt className="font-medium">{widget}</dt>
                  <dd className="text-[13px] text-muted-foreground">{source}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <p className="border-b border-border pb-2 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
              Intentionally omitted — no trustworthy data
            </p>
            <ul className="mt-3 space-y-2 text-[13.5px] text-muted-foreground">
              {scenario.omitted.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
