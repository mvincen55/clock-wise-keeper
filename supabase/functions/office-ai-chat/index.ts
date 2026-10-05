// office-ai-chat — the model behind the "Office AI" conversation in Messages
// (and the floating chat dock).
//
// The Messages page writes the member's message into the `messages` table
// like any other conversation, then invokes this function. It reads the
// thread under the CALLER's JWT (RLS proves they are a participant of their
// own AI conversation), runs the same tool-using agent loop as the Ask AI
// page, and inserts the reply as sender_kind 'pathfinder' with the service
// role — the only writer allowed to speak as the assistant, since RLS
// restricts member inserts to sender_kind 'member'.
//
// What the model can reach (all read under the member's JWT, so RLS scopes
// everything to their office):
//   * the office profile (settings) and standing office memories, in the prompt
//   * every code note on the fee schedules — universal and per-carrier
//   * the uploaded document library (handbook, HR, insurance carrier manuals)
//     through the search_office_docs tool
//   * the public internet through the search_web tool (OpenRouter web plugin)
//
// Providers: OpenRouter (Kimi) first; the Lovable AI gateway (OpenAI) when
// Kimi is unconfigured, out of credits, or down — see _shared/chat-provider.
//
// Privacy rules, same as every AI surface here:
//   * member text goes through the PHI scrubber at the wire (ai-safe) and the
//     jailbreak signature guard before any of it reaches a gateway.
//   * the reply is stored in the member's own AI conversation, which only they
//     participate in — there is no admin override, by design.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { guardAiInput, JAILBREAK_REFUSAL } from "../_shared/jailbreak-guard.ts";
import { OFFICE_DOCTRINE } from "../_shared/office-doctrine.ts";
import { loadOfficeProfile, OFFICE_PROFILE_PREAMBLE } from "../_shared/office-knowledge.ts";
import { formatCodeNote, loadCodeNotes } from "../_shared/procedure-notes.ts";
import {
  type AgentSource,
  describeSource,
  SEARCH_OFFICE_DOCS_TOOL,
  searchOfficeDocs,
} from "../_shared/office-doc-search.ts";
import { DEFAULT_WEB_MODEL, SEARCH_WEB_TOOL, searchWeb, type WebSource } from "../_shared/web-search.ts";
import {
  createChatClient,
  describeProviderFailure,
  resolveChatProviders,
} from "../_shared/chat-provider.ts";
import { scrubMessages } from "../_shared/ai-safe.ts";
import { scrubFreeText } from "../_shared/phi-scrub.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SURFACE = "office-ai-chat";

/** How much thread the model sees. Older turns simply age out. */
const MAX_TURNS = 24;
const MAX_TURN_CHARS = 4000;
const MAX_REPLY_CHARS = 6000;
const MAX_MEMORIES = 40;
const MAX_CODE_NOTES = 120;
const MAX_TOOL_ROUNDS = 5;
// Finalize before the edge-function wall clock (150s on the base plan).
const SOFT_DEADLINE_MS = 100_000;

