import { z } from 'zod';

export const requestKinds = ['breakdown', 'eligibility', 'combined'] as const;
export type RequestKind = (typeof requestKinds)[number];
export const requestLabels: Record<RequestKind, string> = {
  breakdown: 'Plan breakdown',
  eligibility: 'Eligibility and remaining benefits',
  combined: 'Breakdown plus patient verification',
};
export const deliveryGoals = ['answers', 'fax', 'answers_and_fax'] as const;
export type DeliveryGoal = (typeof deliveryGoals)[number];
export const genericKeys = [
  'coverage',
  'individual_deductible',
  'family_deductible',
  'annual_plan_maximum',
  'deductible_applies',
  'benefit_year',
  'waiting_period',
  'missing_tooth',
  'downgrade',
  'age_limit',
  'frequency',
  'shared_frequency',
  'exclusion',
  'limitation',
] as const;
export const memberKeys = [
  'eligible',
  'effective_dates',
  'remaining_deductible',
  'remaining_maximum',
  'remaining_frequency',
] as const;
export type GenericKey = (typeof genericKeys)[number];
export type QuestionKey = GenericKey | (typeof memberKeys)[number];
export const questionLabels: Record<QuestionKey, string> = {
  coverage: 'Coverage percentage',
  individual_deductible: 'Nominal individual deductible',
  family_deductible: 'Nominal family deductible',
  annual_plan_maximum: 'Nominal annual plan maximum',
  deductible_applies: 'Deductible applicability',
  benefit_year: 'Benefit year',
  waiting_period: 'Waiting period',
  missing_tooth: 'Missing-tooth clause',
  downgrade: 'Downgrade',
  age_limit: 'Age limit',
  frequency: 'Frequency rule',
  shared_frequency: 'Shared frequency group',
  exclusion: 'Exclusion',
  limitation: 'Limitation',
  eligible: 'Eligibility for service date',
  effective_dates: 'Member effective dates',
  remaining_deductible: 'Member remaining deductible',
  remaining_maximum: 'Member remaining maximum',
  remaining_frequency: 'Member remaining frequency',
};
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !Number.isNaN(Date.parse(s)) &&
      new Date(s).toISOString().slice(0, 10) === s,
    'Use a valid YYYY-MM-DD date',
  );
const short = z.string().trim().max(160);
export const scopeSchema = z
  .string()
  .regex(/^(plan|preventive|basic|major|diagnostic|orthodontic|D\d{4})$/);
export const quantitySchema = z
  .object({
    amount: z.number().finite().min(0).max(10000000),
    unit: z.enum(['percent', 'USD', 'visits', 'months', 'years', 'days']),
    window: z.enum([
      'none',
      'calendar_year',
      'benefit_year',
      'rolling_months',
      'lifetime',
    ]),
    windowMonths: z.number().int().min(1).max(1200).nullable(),
  })
  .strict();
export const ruleValueSchema = z.union([
  z.boolean(),
  quantitySchema,
  z
    .object({
      // Enumerated interpretation plus codes. No arbitrary notes/transcripts in durable rules.
      meaning: z.enum([
        'applies',
        'does_not_apply',
        'calendar_year',
        'contract_year',
        'not_covered',
        'covered',
        'alternate_benefit',
        'shared_limit',
      ]),
      codes: z.array(z.string().regex(/^D\d{4}$/)).max(30),
    })
    .strict(),
]);
export const genericRuleSchema = z
  .object({
    key: z.enum(genericKeys),
    scope: scopeSchema,
    status: z.enum(['confirmed', 'unknown', 'conflicting']),
    value: ruleValueSchema.nullable(),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.status === 'confirmed' && r.value === null)
      ctx.addIssue({
        code: 'custom',
        message: 'Confirmed rules require a value',
      });
    if (
      r.key === 'coverage' &&
      r.value !== null &&
      (typeof r.value !== 'object' ||
        !('unit' in r.value) ||
        r.value.unit !== 'percent' ||
        r.value.amount > 100)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Coverage needs a percentage from 0 to 100',
      });
    if (
      [
        'individual_deductible',
        'family_deductible',
        'annual_plan_maximum',
      ].includes(r.key) &&
      r.value !== null &&
      (typeof r.value !== 'object' ||
        !('unit' in r.value) ||
        r.value.unit !== 'USD')
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Nominal amounts need USD units',
      });
  });
export type GenericRule = z.infer<typeof genericRuleSchema>;
export const planDraftSchema = z
  .object({
    payerId: z.string().uuid(),
    groupRaw: short.min(1),
    product: short.min(1),
    subgroup: short.min(1),
    network: short.min(1),
    providerId: z.string().uuid().nullable(),
    effectiveFrom: dateSchema,
    effectiveTo: dateSchema,
    benefitYear: short.min(1),
    insurancePlanId: z.string().uuid().nullable(),
    feeScheduleId: z.string().uuid().nullable(),
    manualId: z.string().uuid().nullable(),
    source: short.min(1),
    sourceDate: dateSchema,
    confidence: z.enum(['high', 'medium', 'low']),
    rules: z.array(genericRuleSchema).min(1).max(100),
  })
  .strict()
  .refine(
    (p) => p.effectiveFrom <= p.effectiveTo,
    'Effective period is reversed',
  )
  .refine(
    (p) =>
      new Set(p.rules.map((r) => `${r.key}:${r.scope}`)).size ===
      p.rules.length,
    'Each rule and scope must appear once',
  );
