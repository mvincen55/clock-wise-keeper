import { describe, expect, it } from 'vitest';
import {
  applyEvent,
  applyPlan,
  canRetry,
  completeness,
  finishWithoutCall,
  informationIssues,
  makeTask,
  matchPlan,
  missingQuestions,
  needsCall,
  type TaskEvent,
} from './workflow';
import { genericRuleSchema, planDraftSchema, questionId } from './schema';
import {
  demoOrg,
  syntheticPlan,
  syntheticSettings,
  syntheticTasks,
} from './synthetic';
import { mapRow, readTable } from '../adapters/import';

const now = new Date('2026-09-11T15:00:00Z');
function task() {
  const t = syntheticTasks('session')[0];
  t.planIdentity.benefitYear = '2026';
  t.identity.serviceDate = '2026-09-11';
  t.reviewed = true;
  return t;
}
describe('reviewed benefits workflow', () => {
  it('finishes breakdown without requiring a patient or call', () => {
    const t = task();
    t.identity = {
      patientName: '',
      memberId: '',
      birthDate: '',
      serviceDate: '',
    };
    const p = syntheticPlan(now);
    expect(matchPlan(t, [p], demoOrg, now, 90).state).toBe('matched');
    const result = applyPlan(t, p);
    expect(informationIssues(result)).toEqual([]);
    expect(needsCall(result)).toBe(false);
    expect(finishWithoutCall(result).progress).toBe('finished');
    expect(result.attempts).toEqual([]);
  });
  it('never supplies member accumulators from generic matching', () => {
    const t = syntheticTasks('session')[1];
    const result = applyPlan(t, syntheticPlan(now));
    expect(missingQuestions(result).map((q) => q.key)).toContain(
      'remaining_maximum',
    );
    expect(needsCall(result)).toBe(true);
  });
  it.each(['product', 'subgroup', 'network', 'benefitYear'] as const)(
    'requires missing discriminator %s',
    (key) => {
      const t = task();
      t.planIdentity[key] = '';
      expect(matchPlan(t, [syntheticPlan(now)], demoOrg, now, 90).state).toBe(
        'review',
      );
    },
  );
  it('does not select the first colliding plan', () => {
    const p = syntheticPlan(now);
    expect(
      matchPlan(task(), [p, { ...p, id: 'other' }], demoOrg, now, 90).state,
    ).toBe('review');
  });
  it('rejects stale review, future review, expired period and cross-office source', () => {
    const p = syntheticPlan(now);
    for (const change of [
      { reviewedAt: '2020-01-01' },
      { reviewedAt: '2027-01-01' },
      { effectiveTo: '2026-01-01' },
      { confidence: 'low' as const },
    ])
      expect(
        matchPlan(task(), [{ ...p, ...change }], demoOrg, now, 90).state,
      ).toBe('review');
    expect(matchPlan(task(), [p], 'different-office', now, 90).state).toBe(
      'none',
    );
  });
  it('preserves immutable version snapshots', () => {
    const p = syntheticPlan(now);
    const t = applyPlan(task(), p);
    p.source = 'new notes';
    p.rules[0].value = false;
    expect(t.planSnapshot?.source).not.toBe('new notes');
    expect(t.answers[0].value).not.toBe(false);
  });
  it('requires a fresh call when explicitly requested', () => {
    const t = task();
    t.forceFresh = true;
    expect(needsCall(applyPlan(t, syntheticPlan(now)))).toBe(true);
  });
  it('rejects member fields, freeform model payloads and FOF defaults as plan records', () => {
    const p = syntheticPlan(now);
    expect(planDraftSchema.safeParse({ ...p, memberId: '123' }).success).toBe(
      false,
    );
    expect(
      genericRuleSchema.safeParse({
        key: 'remaining_maximum',
        scope: 'plan',
        status: 'confirmed',
        value: 100,
      }).success,
    ).toBe(false);
    expect(
      genericRuleSchema.safeParse({
        key: 'coverage',
        scope: 'plan',
        status: 'confirmed',
        value: {
          amount: 80,
          unit: 'percent',
          window: 'none',
          windowMonths: null,
          transcript: 'secret',
        },
      }).success,
    ).toBe(false);
    expect(
      planDraftSchema.safeParse({
        preventivePct: 100,
        basicPct: 80,
        majorPct: 50,
      }).success,
    ).toBe(false);
  });
  it('requires staff sources for the exact service date', () => {
    const t = syntheticTasks('session')[1];
    t.answers = [
      {
        questionId: 'remaining_maximum:plan',
        value: '500',
        state: 'answered',
        source: 'staff',
        at: now.toISOString(),
        qualification: 'portal',
        suitableCurrentSource: true,
        serviceDate: '2000-01-01',
      },
    ];
    expect(missingQuestions(t).some((q) => q.key === 'remaining_maximum')).toBe(
      true,
    );
  });
  it('preserves leading zero identifiers and rejects ambiguous dates', () => {
    const parsed = readTable(
      'memberId,groupRaw,birthDate\n000123,00042,01/02/2000',
    );
    const t = mapRow(task(), parsed.rows[0], {
      memberId: 0,
      groupRaw: 1,
      birthDate: 2,
    });
    expect(t.identity.memberId).toBe('000123');
    expect(t.planIdentity.groupRaw).toBe('00042');
    expect(informationIssues(t).some((x) => x.includes('YYYY-MM-DD'))).toBe(
      true,
    );
    expect(t.reviewed).toBe(false);
  });
});
describe('event and result isolation', () => {
  function prepared() {
    const t = task();
    t.progress = 'calling';
    t.attempts = [
      {
        id: 'attempt',
        number: 1,
        startedAt: now.toISOString(),
        launch: 'confirmed',
        lastSequence: 0,
      },
    ];
    return t;
  }
  const event: TaskEvent = {
    id: 'e',
    sessionId: 'session',
    taskId: '',
    attemptId: 'attempt',
    sequence: 1,
    at: now.toISOString(),
    kind: 'ended',
  };
  it('never turns disconnect or a fax promise into collected answers', () => {
    const t = prepared();
    const ended = applyEvent(t, { ...event, taskId: t.id });
    expect(ended.progress).toBe('finished');
    expect(completeness(ended)).toBe('none');
    const fax = applyEvent(t, {
      ...event,
      taskId: t.id,
      kind: 'fax_requested',
    });
    expect(fax.fax).toBe('requested');
    expect(completeness(fax)).toBe('none');
  });
  it('rejects other row, session, attempt and duplicate events after sorting', () => {
    const t = prepared();
    for (const change of [
      { taskId: 'other' },
      { sessionId: 'old' },
      { attemptId: 'old' },
    ])
      expect(applyEvent(t, { ...event, taskId: t.id, ...change })).toBe(t);
    const e = { ...event, taskId: t.id };
    const done = applyEvent(t, e);
    expect(applyEvent(done, e)).toBe(done);
  });
  it('does not regress a terminal call on delayed hold', () => {
    const t = prepared();
    const ended = applyEvent(t, { ...event, taskId: t.id });
    expect(
      applyEvent(ended, {
        ...event,
        id: 'late',
        taskId: t.id,
        sequence: 2,
        kind: 'hold',
      }),
    ).toBe(ended);
  });
  it('keeps negative answers distinct from unknown', () => {
    const t = prepared();
    const e = {
      ...event,
      taskId: t.id,
      kind: 'answer' as const,
      answer: {
        questionId: questionId(t.questions[0]),
        value: false,
        state: 'answered' as const,
        source: 'representative' as const,
        at: now.toISOString(),
        qualification: '',
      },
    };
    expect(missingQuestions(applyEvent(t, e))).toHaveLength(1);
  });
  it('does not retry an ambiguous launch', () => {
    const t = prepared();
    t.progress = 'needs_staff';
    t.limits.retries = 2;
    t.attempts[0].launch = 'ambiguous';
    expect(canRetry(t)).toBe(false);
  });
});
