// office-ai-chat — the model behind the "Office AI" conversation in Messages.
//
// The Messages page (and the floating chat dock) write the member's message
// into the `messages` table like any other conversation, then invoke this
// function. It reads the thread under the CALLER's JWT (RLS proves they are a
// participant of their own AI conversation), asks the gateway for a reply, and
// inserts that reply as sender_kind 'pathfinder' with the service role — the
// only writer allowed to speak as the assistant, since RLS restricts member
// inserts to sender_kind 'member'.
//
// Privacy rules, same as every AI surface here:
//   * member text goes through the PHI scrubber at the wire (ai-safe) and the
//     jailbreak signature guard before any of it reaches the gateway.
//   * the reply is stored in the member's own AI conversation, which only they
//     participate in — there is no admin override, by design.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { guardAiInput, JAILBREAK_REFUSAL } from "../_shared/jailbreak-guard.ts";
import { OFFICE_DOCTRINE } from "../_shared/office-doctrine.ts";
import { scrubMessages } from "../_shared/ai-safe.ts";

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

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.6-flash";

/** How much thread the model sees. Older turns simply age out. */
const MAX_TURNS = 24;
const MAX_TURN_CHARS = 4000;
const MAX_REPLY_CHARS = 6000;
const MAX_MEMORIES = 40;

const boundedText = (value: unknown, cap: number): string =>
  typeof value === "string" ? value.trim().slice(0, cap) : "";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "Office AI is not configured yet." });

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
        surface: "office-ai-chat",
        input: last.content,
      })
    ) {
      return json({ error: JAILBREAK_REFUSAL });
    }

    // ---- Grounding: how this office actually operates ----------------------
    const { data: memories } = await supabase
      .from("assistant_memories")
      .select("content")
      .eq("org_id", orgId)
      .eq("kind", "office")
      .eq("status", "active")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(MAX_MEMORIES);
    const officeFacts = (memories ?? [])
      .map((m) => `- ${boundedText(m.content, 400)}`)
      .join("\n")
      .slice(0, 6000);

    const system = [
      OFFICE_DOCTRINE,
      "You are Office AI — the assistant inside the Messages page of Purple Envelope, this dental office's internal app. You are chatting one-on-one with a member of the office staff.",
      "You can: answer questions, help think through office situations, draft wording (messages, announcements, checklists, interview questions, patient-friendly explanations that never name a patient), and explain how to do things in the app.",
      "You cannot take actions: no sending messages for people, no changing schedules, punches, PTO, or settings, and no reading anything beyond this conversation and the office facts below. If asked to do one of those, say what you can't do and point at where in the app it lives. For questions about the office's uploaded policy documents, point them at the Ask AI page, which searches those documents.",
      officeFacts
        ? `Standing facts about this office (authoritative — never contradict):\n${officeFacts}`
        : "",
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

    const response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1200,
        messages: scrubMessages(
          [{ role: "system", content: system } as ChatMessage, ...chat],
          "office-ai-chat",
        ),
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (response.status === 429) {
      return json({ error: "Office AI is busy right now — try again in a moment." });
    }
    if (response.status === 402) {
      return json({ error: "AI credits are used up for now." });
    }
    if (!response.ok) {
      console.error("office-ai-chat: gateway", response.status);
      return json({ error: "Office AI could not answer right now." });
    }
    const data = await response.json();
    const reply = boundedText(data?.choices?.[0]?.message?.content, MAX_REPLY_CHARS);
    if (!reply) return json({ error: "Office AI could not answer right now." });

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

    return json({ replied: true });
  } catch (err) {
    console.error("office-ai-chat: failed", (err as Error)?.message);
    return json({ error: "Something went wrong." }, 500);
  }
});
