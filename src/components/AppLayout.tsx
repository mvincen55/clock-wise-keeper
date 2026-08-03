import { ReactNode, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import {
  Home, Briefcase, BookOpen, Inbox, Gauge, Mail, LogOut, Settings,
  ShieldCheck, MoreHorizontal, ChevronLeft, ChevronRight, LifeBuoy,
  type LucideIcon,
} from 'lucide-react';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useOrgBranding } from '@/hooks/useOrgBranding';
import NotificationBell from '@/components/NotificationBell';
import BypassReasonBanner from '@/components/BypassReasonBanner';
import SupportWidget from '@/components/SupportWidget';
import AppFooter from '@/components/AppFooter';
import OfficeBrandStyle from '@/components/OfficeBrandStyle';
import GlobalTimeControl, { ClockProvider } from '@/components/GlobalTimeControl';
import { useApprovalCounts } from '@/hooks/useApprovalCounts';
import { useOpenNudgeCount } from '@/hooks/useOfficeNudges';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

interface Destination {
  to: string;
  icon: LucideIcon;
  label: string;
  /** Short label for the mobile bottom navigation. */
  shortLabel?: string;
  /** Legacy paths that keep this destination lit. */
  match: string[];
  managerOnly?: boolean;
}

// The compact destination list (blueprint §4). Every feature keeps its
// existing route; these are the doors, and the hub pages inside organize
// the rooms. Feature paths listed in `match` keep their destination lit.
const DESTINATIONS: Destination[] = [
  { to: '/', icon: Home, label: 'Home', match: [] },
  {
    to: '/workplace', icon: Briefcase, label: 'Workplace',
    match: ['/timesheet', '/days-off', '/pto', '/my-requests', '/office-calendar',
            '/handbook', '/policy-manual', '/important-numbers', '/goals', '/training', '/team'],
  },
  {
    to: '/playbook', icon: BookOpen, label: 'Practice Playbook', shortLabel: 'Playbook',
    match: ['/morning-huddle', '/checklists', '/deposit-log', '/incident-reports', '/fof',
            '/insurance-desk', '/assistant'],
  },
  {
    to: '/inbox', icon: Inbox, label: 'Inbox',
    match: ['/messages', '/requests', '/nudges'],
  },
  {
    to: '/management', icon: Gauge, label: 'Management', managerOnly: true,
    match: ['/approvals', '/reports', '/work-zones'],
  },
];

function useIsActive() {
  const location = useLocation();
  return (dest: Destination) => {
    if (dest.to === '/') return location.pathname === '/';
    const paths = [dest.to, ...dest.match];
    return paths.some(p => location.pathname === p || location.pathname.startsWith(`${p}/`));
  };
}

