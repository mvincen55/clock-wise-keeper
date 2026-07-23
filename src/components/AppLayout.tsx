import { ReactNode, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Clock, LayoutDashboard, Table2, CalendarDays, FileText, LogOut, Menu, X, MapPin, Settings, ShieldCheck, Send, CheckSquare, Users, Calendar, ReceiptText, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import { useOrgContext } from '@/hooks/useOrgContext';
import NotificationBell from '@/components/NotificationBell';
import { useApprovalCounts } from '@/hooks/useApprovalCounts';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const coreNavItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/timesheet', icon: Table2, label: 'Timesheet' },
  { to: '/days-off', icon: CalendarDays, label: 'Attendance' },
  { to: '/office-calendar', icon: Calendar, label: 'Office Calendar' },
  { to: '/pto', icon: Clock, label: 'PTO' },
  { to: '/my-requests', icon: Send, label: 'My Requests' },
  { to: '/reports', icon: FileText, label: 'Reports' },
  { to: '/fof', icon: ReceiptText, label: 'Financial Forms' },
  { to: '/assistant', icon: Sparkles, label: 'Ask AI' },
  { to: '/work-zones', icon: MapPin, label: 'Work Zones' },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { privacyLock, signOut, user } = useAuth();
  const { data: ctx } = useOrgContext();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { data: approvalCounts } = useApprovalCounts();

  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';
  const navItems = [
    ...coreNavItems,
    ...(isManager ? [
      { to: '/team', icon: Users, label: 'Team' },
      { to: '/approvals', icon: CheckSquare, label: 'Approvals' },
    ] : []),
  ];

  const toggleSidebar = () => setCollapsed(c => !c);

  const NavItem = ({ item }: { item: typeof navItems[0] }) => {
    const active = location.pathname === item.to;
    const baseClass = `flex items-center gap-3 rounded-lg text-sm font-medium transition-colors relative ${
      active
        ? 'bg-sidebar-accent text-sidebar-primary'
        : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
    }`;
    const content = (
      <>
        <item.icon className="h-4 w-4 shrink-0" />
        {!collapsed && <span className="truncate">{item.label}</span>}
        {item.to === '/approvals' && approvalCounts && approvalCounts.total > 0 && (
          <span className={`flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1 ${collapsed ? 'absolute -top-1 -right-1' : 'ml-auto'}`}>
            {approvalCounts.total}
          </span>
        )}
      </>
    );

    return collapsed ? (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <Link
            key={item.to}
            to={item.to}
            className={`${baseClass} justify-center px-3 py-2.5`}
            title={item.label}
          >
            {content}
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    ) : (
      <Link
        key={item.to}
        to={item.to}
        className={`${baseClass} px-3 py-2.5`}
      >
        {content}
      </Link>
    );
  };

  return (
    <TooltipProvider>
      <div className="flex min-h-screen">
        {/* Sidebar desktop */}
        <aside className={`hidden md:flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border sticky top-0 h-screen self-start transition-all duration-200 ${collapsed ? 'w-16' : 'w-64'}`}>
          <div className={`flex items-center border-b border-sidebar-border shrink-0 ${collapsed ? 'justify-center px-2 py-5' : 'justify-between px-6 py-5'}`}>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary">
                <Clock className="h-5 w-5 text-sidebar-primary-foreground" />
              </div>
              {!collapsed && <span className="text-lg font-semibold text-sidebar-primary-foreground">TimeVault</span>}
            </div>
            {!collapsed && <NotificationBell />}
          </div>
          <nav className={`flex-1 overflow-y-auto py-4 space-y-1 ${collapsed ? 'px-2' : 'px-3'}`}>
            {navItems.map(item => <NavItem key={item.to} item={item} />)}
          </nav>
          <div className={`border-t border-sidebar-border shrink-0 space-y-1 ${collapsed ? 'px-2 py-4' : 'px-3 py-4'}`}>
            {!collapsed && <p className="px-3 mb-2 text-xs text-muted-foreground truncate">{user?.email}</p>}
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Link
                  to="/settings"
                  className={`flex items-center gap-3 rounded-lg text-sm font-medium transition-colors ${
                    collapsed ? 'justify-center px-3 py-2.5' : 'px-3 py-2.5'
                  } ${
                    location.pathname === '/settings'
                      ? 'bg-sidebar-accent text-sidebar-primary'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  }`}
                >
                  <Settings className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>Settings</span>}
                </Link>
              </TooltipTrigger>
              {collapsed && <TooltipContent side="right">Settings</TooltipContent>}
            </Tooltip>
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  onClick={privacyLock}
                  className={`flex items-center gap-3 w-full rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors font-medium ${collapsed ? 'justify-center px-3 py-2.5' : 'px-3 py-2.5'}`}
                >
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>Privacy Lock</span>}
                </button>
              </TooltipTrigger>
              {collapsed && <TooltipContent side="right">Privacy Lock</TooltipContent>}
            </Tooltip>
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  onClick={signOut}
                  className={`flex items-center gap-3 w-full rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors font-medium ${collapsed ? 'justify-center px-3 py-2.5' : 'px-3 py-2.5'}`}
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>Log Out</span>}
                </button>
              </TooltipTrigger>
              {collapsed && <TooltipContent side="right">Log Out</TooltipContent>}
            </Tooltip>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className="w-full h-8 mt-1 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
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
            <div className="md:hidden bg-card border-b px-4 py-2 space-y-1">
              {navItems.map(item => {
                const active = location.pathname === item.to;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm relative ${
                      active ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground'
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
              })}
            </div>
          )}

          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
