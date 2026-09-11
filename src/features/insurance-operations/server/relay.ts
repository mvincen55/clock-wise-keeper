import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { z } from 'zod';
import type {
  AuthorizedOffice,
  CallAdapter,
  Readiness,
  SessionCapability,
  SessionOwner,
} from '../adapters/call-contract';
import { TransientRuntime } from './runtime';
import { parseSubmittedTasks } from './task-input';

export type RelayDependencies = {
  origin: string;
  authorize: (bearer: string, officeId: string) => Promise<AuthorizedOffice>;
  adapter: CallAdapter;
  readiness: () => Readiness;
  vendorRequest: (
    path: string,
    raw: string,
    signature: string,
  ) => Promise<boolean> | boolean;
  centsPerMinute: number;
  lifetimeMs?: number;
};
type TokenRecord = { bearer: string; expiresAt: number };
const empty = z.object({}).strict();
const control = z
  .object({
    action: z.enum(['pause', 'resume', 'clear', 'cancel', 'retry']),
    taskId: z.string().uuid().optional(),
  })
  .strict();
const start = z
  .object({ tasks: z.unknown(), settingsVersion: z.number().int().positive() })
  .strict();
const cursor = z
  .object({ after: z.number().int().min(0).max(100000) })
  .strict();
const header = (req: IncomingMessage, key: string) =>
  typeof req.headers[key] === 'string' ? (req.headers[key] as string) : '';
async function readBody(req: IncomingMessage) {
  let count = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    count += chunk.length;
    if (count > 1024 * 1024) throw new Error('Request too large');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}
function reply(res: ServerResponse, status: number, value: unknown) {
  if (res.writableEnded || res.destroyed) return;
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(value));
}
/** Mount behind a covered TLS proxy with body/access logging disabled. All
 * errors deliberately have a fixed response; no request/vendor body is logged. */
