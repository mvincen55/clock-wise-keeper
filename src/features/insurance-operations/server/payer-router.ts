import type { CallAdapter, LaunchResult } from '../adapters/call-contract';
import type { Task, TaskEvent } from '../domain/workflow';
import { RetellAdapter, type RetellSetup } from './retell';

/** Resolve canonical office references at dispatch, then freeze each adapter's
 * configuration for its active attempts. No browser-provided phone destination. */
export class PayerRouter implements CallAdapter {
  readonly mode = 'live' as const;
  private adapters = new Map<string, RetellAdapter>();
  constructor(
    private resolve: (task: Task) => Promise<RetellSetup>,
    private emit: (event: TaskEvent) => void,
    private http: typeof fetch = fetch,
  ) {}
  async start(task: Task, attemptId: string): Promise<LaunchResult> {
    let setup: RetellSetup;
    try {
      setup = await this.resolve(task);
    } catch {
      return { state: 'not_created' };
    }
    const key = JSON.stringify(setup);
    let adapter = this.adapters.get(key);
    if (!adapter) {
      for (const [id, a] of this.adapters)
        if (!a.activeCount) this.adapters.delete(id);
      if (this.adapters.size >= 100) return { state: 'not_created' };
      adapter = new RetellAdapter(setup, this.emit, this.http);
      this.adapters.set(key, adapter);
    }
    return adapter.start(task, attemptId);
  }
  async status(ref: string) {
    for (const a of this.adapters.values()) {
      const state = await a.status(ref);
      if (state !== 'unknown') return state;
    }
    return 'unknown' as const;
  }
  async cancel(ref: string) {
    await Promise.all([...this.adapters.values()].map((a) => a.cancel(ref)));
  }
  async reconcile(id: string): Promise<LaunchResult> {
    for (const a of this.adapters.values()) {
      const result = await a.reconcile(id);
      if (result.state !== 'ambiguous') return result;
    }
    return { state: 'ambiguous' };
  }
  releaseSession(id: string) {
    for (const [key, a] of this.adapters) {
      a.releaseSession(id);
      if (!a.activeCount) this.adapters.delete(key);
    }
  }
  async vendorRequest(path: string, raw: string, signature: string) {
    for (const a of this.adapters.values())
      if (
        await (path === '/tools/retell'
          ? a.tool(raw, signature)
          : a.webhook(raw, signature))
      )
        return true;
    return false;
  }
}
