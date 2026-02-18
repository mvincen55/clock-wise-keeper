import { ReactNode, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Clock, LayoutDashboard, Table2, CalendarDays, FileText, LogOut, Menu, X, MapPin, Settings, ShieldCheck, Send, CheckSquare, Users } from 'lucide-react';
import { useOrgContext } from '@/hooks/useOrgContext';

const coreNavItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/timesheet', icon: Table2, label: 'Timesheet' },
  { to: '/days-off', icon: CalendarDays, label: 'Attendance' },
  { to: '/pto', icon: Clock, label: 'PTO' },
  { to: '/my-requests', icon: Send, label: 'My Requests' },
  { to: '/reports', icon: FileText, label: 'Reports' },
  { to: '/work-zones', icon: MapPin, label: 'Work Zones' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { privacyLock, user } = useAuth();
  const { data: ctx } = useOrgContext();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';
  const navItems = [
    ...coreNavItems,
    ...(isManager ? [
      { to: '/team', icon: Users, label: 'Team' },
      { to: '/approvals', icon: CheckSquare, label: 'Approvals' },
    ] : []),
  ];

  return (
    <div className="flex min-h-screen">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary">
            <Clock className="h-5 w-5 text-sidebar-primary-foreground" />
          </div>
          <span className="text-lg font-semibold text-sidebar-primary-foreground">TimeVault</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(item => {
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-sidebar-accent text-sidebar-primary'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-3 py-4 border-t border-sidebar-border space-y-1">
          <p className="px-3 mb-2 text-xs text-muted-foreground truncate">{user?.email}</p>
          <button
            onClick={privacyLock}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors font-medium"
          >
            <ShieldCheck className="h-4 w-4" />
            Privacy Lock
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="flex-1 flex flex-col">
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b bg-card">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Clock className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold">TimeVault</span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={privacyLock} className="text-destructive">
              <ShieldCheck className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setMobileOpen(!mobileOpen)}>
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </header>

        {mobileOpen && (
          <div className="md:hidden bg-card border-b px-4 py-2 space-y-1">
            {navItems.map(item => {
              const active = location.pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
                    active ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground'
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        )}

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
