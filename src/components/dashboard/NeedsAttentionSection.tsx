import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ArrowRight, ClipboardList, GraduationCap, Inbox, Target } from 'lucide-react';
import { ReactNode } from 'react';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useAuth } from '@/hooks/useAuth';
import { useUnresolvedBypasses, useOrgBypasses } from '@/hooks/useChecklistBypasses';
import { useApprovalCounts } from '@/hooks/useApprovalCounts';
import { useTrainingAssignments } from '@/hooks/useTraining';
import { useGoalsMonth, currentMonth } from '@/hooks/useGoals';
import { useActiveTeam } from '@/hooks/useGoals';
import { useUnreadCount } from '@/hooks/useNotifications';
import { getToday } from '@/lib/time-utils';
import { cn } from '@/lib/utils';

type Props = {
  /** Rendered first — the missing shift banner keeps its own rich UI. */
  missingShifts?: ReactNode;
  onOpenBypassReason: () => void;
};

function Row({
  icon,
  title,
  detail,
  action,
  urgent,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  action: ReactNode;
  urgent?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className={cn('shrink-0', urgent ? 'text-warning' : 'text-muted-foreground')}>{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{title}</p>
        <p className="text-xs text-muted-foreground truncate">{detail}</p>
      </div>
      {action}
    </div>
  );
}

/**
 * Everything asking for me right now, most urgent first.
 * Renders nothing at all when there is nothing to do.
 */
export default function NeedsAttentionSection({ missingShifts, onOpenBypassReason }: Props) {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const isAdmin = ctx?.role === 'owner' || ctx?.role === 'manager';

  const { data: myBypasses } = useUnresolvedBypasses();
  const { data: orgBypasses } = useOrgBypasses(isAdmin ? ctx?.org_id : undefined);
  const { data: approvals } = useApprovalCounts();
  const { data: assignments } = useTrainingAssignments();
  const month = currentMonth();
  const { data: goalData } = useGoalsMonth(month);
  const { data: team } = useActiveTeam();
  const unread = useUnreadCount();

  const today = getToday();
  const soon = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);

  const myDueTraining = (assignments ?? []).filter(
    a => a.assigned_to === user?.id && a.status !== 'completed' && a.due_date && a.due_date <= soon
  );
  const overdueTraining = myDueTraining.filter(a => (a.due_date ?? '') < today).length;

  const teamBypasses = (orgBypasses ?? []).filter(
    (b: any) => !b.resolved && b.user_id !== user?.id
  ).length;

  const withGoal = new Set((goalData?.goals ?? []).map(g => g.user_id));
  const withoutGoal = isAdmin ? (team ?? []).filter(m => !withGoal.has(m.user_id)).length : 0;

  const rows: ReactNode[] = [];

  if ((myBypasses?.length ?? 0) > 0) {
    rows.push(
      <Row
        key="bypass"
        urgent
        icon={<AlertTriangle className="h-4 w-4" />}
        title="Your checklist bypass needs a reason"
        detail={`${myBypasses!.length} clock-out went through with items left open.`}
        action={
          <Button size="sm" onClick={onOpenBypassReason}>
            Give a reason
          </Button>
        }
      />
    );
  }

  if (myDueTraining.length > 0) {
    rows.push(
      <Row
        key="training"
        urgent={overdueTraining > 0}
        icon={<GraduationCap className="h-4 w-4" />}
        title={overdueTraining > 0 ? 'Training is overdue' : 'Training due soon'}
        detail={`${myDueTraining.length} assignment${myDueTraining.length > 1 ? 's' : ''} to finish.`}
        action={
          <Button variant="outline" size="sm" asChild>
            <Link to="/training">
              Open <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        }
      />
    );
  }

  if (isAdmin && (approvals?.total ?? 0) > 0) {
    rows.push(
      <Row
        key="approvals"
        urgent
        icon={<Inbox className="h-4 w-4" />}
        title="Approvals waiting on you"
        detail={`${approvals!.total} pending request${approvals!.total > 1 ? 's' : ''}.`}
        action={
          <Button size="sm" asChild>
            <Link to="/approvals">Review</Link>
          </Button>
        }
      />
    );
  }

  if (isAdmin && teamBypasses > 0) {
    rows.push(
      <Row
        key="team-bypass"
        icon={<ClipboardList className="h-4 w-4" />}
        title="Team checklist bypasses"
        detail={`${teamBypasses} unresolved across the team.`}
        action={
          <Button variant="outline" size="sm" asChild>
            <Link to="/checklists">
              Open <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        }
      />
    );
  }

  if (isAdmin && withoutGoal > 0) {
    rows.push(
      <Row
        key="no-goal"
        icon={<Target className="h-4 w-4" />}
        title="No goal set this month"
        detail={`${withoutGoal} team member${withoutGoal > 1 ? 's have' : ' has'} not set one yet.`}
        action={
          <Button variant="outline" size="sm" asChild>
            <Link to="/goals">
              Open <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        }
      />
    );
  }

  if (unread > 0) {
    rows.push(
      <Row
        key="unread"
        icon={<Inbox className="h-4 w-4" />}
        title={`${unread} unread notification${unread > 1 ? 's' : ''}`}
        detail="Open the bell in the sidebar to read them."
        action={null}
      />
    );
  }

  if (!missingShifts && rows.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Needs attention
      </h2>
      {missingShifts}
      {rows.length > 0 && (
        <Card className="card-elevated">
          <CardContent className="p-0 divide-y">{rows}</CardContent>
        </Card>
      )}
    </section>
  );
}
