/**
 * Canonical notification routing — the one place that knows how a
 * notification maps to the application.
 *
 * The contract: every feature that creates a notification must also say
 * where that notification goes, by adding (or reusing) an entry in
 * NOTIFICATION_ROUTES below. The bell never guesses; it asks this module.
 * A type without an entry still resolves — first by its related_table,
 * then by a safe module-level fallback — but it warns in development and
 * fails the routing inventory test, so a new type cannot silently ship
 * without a destination.
 *
 * URLs carry record IDs only. Titles, messages, and anything resembling
 * patient or free-text detail stay out of the query string.
 */

export type NotificationLike = {
  notification_type: string;
  related_table?: string | null;
  related_id?: string | null;
};

export type OrgRole = 'owner' | 'manager' | 'employee';

export type RoutingContext = {
  /** The recipient's role, when known — some events have role-specific surfaces. */
  role?: OrgRole | null;
};

export type NotificationDestination = {
  /** Route path plus query string, ready for navigate(). */
  to: string;
  /** Short user-facing name of where the click lands, e.g. "Approvals · PTO". */
  label: string;
  /**
   * True when the destination opens/highlights the exact record. False when
   * the best we have is the right module or list.
   */
  exact: boolean;
  /** True when this came from fallback rules rather than an explicit mapping. */
  fallback: boolean;
};

const isAdmin = (role?: OrgRole | null) => role === 'owner' || role === 'manager';

const withParam = (path: string, key: string, id: string | null | undefined, extra?: string): string => {
  const params = new URLSearchParams(extra);
  if (id && isSafeId(id)) params.set(key, id);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
};

/** IDs only — nothing that could smuggle free text into a URL. */
export function isSafeId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

type RouteBuilder = (n: NotificationLike, ctx: RoutingContext) => Omit<NotificationDestination, 'fallback'>;

/** The approval queue, opened on the right tab with the right card highlighted. */
const approvalsTab =
  (tab: 'change-requests' | 'pto-requests' | 'corrections', tabLabel: string): RouteBuilder =>
  n => ({
    to: withParam('/approvals', 'request', n.related_id, `tab=${tab}`),
    label: `Approvals · ${tabLabel}`,
    exact: !!n.related_id,
  });

const incidentReport: RouteBuilder = n => ({
  to: withParam('/incident-reports', 'report', n.related_id),
  label: 'Incident Reports',
  exact: !!n.related_id,
});

const acknowledgment: RouteBuilder = n => ({
  to: withParam('/acknowledgments', 'assignment', n.related_id),
  label: 'Office Acknowledgments',
  exact: !!n.related_id,
});

const trainingAssignment: RouteBuilder = n => ({
  to: withParam('/training', 'assignment', n.related_id, 'tab=mine'),
  label: 'Training · My training',
  exact: !!n.related_id,
});

const accountability: RouteBuilder = (n, ctx) =>
  isAdmin(ctx.role)
    ? {
        to: withParam('/management', 'record', n.related_id),
        label: 'Management · Sign-offs',
        exact: !!n.related_id,
      }
    : {
        to: withParam('/', 'record', n.related_id),
        label: 'Home · My records',
        exact: !!n.related_id,
      };

const dashboardSprint: RouteBuilder = n => ({
  to: withParam('/', 'sprint', n.related_id),
  label: 'Home · Team sprint',
  exact: !!n.related_id,
});

/**
 * Explicit type → destination mapping. Use notification_type when it routes
 * more precisely than the table alone; the table map below is the net for
 * legacy rows and anything not listed here.
 */
