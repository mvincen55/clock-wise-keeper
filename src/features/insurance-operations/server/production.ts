import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '@/integrations/supabase/types';
import {
  authorizeOffice,
  type AuthorizationConfig,
} from './office-authorization';
import { PayerRouter } from './payer-router';
import { createInsuranceRelay } from './relay';
import type { AuthorizedOffice } from '../adapters/call-contract';
import type { Task } from '../domain/workflow';
import type { RetellSetup } from './retell';

const secureOrigin = z
  .string()
  .url()
  .refine((value) => {
    const u = new URL(value);
    return (
      u.protocol === 'https:' &&
      u.pathname === '/' &&
      !u.search &&
      !u.hash &&
      !u.username &&
      !u.password
    );
  });
export const deploymentSchema = z
  .object({
    officeId: z.string().uuid(),
    appOrigin: secureOrigin,
    publicOrigin: secureOrigin,
    databaseUrl: secureOrigin,
    publicKey: z.string().min(20),
    fromNumber: z.string().regex(/^\+[1-9]\d{7,14}$/),
    approvedPath: z.boolean(),
    retentionVerified: z.boolean(),
    conservativeCentsPerMinute: z.number().positive().max(10000),
    payers: z
      .array(
        z
          .object({
            payerId: z.string().uuid(),
            agentId: z.string().min(1).max(100),
            agentVersion: z.number().int().min(0),
            payerWorkflowTested: z.boolean(),
          })
          .strict(),
      )
      .min(1)
      .max(50),
    port: z.number().int().min(1024).max(65535).default(8789),
  })
  .strict();
