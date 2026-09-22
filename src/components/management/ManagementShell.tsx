import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useAttentionItems } from '@/hooks/useAttentionItems';

/**
 * Management is the workbench: the only place management actions happen
 * (design §3.4). Four rooms, one count. The sidebar lands on Attention.
 */
export type ManagementRoom = 'attention' | 'people' | 'payroll' | 'office';

const ROOMS: { id: ManagementRoom; label: string; to: string; answers: string }[] = [
  { id: 'attention', label: 'Attention', to: '/management', answers: 'What needs me, in order of consequence?' },
  { id: 'people', label: 'People', to: '/management/people', answers: 'Who is here, who is missing, who needs follow-up?' },
  { id: 'payroll', label: 'Payroll', to: '/management/payroll', answers: 'Is payroll clean, and what do I fix first?' },
  { id: 'office', label: 'Office', to: '/management/office', answers: 'Periodic management of the office as a whole' },
];

/** Which room a management path belongs to, for the switcher and the sidebar. */
function roomForPath(pathname: string): ManagementRoom {
  if (pathname.startsWith('/management/people') || pathname.startsWith('/management/attendance')) return 'people';
  if (pathname.startsWith('/management/payroll') || pathname.startsWith('/reports') || pathname.startsWith('/report-history')) return 'payroll';
  if (pathname.startsWith('/management/office') || pathname.startsWith('/management/knowledge') || pathname.startsWith('/management/missed-appointments') || pathname.startsWith('/practice-setup')) return 'office';
  return 'attention';
}

function RoomCount() {
  const attention = useAttentionItems();
  const n = attention.counts.needsNow;
  if (!n) return null;
  return (
    <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-bold text-destructive-foreground" aria-label={`${n} need you now`}>
      {n}
    </span>
  );
}

/**
 * The room switcher plus the manager gate. Members are sent home, as the
 * Management page always did; while the role is unknown nothing renders.
 */
export default function ManagementShell({ room, children, wide = false }: { room?: ManagementRoom; children: ReactNode; wide?: boolean }) {
  const { data: ctx, isLoading } = useOrgContext();
  const location = useLocation();
  const active = room ?? roomForPath(location.pathname);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';
  if (ctx && !isManager) return <Navigate to="/" replace />;

  return (
    <div className={`p-4 md:p-8 mx-auto space-y-6 ${wide ? 'max-w-7xl' : 'max-w-5xl'}`}>
      <nav aria-label="Management rooms" className="flex flex-wrap items-center gap-1 border-b pb-3">
        <span className="mr-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Management</span>
        {ROOMS.map(r => {
          const current = r.id === active;
          return (
            <Link
              key={r.id}
              to={r.to}
              aria-current={current ? 'page' : undefined}
              title={r.answers}
              className={`inline-flex min-h-9 items-center rounded-md px-3 text-sm font-medium transition-colors ${
                current ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {r.label}
              {r.id === 'attention' && <RoomCount />}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