/** The office's mark: uploaded logo when present, otherwise its initial. */
function OfficeMark({ name, logoUrl, size = 'md' }: { name: string; logoUrl?: string; size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9';
  if (logoUrl) {
    return (
      <div className={`${box} shrink-0 overflow-hidden rounded-lg bg-white flex items-center justify-center`}>
        <img src={logoUrl} alt={name} className="h-full w-full object-contain" />
      </div>
    );
  }
  return (
    <div className={`${box} shrink-0 flex items-center justify-center rounded-lg bg-sidebar-primary`}>
      <span className="text-base font-bold text-sidebar-primary-foreground">
        {(name || 'P').charAt(0).toUpperCase()}
      </span>
    </div>
  );
}

function CountBadge({ count, floating }: { count: number; floating?: boolean }) {
  if (count <= 0) return null;
  return (
    <span
      className={`flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1 ${
        floating ? 'absolute -top-1 -right-1' : 'ml-auto'
      }`}
    >
      {count}
    </span>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const { privacyLock, signOut, user } = useAuth();
  const { data: ctx } = useOrgContext();
  const { data: branding } = useOrgBranding();
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const { data: approvalCounts } = useApprovalCounts();
  const openNudges = useOpenNudgeCount();
  const isActive = useIsActive();

  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';
  const destinations = DESTINATIONS.filter(d => !d.managerOnly || isManager);
  // The office identity leads; Purple Envelope signs the footer (blueprint §3).
  const officeName = branding?.displayName || ctx?.org_name || 'Purple Envelope';

  const badgeFor = (dest: Destination) => {
    if (dest.to === '/management') return approvalCounts?.total ?? 0;
    if (dest.to === '/inbox') return openNudges;
    return 0;
  };

  const desktopItem = (dest: Destination) => {
    const active = isActive(dest);
    const badge = badgeFor(dest);
    const link = (
      <Link
        key={dest.to}
        to={dest.to}
        className={`flex items-center gap-3 rounded-lg text-sm font-medium transition-colors relative ${
          collapsed ? 'justify-center px-3 py-2.5' : 'px-3 py-2.5'
        } ${
          active
            ? 'bg-sidebar-accent text-sidebar-primary'
            : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
        }`}
      >
        <dest.icon className="h-4 w-4 shrink-0" />
        {!collapsed && <span className="truncate">{dest.label}</span>}
        <CountBadge count={badge} floating={collapsed} />
      </Link>
    );
    if (!collapsed) return link;
    return (
      <Tooltip key={dest.to} delayDuration={0}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{dest.label}</TooltipContent>
      </Tooltip>
    );
  };

  const userInitials = (user?.email ?? '?').slice(0, 2).toUpperCase();

  return (
    <TooltipProvider>
      <ClockProvider>
        <OfficeBrandStyle />
        <div className="flex min-h-screen">
          {/* Desktop destination sidebar — the office's, not ours. */}
          <aside
            className={`hidden md:flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border sticky top-0 h-screen self-start transition-all duration-200 ${
              collapsed ? 'w-16' : 'w-60'
            }`}
          >
            <div className={`flex items-center border-b border-sidebar-border shrink-0 ${collapsed ? 'justify-center px-2 py-5' : 'px-4 py-5'}`}>
              <Link to="/" className="flex items-center gap-3 rounded-lg transition-opacity hover:opacity-80 min-w-0" title="Home">
                <OfficeMark name={officeName} logoUrl={branding?.logoUrl} />
                {!collapsed && (
                  <span className="truncate text-base font-semibold text-sidebar-primary-foreground">
                    {officeName}
                  </span>
                )}
              </Link>
            </div>
            <nav className={`flex-1 overflow-y-auto py-4 space-y-1 ${collapsed ? 'px-2' : 'px-3'}`}>
              {destinations.map(desktopItem)}
            </nav>
            <div className={`border-t border-sidebar-border shrink-0 py-3 ${collapsed ? 'px-2' : 'px-3'}`}>
              {!collapsed && (
                <p className="px-3 pb-2 text-[10px] uppercase tracking-wider text-sidebar-foreground/50">
                  Powered by Purple Envelope
                </p>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCollapsed(c => !c)}
                className="w-full h-8 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </Button>
            </div>
          </aside>

          <div className="flex-1 flex flex-col min-w-0">
            {/* Desktop utility header: time control, then notifications, then account. */}
            <header className="hidden md:flex items-center justify-end gap-2 border-b bg-card px-4 py-2 sticky top-0 z-30">
              <GlobalTimeControl variant="header" />
              <NotificationBell />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
                    aria-label="Account"
                  >
                    {userInitials}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
                    {user?.email}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/settings"><Settings className="mr-2 h-4 w-4" />Settings</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/help"><LifeBuoy className="mr-2 h-4 w-4" />Help &amp; Support</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={privacyLock} className="text-destructive focus:text-destructive">
                    <ShieldCheck className="mr-2 h-4 w-4" />Privacy Lock
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />Log Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </header>

            {/* Mobile top header: office identity, notifications, privacy lock. */}
            <header className="md:hidden flex items-center justify-between px-4 py-3 border-b bg-card sticky top-0 z-30">
              <Link to="/" className="flex items-center gap-2 min-w-0">
                <OfficeMark name={officeName} logoUrl={branding?.logoUrl} size="sm" />
                <span className="truncate font-semibold">{officeName}</span>
              </Link>
              <div className="flex items-center gap-1 shrink-0">
                <NotificationBell />
                <Button variant="ghost" size="icon" onClick={privacyLock} className="text-destructive" aria-label="Privacy lock">
                  <ShieldCheck className="h-5 w-5" />
                </Button>
              </div>
            </header>

            <BypassReasonBanner />

            <main className="flex-1 overflow-auto pb-36 md:pb-0">
              {children}
            </main>

            <AppFooter />
          </div>

          {/* Mobile sticky clock bar (above the bottom navigation). */}
          <GlobalTimeControl variant="bar" />

          {/* Mobile five-item bottom navigation. */}
          <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t bg-card">
            {destinations
              .filter(d => !d.managerOnly)
              .map(dest => {
                const active = isActive(dest);
                const badge = badgeFor(dest);
                return (
                  <Link
                    key={dest.to}
                    to={dest.to}
                    className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                      active ? 'text-primary' : 'text-muted-foreground'
                    }`}
                  >
                    <span className="relative">
                      <dest.icon className="h-5 w-5" />
                      <CountBadge count={badge} floating />
                    </span>
                    {dest.shortLabel ?? dest.label}
                  </Link>
                );
              })}
            <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
              <SheetTrigger asChild>
                <button className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground" aria-label="More">
                  <span className="relative">
                    <MoreHorizontal className="h-5 w-5" />
                    {isManager && <CountBadge count={approvalCounts?.total ?? 0} floating />}
                  </span>
                  More
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" className="rounded-t-2xl pb-8">
                <SheetHeader className="text-left">
                  <SheetTitle className="text-base">{officeName}</SheetTitle>
                </SheetHeader>
                <div className="mt-2 space-y-1">
                  {isManager && (
                    <Link
                      to="/management"
                      onClick={() => setMoreOpen(false)}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-muted"
                    >
                      <Gauge className="h-4 w-4" />Management
                      <CountBadge count={approvalCounts?.total ?? 0} />
                    </Link>
                  )}
                  <Link to="/settings" onClick={() => setMoreOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-muted">
                    <Settings className="h-4 w-4" />Settings
                  </Link>
                  <Link to="/help" onClick={() => setMoreOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-muted">
                    <LifeBuoy className="h-4 w-4" />Help &amp; Support
                  </Link>
                  <button
                    onClick={() => { setMoreOpen(false); privacyLock(); }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10"
                  >
                    <ShieldCheck className="h-4 w-4" />Privacy Lock
                  </button>
                  <button
                    onClick={signOut}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10"
                  >
                    <LogOut className="h-4 w-4" />Log Out
                  </button>
                  <p className="flex items-center gap-1.5 px-3 pt-3 text-[11px] text-muted-foreground">
                    <Mail className="h-3 w-3 text-primary" />
                    Powered by Purple Envelope ·{' '}
                    <Link to="/privacy" onClick={() => setMoreOpen(false)} className="underline">
                      Privacy &amp; Terms
                    </Link>
                  </p>
                </div>
              </SheetContent>
            </Sheet>
          </nav>

          <SupportWidget />
        </div>
      </ClockProvider>
    </TooltipProvider>
  );
}
