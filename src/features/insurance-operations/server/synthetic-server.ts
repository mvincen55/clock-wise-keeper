import { createServer } from 'node:http';
import { TransientRuntime } from './runtime';
import type {
  CallAdapter,
  SessionCapability,
  SessionOwner,
} from '../adapters/call-contract';
import { demoOrg, syntheticSettings } from '../domain/synthetic';
import {
  missingQuestions,
  type Task,
  type TaskEvent,
} from '../domain/workflow';
import { questionId } from '../domain/schema';

// Fixture-only localhost harness. This is not a patient relay or live setup check.
const owner: SessionOwner = { userId: 'synthetic-user', orgId: demoOrg };
const scheduled = new Map<
  string,
  { task: Task; attemptId: string; due: number; stage: number }
>();
const adapter: CallAdapter = {
  mode: 'synthetic',
  async start(task, attemptId) {
    if (
      !/^Synthetic Patient [AB]$/.test(task.identity.patientName) ||
      !['00001', '00002'].includes(task.identity.memberId) ||
      task.identity.birthDate !== '1990-01-01'
    )
      return { state: 'not_created' };
    const callRef = crypto.randomUUID();
    scheduled.set(callRef, {
      task,
      attemptId,
      due: Date.now() + 3000,
      stage: 0,
    });
    return { state: 'created', callRef };
  },
  async status(ref) {
    return scheduled.has(ref) ? 'active' : 'ended';
  },
  async cancel(ref) {
    scheduled.delete(ref);
  },
  async reconcile() {
    return { state: 'ambiguous' };
  },
};
const runtime = new TransientRuntime(adapter, async (identity) => {
  if (identity.userId !== owner.userId || identity.orgId !== owner.orgId)
    throw new Error('Denied');
  return { ...owner, approved: true, settings: syntheticSettings };
});
setInterval(() => {
  void runtime.pump();
  for (const [ref, s] of scheduled) {
    if (s.due > Date.now()) continue;
    const emit = (
      kind: TaskEvent['kind'],
      sequence: number,
      extra: Partial<TaskEvent> = {},
    ) =>
      runtime.receive({
        id: crypto.randomUUID(),
        sessionId: s.task.sessionId,
        taskId: s.task.id,
        attemptId: s.attemptId,
        sequence,
        at: new Date().toISOString(),
        kind,
        ...extra,
      });
    if (s.stage === 0) {
      emit('hold', 2, { detail: 'Synthetic hold scenario' });
      s.stage = 1;
      s.due = Date.now() + 8000;
    } else {
      emit('representative', 3, { detail: 'Synthetic representative reached' });
      let seq = 4;
      for (const q of missingQuestions(s.task)) {
        emit('answer', seq++, {
          answer: {
            questionId: questionId(q),
            state: 'unknown',
            value: null,
            source: 'representative',
            at: new Date().toISOString(),
            qualification:
              'Synthetic missing-answer scenario; no payer benefits supplied',
          },
        });
      }
      if (s.task.delivery !== 'answers')
        emit('fax_requested', seq++, {
          detail: 'Synthetic fax promise only — no fax was sent',
        });
      emit('ended', seq, {
        detail: 'Synthetic disconnect; unanswered questions remain',
      });
      scheduled.delete(ref);
    }
  }
}, 250).unref();
const capabilities = new Map<string, SessionCapability>();
setInterval(() => {
  for (const [id, cap] of capabilities)
    if (cap.expiresAt <= Date.now()) capabilities.delete(id);
}, 1000).unref();
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const origin = req.headers.origin;
  if (
    origin &&
    !['http://localhost:8080', 'http://127.0.0.1:8080'].includes(origin)
  ) {
    res.writeHead(403);
    res.end();
    return;
  }
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type,Authorization,X-Office-Id,X-Session-Id,X-Session-Secret',
  );
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (
    req.method !== 'POST' ||
    req.headers.authorization !== 'Bearer synthetic-only' ||
    req.headers['x-office-id'] !== demoOrg
  ) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 256000) throw new Error('Size limit');
    }
    const body = JSON.parse(raw || '{}');
    const respond = (result: unknown) => {
      if (res.writableEnded) return;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result));
    };
    if (req.url === '/readiness') {
      respond({
        ready: true,
        mode: 'synthetic',
        requirements: [
          'Fixture-only localhost runtime. No live readiness is claimed.',
        ],
      });
      return;
    }
    if (req.url === '/session') {
      const cap = await runtime.open(owner);
      capabilities.set(cap.id, cap);
      respond(cap);
      return;
    }
    const id = String(req.headers['x-session-id'] ?? '');
    const stored = capabilities.get(id);
    if (!stored) throw new Error('Missing');
    const cap = {
      ...stored,
      secret: String(req.headers['x-session-secret'] ?? ''),
    };
    if (req.url === '/start') {
      if (
        !Array.isArray(body.tasks) ||
        body.tasks.some(
          (t: Task) =>
            !/^Synthetic Patient [AB]$/.test(t.identity?.patientName ?? '') ||
            !['00001', '00002'].includes(t.identity?.memberId),
        )
      )
        throw new Error('Fixtures only');
      await runtime.start(owner, cap, body.tasks, body.settingsVersion);
      respond({ ok: true });
      return;
    }
    if (req.url === '/control') {
      if (
        !['pause', 'resume', 'clear', 'cancel', 'retry'].includes(body.action)
      )
        throw new Error('Action');
      await runtime.control(owner, cap, body.action, body.taskId);
      if (body.action === 'clear') capabilities.delete(id);
      respond({ ok: true });
      return;
    }
    if (req.url === '/events') {
      const after = Number(body.after);
      if (!Number.isInteger(after) || after < 0) throw new Error('Cursor');
      const read = () => runtime.read(owner, cap, after);
      const events = await read();
      if (events.length) {
        respond({ events });
        return;
      }
      let cleanup = () => {};
      let sent = false;
      const wake = async () => {
        if (sent) return;
        sent = true;
        clearTimeout(timer);
        cleanup();
        try {
          respond({ events: await read() });
        } catch {
          res.writeHead(410);
          res.end();
        }
      };
      cleanup = runtime.wait(owner, cap, () => {
        void wake();
      });
      const timer = setTimeout(() => {
        void wake();
      }, 20000);
      res.on('close', () => {
        clearTimeout(timer);
        cleanup();
      });
      if ((await read()).length) void wake();
      return;
    }
    res.writeHead(404);
    res.end();
  } catch {
    res.writeHead(410);
    res.end('{"error":"Session unavailable or fixture rejected"}');
  }
});
server.listen(8788, '127.0.0.1', () => {
  process.stdout.write(
    'Synthetic insurance runtime listening on 127.0.0.1:8788; fixture data only.\n',
  );
});
