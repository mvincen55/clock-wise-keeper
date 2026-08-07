import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  resolveNotificationDestination,
  isKnownNotificationType,
  isSafeId,
  KNOWN_NOTIFICATION_TYPES,
  type NotificationLike,
} from '@/lib/notification-routing';

const n = (
  notification_type: string,
  related_table: string | null = null,
  related_id: string | null = null
): NotificationLike => ({ notification_type, related_table, related_id });

const asManager = { role: 'manager' as const };
const asOwner = { role: 'owner' as const };
const asEmployee = { role: 'employee' as const };

describe('notification routing — every current type has a destination', () => {
  it('routes PTO requests by role', () => {
    const manager = resolveNotificationDestination(n('pto_request_new', 'pto_requests', 'pto-1'), asManager);
    expect(manager.to).toBe('/approvals?tab=pto-requests&request=pto-1');
    expect(manager.exact).toBe(true);
    expect(manager.fallback).toBe(false);

    // An employee never lands on a management surface.
    const employee = resolveNotificationDestination(n('pto_request_new', 'pto_requests', 'pto-1'), asEmployee);
    expect(employee.to).toBe('/pto?request=pto-1');

    expect(resolveNotificationDestination(n('pto_request_approved', 'pto_requests', 'pto-2'), asEmployee).to)
      .toBe('/pto?request=pto-2');
    expect(resolveNotificationDestination(n('pto_request_denied', 'pto_requests', 'pto-3'), asEmployee).to)
      .toBe('/pto?request=pto-3');
  });

  it('routes correction requests to the queue for managers and history for employees', () => {
    expect(resolveNotificationDestination(n('correction_request_new', 'correction_requests', 'cr-1'), asManager).to)
      .toBe('/approvals?tab=corrections&request=cr-1');
    expect(resolveNotificationDestination(n('correction_approved', 'correction_requests', 'cr-2'), asEmployee).to)
      .toBe('/my-requests?correction=cr-2');
    expect(resolveNotificationDestination(n('correction_denied', 'correction_requests', 'cr-3'), asEmployee).to)
      .toBe('/my-requests?correction=cr-3');
  });

  it('routes change requests by role', () => {
    expect(resolveNotificationDestination(n('change_request_new', 'change_requests', 'ch-1'), asOwner).to)
      .toBe('/approvals?tab=change-requests&request=ch-1');
    expect(resolveNotificationDestination(n('change_request_approved', 'change_requests', 'ch-2'), asEmployee).to)
      .toBe('/my-requests?request=ch-2');
    expect(resolveNotificationDestination(n('change_request_denied', 'change_requests', 'ch-3'), asEmployee).to)
      .toBe('/my-requests?request=ch-3');
  });

  it('keeps the existing incident-report deep link working (regression)', () => {
    for (const type of [
      'incident_report_new',
      'incident_report_signature_needed',
      'incident_report_signed',
      'incident_report_closed',
    ]) {
      const dest = resolveNotificationDestination(n(type, 'incident_reports', 'rep-9'), asEmployee);
      expect(dest.to).toBe('/incident-reports?report=rep-9');
      expect(dest.exact).toBe(true);
    }
  });

  it('routes training to the exact assignment, including the legacy module shape', () => {
    // Canonical shape: the person’s own assignment row.
    expect(resolveNotificationDestination(n('training_assigned', 'training_assignments', 'as-1'), asEmployee).to)
      .toBe('/training?tab=mine&assignment=as-1');
    // Legacy rows created before the producer fix carried the module id.
    expect(resolveNotificationDestination(n('training_assigned', 'training_modules', 'mod-1'), asEmployee).to)
      .toBe('/training?tab=mine&module=mod-1');
    expect(resolveNotificationDestination(n('training_due', 'training_assignments', 'as-2'), asEmployee).to)
      .toBe('/training?tab=mine&assignment=as-2');
    expect(resolveNotificationDestination(n('ai_training_due', 'training_assignments', 'as-3'), asEmployee).to)
      .toBe('/training?tab=mine&assignment=as-3');
  });

  it('routes goals and goal steps to the exact record', () => {
    expect(resolveNotificationDestination(n('goal_step_due', 'checklist_items', 'item-1'), asEmployee).to)
      .toBe('/checklists?item=item-1');
    expect(resolveNotificationDestination(n('ai_goal_task_due', 'goal_tasks', 'task-1'), asEmployee).to)
      .toBe('/goals?task=task-1');
    expect(resolveNotificationDestination(n('ai_plan_stall', 'goals', 'goal-1'), asEmployee).to)
      .toBe('/goals?goal=goal-1');
  });

  it('routes every acknowledgment event to the exact assignment', () => {
    for (const type of [
      'knowledge_acknowledgment_required',
      'knowledge_acknowledgment_due',
      'knowledge_acknowledgment_blocked',
      'knowledge_acknowledgment_unblocked',
      'knowledge_acknowledgment_question',
      'knowledge_acknowledgment_question_answered',
      'knowledge_acknowledgment_manager_escalation',
      'knowledge_acknowledgment_owner_escalation',
    ]) {
      const dest = resolveNotificationDestination(n(type, 'knowledge_acknowledgments', 'ack-7'), asManager);
      expect(dest.to).toBe('/acknowledgments?assignment=ack-7');
      expect(dest.exact).toBe(true);
    }
  });

  it('routes accountability records by role', () => {
    expect(resolveNotificationDestination(n('accountability_record', 'accountability_reports', 'r-1'), asEmployee).to)
      .toBe('/?record=r-1');
    expect(resolveNotificationDestination(n('accountability_review_due', 'accountability_reports', 'r-2'), asManager).to)
      .toBe('/management?record=r-2');
    expect(resolveNotificationDestination(n('accountability_escalation', 'accountability_reports', 'r-3'), asOwner).to)
      .toBe('/management?record=r-3');
  });

  it('routes checklist bypasses to the team view for managers only', () => {
    expect(resolveNotificationDestination(n('checklist_bypass', 'checklist_bypasses', 'b-1'), asManager).to)
      .toBe('/team?bypass=b-1');
    // Employees have no bypass surface; they get the checklists module, not a manager page.
    expect(resolveNotificationDestination(n('checklist_bypass', 'checklist_bypasses', 'b-1'), asEmployee).to)
      .toBe('/checklists');
  });

  it('routes sprint updates to the dashboard sprint card', () => {
    for (const type of [
      'ai_sprint_verify',
      'ai_sprint_announced',
      'ai_sprint_won',
      'ai_sprint_missed',
      'ai_sprint_pending_verification',
      'ai_sprint_progress',
    ]) {
      expect(resolveNotificationDestination(n(type, 'team_goals', 'tg-1'), asManager).to).toBe('/?sprint=tg-1');
    }
  });

  it('routes messages to the exact conversation', () => {
    expect(resolveNotificationDestination(n('message', 'conversations', 'conv-1'), asEmployee).to)
      .toBe('/inbox/messages?conversation=conv-1');
  });

  it('routes integrity notices to settings (no per-event screen exists)', () => {
    expect(resolveNotificationDestination(n('integrity_elevated', 'security_events', 'sec-1'), asOwner).to)
      .toBe('/settings');
    expect(resolveNotificationDestination(n('integrity_digest', 'security_events', null), asOwner).to)
      .toBe('/settings');
  });
});

