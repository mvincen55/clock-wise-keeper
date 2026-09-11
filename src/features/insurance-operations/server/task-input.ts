import { z } from 'zod';
import {
  dateSchema,
  deliveryGoals,
  limitsSchema,
  questionSchema,
  requestKinds,
  ruleValueSchema,
} from '../domain/schema';
import type { Task } from '../domain/workflow';

const bounded = z.string().max(160);
const answer = z
  .object({
    questionId: z.string().max(100),
    value: z.union([ruleValueSchema, z.string().max(1000)]).nullable(),
    state: z.enum(['answered', 'unknown', 'not_asked', 'unavailable']),
    source: z.enum([
      'plan_library',
      'ivr',
      'representative',
      'staff',
      'unknown',
    ]),
    at: z.string().datetime(),
    qualification: z.string().max(1000),
    planVersionId: z.string().uuid().optional(),
    serviceDate: dateSchema.optional(),
    suitableCurrentSource: z.boolean().optional(),
  })
  .strict();
// Snapshot is browser display evidence, not required by the caller. Strip it and
// office billing policies before validation; they must never become agent instructions.
const taskInput = z
  .object({
    id: z.string().uuid(),
    workflowKind: z.literal('benefits'),
    payloadVersion: z.literal(1),
    revision: z.number().int().positive(),
    sessionId: z.string().uuid(),
    identity: z
      .object({
        patientName: bounded,
        memberId: bounded,
        birthDate: bounded,
        serviceDate: bounded,
      })
      .strict(),
    planIdentity: z
      .object({
        payerId: z.string().uuid(),
        groupRaw: bounded,
        product: bounded,
        subgroup: bounded,
        network: bounded,
        providerId: z.string().uuid().nullable(),
        benefitYear: bounded,
      })
      .strict(),
    kind: z.enum(requestKinds),
    delivery: z.enum(deliveryGoals),
    codes: z.array(z.string().regex(/^D\d{4}$/)).max(30),
    questions: z.array(questionSchema).min(1).max(60),
    presetVersion: z.number().int().positive(),
    limits: limitsSchema,
    reviewed: z.literal(true),
    forceFresh: z.boolean(),
    planSnapshot: z.null(),
    answers: z.array(answer).max(60),
    progress: z.enum(['draft', 'queued']),
    fax: z.enum(['not_requested', 'requested', 'received']),
    attempts: z.array(z.never()).max(0),
    events: z.array(z.never()).max(0),
    selected: z.boolean(),
  })
  .strict();
export function parseSubmittedTasks(input: unknown): Task[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 200)
    throw new Error('Invalid batch');
  return input.map((value) => {
    if (!value || typeof value !== 'object') throw new Error('Invalid task');
    const { planSnapshot: _snapshot, billingPolicy: _policy, ...rest } = value;
    // Never parse/persist/transmit a browser plan document or billing instruction.
    return taskInput.parse({ ...rest, planSnapshot: null }) as Task;
  });
}
