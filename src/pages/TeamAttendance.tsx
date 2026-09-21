import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useOrgContext } from '@/hooks/useOrgContext';
import AttendanceWorkspace from '@/components/attendance/AttendanceWorkspace';

/**
 * Management → Team Attendance: the whole office at once, or one person,
 * sortable, with punch editing and day-off recording for anyone. Owners
 * and managers only; everyone else is sent home, as with Management.
 */
export default function TeamAttendance() {
  const { data: ctx, isLoading } = useOrgContext();
  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';
  if (ctx && !isManager) return <Navigate to="/" replace />;
  return <AttendanceWorkspace mode="team" />;
}
