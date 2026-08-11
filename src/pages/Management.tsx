import { Link, Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  BookOpenCheck, CheckSquare, FileText, FolderCog, Users, UserCheck, MapPin, Settings, BellRing, ChevronRight, Loader2,
} from 'lucide-react';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useApprovalCounts } from '@/hooks/useApprovalCounts';
import { useConsumedSearchParam } from '@/hooks/useDeepLink';
import { OrgSnapshotPanel } from '@/components/OrgSnapshotPanel';
import PracticeVitalsCard from '@/components/PracticeVitalsCard';
import AccountabilityReviewQueue from '@/components/accountability/AccountabilityReviewQueue';

const ADMIN_LINKS = [
  { to: '/approvals', icon: CheckSquare, label: 'Approvals', description: 'Review pending requests' },
  { to: '/management/knowledge', icon: BookOpenCheck, label: 'Knowledge Workspace', description: 'Draft, review, and publish the office handbook and playbook' },
  { to: '/practice-setup', icon: FolderCog, label: 'Practice Setup', description: 'Sort existing documents and create human-confirmed office drafts' },
  { to: '/acknowledgments', icon: UserCheck, label: 'Office Acknowledgments', description: 'See who has opened, signed, paused, or missed a required office version' },
  { to: '/team', icon: Users, label: 'Team', description: 'Roster, schedules, and details' },
  { to: '/reports', icon: FileText, label: 'Reports', description: 'Hours, payroll, and exports' },
  { to: '/work-zones', icon: MapPin, label: 'Work Zones', description: 'GPS auto-clock zones' },
  { to: '/settings', icon: Settings, label: 'Office Settings', description: 'Branding, payroll, policies, escalation, workflows' },
  { to: '/settings/reminders', icon: BellRing, label: 'Reminders', description: 'Automated reminder rules' },
];

/**
 * Management command center (blueprint §7): answers "what needs management
 * attention?" and links into each feature's own administration. It is not a
 * duplicate copy of the application.
 */
export default function Management() {
  const { data: ctx, isLoading } = useOrgContext();
  const { data: counts } = useApprovalCounts();
  // An accountability notification lands on the exact record in the queue.
  const linkedRecordId = useConsumedSearchParam('record');

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';
  if (ctx && !isManager) return <Navigate to="/" replace />;

  const approvalRows = [
    { label: 'Change requests', count: counts?.changeRequests ?? 0 },
    { label: 'PTO requests', count: counts?.ptoRequests ?? 0 },
    { label: 'Correction requests', count: counts?.corrections ?? 0 },
  ];

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Management</h1>
        <p className="text-muted-foreground">What needs management attention today.</p>
      </div>

      <Card className="card-elevated">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-primary" />
            Pending approvals
          </CardTitle>
          <Button asChild size="sm" variant={counts?.total ? 'default' : 'outline'}>
            <Link to="/approvals">
              Review{counts && counts.total > 0 && ` (${counts.total})`}
              <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-3">
          {approvalRows.map(row => (
            <div key={row.label} className="rounded-lg bg-muted/50 px-3 py-2">
              <p className={`text-xl font-bold ${row.count > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                {row.count}
              </p>
              <p className="text-xs text-muted-foreground">{row.label}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <AccountabilityReviewQueue highlightId={linkedRecordId} />

      <OrgSnapshotPanel />

      <PracticeVitalsCard />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Administration
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ADMIN_LINKS.map(link => (
            <Link key={link.to} to={link.to} className="group">
              <Card className="card-elevated h-full transition-colors group-hover:border-primary/40">
                <CardContent className="flex items-start gap-3 p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <link.icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium leading-tight">{link.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground leading-snug">{link.description}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