export type DeploymentConfig = z.infer<typeof deploymentSchema>;
const phone = (value: string) => {
  if (!/^[+\d\s().-]+$/.test(value)) throw new Error('Review telephone entry');
  const normalized = value.replace(/[\s().-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(normalized))
    throw new Error('Use an international phone number');
  return normalized;
};
const identifier = (value: string, length: number) => {
  if (!/^[\d\s-]+$/.test(value)) throw new Error('Review credential entry');
  const normalized = value.replace(/[\s-]/g, '');
  if (normalized.length !== length) throw new Error('Review credential length');
  return normalized;
};
export function createProductionRelay(raw: unknown, apiKey: string) {
  const config = deploymentSchema.parse(raw);
  const ready =
    !!apiKey &&
    config.approvedPath &&
    config.retentionVerified &&
    config.payers.every((p) => p.payerWorkflowTested);
  const authConfig: AuthorizationConfig = {
    databaseUrl: config.databaseUrl,
    publicKey: config.publicKey,
    configuredOfficeId: config.officeId,
    deploymentApproved: config.approvedPath,
  };
  // JWTs remain in process memory only. The outer relay bounds active owners;
  // this cache is pruned on every authorization and on service shutdown.
  const credentials = new Map<string, { bearer: string; expiresAt: number }>();

  const authorize = async (
    bearer: string,
    orgId: string,
  ): Promise<AuthorizedOffice> => {
    for (const [key, v] of credentials)
      if (v.expiresAt <= Date.now()) credentials.delete(key);
    const office = await authorizeOffice(authConfig, bearer, orgId);
    if (!credentials.has(office.userId) && credentials.size >= 32)
      throw new Error('Capacity');
    credentials.set(office.userId, { bearer, expiresAt: Date.now() + 3600000 });
    return office;
  };
  const resolve = async (task: Task): Promise<RetellSetup> => {
    const owner = relay.sessionOwner(task.sessionId);
    const credential = owner && credentials.get(owner.userId);
    if (!owner || !credential || credential.expiresAt <= Date.now())
      throw new Error('Session unavailable');
    const office = await authorize(credential.bearer, owner.orgId);
    const client = createClient<Database>(
      config.databaseUrl,
      config.publicKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: { headers: { Authorization: `Bearer ${credential.bearer}` } },
      },
    );
    const [directory, branding, provider] = await Promise.all([
      client
        .from('important_numbers')
        .select('id,value')
        .eq('org_id', owner.orgId),
      client
        .from('org_branding')
        .select('legal_name,display_name')
        .eq('org_id', owner.orgId)
        .maybeSingle(),
      task.planIdentity.providerId
        ? client
            .from('org_providers')
            .select('id')
            .eq('org_id', owner.orgId)
            .eq('id', task.planIdentity.providerId)
            .eq('active', true)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (
      directory.error ||
      branding.error ||
      !branding.data ||
      provider.error ||
      (task.planIdentity.providerId && !provider.data)
    )
      throw new Error('References unavailable');
    const mapped = (role: string, required = true) => {
      const found = office.settings.mappings.filter(
        (m) =>
          m.role === role &&
          m.confirmed &&
          (role === 'payer_phone'
            ? m.entryId === task.planIdentity.payerId
            : role === 'rendering_npi'
              ? m.providerId === task.planIdentity.providerId && !!m.providerId
              : m.providerId === null),
      );
      if (found.length === 0 && !required) return undefined;
      if (found.length !== 1) throw new Error('Missing or ambiguous mapping');
      const entry = directory.data?.find((d) => d.id === found[0].entryId);
      if (!entry?.value) throw new Error('Empty canonical reference');
      return entry.value;
    };
    const payer = config.payers.find(
      (p) => p.payerId === task.planIdentity.payerId,
    );
    if (!payer) throw new Error('Payer not configured');
    const rendering = mapped('rendering_npi', !!task.planIdentity.providerId);
    const practiceName = branding.data.legal_name || branding.data.display_name;
    if (!practiceName) throw new Error('Practice identity missing');
    return {
      apiKey,
      agentId: payer.agentId,
      agentVersion: payer.agentVersion,
      fromNumber: config.fromNumber,
      payerId: payer.payerId,
      payerNumber: phone(mapped('payer_phone')!),
      officeFax: phone(mapped('office_fax')!),
      webhookUrl: new URL('/webhooks/retell', config.publicOrigin).href,
      approvedPath: ready,
      retentionVerified: config.retentionVerified,
      payerWorkflowTested: payer.payerWorkflowTested,
      practiceName,
      credentials: {
        billingNpi: identifier(mapped('billing_npi')!, 10),
        taxId: identifier(mapped('tax_id')!, 9),
        ...(rendering ? { renderingNpi: identifier(rendering, 10) } : {}),
      },
    };
  };
  const adapter = new PayerRouter(resolve, (event) =>
    relay.runtime.receive(event),
  );
  const relay = createInsuranceRelay({
    origin: config.appOrigin,
    authorize,
    adapter,
    centsPerMinute: config.conservativeCentsPerMinute,
    readiness: () => ({
      ready,
      mode: 'live',
      requirements: ready
        ? []
        : [
            'Approved path, retention review, API key and tested pinned payer agents are required.',
          ],
    }),
    vendorRequest: (...args) => adapter.vendorRequest(...args),
  });
  return {
    ...relay,
    config,
    async close() {
      await relay.close();
      credentials.clear();
    },
  };
}

if ((import.meta as ImportMeta & { main?: boolean }).main) {
  try {
    const file = process.env.INSURANCE_RELAY_CONFIG;
    if (!file) throw new Error('Configuration required');
    const relay = createProductionRelay(
      JSON.parse(readFileSync(file, 'utf8')),
      process.env.RETELL_API_KEY ?? '',
    );
    // Loopback only. A separately approved reverse proxy terminates public TLS.
    relay.server.listen(relay.config.port, '127.0.0.1', () =>
      process.stdout.write(
        'Insurance relay listening on loopback; inspect authenticated readiness.\n',
      ),
    );
    const stop = () => {
      void relay.close().finally(() => process.exit(0));
    };
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
  } catch {
    process.stderr.write(
      'Insurance relay setup invalid or unavailable. Review the configuration; no secrets are logged.\n',
    );
    process.exitCode = 1;
  }
}
