// Legacy patient-plan naming is retired. Office guidance has its own endpoint.
// Keep this entry point self-contained: deployment excludes sibling functions.
import { requireUser } from '../_shared/require-user.ts';
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  const user = await requireUser(req);
  return new Response(JSON.stringify({ error: user ? 'Update the app to use office code-bank guidance. No patient plan was read or sent to AI.' : 'Not authorized' }), { status: user ? 410 : 401, headers });
});
