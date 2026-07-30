// ai-safe — one scrub point at the wire, not scattered through prompt builders.
//
// Every function that talks to the AI gateway ends up doing the same thing:
// assemble a `messages` array and POST it. Scrubbing at that boundary means a
// new prompt builder, a new tool result, or a new context block cannot bypass
// the redactor by accident — the only way out of the building is through here.
//
// System messages are left alone on purpose: they are static, author-written
// instructions (doctrine, rubrics, output contracts) and running the name
// heuristic over them mangles the instructions without protecting anyone.
// Everything else — user turns, assistant history, tool results carrying DB
// rows, image captions — is scrubbed.

import { scrubFreeText, type ScrubResult } from "./phi-scrub.ts";
import { assertGatewayAllowed, isAllowlisted } from "./ai-allowlist.ts";

type Part = { type?: string; text?: unknown; [k: string]: unknown };
type Message = { role?: unknown; content?: unknown; [k: string]: unknown };

const PART_LIMIT = 20_000;

function scrubText(value: unknown, hits: string[]): string {
  const r: ScrubResult = scrubFreeText(value, PART_LIMIT);
  for (const h of r.hits) if (!hits.includes(h)) hits.push(h);
  return r.text;
}

function scrubContent(content: unknown, hits: string[]): unknown {
  if (typeof content === "string") return scrubText(content, hits);
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (!part || typeof part !== "object") return part;
      const p = part as Part;
      // Only text-bearing parts are scrubbable. Image/file parts pass through
      // untouched — their own upload path decides whether they may be sent.
      if (typeof p.text === "string") return { ...p, text: scrubText(p.text, hits) };
      return p;
    });
  }
  return content;
}

/**
 * Scrub an outbound chat `messages` array. Returns a new array; the input is
 * never mutated. Safe to call on anything — malformed entries pass through.
 */
export function scrubMessages<T>(messages: T, surface?: string): T {
  // A named surface must be registered in the allowlist. Unregistered callers
  // throw here rather than shipping text to a gateway nobody signed off on.
  if (surface !== undefined) assertGatewayAllowed(surface);
  if (!Array.isArray(messages)) return messages;
  const hits: string[] = [];
  const out = messages.map((m) => {
    if (!m || typeof m !== "object") return m;
    const msg = m as Message;
    if (msg.role === "system") return msg;
    return { ...msg, content: scrubContent(msg.content, hits) };
  });
  if (hits.length > 0) {
    // The labels only, never the value.
    console.log(`phi-scrub: ${surface ?? "gateway"} redacted [${hits.join(",")}]`);
  }
  return out as unknown as T;
}

export { assertGatewayAllowed, isAllowlisted };
