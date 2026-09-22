import {
  Table2, CalendarDays, Clock, Send, Calendar, BookOpen, Users,
  Target, GraduationCap,
} from 'lucide-react';
import { useOrgContext } from '@/hooks/useOrgContext';
import HubLinkGrid, { HubSection } from '@/components/HubLinkGrid';
import UserNotesBoard from '@/components/UserNotesBoard';

// Workplace: employee and office life (blueprint §2). Each feature keeps its
// existing route; this hub is its primary home in the navigation.
const SECTIONS: HubSection[] = [
  {
    title: 'My Time',
    links: [
      { to: '/timesheet', icon: Table2, label: 'Timesheet', description: 'Your punches, totals, and pay periods.' },
      { to: '/days-off', icon: CalendarDays, label: 'Attendance', description: 'Your days off, tardies, and attendance history.' },
      { to: '/pto', icon: Clock, label: 'PTO', description: 'Balance, accrual, and time-off requests.' },
      { to: '/my-requests', icon: Send, label: 'My Requests', description: 'Corrections and changes you have submitted.' },
    ],
  },
  {
    title: 'Office Life',
    links: [
      { to: '/office-calendar', icon: Calendar, label: 'Office Calendar', description: 'Closures, events, and the office schedule.' },
      { to: '/handbook', icon: BookOpen, label: 'Employee Handbook', description: 'Policies, benefits, expectations, and information for working here.' },
      { to: '/directory', icon: Users, label: 'Directory', description: 'Who works here, staff codes, and this week’s closures.' },
    ],
  },
  {
    title: 'Growth',
    links: [
      { to: '/goals', icon: Target, label: 'Goals', description: 'Personal goals, sprints, and office challenges.' },
      { to: '/training', icon: GraduationCap, label: 'Training', description: 'Assigned training and mastery tracks.' },
    ],
  },
];

export default function Workplace() {
  const { data: ctx } = useOrgContext();
  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Workplace</h1>
        <p className="text-muted-foreground">Your time, your office, and your growth.</p>
      </div>
      <HubLinkGrid sections={SECTIONS} isManager={isManager} />
      {/* Personal notes: members keep theirs on Home (My work); the manager
          and owner Home is a briefing, so their notes live here. */}
      {isManager && <UserNotesBoard />}
    </div>
  );
}