export type PlanDraft = z.infer<typeof planDraftSchema>;
export type PlanVersion = PlanDraft & {
  id: string;
  orgId: string;
  catalogId: string;
  version: number;
  reviewedAt: string;
  reviewerId: string;
  status: 'reviewed' | 'superseded';
  groupNormalized: string;
};
export type Question = { key: QuestionKey; scope: string; required: boolean };
export const questionSchema = z
  .object({
    key: z.enum([...genericKeys, ...memberKeys]),
    scope: scopeSchema,
    required: z.boolean(),
  })
  .strict();
export const limitsSchema = z
  .object({
    holdSeconds: z.number().int().min(30).max(3600),
    totalSeconds: z.number().int().min(60).max(7200),
    retries: z.number().int().min(0).max(2),
  })
  .strict()
  .refine(
    (v) => v.holdSeconds <= v.totalSeconds,
    'Hold limit must fit inside total limit',
  );
export const presetSchema = z
  .object({
    questions: z.array(questionSchema).min(1).max(60),
    limits: limitsSchema,
  })
  .strict();
export const settingsSchema = z
  .object({
    version: z.number().int().positive(),
    enabled: z.boolean(),
    defaultKind: z.enum(requestKinds),
    defaultDelivery: z.enum(deliveryGoals),
    presets: z
      .object({
        breakdown: presetSchema,
        eligibility: presetSchema,
        combined: presetSchema,
      })
      .strict(),
    bundles: z
      .array(
        z
          .object({
            name: short.min(1),
            codes: z
              .array(z.string().regex(/^D\d{4}$/))
              .min(1)
              .max(30),
          })
          .strict(),
      )
      .max(20),
    carrierOverrides: z
      .array(
        z
          .object({
            payerId: z.string().uuid(),
            kind: z.enum(requestKinds),
            preset: presetSchema,
          })
          .strict(),
      )
      .max(20),
    mappings: z
      .array(
        z
          .object({
            role: z.enum([
              'billing_npi',
              'rendering_npi',
              'tax_id',
              'payer_phone',
              'office_fax',
            ]),
            entryId: z.string().uuid(),
            providerId: z.string().uuid().nullable(),
            confirmed: z.literal(true),
          })
          .strict(),
      )
      .max(30),
    concurrency: z.number().int().min(1).max(3),
    spendingLimitCents: z.number().int().min(0).max(10000),
    freshnessDays: z.number().int().min(1).max(365),
    roles: z.array(z.enum(['owner', 'manager', 'employee'])).min(1),
    alerts: z
      .object({
        completion: z.boolean(),
        attention: z.boolean(),
        sound: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type OfficeSettings = z.infer<typeof settingsSchema>;
const genericQuestions: Question[] = [
  { key: 'coverage', scope: 'preventive', required: true },
  { key: 'annual_plan_maximum', scope: 'plan', required: true },
];
const patientQuestions: Question[] = [
  { key: 'eligible', scope: 'plan', required: true },
  { key: 'remaining_maximum', scope: 'plan', required: true },
];
export const defaultSettings: OfficeSettings = {
  version: 1,
  enabled: false,
  defaultKind: 'breakdown',
  defaultDelivery: 'answers',
  presets: {
    breakdown: {
      questions: genericQuestions,
      limits: { holdSeconds: 300, totalSeconds: 600, retries: 0 },
    },
    eligibility: {
      questions: patientQuestions,
      limits: { holdSeconds: 300, totalSeconds: 600, retries: 0 },
    },
    combined: {
      questions: [...genericQuestions, ...patientQuestions],
      limits: { holdSeconds: 300, totalSeconds: 900, retries: 0 },
    },
  },
  bundles: [{ name: 'Preventive', codes: ['D0120', 'D1110'] }],
  carrierOverrides: [],
  mappings: [],
  concurrency: 1,
  spendingLimitCents: 500,
  freshnessDays: 90,
  roles: ['owner', 'manager'],
  alerts: { completion: true, attention: true, sound: false },
};
export function presetFor(
  settings: OfficeSettings,
  kind: RequestKind,
  payerId: string,
) {
  return structuredClone(
    settings.carrierOverrides.find(
      (o) => o.kind === kind && o.payerId === payerId,
    )?.preset ?? settings.presets[kind],
  );
}
export const questionId = (q: Pick<Question, 'key' | 'scope'>) =>
  `${q.key}:${q.scope}`;
export const isGeneric = (key: QuestionKey) =>
  (genericKeys as readonly string[]).includes(key);
export function displayValue(value: unknown): string {
  if (value === null || value === undefined) return 'Unknown';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object' && 'amount' in value) {
    const q = value as z.infer<typeof quantitySchema>;
    return `${q.amount} ${q.unit}${q.window === 'none' ? '' : ` per ${q.window.replace(/_/g, ' ')}${q.windowMonths ? ` (${q.windowMonths} months)` : ''}`}`;
  }
  if (typeof value === 'object' && 'meaning' in value) {
    const v = value as { meaning: string; codes: string[] };
    return `${v.meaning.replace(/_/g, ' ')} ${v.codes.join(', ')}`.trim();
  }
  return String(value);
}
