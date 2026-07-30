// require-user — the standard "is this a real signed-in member?" gate.
//
// Any function that spends AI credits or reads office data on a person's
// behalf must call this first. Public/cron functions use the service-role
// bearer check instead; they never use this.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type SignedInUser = { id: string; email: string | null };

/**
 * Returns the signed-in user, or null when the request has no valid session.
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

  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}