export function createInsuranceRelay(deps: RelayDependencies) {
  const tokens = new Map<string, TokenRecord>();
  const caps = new Map<string, SessionCapability>();
  const lifetime = deps.lifetimeMs ?? 3600000;
  const ownerKey = (owner: SessionOwner) => `${owner.orgId}:${owner.userId}`;
  const runtime = new TransientRuntime(
    deps.adapter,
    async (owner) => {
      const token = tokens.get(ownerKey(owner));
      if (!token || token.expiresAt <= Date.now())
        throw new Error('Authorization expired');
      const office = await deps.authorize(token.bearer, owner.orgId);
      if (office.userId !== owner.userId) throw new Error('Owner mismatch');
      return office;
    },
    () => Date.now(),
    lifetime,
    deps.centsPerMinute,
  );
  const sweep = setInterval(() => {
    void runtime.pump().catch(() => undefined);
    for (const [id, cap] of caps)
      if (cap.expiresAt <= Date.now()) caps.delete(id);
    for (const [id, token] of tokens)
      if (token.expiresAt <= Date.now()) tokens.delete(id);
  }, 1000);
  sweep.unref();
  const pending = new Set<ServerResponse>();
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const path = req.url ?? '';
      const vendor = path === '/webhooks/retell' || path === '/tools/retell';
      const origin = header(req, 'origin');
      if (origin && origin !== deps.origin)
        return reply(res, 403, { error: 'Origin unavailable' });
      if (origin) res.setHeader('Access-Control-Allow-Origin', deps.origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type,Authorization,X-Office-Id,X-Session-Id,X-Session-Secret',
      );
      res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
      if (req.method === 'OPTIONS' && !vendor) {
        res.writeHead(204);
        res.end();
        return;
      }
      if (req.method !== 'POST')
        return reply(res, 405, { error: 'Method unavailable' });
      if (
        ![
          '/readiness',
          '/session',
          '/start',
          '/control',
          '/events',
          '/webhooks/retell',
          '/tools/retell',
        ].includes(path)
      )
        return reply(res, 404, { error: 'Route unavailable' });
      if (!header(req, 'content-type').startsWith('application/json'))
        return reply(res, 415, { error: 'JSON required' });
      const raw = await readBody(req);
      if (vendor) {
        const accepted = await deps.vendorRequest(
          path,
          raw,
          header(req, 'x-retell-signature'),
        );
        return reply(res, accepted ? 200 : 403, { accepted });
      }
      const bearer = header(req, 'authorization').replace(/^Bearer /, '');
      if (
        !header(req, 'authorization').startsWith('Bearer ') ||
        bearer.length > 8192
      )
        return reply(res, 403, { error: 'Authorization required' });
      const officeId = z.string().uuid().parse(header(req, 'x-office-id'));
      const office = await deps.authorize(bearer, officeId);
      if (!office.approved || office.orgId !== officeId)
        return reply(res, 403, { error: 'Office unavailable' });
      const owner = { userId: office.userId, orgId: office.orgId };
      const key = ownerKey(owner);
      if (!tokens.has(key) && tokens.size >= 32)
        return reply(res, 429, { error: 'Capacity reached' });
      tokens.set(key, { bearer, expiresAt: Date.now() + lifetime });
      const body = JSON.parse(raw || '{}');
      if (path === '/readiness') {
        empty.parse(body);
        return reply(res, 200, deps.readiness());
      }
      if (path === '/session') {
        empty.parse(body);
        if (!deps.readiness().ready)
          return reply(res, 409, { error: 'Setup required' });
        const cap = await runtime.open(owner);
        caps.set(cap.id, cap);
        return reply(res, 200, cap);
      }
      const stored = caps.get(header(req, 'x-session-id'));
      if (
        !stored ||
        stored.userId !== owner.userId ||
        stored.orgId !== owner.orgId
      )
        return reply(res, 410, { error: 'Session unavailable' });
      const cap = { ...stored, secret: header(req, 'x-session-secret') };
      if (path === '/start') {
        if (!deps.readiness().ready)
          return reply(res, 409, { error: 'Setup required' });
        const parsed = start.parse(body);
        await runtime.start(
          owner,
          cap,
          parseSubmittedTasks(parsed.tasks),
          parsed.settingsVersion,
        );
        return reply(res, 200, { ok: true });
      }
      if (path === '/control') {
        const parsed = control.parse(body);
        await runtime.control(owner, cap, parsed.action, parsed.taskId);
        if (parsed.action === 'clear') caps.delete(cap.id);
        return reply(res, 200, { ok: true });
      }
      const { after } = cursor.parse(body);
      const read = () => runtime.read(owner, cap, after);
      const events = await read();
      if (events.length) return reply(res, 200, { events });
      if (pending.size >= 32)
        return reply(res, 429, { error: 'Event capacity reached' });
      pending.add(res);
      let sent = false;
      let unsubscribe = () => {};

      const finish = () => {
        clearTimeout(timer);
        unsubscribe();
        pending.delete(res);
      };
      const wake = async () => {
        if (sent) return;
        sent = true;
        finish();
        try {
          reply(res, 200, { events: await read() });
        } catch {
          reply(res, 410, { error: 'Session unavailable' });
        }
      };
      unsubscribe = runtime.wait(owner, cap, () => {
        void wake();
      });
      const timer = setTimeout(() => {
        void wake();
      }, 20000);
      res.once('close', finish);
      if ((await read()).length) void wake();
    } catch {
      reply(res, 410, { error: 'Session unavailable or request rejected' });
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.maxConnections = 64;
  return {
    server,
    runtime,
    sessionOwner(id: string): SessionOwner | undefined {
      const cap = caps.get(id);
      return cap ? { userId: cap.userId, orgId: cap.orgId } : undefined;
    },
    async close() {
      clearInterval(sweep);
      for (const cap of caps.values())
        await runtime.control(cap, cap, 'clear').catch(() => undefined);
      caps.clear();
      tokens.clear();
      for (const res of pending) reply(res, 410, { error: 'Service stopping' });
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