const boundedText = (value: unknown, cap: number): string =>
  typeof value === "string" ? value.trim().slice(0, cap) : "";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const startedAt = Date.now();

  try {
    const providers = resolveChatProviders(Deno.env);
    if (providers.length === 0) {
      return json({ error: "Office AI is not configured yet — add OPENROUTER_API_KEY or LOVABLE_API_KEY." });
    }

    // ---- Auth: a signed-in, active member — through their own JWT ----------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    );
    const { data: auth, error: authError } = await supabase.auth.getUser();
    const user = auth?.user;
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const { data: membership } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (!membership) return json({ error: "Unauthorized" }, 403);
    const orgId = membership.org_id as string;

    const body = await req.json().catch(() => ({}));
    const conversationId = boundedText(body?.conversation_id, 64);
    if (!conversationId) return json({ error: "Bad request" }, 400);

    // The conversation is read through the member's session: RLS decides
    // whether they can see it at all, we only insist it is the AI channel.
    const { data: conv } = await supabase
      .from("conversations")
      .select("id, org_id, type")
      .eq("id", conversationId)
      .maybeSingle();
    if (!conv || conv.org_id !== orgId) return json({ error: "Not found" }, 404);
    if (conv.type !== "ai") return json({ error: "Not an AI conversation" }, 400);

    const { data: rows } = await supabase
      .from("messages")
      .select("sender_kind, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(MAX_TURNS);
    const thread = (rows ?? []).reverse();
    if (thread.length === 0) return json({ error: "Nothing to reply to yet." }, 400);

    // Someone double-invoked (or a retry raced): the last word is already
    // the assistant's, so there is nothing to add.
    const last = thread[thread.length - 1];
    if (last.sender_kind !== "member") return json({ replied: false });

    // Integrity: signature-only jailbreak check on the newest member turn.
    if (
      await guardAiInput({
        orgId,
        actorUserId: user.id,
        surface: SURFACE,
        input: last.content,
      })
    ) {
      return json({ error: JAILBREAK_REFUSAL });
    }

    // ---- Grounding: how this office actually operates ----------------------
    const [{ data: memories }, officeProfile, codeNotes, { data: docs }] = await Promise.all([
      supabase
        .from("assistant_memories")
        .select("content")
        .eq("org_id", orgId)
        .eq("kind", "office")
        .eq("status", "active")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(MAX_MEMORIES),
      // Same office configuration the Ask AI page sees, under the same JWT.
      loadOfficeProfile(supabase, orgId),
      // Every code note — universal and per-carrier — same as the FOF assistant.
      loadCodeNotes(supabase, MAX_CODE_NOTES, 400, orgId),
      supabase.from("office_docs").select("id, title, category").eq("org_id", orgId).limit(200),
    ]);
    // Staff-authored text is scrubbed piece by piece here; the system prompt
    // as a whole is not (ai-safe leaves system messages alone on purpose —
    // the name heuristic would mangle the instructions and document titles).
    const scrubbed = (value: unknown, cap: number): string => scrubFreeText(value, cap).text.replace(/\s+/g, " ").trim();
    const officeFacts = (memories ?? [])
      .map((m) => `- ${scrubbed(m.content, 400)}`)
      .join("\n")
      .slice(0, 6000);
    const docList = ((docs ?? []) as { title?: unknown; category?: unknown }[])
      .map((d) => `${boundedText(d.title, 80)}${boundedText(d.category, 20) ? ` (${boundedText(d.category, 20)})` : ""}`)
      .filter(Boolean);
    const safeNotes = codeNotes.map((n) => ({ ...n, notes: scrubbed(n.notes, 400) })).filter((n) => n.notes);
    const universalNotes = safeNotes.filter((n) => n.scheduleKind === "office");
    const carrierNotes = safeNotes.filter((n) => n.scheduleKind !== "office");

    const client = createChatClient(providers);
    const webAvailable = client.openrouter !== null;
    const webModel = Deno.env.get("OPENROUTER_WEB_MODEL") ?? Deno.env.get("OPENROUTER_CHECK_MODEL") ?? DEFAULT_WEB_MODEL;

    const system = [
      OFFICE_DOCTRINE,
      "You are Office AI — the assistant inside the Messages page of Purple Envelope, this dental office's internal app. You are chatting one-on-one with a member of the office staff.",
      `WHAT YOU CAN REACH: (1) the office profile and standing facts below; (2) the office's code notes below — what this office has written about specific procedure codes; (3) the office's uploaded document library through search_office_docs — ${docList.length} document${docList.length === 1 ? "" : "s"}${docList.length ? `: ${docList.slice(0, 40).join("; ")}` : " (none uploaded yet)"}; ${webAvailable ? "(4) the public internet through search_web." : "(4) web search is unavailable right now — say so if a question needs it."}`,
      "USE THE TOOLS, DON'T GUESS: for anything about office policy, HR, PTO, carrier/insurance rules, what a manual says, or how a code is handled here, call search_office_docs FIRST with 2-5 short keyword queries (expand shorthand: 'DD MA' → Delta Dental, 'ins' → insurance, 'pt' → patient) and answer from what comes back, naming the document, section and page casually ('per the DD MA manual, Timely Filing, p. 12'). Never apply one carrier's rule to another carrier. For general facts outside the office's own documents (what a CDT code means, a carrier's public policy, clinical or regulatory facts, anything current), use search_web and mention the source. If neither finds it, say so plainly instead of inventing policy, rates, or rules.",
      "You can also: help think through office situations, draft wording (messages, announcements, checklists, interview questions, patient-friendly explanations that never name a patient), and explain how to do things in the app.",
      "You cannot take actions: no sending messages for people, no changing schedules, punches, PTO, settings, or office knowledge. If asked to do one of those, say what you can't do and point at where in the app it lives. Managers can save office memories and code notes from the Ask AI page or the FOF Assistant with Training on.",
      officeProfile ? `${OFFICE_PROFILE_PREAMBLE}\n${officeProfile}` : "",
      officeFacts
        ? `Standing facts about this office (authoritative — never contradict):\n${officeFacts}`
        : "",
      safeNotes.length
        ? "CODE NOTES (what the office has written about specific procedure codes — authoritative for those codes). " +
          (universalNotes.length
            ? `UNIVERSAL — these apply to EVERY patient, whatever insurance they have: ${universalNotes.map(formatCodeNote).join(" || ")} `
            : "") +
          (carrierNotes.length
            ? `INSURANCE-SPECIFIC — each applies ONLY when billing that code to the named carrier; never apply one carrier's note to another carrier's patient: ${carrierNotes.map(formatCodeNote).join(" || ")}`
            : "")
        : "",
      "PRIVACY — HARD RULE: you never know who a patient is and must keep it that way. If a message contains a patient's name or personal details, do not repeat them and do not put them in a search; remind the member not to share patient information here.",
      "This is a chat: reply in plain text, no markdown headings. Keep answers short and useful — a few sentences, or a short list when it genuinely helps.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const chat: ChatMessage[] = thread
      .filter((m) => m.sender_kind === "member" || m.sender_kind === "pathfinder")
      .map((m): ChatMessage => ({
        role: m.sender_kind === "member" ? "user" : "assistant",
        content: boundedText(m.content, MAX_TURN_CHARS),
      }))
      .filter((m) => m.content.length > 0);

    const tools = [SEARCH_OFFICE_DOCS_TOOL, ...(webAvailable ? [SEARCH_WEB_TOOL] : [])];
    const docSources = new Map<string, AgentSource>();
    const webSources = new Map<string, WebSource>();

    // deno-lint-ignore no-explicit-any
    const executeTool = async (name: string, args: any): Promise<string> => {
      switch (name) {
        case "search_office_docs":
          return await searchOfficeDocs(supabase, Array.isArray(args?.queries) ? args.queries : [], docSources);
        case "search_web": {
          const openrouter = client.openrouter;
          if (!openrouter) {
            return "ERROR: web search is unavailable right now (it needs the Kimi/OpenRouter provider, which is not responding). Answer from the office's documents and say the web could not be checked.";
          }
          return await searchWeb({
            apiKey: openrouter.apiKey,
            model: webModel,
            query: boundedText(args?.query, 300),
            surface: SURFACE,
            sources: webSources,
          });
        }
        default:
          return `ERROR: unknown tool ${name}.`;
      }
    };

    // ---- agent loop --------------------------------------------------------
    // deno-lint-ignore no-explicit-any
    const convo: any[] = [
      { role: "system", content: system },
      ...chat,
    ];
    let reply = "";
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const outOfTime = Date.now() - startedAt > SOFT_DEADLINE_MS;
      const finalizing = round === MAX_TOOL_ROUNDS || outOfTime;
      const result = await client.complete(
        {
          messages: scrubMessages(convo, SURFACE),
          // Tools stay declared even on the final round (tool messages in
          // history need them); tool_choice "none" forces a text reply.
          tools,
          tool_choice: finalizing ? "none" : "auto",
          max_tokens: 1500,
          temperature: 0.5,
        },
        60_000,
      );
      if (!result.ok) {
        console.error("office-ai-chat: providers", result.error);
        return json({ error: describeProviderFailure(result) });
      }
      const message = result.completion?.choices?.[0]?.message;
      if (!message) return json({ error: "Office AI could not answer right now." });

      const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
      if (toolCalls.length === 0 || finalizing) {
        reply = boundedText(message.content, MAX_REPLY_CHARS);
        break;
      }

      // Echo the assistant turn (with any reasoning details some Kimi
      // variants emit — OpenRouter wants them passed back for tool-call
      // continuity), then run every requested tool.
      convo.push({
        role: "assistant",
        content: message.content ?? "",
        tool_calls: toolCalls,
        ...(message.reasoning ? { reasoning: message.reasoning } : {}),
        ...(message.reasoning_details ? { reasoning_details: message.reasoning_details } : {}),
      });
      for (const tc of toolCalls) {
        const name = tc?.function?.name ?? "";
        // deno-lint-ignore no-explicit-any
        let args: any = {};
        try {
          args = JSON.parse(tc?.function?.arguments || "{}");
        } catch {
          /* leave args empty; executor reports the problem */
        }
        let toolResult: string;
        try {
          toolResult = await executeTool(name, args);
        } catch (err) {
          toolResult = `ERROR: ${err instanceof Error ? err.message : "tool failed"}`;
        }
        convo.push({ role: "tool", tool_call_id: tc.id, name, content: toolResult });
      }
    }
    if (!reply) return json({ error: "Office AI could not answer right now." });

    // A chat reply is stored as plain text, so the citations the Ask AI page
    // shows as chips ride along at the end of the message instead.
    const cited = [
      ...[...docSources.values()].map(describeSource),
      ...[...webSources.values()].map((s) => s.url),
    ].slice(0, 8);
    if (cited.length) reply = `${reply}\n\nSources: ${cited.join("; ")}`.slice(0, MAX_REPLY_CHARS);

    // ---- The reply is written by the service role: RLS lets members write
    // only as themselves, and 'pathfinder' is how the schema spells the AI.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { error: insertError } = await admin.from("messages").insert({
      org_id: orgId,
      conversation_id: conversationId,
      sender_id: null,
      sender_kind: "pathfinder",
      content: reply,
    });
    if (insertError) {
      console.error("office-ai-chat: insert", insertError.message);
      return json({ error: "The reply could not be saved — try again." });
    }

    return json({ replied: true, provider: client.active?.name ?? null });
  } catch (err) {
    console.error("office-ai-chat: failed", (err as Error)?.message);
    return json({ error: "Something went wrong." }, 500);
  }
});
