import { getToday } from '@/lib/time-utils';
import { useMissingShifts } from '@/hooks/useMissingShifts';
import { MissingShiftBanner } from '@/components/MissingShiftBanner';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useConsumedSearchParam } from '@/hooks/useDeepLink';
import TodayFocusCard from '@/components/copilot/TodayFocusCard';
import MessagesCloseoutCard from '@/components/MessagesCloseoutCard';
import DoctorBoardCard from '@/components/board/DoctorBoardCard';
import RescopeCard from '@/components/copilot/RescopeCard';
import SprintCard from '@/components/SprintCard';
import MyMomentumCard from '@/components/MyMomentumCard';
import MyAccountabilityCard from '@/components/accountability/MyAccountabilityCard';
import UserNotesBoard from '@/components/UserNotesBoard';
import OwnerDashboard from '@/components/dashboard/OwnerDashboard';
import ManagerDashboard from '@/components/dashboard/ManagerDashboard';
import MemberDashboard from '@/components/dashboard/MemberDashboard';
import { useDashboardView } from '@/components/dashboard/useDashboardView';
import { MicroLabel } from '@/components/dashboard/kit';

/**
 * Home — three role experiences, one product family.
 *
 * Owner reads decisions and exceptions, manager reads the live floor, team
 * member reads their own next action. The top composition is a view into
 * existing hooks (`useDashboardView`); the working surfaces below are the
 * unchanged interactive cards, including the deep-link targets notifications
 * point at. No clock card anywhere — clocking stays in GlobalTimeControl.
 */
export default function Home() {
  const { data: ctx } = useOrgContext();
  const { view } = useDashboardView();

  // Notifications about sprints and accountability records still land on the
  // exact card the notification described.
  const linkedRecordId = useConsumedSearchParam('record');
  const linkedSprintId = useConsumedSearchParam('sprint');

  const todayKey = getToday();
  const fourteenDaysAgo = new Date(new Date(todayKey + 'T12:00:00Z').getTime() - 14 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const missingDays = useMissingShifts(fourteenDaysAgo);

  const role = ctx?.role;
  const isOwner = role === 'owner';
  const isManager = role === 'manager';
  const isMember = role === 'employee';

  return (
    <div className="pb-10">
      {view?.kind === 'owner' && <OwnerDashboard view={view} />}
      {view?.kind === 'manager' && <ManagerDashboard view={view} />}
      {view?.kind === 'member' && <MemberDashboard view={view} />}

      {/* Working surfaces: unchanged interactive cards and deep-link targets. */}
      <div className="mx-auto w-full max-w-[1400px] space-y-4 px-4 sm:px-6 md:px-8">
        {!isOwner && missingDays.length > 0 && <MissingShiftBanner missingDays={missingDays} />}

        <div className="border-t-2 border-foreground pt-4">
          <MicroLabel>Detail</MicroLabel>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <MessagesCloseoutCard />
            {!isOwner && <TodayFocusCard />}
            {!isMember && <DoctorBoardCard />}
            {!isOwner && <RescopeCard />}
          </div>
          <div className="space-y-4">
            <SprintCard highlightId={linkedSprintId} />
            {isMember && <MyMomentumCard />}
            <MyAccountabilityCard highlightId={linkedRecordId} />
            <UserNotesBoard />
          </div>
        </div>
      </div>
    </div>
  );
}