describe('notification routing — legacy and missing metadata', () => {
  it('falls back to the module list when related_id is missing', () => {
    expect(resolveNotificationDestination(n('pto_request_approved', 'pto_requests', null), asEmployee))
      .toMatchObject({ to: '/pto', exact: false });
    expect(resolveNotificationDestination(n('correction_request_new', 'correction_requests', null), asManager))
      .toMatchObject({ to: '/approvals?tab=corrections', exact: false });
    expect(resolveNotificationDestination(n('goal_step_due', null, null), asEmployee))
      .toMatchObject({ to: '/checklists', exact: false });
    expect(resolveNotificationDestination(n('incident_report_new', 'incident_reports', null), asManager))
      .toMatchObject({ to: '/incident-reports', exact: false });
  });

  it('routes an unknown type through its related_table', () => {
    const dest = resolveNotificationDestination(n('some_future_type', 'incident_reports', 'rep-1'), asManager);
    expect(dest.to).toBe('/incident-reports?report=rep-1');
    expect(dest.fallback).toBe(true);
  });

  it('routes an unknown AI type to the nudge inbox', () => {
    const dest = resolveNotificationDestination(n('ai_shiny_new_thing', null, null), asEmployee);
    expect(dest.to).toBe('/inbox/nudges');
    expect(dest.fallback).toBe(true);
  });

  it('never crashes or returns nothing for a fully unknown notification', () => {
    const dest = resolveNotificationDestination(n('mystery', 'mystery_table', 'x-1'), undefined as never);
    expect(dest.to).toBe('/');
    expect(dest.fallback).toBe(true);
    expect(dest.label).toBeTruthy();

    const empty = resolveNotificationDestination({ notification_type: '' });
    expect(empty.to).toBe('/');
  });

  it('refuses to embed unsafe identifiers in URLs', () => {
    expect(isSafeId('abc-123_DEF')).toBe(true);
    expect(isSafeId('x?y=1')).toBe(false);
    expect(isSafeId('<script>')).toBe(false);
    expect(isSafeId('')).toBe(false);

    const dest = resolveNotificationDestination(n('pto_request_approved', 'pto_requests', 'bad?id=1'), asEmployee);
    expect(dest.to).toBe('/pto');
  });

  it('resolves without role context (degrades to the employee-safe surface)', () => {
    const dest = resolveNotificationDestination(n('pto_request_new', 'pto_requests', 'pto-1'), {});
    expect(dest.to).toBe('/pto?request=pto-1');
  });
});

