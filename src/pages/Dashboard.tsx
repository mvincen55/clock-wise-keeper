import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Briefcase, BookOpen, Inbox, Gauge, CalendarDays, ChevronRight,
} from 'lucide-react';
import { formatDate, getToday } from '@/lib/time-utils';
import { useTick } from '@/hooks/useTick';
import { useMissingShifts } from '@/hooks/useMissingShifts';
import { MissingShiftBanner } from '@/components/MissingShiftBanner';
import { useCurrentPtoBalance } from '@/hooks/usePtoEngine';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useApprovalCounts } from '@/hooks/useApprovalCounts';
import { useConsumedSearchParam } from '@/hooks/useDeepLink';
import TodayFocusCard from '@/components/copilot/TodayFocusCard';
import MessagesCloseoutCard from '@/components/MessagesCloseoutCard';
import DoctorBoardCard from '@/components/board/DoctorBoardCard';
import RescopeCard from '@/components/copilot/RescopeCard';
import SprintCard from '@/components/SprintCard';
import MyMomentumCard from '@/components/MyMomentumCard';
import MyAccountabilityCard from '@/components/accountability/MyAccountabilityCard';
import UserNotesBoard from '@/components/UserNotesBoard';

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const SHORTCUTS = [
  { to: '/workplace', icon: Briefcase, label: 'Workplace' },
  { to: '/playbook', icon: BookOpen, label: 'Playbook' },
  { to: '/inbox', icon: Inbox, label: 'Inbox' },
];

/**
 * Home: a role-personalized launchpad (blueprint §5). It answers "what
 * deserves my attention?" — the clock lives in the global time control,
 * and management concerns live in Management.
 */
export default function Home() {
  const now = useTick(60_000);
  const { data: ctx } = useOrgContext();
  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';
  const { data: approvalCounts } = useApprovalCounts();
  // Notifications about sprints and accountability records land here, on
  // the exact card the notification described.
  const linkedRecordId = useConsumedSearchParam('record');
  const linkedSprintId = useConsumedSearchParam('sprint');

  const todayKey = getToday();
  const fourteenDaysAgo = new Date(new Date(todayKey + 'T12:00:00Z').getTime() - 14 * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  const missingDays = useMissingShifts(fourteenDaysAgo);
  const ptoState = useCurrentPtoBalance();

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">{greeting(now.getHours())}</h1>
        <p className="text-muted-foreground">{formatDate(now)}</p>
      </div>

      {/* Where to next — the destinations, one tap away. */}
      <div className="flex flex-wrap gap-2">
        {SHORTCUTS.map(s => (
          <Button key={s.to} asChild variant="outline" size="sm">
            <Link to={s.to}><s.icon className="mr-2 h-4 w-4" />{s.label}</Link>
          </Button>
        ))}
        {isManager && (
          <Button asChild variant="outline" size="sm">
            <Link to="/management">
              <Gauge className="mr-2 h-4 w-4" />
              Management
              {(approvalCounts?.total ?? 0) > 0 && (
                <span className="ml-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                  {approvalCounts!.total}
                </span>
              )}
            </Link>
          </Button>
        )}
      </div>

      {/* Needs attention first. */}
      {missingDays.length > 0 && <MissingShiftBanner missingDays={missingDays} />}
      <MessagesCloseoutCard />

      {/* One spotlight: your next thing. */}
      <TodayFocusCard />
      <DoctorBoardCard />
      <RescopeCard />

      {/* Restrained progress summary. */}
      <SprintCard highlightId={linkedSprintId} />
      <MyMomentumCard />
      <MyAccountabilityCard highlightId={linkedRecordId} />

      <Card className="card-elevated">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CalendarDays className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium">PTO Balance</p>
                <p className="text-xs text-muted-foreground">
                  {ptoState.tier.label} — {(ptoState.tier.rate * 100).toFixed(2)}%
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className={`text-xl font-bold time-display ${ptoState.balance < 0 ? 'text-destructive' : 'text-success'}`}>
                {ptoState.balance.toFixed(2)}h
              </p>
              <Link to="/pto" className="inline-flex items-center text-xs text-primary hover:underline">
                View Details <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
          {ptoState.currentWeek && (
            <div className="flex gap-4 mt-2 pt-2 border-t text-xs text-muted-foreground">
              <span>This week accrual: <span className="font-semibold text-success">+{ptoState.currentWeek.accrual_credited.toFixed(2)}h</span></span>
              {ptoState.currentWeek.pto_taken_hours > 0 && (
                <span>PTO used: <span className="font-semibold text-destructive">-{ptoState.currentWeek.pto_taken_hours.toFixed(2)}h</span></span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <UserNotesBoard />
    </div>
  );
}
