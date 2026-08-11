// ai-allowlist — the single registry of functions permitted to reach the AI
// gateway, and how each one handles person-level data.
//
// The gateway sits outside this practice's BAA. Anything put in a prompt has
// left the building. So reaching the gateway is not a thing a function may do
// quietly: it must appear here with an explicit PHI handler.
//
//   handler: "scrub"     — free text is piped through phi-scrub / ai-safe
//                          before the POST. This is the default expectation.
//   handler: "consented" — the person-level content IS the request (a user
//                          uploaded the document and asked for it to be read).
//                          Requires a reason, and stays rare.
//
// Adding a new AI caller without registering it here fails the test suite
// (src/test/phi-gateway-guard.test.ts) and throws at runtime if it routes
// through ai-safe. That is deliberate: the decision must be made, not
// remembered.

export type PhiHandler = "scrub" | "consented";

export type GatewayEntry = {
  /** How this function handles person-level data on the way out. */
  handler: PhiHandler;
  /** Why this is acceptable. Required for every entry. */
  reason: string;
};

export const AI_GATEWAY_ALLOWLIST: Record<string, GatewayEntry> = {
  // ---- scrubbed: staff free text, redacted at the wire -------------------
  "goal-assistant": {
    handler: "scrub",
    reason: "Goal titles and update notes are staff free text.",
  },
  "office-pulse": {
    handler: "scrub",
    reason: "Summarizes office signals that can carry staff-authored notes.",
  },
  "sprint-verify": {
    handler: "scrub",
    reason: "Reads a staff-uploaded verification artifact, then deletes it.",
  },
  "sprint-architect": {
    handler: "scrub",
    reason:
      "Builds sprint suggestions from manager direction, sprint history, and office rules — all staff-authored free text.",
  },
  "commitment-listen": {
    handler: "scrub",
    reason: "Listens to meeting/update text authored by staff.",
  },
  "training-roleplay": {
    handler: "scrub",
    reason: "Persona chat and rubric scoring over trainee-authored replies.",
  },
  "ask-docs": {
    handler: "scrub",
    reason: "Answers questions over the office corpus using staff questions.",
  },
  "assistant-auditor": {
    handler: "scrub",
    reason: "Second-pass audit over another model's output.",
  },
  "kimi-agent": {
    handler: "scrub",
    reason: "General agent surface over staff-authored prompts.",
  },
  "reports-analyst": {
    handler: "scrub",
    reason: "Analyzes report rows that can carry staff notes.",
  },
  "support-agent": {
    handler: "scrub",
    reason: "Support tickets contain user-written problem descriptions.",
  },
  "training-builder": {
    handler: "scrub",
    reason: "Grounds modules in office docs and memories.",
  },
  "accountability-engine": {
    handler: "scrub",
    reason: "Drafts neutral records from staff-authored event context.",
  },
  "office-ai-chat": {
    handler: "scrub",
    reason: "The Office AI conversation in Messages carries staff free text.",
  },
  "consent-ai": {
    handler: "scrub",
    reason:
      "Converts and reviews the office's blank consent templates. Uploads are supposed to be blank masters; scrubbing catches a filled form uploaded by mistake.",
  },

  // ---- consented: the person-level content is the request ---------------
  "parse-pdf": {
    handler: "consented",
    reason: "User uploads a payroll/timesheet PDF and asks for it to be read.",
  },
  "parse-treatment": {
    handler: "consented",
    reason: "User uploads a treatment plan and asks for it to be parsed.",
  },
  "ingest-doc": {
    handler: "consented",
    reason: "Owner deliberately uploads office policy documents to the corpus.",
  },
  "name-visits": {
    handler: "consented",
    reason: "Sees procedure codes and visit structure only — no person fields.",
  },
};

/** Every function name permitted to reach the gateway. */
export function allowlistedSurfaces(): string[] {
  return Object.keys(AI_GATEWAY_ALLOWLIST);
}

/** Surfaces required to run outbound text through the scrubber. */
export function surfacesRequiringScrub(): string[] {
  return allowlistedSurfaces().filter(
    (n) => AI_GATEWAY_ALLOWLIST[n].handler === "scrub",
  );
}

/** Surfaces exempt from scrubbing because the content is the request. */
export function consentedSurfaces(): string[] {
  return allowlistedSurfaces().filter(
    (n) => AI_GATEWAY_ALLOWLIST[n].handler === "consented",
  );
}

export function isAllowlisted(surface: string | undefined): boolean {
  return !!surface && surface in AI_GATEWAY_ALLOWLIST;
}

/**
 * Runtime gate. Called from the shared wire helper so an unregistered surface
 * fails loudly in the function's own logs instead of silently shipping text.
 */
export function assertGatewayAllowed(surface: string | undefined): GatewayEntry {
  if (!surface) {
    throw new Error(
      "ai-gateway: no surface name given. Pass the function name so its PHI handler can be verified.",
    );
  }
  const entry = AI_GATEWAY_ALLOWLIST[surface];
  if (!entry) {
    throw new Error(
      `ai-gateway: "${surface}" is not registered in _shared/ai-allowlist.ts. ` +
        `Register it with a PHI handler ("scrub" or "consented") before calling the gateway.`,
    );
  }
  return entry;
}
