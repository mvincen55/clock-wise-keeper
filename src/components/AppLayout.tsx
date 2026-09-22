import { ReactNode, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import {
  Home, Briefcase, BookOpen, Inbox, Gauge, Mail, LogOut, Settings,
  ShieldCheck, ChevronLeft, ChevronRight, LifeBuoy,
  type LucideIcon,
} from 'lucide-react';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useOrgBranding } from '@/hooks/useOrgBranding';
import NotificationBell from '@/components/NotificationBell';
import BypassReasonBanner from '@/components/BypassReasonBanner';
import SupportWidget from '@/components/SupportWidget';
import ChatDock from '@/components/messaging/ChatDock';
import MessagePopups from '@/components/messaging/MessagePopups';
import SendMomentDialog from '@/components/moments/SendMomentDialog';
import TeamMomentsReveal from '@/components/moments/TeamMomentsReveal';
import AppFooter from '@/components/AppFooter';
import OfficeBrandStyle from '@/components/OfficeBrandStyle';
import GlobalTimeControl, { ClockProvider } from '@/components/GlobalTimeControl';
import { useAttentionItems } from '@/hooks/useAttentionItems';
import { useConversations } from '@/hooks/useMessaging';
import { useTimezoneSync } from '@/hooks/useTimezoneSync';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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

// The five destinations (design §3.1). Every feature keeps its existing
// route; these are the doors, and the hub pages inside organize the rooms.
// Feature paths listed in `match` keep their destination lit. Insurance
// Benefits is a Playbook door: it keeps its whole workspace and its route,
// not a top-level slot.
const DESTINATIONS: Destination[] = [
  { to: '/', icon: Home, label: 'Home', match: [] },
  {
    to: '/workplace', icon: Briefcase, label: 'Workplace',
    match: ['/timesheet', '/days-off', '/pto', '/my-requests', '/office-calendar',
            '/handbook', '/policy-manual', '/goals', '/training', '/directory'],
  },
  {
    to: '/playbook', icon: BookOpen, label: 'Practice Playbook', shortLabel: 'Playbook',
    match: ['/morning-huddle', '/checklists', '/deposit-log', '/incident-reports', '/fof',
            '/account-balance', '/broken-appointments', '/consents', '/letters',
            '/important-numbers', '/assistant', '/insurance-desk'],
  },
  {
    to: '/inbox', icon: Inbox, label: 'Inbox',
    match: ['/messages', '/requests'],
  },
  {
    to: '/management', icon: Gauge, label: 'Management', shortLabel: 'Manage', managerOnly: true,
    match: ['/approvals', '/reports', '/report-history', '/team', '/acknowledgments', '/practice-setup'],
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

/**
 * The Management badge: how many attention items need the manager now — one
 * derived state, not a sum of queues. Waiting and parked items stay open but
 * are not counted here. Mounted only for owners and managers, so members
 * never read the office's records for a badge they cannot see.
 */
function ManagementBadge({ floating }: { floating?: boolean }) {
  const attention = useAttentionItems();
  return <CountBadge count={attention.counts.needsNow} floating={floating} />;
}

export default function AppLayout({ children }: { children: ReactNode }) {
  // Display timezone follows org context (person's override, else the
  // office setting) — one sync point for every wall-clock render.
  useTimezoneSync();
  const { privacyLock, signOut, user } = useAuth();
  const { data: ctx } = useOrgContext();
  const { data: branding } = useOrgBranding();
  const [collapsed, setCollapsed] = useState(false);
  // Inbox counts communication from people (unread conversations). Nudges are
  // suggestions, not work owed, and never badge a destination.
  const { data: conversations } = useConversations();
  const unreadConversations = (conversations ?? []).reduce((sum, c) => sum + (c.unreadCount > 0 ? 1 : 0), 0);
  const isActive = useIsActive();

  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';
  const destinations = DESTINATIONS.filter(d => !d.managerOnly || isManager);
  // The office identity leads; Purple Envelope signs the footer (blueprint §3).
  const officeName = branding?.displayName || ctx?.org_name || 'Purple Envelope';

  const badgeFor = (dest: Destination) => {
    if (dest.to === '/inbox') return unreadConversations;
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
        {dest.to === '/management' && isManager
          ? <ManagementBadge floating={collapsed} />
          : <CountBadge count={badge} floating={collapsed} />}
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

  /**
   * The account menu: settings, help, privacy lock, sign-out. One component
   * for both headers, so the phone never needs a "More" sheet (design §3.2).
   */
  const accountMenu = (
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
        <DropdownMenuItem onClick={() => window.dispatchEvent(new CustomEvent('pe:open-support'))}>
          <LifeBuoy className="mr-2 h-4 w-4" />Report a Problem
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={privacyLock} className="text-destructive focus:text-destructive">
          <ShieldCheck className="mr-2 h-4 w-4" />Privacy Lock
        </DropdownMenuItem>
        <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
          <LogOut className="mr-2 h-4 w-4" />Log Out
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/privacy" className="text-xs text-muted-foreground">
            <Mail className="mr-2 h-3 w-3 text-primary" />Powered by Purple Envelope · Privacy &amp; Terms
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

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
              <SendMomentDialog />
              <NotificationBell />
              {accountMenu}
            </header>

            {/* Mobile top header: office identity, notifications, and the
                account menu under the avatar (settings, help, privacy lock,
                sign-out). Privacy lock stays one tap away inside it. */}
            <header className="md:hidden flex items-center justify-between px-4 py-3 border-b bg-card sticky top-0 z-30">
              <Link to="/" className="flex items-center gap-2 min-w-0">
                <OfficeMark name={officeName} logoUrl={branding?.logoUrl} size="sm" />
                <span className="truncate font-semibold">{officeName}</span>
              </Link>
              <div className="flex items-center gap-1 shrink-0">
                <SendMomentDialog />
                <NotificationBell />
                {accountMenu}
              </div>
            </header>

            <BypassReasonBanner />

            <main className="flex-1 overflow-auto pb-[calc(9rem+env(safe-area-inset-bottom))] md:pb-0">
              {children}
            </main>

            <AppFooter />
          </div>

          {/* Mobile sticky clock bar (above the bottom navigation). */}
          <GlobalTimeControl variant="bar" />

          {/* Mobile bottom navigation, role-shaped (design §3.2): Home ·
              Workplace · Playbook · Inbox, and Manage with the Attention
              badge for owners and managers. Safe-area padding keeps the
              row clear of home indicators; nothing may float over it. */}
          <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 flex min-h-16 items-stretch border-t bg-card pb-[env(safe-area-inset-bottom)]">
            {destinations.map(dest => {
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
                    {dest.to === '/management' && isManager
                      ? <ManagementBadge floating />
                      : <CountBadge count={badge} floating />}
                  </span>
                  {dest.shortLabel ?? dest.label}
                </Link>
              );
            })}
          </nav>

          {/* Team Moments: anchored, never blocking navigation or clocking. */}
          <TeamMomentsReveal />

          <SupportWidget />

          {/* Google Chat-style dock (desktop) + corner popups for new messages. */}
          <ChatDock />
          <MessagePopups />
        </div>
      </ClockProvider>
    </TooltipProvider>
  );
}