const NOTIFICATION_ROUTES: Record<string, RouteBuilder> = {
  // ── PTO ──────────────────────────────────────────────────────────────
  pto_request_new: (n, ctx) =>
    isAdmin(ctx.role)
      ? approvalsTab('pto-requests', 'PTO Requests')(n, ctx)
      : { to: withParam('/pto', 'request', n.related_id), label: 'PTO', exact: !!n.related_id },
  pto_request_approved: n => ({
    to: withParam('/pto', 'request', n.related_id),
    label: 'PTO · My requests',
    exact: !!n.related_id,
  }),
  pto_request_denied: n => ({
    to: withParam('/pto', 'request', n.related_id),
    label: 'PTO · My requests',
    exact: !!n.related_id,
  }),

  // ── Corrections ──────────────────────────────────────────────────────
  correction_request_new: (n, ctx) =>
    isAdmin(ctx.role)
      ? approvalsTab('corrections', 'Corrections')(n, ctx)
      : { to: withParam('/my-requests', 'correction', n.related_id), label: 'My Requests', exact: !!n.related_id },
  correction_approved: n => ({
    to: withParam('/my-requests', 'correction', n.related_id),
    label: 'My Requests · Corrections',
    exact: !!n.related_id,
  }),
  correction_denied: n => ({
    to: withParam('/my-requests', 'correction', n.related_id),
    label: 'My Requests · Corrections',
    exact: !!n.related_id,
  }),

  // ── Change requests ──────────────────────────────────────────────────
  change_request_new: (n, ctx) =>
    isAdmin(ctx.role)
      ? approvalsTab('change-requests', 'Change Requests')(n, ctx)
      : { to: withParam('/my-requests', 'request', n.related_id), label: 'My Requests', exact: !!n.related_id },
  change_request_approved: n => ({
    to: withParam('/my-requests', 'request', n.related_id),
    label: 'My Requests',
    exact: !!n.related_id,
  }),
  change_request_denied: n => ({
    to: withParam('/my-requests', 'request', n.related_id),
    label: 'My Requests',
    exact: !!n.related_id,
  }),

  // ── Incident reports ─────────────────────────────────────────────────
  incident_report_new: incidentReport,
  incident_report_signature_needed: incidentReport,
  incident_report_signed: incidentReport,
  incident_report_closed: incidentReport,

  // ── Training ─────────────────────────────────────────────────────────
  // New assignments historically carried the module id; reminders carry the
  // assignment id. Both open "My training" with the right module in front.
  training_assigned: n =>
    n.related_table === 'training_assignments'
      ? trainingAssignment(n, {})
      : {
          to: withParam('/training', 'module', n.related_id, 'tab=mine'),
          label: 'Training · My training',
          exact: !!n.related_id,
        },
  training_due: trainingAssignment,
  ai_training_due: trainingAssignment,

  // ── Goals & goal steps ───────────────────────────────────────────────
  goal_step_due: n => ({
    to: withParam('/checklists', 'item', n.related_id),
    label: 'Checklists · My Goal Steps',
    exact: !!n.related_id,
  }),
  ai_goal_task_due: n => ({
    to: withParam('/goals', 'task', n.related_id),
    label: 'Goals',
    exact: !!n.related_id,
  }),
  ai_plan_stall: n => ({
    to: withParam('/goals', 'goal', n.related_id),
    label: 'Goals',
    exact: !!n.related_id,
  }),

  // ── Knowledge acknowledgments ────────────────────────────────────────
  knowledge_acknowledgment_required: acknowledgment,
  knowledge_acknowledgment_due: acknowledgment,
  knowledge_acknowledgment_blocked: acknowledgment,
  knowledge_acknowledgment_unblocked: acknowledgment,
  knowledge_acknowledgment_question: acknowledgment,
  knowledge_acknowledgment_question_answered: acknowledgment,
  knowledge_acknowledgment_manager_escalation: acknowledgment,
  knowledge_acknowledgment_owner_escalation: acknowledgment,

  // ── Accountability ───────────────────────────────────────────────────
  accountability_record: accountability,
  accountability_review_due: accountability,
  accountability_escalation: accountability,

  // ── Checklist bypasses ───────────────────────────────────────────────
  checklist_bypass: (n, ctx) =>
    isAdmin(ctx.role)
      ? { to: withParam('/team', 'bypass', n.related_id), label: 'Team · Checklist bypasses', exact: !!n.related_id }
      : { to: '/checklists', label: 'Checklists', exact: false },

  // ── Team sprints (office pulse) ──────────────────────────────────────
  ai_sprint_verify: dashboardSprint,
  ai_sprint_announced: dashboardSprint,
  ai_sprint_won: dashboardSprint,
  ai_sprint_missed: dashboardSprint,
  ai_sprint_pending_verification: dashboardSprint,
  ai_sprint_progress: dashboardSprint,

  // ── Messages ─────────────────────────────────────────────────────────
  message: n => ({
    to: withParam('/inbox/messages', 'conversation', n.related_id),
    label: 'Inbox · Messages',
    exact: !!n.related_id,
  }),

  // ── Integrity & safety (owner-facing; no per-event screen exists) ────
  integrity_elevated: () => ({ to: '/settings', label: 'Office Settings', exact: false }),
  integrity_digest: () => ({ to: '/settings', label: 'Office Settings', exact: false }),
};

/**
 * Table-level net for notifications whose type has no explicit entry —
 * usually legacy rows. Points at the module list; exact only where the
 * page can open a record straight from the id.
 */
