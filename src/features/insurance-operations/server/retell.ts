import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { z } from 'zod';
import { isGeneric, questionId, ruleValueSchema } from '../domain/schema';
import {
  missingQuestions,
  type Answer,
  type Task,
  type TaskEvent,
} from '../domain/workflow';
import type { CallAdapter, LaunchResult } from '../adapters/call-contract';

export type RetellSetup = {
  apiKey: string;
  agentId: string;
  agentVersion: number;
  fromNumber: string;
  payerId: string;
  payerNumber: string;
  officeFax: string;
  webhookUrl: string;
  approvedPath: boolean;
  retentionVerified: boolean;
  payerWorkflowTested: boolean;
  practiceName: string;
  credentials: { billingNpi?: string; renderingNpi?: string; taxId?: string };
};
export function verifyRetell(
  raw: string,
  signature: string,
  key: string,
  now = Date.now(),
): boolean {
  const match = /^v=(\d+),d=([a-f0-9]{64})$/i.exec(signature);
  if (!match || !key || Math.abs(now - Number(match[1])) > 300000) return false;
  const expected = createHmac('sha256', key)
    .update(raw + match[1])
    .digest();
  return timingSafeEqual(expected, Buffer.from(match[2], 'hex'));
}
type Correlation = {
  task: Task;
  attemptId: string;
  callRef?: string;
  sequence: number;
  terminal: boolean;
  expiresAt: number;
};
/** Server-only API adapter. Instantiation does not enable live calling.
 * Documented endpoints checked 2026-09-11; see setup.md for exact sources.
 * No raw vendor body, transcript, recording, error body or phone metadata is retained. */
