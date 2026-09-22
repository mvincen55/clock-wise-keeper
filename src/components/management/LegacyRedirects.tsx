import { Navigate, useLocation, useParams } from 'react-router-dom';
import type { AttentionKind } from '@/lib/attention';

/**
 * Legacy manager routes keep working: every old address lands on the room
 * that owns it now, carrying its deep link along (design §3.4, §3.8).
 * Nothing here decides anything; each is a plain redirect.
 */

const APPROVALS_TAB_KIND: Record<string, AttentionKind> = {
  'change-requests': 'change_request',
  'pto-requests': 'pto_request',
  corrections: 'correction_request',
};

/** /approvals[?tab=&request=] → /management?kind=decide or the exact item. */
export function LegacyApprovalsRedirect() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const tab = params.get('tab');
  const request = params.get('request');
  const kind = tab ? APPROVALS_TAB_KIND[tab] : undefined;
  if (kind && request) return <Navigate to={`/management?item=${kind}:${request}`} replace />;
  return <Navigate to="/management?kind=decide" replace />;
}

/** /team[?bypass=] → /management/people (Patterns keeps the bypass highlight). */
export function LegacyTeamRedirect() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const bypass = params.get('bypass');
  return <Navigate to={bypass ? `/management/people?view=patterns&bypass=${encodeURIComponent(bypass)}` : '/management/people'} replace />;
}

/** /team/:employeeId → /management/people/:employeeId */
export function LegacyEmployeeRedirect() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const { search } = useLocation();
  return <Navigate to={`/management/people/${employeeId ?? ''}${search}`} replace />;
}

/** /acknowledgments[?assignment=] → /management/office/acknowledgments */
export function LegacyAcknowledgmentsRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/management/office/acknowledgments${search}`} replace />;
}

/**
 * /settings/:tab → Office settings (office, people, workflows) or My
 * settings (me). The search and hash ride along so `?closingDate=` and
 * `#schedule-intelligence` keep their meaning.
 */
export function LegacySettingsTabRedirect() {
  const { tab } = useParams<{ tab: string }>();
  const { search, hash } = useLocation();
  if (tab === 'office' || tab === 'people' || tab === 'workflows') {
    return <Navigate to={`/management/office/settings${search}${hash}`} replace />;
  }
  return <Navigate to={`/settings${search}${hash}`} replace />;
}
