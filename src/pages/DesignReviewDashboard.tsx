import { useParams, Link } from 'react-router-dom';
import NotFound from './NotFound';
import OwnerDashboard from '@/components/dashboard/OwnerDashboard';
import ManagerDashboard from '@/components/dashboard/ManagerDashboard';
import MemberDashboard from '@/components/dashboard/MemberDashboard';
import { ownerFixture, managerFixture, memberFixture } from '@/components/dashboard/fixtures';
import { PRODUCTION_HOSTS } from './DesignReview';

/**
 * TEMPORARY — role dashboard previews for design review.
 *
 * Renders the three role compositions from static fixtures. It grants no
 * permissions, touches no session, issues no queries, and refuses to render on
 * production hosts. Delete with the rest of the /design-review surface.
 */
export default function DesignReviewDashboard() {
  const { role } = useParams<{ role: string }>();
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  if (PRODUCTION_HOSTS.includes(host)) return <NotFound />;

  const body =
    role === 'owner' ? (
      <OwnerDashboard view={ownerFixture} />
    ) : role === 'manager' ? (
      <ManagerDashboard view={managerFixture} />
    ) : role === 'team' ? (
      <MemberDashboard view={memberFixture} />
    ) : null;

  if (!body) return <NotFound />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-muted/40 px-4 py-2 sm:px-6 md:px-8">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Preview · fixture data · no session, no queries
          </p>
          <Link
            to="/design-review"
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary hover:underline"
          >
            Back to index
          </Link>
        </div>
      </div>
      {body}
    </div>
  );
}
