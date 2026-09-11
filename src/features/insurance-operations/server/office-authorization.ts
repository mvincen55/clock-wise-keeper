import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { settingsSchema } from '../domain/schema';
import type { AuthorizedOffice } from '../adapters/call-contract';

export interface AuthorizationConfig {
  databaseUrl: string;
  publicKey: string;
  configuredOfficeId: string;
  deploymentApproved: boolean;
}
/** Non-patient auth/config traffic only. Neither tasks nor webhook bodies are
 * arguments to this adapter. The patient relay must be a separately covered host. */
export async function authorizeOffice(
  config: AuthorizationConfig,
  bearer: string,
  requestedOfficeId: string,
): Promise<AuthorizedOffice> {
  if (requestedOfficeId !== config.configuredOfficeId || !bearer)
    throw new Error('Not authorized');
  const client = createClient<Database>(config.databaseUrl, config.publicKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data: authentication, error: authError } =
    await client.auth.getUser(bearer);
  if (authError || !authentication.user) throw new Error('Not authorized');
  const userId = authentication.user.id;
  const [allowed, membership, configuration] = await Promise.all([
    client.rpc('is_allowed_user'),
    client
      .from('org_members')
      .select('role')
      .eq('org_id', requestedOfficeId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle(),
    client
      .from('insurance_operation_settings')
      .select('configuration,enabled')
      .eq('org_id', requestedOfficeId)
      .maybeSingle(),
  ]);
  if (
    allowed.error ||
    allowed.data !== true ||
    membership.error ||
    !membership.data ||
    configuration.error ||
    !configuration.data
  )
    throw new Error('Not authorized');
  const settings = settingsSchema.parse(configuration.data.configuration);
  if (
    !settings.roles.includes(
      membership.data.role as 'owner' | 'manager' | 'employee',
    )
  )
    throw new Error('Not authorized');
  return {
    userId,
    orgId: requestedOfficeId,
    settings: {
      ...settings,
      enabled: configuration.data.enabled && settings.enabled,
    },
    approved: config.deploymentApproved,
  };
}
