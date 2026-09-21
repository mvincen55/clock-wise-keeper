import AttendanceWorkspace from '@/components/attendance/AttendanceWorkspace';

/**
 * Workplace → Attendance: everyone's own attendance, managers included.
 * The whole team lives under Management (`/management/attendance`).
 */
export default function DaysOff() {
  return <AttendanceWorkspace mode="personal" />;
}
