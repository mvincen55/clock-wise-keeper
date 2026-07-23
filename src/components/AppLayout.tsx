import { ReactNode, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Clock, Table2, CalendarDays, FileText, LogOut, Menu, X, Settings, ShieldCheck, Send, CheckSquare, Users, Calendar, ReceiptText, Sparkles, BookOpen, Phone, ListChecks, Banknote, Sunrise, type LucideIcon } from 'lucide-react';
import { useOrgContext } from '@/hooks/useOrgContext';
import NotificationBell from '@/components/NotificationBell';
import { useApprovalCounts } from '@/hooks/useApprovalCounts';

interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
}

interface NavGroup {
  /** null = ungrouped items at the top (no header). */
  label: string | null;
  items: NavItem[];
  managerOnly?: boolean;
}

// Grouped navigation. Planned sections (Communication, Office Policies,
// Training, Office Forms, Consent Forms) stay out of this list until their
// pages exist — they appear here as each one ships. Dashboard has no item:
// the TimeVault brand is the home link.
const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      { to: '/assistant', icon: Sparkles, label: 'Ask AI' },
      { to: '/office-calendar', icon: Calendar, label: 'Calendar' },
    ],
  },
  {
    label: 'Office Policies',
    items: [{ to: '/policy-manual', icon: BookOpen, label: 'Policy Manual' }],
  },
  {
    label: 'Patient Forms',
    items: [{ to: '/fof', icon: ReceiptText, label: 'Financial Options Form' }],
  },
  {
    label: 'Office Forms',
    items: [
      { to: '/important-numbers', icon: Phone, label: 'Important Numbers' },
      { to: '/morning-huddle', icon: Sunrise, label: 'Morning Huddle' },
      { to: '/checklists', icon: ListChecks, label: 'Checklists' },
      { to: '/deposit-log', icon: Banknote, label: 'Deposit Log' },
    ],
  },
  {
    label: 'My Time',
    items: [
      { to: '/timesheet', icon: Table2, label: 'Timesheet' },
      { to: '/days-off', icon: CalendarDays, label: 'Attendance' },
      { to: '/pto', icon: Clock, label: 'PTO' },
      { to: '/my-requests', icon: Send, label: 'My Requests' },
    ],
  },
  {
    label: 'Manager',
    managerOnly: true,
    items: [
      { to: '/reports', icon: FileText, label: 'Reports' },
      { to: '/team', icon: Users, label: 'Team' },
      { to: '/approvals', icon: CheckSquare, label: 'Approvals' },
    ],
  },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { privacyLock, signOut, user } = useAuth();
  const { data: ctx } = useOrgContext();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: approvalCounts } = useApprovalCounts();

  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';
  const groups = NAV_GROUPS.filter(g => !g.managerOnly || isManager);

  // Sub-routes keep their section lit (/team/:id, /fof/templates, …).
  const isActive = (to: string) =>
    location.pathname === to || location.pathname.startsWith(`${to}/`);

  const renderItem = (item: NavItem, onNavigate?: () => void, mobile = false) => {
    const active = isActive(item.to);
    const desktopClasses = active
      ? 'bg-sidebar-accent text-sidebar-primary'
      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground';
    const mobileClasses = active
      ? 'bg-primary/10 text-primary font-medium'
      : 'text-muted-foreground';
    return (
      <Link
        key={item.to}
        to={item.to}
        onClick={onNavigate}
        className={`flex items-center gap-3 px-3 rounded-lg text-sm transition-colors relative ${
          mobile ? `py-2 ${mobileClasses}` : `py-2.5 font-medium ${desktopClasses}`
        }`}
      >
        <item.icon className="h-4 w-4" />
        {item.label}
        {item.to === '/approvals' && approvalCounts && approvalCounts.total > 0 && (
          <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1">
            {approvalCounts.total}
          </span>
        )}
      </Link>
    );
  };

  const renderGroups = (onNavigate?: () => void, mobile = false) =>
    groups.map((group, gi) => (
      <div key={group.label ?? `top-${gi}`} className={gi > 0 ? 'pt-3' : undefined}>
        {group.label && (
          <p
            className={`px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider ${
              mobile ? 'text-muted-foreground' : 'text-sidebar-foreground/60'
            }`}
          >
            {group.label}
          </p>
        )}
        <div className="space-y-1">
          {group.items.map(item => renderItem(item, onNavigate, mobile))}
        </div>
      </div>
    ));

  return (
    <div className="flex min-h-screen">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border sticky top-0 h-screen self-start">
        <div className="flex items-center justify-between px-6 py-5 border-b border-sidebar-border">
          {/* The brand IS the home link (there is no Dashboard nav item). */}
          <Link
            to="/"
            className="flex items-center gap-3 rounded-lg transition-opacity hover:opacity-80"
            title="Dashboard"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary">
              <Clock className="h-5 w-5 text-sidebar-primary-foreground" />
            </div>
            <span className="text-lg font-semibold text-sidebar-primary-foreground">TimeVault</span>
          </Link>
          <NotificationBell />
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">{renderGroups()}</nav>
        <div className="px-3 py-4 border-t border-sidebar-border space-y-1">
          <p className="px-3 mb-2 text-xs text-muted-foreground truncate">{user?.email}</p>
          <Link
            to="/settings"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive('/settings')
                ? 'bg-sidebar-accent text-sidebar-primary'
                : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
            }`}
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
          <button
            onClick={privacyLock}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors font-medium"
          >
            <ShieldCheck className="h-4 w-4" />
            Privacy Lock
          </button>
          <button
            onClick={signOut}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors font-medium"
          >
            <LogOut className="h-4 w-4" />
            Log Out
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="flex-1 flex flex-col">
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b bg-card">
          <Link to="/" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Clock className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold">TimeVault</span>
          </Link>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <Button variant="ghost" size="icon" onClick={privacyLock} className="text-destructive">
              <ShieldCheck className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setMobileOpen(!mobileOpen)}>
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </header>

        {mobileOpen && (
          <div className="md:hidden bg-card border-b px-4 py-3">
            {renderGroups(() => setMobileOpen(false), true)}
          </div>
        )}

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
