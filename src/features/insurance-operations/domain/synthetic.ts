import { defaultSettings, type PlanVersion } from './schema';
import { makeTask, type Task } from './workflow';
export const demoPayer = '00000000-0000-4000-8000-000000000001';
export const demoOrg = '00000000-0000-4000-8000-000000000002';
export const syntheticSettings = {
  ...structuredClone(defaultSettings),
  enabled: true,
  spendingLimitCents: 1000,
};
// The demonstration intentionally selects a small scope so one row proves the
// zero-call path. Office defaults use the configurable full breakdown checklist.
const demoQuestions = [
  { key: 'coverage' as const, scope: 'preventive', required: true },
  { key: 'annual_plan_maximum' as const, scope: 'plan', required: true },
];
syntheticSettings.presets.breakdown.questions = structuredClone(demoQuestions);
syntheticSettings.presets.combined.questions = [
  ...structuredClone(demoQuestions),
  ...structuredClone(syntheticSettings.presets.eligibility.questions),
];
export function syntheticPlan(now = new Date()): PlanVersion {
  const year = String(now.getFullYear());
  return {
    id: '00000000-0000-4000-8000-000000000003',
    orgId: demoOrg,
    catalogId: '00000000-0000-4000-8000-000000000004',
    version: 1,
    status: 'reviewed',
    payerId: demoPayer,
    groupRaw: '00042',
    groupNormalized: '00042',
    product: 'Demo PPO',
    subgroup: 'A',
    network: 'Demo network',
    providerId: null,
    benefitYear: year,
    effectiveFrom: `${year}-01-01`,
    effectiveTo: `${year}-12-31`,
    insurancePlanId: null,
    feeScheduleId: null,
    manualId: null,
    source: 'Synthetic training reference — not payer benefits',
    sourceDate: now.toISOString().slice(0, 10),
    confidence: 'high',
    reviewedAt: now.toISOString(),
    reviewerId: demoPayer,
    rules: [
      {
        key: 'coverage',
        scope: 'preventive',
        status: 'confirmed',
        value: {
          amount: 80,
          unit: 'percent',
          window: 'none',
          windowMonths: null,
        },
      },
      {
        key: 'annual_plan_maximum',
        scope: 'plan',
        status: 'confirmed',
        value: {
          amount: 1200,
          unit: 'USD',
          window: 'benefit_year',
          windowMonths: null,
        },
      },
    ],
  };
}
export function syntheticTasks(sessionId: string): Task[] {
  const plan = syntheticPlan();
  return ['breakdown', 'combined'].map((kind: 'breakdown' | 'combined', i) => {
    const task = makeTask(sessionId, syntheticSettings, kind);
    return {
      ...task,
      identity: {
        patientName: i ? 'Synthetic Patient B' : 'Synthetic Patient A',
        memberId: `0000${i + 1}`,
        birthDate: '1990-01-01',
        serviceDate: new Date().toISOString().slice(0, 10),
      },
      planIdentity: {
        payerId: demoPayer,
        groupRaw: plan.groupRaw,
        product: plan.product,
        subgroup: plan.subgroup,
        network: plan.network,
        providerId: null,
        benefitYear: plan.benefitYear,
      },
      reviewed: false,
    };
  });
}
