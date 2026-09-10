// Legacy cloud screenshot import is retired. The FOF reads and reviews images locally.
import { requireUser } from '../_shared/require-user.ts';
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Content-Type': 'application/json' };
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  const user = await requireUser(req);
  return new Response(JSON.stringify({ error: user ? 'Update the app to read this screenshot privately in your browser. No image was sent to AI.' : 'Not authorized' }), { status: user ? 410 : 401, headers });
});
