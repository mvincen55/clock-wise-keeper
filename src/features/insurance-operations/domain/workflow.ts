import {
  dateSchema,
  isGeneric,
  questionId,
  presetFor,
  type OfficeSettings,
  type PlanVersion,
  type Question,
  type RequestKind,
  type DeliveryGoal,
} from './schema';

export type Identity = {
  patientName: string;
  memberId: string;
  birthDate: string;
  serviceDate: string;
};
export type PlanIdentity = {
  payerId: string;
  groupRaw: string;
  product: string;
  subgroup: string;
  network: string;
  providerId: string | null;
  benefitYear: string;
};
export type Answer = {
  questionId: string;
  value: unknown;
  state: 'answered' | 'unknown' | 'not_asked' | 'unavailable';
  source: 'plan_library' | 'ivr' | 'representative' | 'staff' | 'unknown';
  at: string;
  qualification: string;
  planVersionId?: string;
  serviceDate?: string;
  suitableCurrentSource?: boolean;
};
export type Progress =
  | 'draft'
  | 'queued'
  | 'launching'
  | 'calling'
  | 'on_hold'
  | 'needs_staff'
  | 'finished'
  | 'failed'
  | 'cancelled';
export type Attempt = {
  id: string;
  number: number;
  startedAt: string;
  endedAt?: string;
  callRef?: string;
  launch: 'pending' | 'confirmed' | 'ambiguous' | 'not_created';
  lastSequence: number;
};
export type TaskEvent = {
  id: string;
  sessionId: string;
  taskId: string;
  attemptId: string;
  sequence: number;
  at: string;
  kind:
    | 'started'
    | 'hold'
    | 'representative'
    | 'answer'
    | 'fax_requested'
    | 'needs_staff'
    | 'ended'
    | 'failed';
  answer?: Answer;
  callRef?: string;
  detail?: string;
};
export type Task = {
  id: string;
  workflowKind: 'benefits';
  payloadVersion: 1;
  revision: number;
  sessionId: string;
  identity: Identity;
  planIdentity: PlanIdentity;
  kind: RequestKind;
  delivery: DeliveryGoal;
  codes: string[];
  questions: Question[];
  presetVersion: number;
  limits: OfficeSettings['presets']['breakdown']['limits'];
  reviewed: boolean;
  forceFresh: boolean;
  planSnapshot: PlanVersion | null;
  answers: Answer[];
  progress: Progress;
  fax: 'not_requested' | 'requested' | 'received';
  attempts: Attempt[];
  events: TaskEvent[];
  selected: boolean;
};
export function makeTask(
  sessionId: string,
  settings: OfficeSettings,
  kind = settings.defaultKind,
): Task {
  const preset = presetFor(settings, kind, '');
  return {
    id: crypto.randomUUID(),
    workflowKind: 'benefits',
    payloadVersion: 1,
    revision: 1,
    sessionId,
    identity: { patientName: '', memberId: '', birthDate: '', serviceDate: '' },
    planIdentity: {
      payerId: '',
      groupRaw: '',
      product: '',
      subgroup: '',
      network: '',
      providerId: null,
      benefitYear: '',
    },
    kind,
    delivery: settings.defaultDelivery,
    codes: [],
    questions: preset.questions as Question[],
    presetVersion: settings.version,
    limits: preset.limits,
    reviewed: false,
    forceFresh: false,
    planSnapshot: null,
    answers: [],
    progress: 'draft',
    fax: 'not_requested',
    attempts: [],
    events: [],
    selected: true,
  };
}
// Do not strip punctuation/leading zeros: normalization must not manufacture identity.
export const normalizeIdentifier = (value: string) =>
  value.trim().toUpperCase();
