// require-user — the standard "is this a real signed-in member?" gate.
//
// Any function that spends AI credits or reads office data on a person's
// behalf must call this first. Public/cron functions use the service-role
// bearer check instead; they never use this.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type SignedInUser = { id: string; email: string | null; orgId: string };

/**
 * Returns an approved active member, or null on any failed authorization check.
 * All consumers spend AI credits; invitation/onboarding functions do not use it.
 * The token is verified against the auth server — never trusted as sent.
 */
export async function requireUser(req: Request): Promise<SignedInUser | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );

  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return null;
    // The SECURITY DEFINER RPC avoids the known recursive allowed_users policy.
    const allowed = await supabase.rpc('is_allowed_user');
    if (allowed.error || allowed.data !== true) return null;
    const membership = await supabase.from('org_members').select('org_id')
      .eq('user_id', data.user.id).eq('status', 'active').limit(1).maybeSingle();
    if (membership.error || !membership.data?.org_id) return null;
    return { id: data.user.id, email: data.user.email ?? null, orgId: membership.data.org_id };
  } catch {
    return null;
  }
}