const TABLE_ROUTES: Record<string, RouteBuilder> = {
  pto_requests: (n, ctx) =>
    isAdmin(ctx.role)
      ? approvalsTab('pto-requests', 'PTO Requests')(n, ctx)
      : { to: withParam('/pto', 'request', n.related_id), label: 'PTO', exact: !!n.related_id },
  correction_requests: (n, ctx) =>
    isAdmin(ctx.role)
      ? approvalsTab('corrections', 'Corrections')(n, ctx)
      : { to: withParam('/my-requests', 'correction', n.related_id), label: 'My Requests', exact: !!n.related_id },
  change_requests: (n, ctx) =>
    isAdmin(ctx.role)
      ? approvalsTab('change-requests', 'Change Requests')(n, ctx)
      : { to: withParam('/my-requests', 'request', n.related_id), label: 'My Requests', exact: !!n.related_id },
  incident_reports: incidentReport,
  training_assignments: trainingAssignment,
  training_modules: n => ({
    to: withParam('/training', 'module', n.related_id, 'tab=mine'),
    label: 'Training',
    exact: !!n.related_id,
  }),
  checklist_items: n => ({
    to: withParam('/checklists', 'item', n.related_id),
    label: 'Checklists',
    exact: !!n.related_id,
  }),
  goal_tasks: n => ({ to: withParam('/goals', 'task', n.related_id), label: 'Goals', exact: !!n.related_id }),
  goals: n => ({ to: withParam('/goals', 'goal', n.related_id), label: 'Goals', exact: !!n.related_id }),
  knowledge_acknowledgments: acknowledgment,
  accountability_reports: accountability,
  checklist_bypasses: (n, ctx) =>
    isAdmin(ctx.role)
      ? { to: withParam('/team', 'bypass', n.related_id), label: 'Team · Checklist bypasses', exact: !!n.related_id }
      : { to: '/checklists', label: 'Checklists', exact: false },
  team_goals: dashboardSprint,
  conversations: n => ({
    to: withParam('/inbox/messages', 'conversation', n.related_id),
    label: 'Inbox · Messages',
    exact: !!n.related_id,
  }),
  security_events: () => ({ to: '/settings', label: 'Office Settings', exact: false }),
};

/** Every notification type with an explicit destination. Tests inventory against this. */
export const KNOWN_NOTIFICATION_TYPES: readonly string[] = Object.freeze(
  Object.keys(NOTIFICATION_ROUTES)
);

export function isKnownNotificationType(type: string): boolean {
  return Object.prototype.hasOwnProperty.call(NOTIFICATION_ROUTES, type);
}

const warned = new Set<string>();
function warnOnce(key: string, message: string) {
  if (warned.has(key)) return;
  warned.add(key);
  if (import.meta.env.DEV) {
    console.warn(`[notification-routing] ${message}`);
  }
}

/**
 * Resolve where a notification takes its recipient. Total: every input gets
 * a destination — worst case the home page — so the bell never dead-clicks.
 */
export function resolveNotificationDestination(
  n: NotificationLike,
  ctx: RoutingContext = {}
): NotificationDestination {
  const type = n.notification_type || '';

  const explicit = NOTIFICATION_ROUTES[type];
  if (explicit) {
    return { ...explicit(n, ctx), fallback: false };
  }

  // Unknown type: fall back to the table when we recognize it.
  const table = n.related_table ? TABLE_ROUTES[n.related_table] : undefined;
  if (table) {
    warnOnce(
      `type:${type}`,
      `No route registered for notification_type "${type}"; fell back to related_table "${n.related_table}". Add it to NOTIFICATION_ROUTES in src/lib/notification-routing.ts.`
    );
    return { ...table(n, ctx), fallback: true };
  }

  // AI nudges we have not met yet read best in the nudge inbox.
  if (type.startsWith('ai_')) {
    warnOnce(
      `type:${type}`,
      `No route registered for AI notification_type "${type}"; sending to the nudge inbox. Add it to NOTIFICATION_ROUTES in src/lib/notification-routing.ts.`
    );
    return { to: '/inbox/nudges', label: 'Inbox · Nudges', exact: false, fallback: true };
  }

  warnOnce(
    `type:${type}`,
    `No route registered for notification_type "${type}" (related_table: ${n.related_table ?? 'none'}); sending home. Add it to NOTIFICATION_ROUTES in src/lib/notification-routing.ts.`
  );
  return { to: '/', label: 'Home', exact: false, fallback: true };
}