/**
 * The developer contract: any feature that creates a notification must give
 * it a destination. This inventories notification_type literals from the
 * TypeScript producers (frontend hooks and edge functions) automatically,
 * and carries an explicit registry for producers that live in SQL or build
 * their type dynamically. A new producer without a route fails here.
 */
describe('notification routing — producer inventory contract', () => {
  const ROOT = path.resolve(__dirname, '..', '..');

  /** Types created in SQL functions/triggers, or via dynamic `ai_${kind}` strings. */
  const REGISTERED_NON_STATIC_TYPES = [
    // supabase/migrations — messages trigger, acknowledgment RPCs, accountability sweep
    'message',
    'knowledge_acknowledgment_required',
    'knowledge_acknowledgment_blocked',
    'knowledge_acknowledgment_unblocked',
    'knowledge_acknowledgment_question',
    'knowledge_acknowledgment_question_answered',
    'accountability_escalation',
    // supabase/functions/office-pulse — notification_type is `ai_${kind}`
    'ai_goal_task_due',
    'ai_training_due',
    'ai_plan_stall',
    'ai_sprint_verify',
    'ai_sprint_announced',
    'ai_sprint_won',
    'ai_sprint_missed',
    'ai_sprint_pending_verification',
    'ai_sprint_progress',
  ];

  function* walk(dir: string): Generator<string> {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'test') continue;
        yield* walk(full);
      } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
        yield full;
      }
    }
  }

  function staticProducerTypes(): Map<string, string[]> {
    const found = new Map<string, string[]>();
    const roots = [path.join(ROOT, 'src'), path.join(ROOT, 'supabase', 'functions')];
    for (const root of roots) {
      for (const file of walk(root)) {
        const source = fs.readFileSync(file, 'utf8');
        // Take the full expression assigned to notification_type / notificationType
        // and collect every string literal in it — both arms of a ternary count.
        for (const match of source.matchAll(/notification_?[tT]ype:\s*([^\n]+)/g)) {
          for (const literal of match[1].matchAll(/["'`]([a-z0-9_]+)["'`]/g)) {
            const type = literal[1];
            // Ternary producers compare a status ('approved') on the same
            // line; actual type names are compound snake_case tokens.
            if (!type.includes('_')) continue;
            const files = found.get(type) ?? [];
            if (!files.includes(file)) files.push(file);
            found.set(type, files);
          }
        }
      }
    }
    return found;
  }

  it('every notification type created in TypeScript resolves to an explicit destination', () => {
    const produced = staticProducerTypes();
    expect(produced.size).toBeGreaterThan(0);
    const unmapped = [...produced.entries()]
      .filter(([type]) => !isKnownNotificationType(type))
      .map(([type, files]) => `${type} (${files.map(f => path.relative(ROOT, f)).join(', ')})`);
    expect(unmapped, `Producers created notification types with no route. Add them to NOTIFICATION_ROUTES in src/lib/notification-routing.ts:\n${unmapped.join('\n')}`).toEqual([]);
  });

  it('every SQL/dynamic notification type in the registry resolves to an explicit destination', () => {
    const unmapped = REGISTERED_NON_STATIC_TYPES.filter(type => !isKnownNotificationType(type));
    expect(unmapped).toEqual([]);
  });

  it('SQL producers in migrations do not create types outside the registry', () => {
    const migrationsDir = path.join(ROOT, 'supabase', 'migrations');
    // related_table literals share prefixes with type literals; they are not types.
    const TABLE_LITERALS = new Set(['knowledge_acknowledgments', 'accountability_reports']);
    const sqlTypes = new Set<string>();
    for (const entry of fs.readdirSync(migrationsDir)) {
      if (!entry.endsWith('.sql')) continue;
      const source = fs.readFileSync(path.join(migrationsDir, entry), 'utf8');
      // Every INSERT INTO public.notifications lists notification_type in its
      // column list; the type value is a quoted literal in the following rows.
      if (!/INSERT INTO (public\.)?notifications/i.test(source)) continue;
      for (const match of source.matchAll(/'((?:knowledge_acknowledgment|accountability|message)[a-z0-9_]*)'/g)) {
        if (!TABLE_LITERALS.has(match[1])) sqlTypes.add(match[1]);
      }
    }
    expect(sqlTypes.size).toBeGreaterThan(0);
    const unmapped = [...sqlTypes].filter(type => !isKnownNotificationType(type));
    expect(unmapped).toEqual([]);
  });

  it('every registered route yields an exact deep link when the record id is present', () => {
    // Integrity notices are the deliberate exception: no per-event screen exists.
    const moduleOnly = new Set(['integrity_elevated', 'integrity_digest']);
    const tableFor: Record<string, string> = {
      pto_request: 'pto_requests',
      correction: 'correction_requests',
      change_request: 'change_requests',
      incident_report: 'incident_reports',
      training: 'training_assignments',
      ai_training: 'training_assignments',
      goal_step_due: 'checklist_items',
      ai_goal_task_due: 'goal_tasks',
      ai_plan_stall: 'goals',
      knowledge: 'knowledge_acknowledgments',
      accountability: 'accountability_reports',
      checklist_bypass: 'checklist_bypasses',
      ai_sprint: 'team_goals',
      message: 'conversations',
    };
    for (const type of KNOWN_NOTIFICATION_TYPES) {
      if (moduleOnly.has(type)) continue;
      const prefix = Object.keys(tableFor).find(p => type.startsWith(p));
      const dest = resolveNotificationDestination(
        n(type, prefix ? tableFor[prefix] : null, 'id-123'),
        asManager
      );
      expect(dest.exact, `${type} should deep-link when an id exists (got ${dest.to})`).toBe(true);
      expect(dest.to).toContain('id-123');
    }
  });
});