export type Match = {
  state: 'matched' | 'review' | 'none';
  candidates: PlanVersion[];
  reason: string;
};
export function matchPlan(
  task: Task,
  plans: PlanVersion[],
  orgId: string,
  now: Date,
  freshnessDays: number,
): Match {
  const p = task.planIdentity;
  const candidates = plans.filter(
    (x) =>
      x.orgId === orgId &&
      x.status === 'reviewed' &&
      x.payerId === p.payerId &&
      x.groupNormalized === normalizeIdentifier(p.groupRaw),
  );
  if (!candidates.length)
    return {
      state: 'none',
      candidates,
      reason: 'No reviewed payer/group record',
    };
  if (
    ![p.groupRaw, p.product, p.subgroup, p.network, p.benefitYear].every((v) =>
      v.trim(),
    )
  )
    return {
      state: 'review',
      candidates,
      reason:
        'Confirm product, subgroup, network and benefit year (use an explicit not-applicable value when supported)',
    };
  const date = task.identity.serviceDate || now.toISOString().slice(0, 10);
  const exact = candidates.filter(
    (x) =>
      x.product === p.product &&
      x.subgroup === p.subgroup &&
      x.network === p.network &&
      x.providerId === p.providerId &&
      x.benefitYear === p.benefitYear,
  );
  const current = exact.filter(
    (x) =>
      x.effectiveFrom <= date &&
      x.effectiveTo >= date &&
      Date.parse(x.reviewedAt) <= now.getTime() &&
      now.getTime() - Date.parse(x.reviewedAt) <= freshnessDays * 86400000 &&
      x.confidence === 'high',
  );
  if (current.length !== 1)
    return {
      state: 'review',
      candidates,
      reason:
        current.length > 1
          ? 'Multiple current versions need source review'
          : 'Variant, period, confidence or review date needs review',
    };
  if (current[0].rules.some((r) => r.status === 'conflicting'))
    return {
      state: 'review',
      candidates,
      reason: 'Conflicting plan rules need review',
    };
  if (
    new Set(current[0].rules.map((r) => `${r.key}:${r.scope}`)).size !==
    current[0].rules.length
  )
    return {
      state: 'review',
      candidates,
      reason: 'Duplicate rule scopes require source review',
    };
  return {
    state: 'matched',
    candidates: current,
    reason: 'Current reviewed version with all discriminators',
  };
}
export function applyPlan(task: Task, plan: PlanVersion): Task {
  const snapshot = structuredClone(plan);
  const answers = task.answers.filter((a) => a.source !== 'plan_library');
  if (!task.forceFresh)
    for (const q of task.questions) {
      if (!isGeneric(q.key)) continue;
      const rule = snapshot.rules.find(
        (r) =>
          r.key === q.key && r.scope === q.scope && r.status === 'confirmed',
      );
      if (rule && !answers.some((a) => a.questionId === questionId(q)))
        answers.push({
          questionId: questionId(q),
          value: structuredClone(rule.value),
          state: 'answered',
          source: 'plan_library',
          at: snapshot.reviewedAt,
          qualification: snapshot.source,
          planVersionId: snapshot.id,
        });
    }
  return { ...task, planSnapshot: snapshot, answers };
}
export function usableAnswer(task: Task, q: Question) {
  return task.answers.find(
    (a) =>
      a.questionId === questionId(q) &&
      a.state === 'answered' &&
      a.value !== null &&
      a.value !== undefined &&
      (isGeneric(q.key)
        ? !(task.forceFresh && a.source === 'plan_library')
        : a.source !== 'plan_library' &&
          (a.source !== 'staff' ||
            (a.suitableCurrentSource === true &&
              a.serviceDate === task.identity.serviceDate))),
  );
}
export const missingQuestions = (task: Task) =>
  task.questions.filter((q) => !usableAnswer(task, q));
export function completeness(task: Task): 'complete' | 'partial' | 'none' {
  const missing = missingQuestions(task);
  return missing.length === 0
    ? 'complete'
    : missing.length === task.questions.length
      ? 'none'
      : 'partial';
}
export const needsCall = (task: Task) =>
  (task.delivery !== 'fax' && missingQuestions(task).length > 0) ||
  (task.delivery !== 'answers' && task.fax === 'not_requested');
