import type {
  SessionCapability,
  SessionTransport,
  Readiness,
} from './call-contract';
import type { Task, TaskEvent } from '../domain/workflow';

export function createSessionTransport(
  base: string,
  token: () => Promise<string>,
  orgId: string,
): SessionTransport {
  const url = new URL(base);
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && url.hostname === '127.0.0.1')
  )
    throw new Error('Calling relay requires HTTPS');
  const request = async (
    path: string,
    body: unknown,
    capability?: SessionCapability,
    signal?: AbortSignal,
  ) => {
    const response = await fetch(new URL(path, url), {
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await token()}`,
        'X-Office-Id': orgId,
        ...(capability
          ? {
              'X-Session-Id': capability.id,
              'X-Session-Secret': capability.secret,
            }
          : {}),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok)
      throw new Error(
        response.status === 410
          ? 'Session expired. Clear this session before starting new work.'
          : 'Calling connection unavailable. Reconnect to reconcile; do not relaunch.',
      );
    return response.json();
  };
  return {
    readiness: () => request('/readiness', {}) as Promise<Readiness>,
    open: () => request('/session', {}) as Promise<SessionCapability>,
    start: async (s, tasks: Task[], settingsVersion) => {
      await request('/start', { tasks, settingsVersion }, s);
    },
    events: async (s, after, signal, receive) => {
      let cursor = after;
      // Server holds each request until an event or keepalive. Browser timers
      // never launch jobs; visibility has no effect on the independent runtime.
      while (!signal.aborted) {
        const result = (await request(
          '/events',
          { after: cursor },
          s,
          signal,
        )) as { events: TaskEvent[] };
        for (const event of result.events) {
          receive(event);
          cursor += 1;
        }
      }
    },
    control: async (s, action, taskId) => {
      await request('/control', { action, taskId }, s);
    },
  };
}