export class RetellAdapter implements CallAdapter {
  readonly mode = 'live' as const;
  private attempts = new Map<string, Correlation>();
  private seen = new Map<string, number>();
  constructor(
    private setup: RetellSetup,
    private emit: (event: TaskEvent) => void,
    private http: typeof fetch = fetch,
    private now = () => Date.now(),
  ) {}
  private ready(task: Task) {
    return (
      this.setup.approvedPath &&
      this.setup.retentionVerified &&
      this.setup.payerWorkflowTested &&
      this.setup.agentVersion >= 0 &&
      !!this.setup.apiKey &&
      !!this.setup.agentId &&
      task.planIdentity.payerId === this.setup.payerId &&
      [
        this.setup.fromNumber,
        this.setup.payerNumber,
        this.setup.officeFax,
      ].every((n) => /^\+[1-9]\d{7,14}$/.test(n)) &&
      new URL(this.setup.webhookUrl).protocol === 'https:'
    );
  }
  private async request(path: string, method = 'GET', body?: unknown) {
    const response = await this.http(`https://api.retellai.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.setup.apiKey}`,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Calling provider request failed');
    if (response.status === 204) return {};
    return response.json();
  }
  async start(task: Task, attemptId: string): Promise<LaunchResult> {
    this.sweep();
    if (!this.ready(task)) return { state: 'not_created' };
    const previous = this.attempts.get(attemptId);
    if (previous)
      return previous.callRef
        ? { state: 'created', callRef: previous.callRef }
        : { state: 'ambiguous' };
    const correlation: Correlation = {
      task: structuredClone(task),
      attemptId,
      sequence: 1,
      terminal: false,
      expiresAt: this.now() + 60 * 60 * 1000,
    };
    this.attempts.set(attemptId, correlation);
    const patientQuestions = missingQuestions(task).some(
      (q) => !isGeneric(q.key),
    );
    const scope = {
      kind: task.kind,
      delivery: task.delivery,
      questions: missingQuestions(task),
      codes: task.codes,
      plan: {
        group: task.planIdentity.groupRaw,
        product: task.planIdentity.product,
        subgroup: task.planIdentity.subgroup,
        network: task.planIdentity.network,
        benefitYear: task.planIdentity.benefitYear,
      },
      ...(patientQuestions
        ? {
            member: {
              name: task.identity.patientName,
              id: task.identity.memberId,
              ...(task.identity.birthDate
                ? { birthDate: task.identity.birthDate }
                : {}),
              serviceDate: task.identity.serviceDate,
            },
          }
        : {}),
      practice: this.setup.practiceName,
      credentials: this.setup.credentials,
      ...(task.delivery !== 'answers'
        ? { faxDestination: this.setup.officeFax }
        : {}),
    };
    try {
      const result = await this.request('/v2/create-phone-call', 'POST', {
        from_number: this.setup.fromNumber,
        to_number: this.setup.payerNumber,
        override_agent_id: this.setup.agentId,
        override_agent_version: this.setup.agentVersion,
        metadata: { attempt_token: attemptId },
        retell_llm_dynamic_variables: {
          authorized_task: JSON.stringify(scope),
        },
        agent_override: {
          agent: {
            data_storage_setting: 'basic_attributes_only',
            data_storage_retention_days: 1,
            webhook_url: this.setup.webhookUrl,
            max_call_duration_ms: task.limits.totalSeconds * 1000,
          },
        },
      });
      if (typeof result.call_id !== 'string') return { state: 'ambiguous' };
      correlation.callRef = result.call_id;
      return { state: 'created', callRef: result.call_id };
    } catch {
      return { state: 'ambiguous' };
    }
  }
  async status(callRef: string): Promise<'active' | 'ended' | 'unknown'> {
    if (![...this.attempts.values()].some((a) => a.callRef === callRef))
      return 'unknown';
    try {
      const call = await this.request(
        `/v2/get-call/${encodeURIComponent(callRef)}`,
      );
      return ['ended', 'error', 'not_connected'].includes(call.call_status)
        ? 'ended'
        : ['ongoing', 'registered'].includes(call.call_status)
          ? 'active'
          : 'unknown';
    } catch {
      return 'unknown';
    }
  }
  async cancel(callRef: string) {
    if (![...this.attempts.values()].some((a) => a.callRef === callRef)) return;
    await this.request(`/v2/stop-call/${encodeURIComponent(callRef)}`, 'POST');
  }
  async reconcile(attemptId: string): Promise<LaunchResult> {
    const a = this.attempts.get(attemptId);
    return a?.callRef
      ? { state: 'created', callRef: a.callRef }
      : { state: 'ambiguous' };
  }
  releaseSession(sessionId: string) {
    for (const [id, a] of this.attempts)
      if (a.task.sessionId === sessionId) this.attempts.delete(id);
  }
  webhook(raw: string, signature: string) {
    this.sweep();
    if (
      raw.length > 1024 * 1024 ||
      !verifyRetell(raw, signature, this.setup.apiKey, this.now())
    )
      return false;
    const digest = createHash('sha256').update(raw).digest('hex');
    if (this.seen.has(digest)) return true;
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return false;
    }
    const a = this.attempts.get(body.call?.metadata?.attempt_token);
    if (!a || typeof body.call?.call_id !== 'string') return false;
    if (a.callRef && a.callRef !== body.call.call_id) return false;
    a.callRef = body.call.call_id;
    this.seen.set(digest, this.now() + 300000);
    if (body.event === 'call_started' && !a.terminal)
      this.event(a, 'started', 'Call connected');
    if (body.event === 'call_ended' && !a.terminal) {
      a.terminal = true;
      this.event(
        a,
        'ended',
        typeof body.call.disconnection_reason === 'string'
          ? body.call.disconnection_reason.replace(/[^a-z_]/g, '').slice(0, 60)
          : 'Disconnected; answers may be incomplete',
      );
    }
    return true;
  }
  /** This narrow tool handler is intended for the approved agent workflow.
   * The server must verify the same signed raw request BEFORE invoking it. */
  recordAnswer(attemptId: string, input: unknown) {
    const a = this.attempts.get(attemptId);
    if (!a || a.terminal) return false;
    const result = z
      .object({
        questionId: z.string().max(100),
        state: z.enum(['answered', 'unknown', 'unavailable']),
        value: z.union([ruleValueSchema, z.string().max(160)]).nullable(),
        source: z.enum(['ivr', 'representative']),
        qualification: z.string().max(200),
      })
      .strict()
      .safeParse(input);
    if (
      !result.success ||
      !a.task.questions.some((q) => questionId(q) === result.data.questionId)
    )
      return false;
    const answer = {
      ...result.data,
      at: new Date(this.now()).toISOString(),
    } as Answer;
    this.emit({
      id: crypto.randomUUID(),
      sessionId: a.task.sessionId,
      taskId: a.task.id,
      attemptId,
      sequence: ++a.sequence,
      at: answer.at,
      kind: 'answer',
      answer,
    });
    return true;
  }
  private event(a: Correlation, kind: TaskEvent['kind'], detail: string) {
    this.emit({
      id: crypto.randomUUID(),
      sessionId: a.task.sessionId,
      taskId: a.task.id,
      attemptId: a.attemptId,
      sequence: ++a.sequence,
      at: new Date(this.now()).toISOString(),
      kind,
      detail,
    });
  }
  private sweep() {
    for (const [id, a] of this.attempts)
      if (a.expiresAt <= this.now()) this.attempts.delete(id);
    for (const [id, expiry] of this.seen)
      if (expiry <= this.now()) this.seen.delete(id);
  }
}