export function informationIssues(task: Task): string[] {
  const issues: string[] = [];
  if (!task.reviewed) issues.push('Review the mapped row');
  if (!task.planIdentity.payerId || !task.planIdentity.groupRaw.trim())
    issues.push('Choose payer and enter group identifier');
  for (const [label, value] of [
    ['Birth date', task.identity.birthDate],
    ['Service date', task.identity.serviceDate],
  ])
    if (value && !dateSchema.safeParse(value).success)
      issues.push(`${label}: use YYYY-MM-DD`);
  const patientNeeded = task.questions.some((q) => !isGeneric(q.key));
  if (
    patientNeeded &&
    (!task.identity.memberId.trim() ||
      !task.identity.serviceDate ||
      !task.identity.patientName.trim())
  )
    issues.push('Member questions require name, member ID and service date');
  if (!task.questions.length) issues.push('Select at least one question');
  if (task.kind === 'breakdown' && patientNeeded)
    issues.push('Plan breakdown cannot include member questions');
  if (
    task.kind === 'eligibility' &&
    task.questions.some((q) => isGeneric(q.key))
  )
    issues.push('Choose combined scope for plan and member questions');
  if (task.codes.some((c) => !/^D\d{4}$/.test(c)))
    issues.push('Use valid CDT codes');
  return issues;
}
export function taskLabel(task: Task, match?: Match) {
  if (task.progress === 'finished')
    return completeness(task) === 'complete' ? 'Finished' : 'Partial';
  const labels: Partial<Record<Progress, string>> = {
    queued: 'Queued',
    launching: 'Calling',
    calling: 'Calling',
    on_hold: 'On hold',
    needs_staff: 'Needs staff',
    failed: 'Failed',
    cancelled: 'Cancelled',
  };
  if (labels[task.progress]) return labels[task.progress]!;
  if (informationIssues(task).length) return 'Needs information';
  if (
    match?.state === 'review' &&
    task.kind !== 'eligibility' &&
    !task.forceFresh
  )
    return 'Needs plan match review';
  return needsCall(task) ? 'Ready to call' : 'Ready from plan library';
}
export function finishWithoutCall(task: Task): Task {
  if (informationIssues(task).length || needsCall(task))
    throw new Error('Task still needs review or answers');
  return { ...task, progress: 'finished' };
}
export function applyEvent(task: Task, event: TaskEvent): Task {
  const attempt = task.attempts.at(-1);
  if (
    !attempt ||
    task.sessionId !== event.sessionId ||
    task.id !== event.taskId ||
    attempt.id !== event.attemptId ||
    task.events.some((e) => e.id === event.id) ||
    event.sequence <= attempt.lastSequence ||
    task.progress === 'cancelled'
  )
    return task;
  const terminal = ['finished', 'failed'].includes(task.progress);
  if (terminal && ['started', 'hold', 'representative'].includes(event.kind))
    return task;
  if (
    event.answer &&
    !task.questions.some((q) => questionId(q) === event.answer!.questionId)
  )
    return task;
  let progress = task.progress;
  if (!terminal)
    progress =
      (
        {
          started: 'calling',
          hold: 'on_hold',
          representative: 'calling',
          needs_staff: 'needs_staff',
          ended: 'finished',
          failed: 'failed',
        } as const
      )[event.kind] ?? progress;
  return {
    ...task,
    progress,
    fax:
      event.kind === 'fax_requested' && task.fax !== 'received'
        ? 'requested'
        : task.fax,
    answers: event.answer
      ? [
          ...task.answers.filter(
            (a) => a.questionId !== event.answer!.questionId,
          ),
          structuredClone(event.answer),
        ]
      : task.answers,
    attempts: task.attempts.map((a) =>
      a.id === attempt.id
        ? {
            ...a,
            launch: event.kind === 'started' ? 'confirmed' : a.launch,
            callRef: event.callRef ?? a.callRef,
            lastSequence: event.sequence,
            ...(['ended', 'failed'].includes(event.kind)
              ? { endedAt: event.at }
              : {}),
          }
        : a,
    ),
    events: [...task.events, event],
  };
}
export function canRetry(task: Task) {
  const last = task.attempts.at(-1);
  return (
    !!last &&
    ['finished', 'failed', 'needs_staff'].includes(task.progress) &&
    needsCall(task) &&
    task.attempts.length <= task.limits.retries &&
    (last.launch === 'not_created' ||
      (!!last.endedAt && last.launch === 'confirmed'))
  );
}
