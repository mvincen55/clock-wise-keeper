import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  applyEvent,
  canRetry,
  informationIssues,
  needsCall,
  type Task,
  type TaskEvent,
} from '../domain/workflow';
import { presetFor } from '../domain/schema';
import type {
  AuthorizedOffice,
  CallAdapter,
  SessionCapability,
  SessionOwner,
} from '../adapters/call-contract';

type RuntimeSession = {
  capability: SessionCapability;
  tasks: Map<string, Task>;
  paused: boolean;
  events: TaskEvent[];
  listeners: Set<() => void>;
  reservedCents: number;
};
export class RuntimeDenied extends Error {
  constructor() {
    super('Session unavailable or action not authorized');
  }
}
/** One long-lived, supervised process per office deployment. No disk, cache,
 * serverless process-global survival assumption or recoverable worklist. */
export class TransientRuntime {
  private sessions = new Map<string, RuntimeSession>();
  private pumping = false;
  constructor(
    private adapter: CallAdapter,
    private authorize: (owner: SessionOwner) => Promise<AuthorizedOffice>,
    private now = () => Date.now(),
    private lifetimeMs = 60 * 60 * 1000,
    private conservativeCentsPerMinute = adapter.mode === 'synthetic'
      ? 25
      : Infinity,
  ) {}
  async open(owner: SessionOwner): Promise<SessionCapability> {
    const office = await this.authorize(owner);
    if (!office.approved || !office.settings.enabled) throw new RuntimeDenied();
    const active = [...this.sessions.values()].filter(
      (s) => s.capability.orgId === owner.orgId,
    );
    if (active.length >= 4) throw new RuntimeDenied();
    const capability = {
      ...owner,
      id: crypto.randomUUID(),
      secret: randomBytes(32).toString('base64url'),
      expiresAt: this.now() + this.lifetimeMs,
    };
    this.sessions.set(capability.id, {
      capability,
      tasks: new Map(),
      paused: false,
      events: [],
      listeners: new Set(),
      reservedCents: 0,
    });
    return { ...capability };
  }
  private get(owner: SessionOwner, capability: SessionCapability) {
    const s = this.sessions.get(capability.id);
    const supplied = Buffer.from(capability.secret ?? '');
    const expected = Buffer.from(s?.capability.secret ?? '');
    if (
      !s ||
      s.capability.expiresAt <= this.now() ||
      s.capability.userId !== owner.userId ||
      s.capability.orgId !== owner.orgId ||
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      throw new RuntimeDenied();
    return s;
  }
  async start(
    owner: SessionOwner,
    capability: SessionCapability,
    tasks: Task[],
    settingsVersion: number,
  ) {
    const s = this.get(owner, capability);
    const office = await this.authorize(owner);
    if (
      !office.approved ||
      !office.settings.enabled ||
      office.settings.version !== settingsVersion ||
      tasks.length > 200 ||
      s.tasks.size + tasks.length > 200
    )
      throw new RuntimeDenied();
    for (const task of tasks) {
      if (
        task.workflowKind !== 'benefits' ||
        task.sessionId !== capability.id ||
        informationIssues(task).length ||
        !needsCall(task) ||
        task.presetVersion !== settingsVersion
      )
        throw new RuntimeDenied();
      if (s.tasks.has(task.id)) continue; // idempotent same-session submission; never create a second call
      const copy = structuredClone(task);
      // Office limits are authoritative, regardless of browser payload.
      copy.limits = structuredClone(
        presetFor(office.settings, task.kind, task.planIdentity.payerId).limits,
      );
      copy.progress = 'queued';
      copy.attempts = [];
      copy.events = [];
      s.tasks.set(copy.id, copy);
    }
    await this.pump();
  }
  async control(
    owner: SessionOwner,
    capability: SessionCapability,
    action: 'pause' | 'resume' | 'clear' | 'cancel' | 'retry',
    taskId?: string,
  ) {
    const s = this.get(owner, capability);
    if (action === 'clear') {
      await this.expire(s);
      return;
    }
    if (action === 'pause') s.paused = true;
    if (action === 'resume') {
      const office = await this.authorize(owner);
      if (!office.approved || !office.settings.enabled)
        throw new RuntimeDenied();
      s.paused = false;
    }
    if (action === 'retry') {
      const office = await this.authorize(owner);
      if (!office.approved || !office.settings.enabled)
        throw new RuntimeDenied();
      const task = s.tasks.get(taskId ?? '');
      const last = task?.attempts.at(-1);
      if (!task || !last || task.progress === 'cancelled')
        throw new RuntimeDenied();
      if (last.launch === 'ambiguous') {
        const remote = await this.adapter.reconcile(last.id);
        if (remote.state === 'ambiguous') throw new RuntimeDenied();
        if (remote.state === 'not_created') last.launch = 'not_created';
        else {
          last.callRef = remote.callRef;
          last.launch = 'confirmed';
        }
      }
      if (last.callRef) {
        if ((await this.adapter.status(last.callRef)) !== 'ended')
          throw new RuntimeDenied();
        last.endedAt = new Date(this.now()).toISOString();
      }
      if (!canRetry(task)) throw new RuntimeDenied();
      task.progress = 'queued';
    }
    if (action === 'cancel') {
      const task = s.tasks.get(taskId ?? '');
      if (!task) throw new RuntimeDenied();
      task.progress = 'cancelled';
      const ref = task.attempts.at(-1)?.callRef;
      if (ref) await this.adapter.cancel(ref).catch(() => undefined);
    }
    await this.pump();
  }
  async read(
    owner: SessionOwner,
    capability: SessionCapability,
    after: number,
  ) {
    const s = this.get(owner, capability);
    const office = await this.authorize(owner);
    if (!office.approved) {
      await this.expire(s);
      throw new RuntimeDenied();
    }
    return s.events.slice(Math.max(0, after)).map((e) => structuredClone(e));
  }
  wait(
    owner: SessionOwner,
    capability: SessionCapability,
    wake: () => void,
  ): () => void {
    const s = this.get(owner, capability);
    s.listeners.add(wake);
    return () => s.listeners.delete(wake);
  }
  receive(event: TaskEvent) {
    const s = this.sessions.get(event.sessionId);
    if (!s || s.capability.expiresAt <= this.now()) return;
    const task = s.tasks.get(event.taskId);
    if (!task) return;
    const next = applyEvent(task, event);
    if (next === task) return;
    s.tasks.set(task.id, next);
    s.events.push(structuredClone(event));
    s.listeners.forEach((wake) => wake());
    void this.pump();
  }
  private emit(
    s: RuntimeSession,
    task: Task,
    kind: TaskEvent['kind'],
    detail: string,
  ) {
    const attempt = task.attempts.at(-1);
    if (!attempt) return;
    this.receive({
      id: crypto.randomUUID(),
      sessionId: s.capability.id,
      taskId: task.id,
      attemptId: attempt.id,
      sequence: attempt.lastSequence + 1,
      at: new Date(this.now()).toISOString(),
      kind,
      detail,
      callRef: attempt.callRef,
    });
  }
  /** Called by the SERVER's scheduler, never by browser visibility/timers. */
  async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      for (const s of [...this.sessions.values()]) {
        if (s.capability.expiresAt <= this.now()) {
          await this.expire(s);
          continue;
        }
        let office: AuthorizedOffice;
        try {
          office = await this.authorize(s.capability);
        } catch {
          s.paused = true;
          continue;
        }
        if (!office.approved || !office.settings.enabled) {
          await this.expire(s);
          continue;
        }
        for (const task of s.tasks.values()) {
          const attempt = task.attempts.at(-1);
          if (
            !attempt ||
            !['calling', 'on_hold', 'launching'].includes(task.progress)
          )
            continue;
          const elapsed = this.now() - Date.parse(attempt.startedAt);
          const hold = [...task.events]
            .reverse()
            .find((e) => e.kind === 'hold');
          if (
            elapsed >= task.limits.totalSeconds * 1000 ||
            (task.progress === 'on_hold' &&
              hold &&
              this.now() - Date.parse(hold.at) >=
                task.limits.holdSeconds * 1000)
          ) {
            if (attempt.callRef)
              await this.adapter.cancel(attempt.callRef).catch(() => undefined);
            this.emit(
              s,
              task,
              'needs_staff',
              'Configured limit reached; cancellation requested. Verify remote status before retrying.',
            );
          }
        }
        if (s.paused) continue;
        for (const task of s.tasks.values()) {
          if (task.progress !== 'queued') continue;
          const running = [...this.sessions.values()]
            .filter((x) => x.capability.orgId === s.capability.orgId)
            .flatMap((x) => [...x.tasks.values()])
            .filter((t) => {
              const a = t.attempts.at(-1);
              return !!a && !a.endedAt && a.launch !== 'not_created';
            }).length;
          if (running >= office.settings.concurrency) break;
          // Reserve worst-case cost before launch; server deployment supplies the conservative rate.
          const reserve =
            Math.ceil(task.limits.totalSeconds / 60) *
            this.conservativeCentsPerMinute;
          const officeReserved = [...this.sessions.values()]
            .filter((x) => x.capability.orgId === s.capability.orgId)
            .reduce((sum, x) => sum + x.reservedCents, 0);
          if (officeReserved + reserve > office.settings.spendingLimitCents) {
            s.paused = true;
            break;
          }
          s.reservedCents += reserve;
          const attemptId = crypto.randomUUID();
          task.attempts.push({
            id: attemptId,
            number: task.attempts.length + 1,
            startedAt: new Date(this.now()).toISOString(),
            launch: 'pending',
            lastSequence: 0,
          });
          task.progress = 'launching';
          let launched;
          try {
            launched = await this.adapter.start(
              structuredClone(task),
              attemptId,
            );
          } catch {
            launched = { state: 'ambiguous' as const };
          }
          // Expiry/cancel can happen during a vendor request. Never resurrect it.
          if (
            !this.sessions.has(s.capability.id) ||
            (task as Task).progress === 'cancelled'
          ) {
            if (launched.state === 'created')
              await this.adapter
                .cancel(launched.callRef)
                .catch(() => undefined);
            continue;
          }
          const attempt = task.attempts.at(-1)!;
          if (launched.state === 'created') {
            attempt.callRef = launched.callRef;
            attempt.launch = 'confirmed';
            this.emit(s, task, 'started', 'Attempt started');
          } else {
            attempt.launch = launched.state;
            this.emit(
              s,
              task,
              'needs_staff',
              launched.state === 'ambiguous'
                ? 'Launch outcome unknown. Do not retry until remote reconciliation.'
                : 'Call was not created.',
            );
          }
        }
      }
    } finally {
      this.pumping = false;
    }
  }
  private async expire(s: RuntimeSession) {
    this.sessions.delete(s.capability.id);
    const refs = [...s.tasks.values()].flatMap((t) =>
      t.attempts.map((a) => a.callRef).filter((r): r is string => !!r),
    );
    s.tasks.clear();
    s.events.length = 0;
    s.listeners.forEach((wake) => wake());
    s.listeners.clear();
    s.capability.secret = '';
    await Promise.allSettled(refs.map((ref) => this.adapter.cancel(ref)));
    this.adapter.releaseSession?.(s.capability.id);
  }
}
