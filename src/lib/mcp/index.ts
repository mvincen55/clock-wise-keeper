import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoamiTool from "./tools/whoami";
import listTimeEntriesTool from "./tools/list-time-entries";
import listPtoRequestsTool from "./tools/list-pto-requests";

// Issuer must be the direct supabase.co host, not any proxy.
// Built from VITE_SUPABASE_PROJECT_ID which Vite inlines at build time.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "purple-envelope-mcp",
  title: "Purple Envelope",
  version: "0.1.0",
  instructions:
    "Tools for Purple Envelope, a workforce time tracking app. Use `whoami` to check identity, `list_time_entries` to read the caller's daily hours, and `list_pto_requests` to read their PTO requests. All tools act as the signed-in user; row-level security scopes results to that user's org and employee.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoamiTool, listTimeEntriesTool, listPtoRequestsTool],
});
