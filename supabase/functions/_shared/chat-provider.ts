/**
 * One chat client for every office assistant surface, with a fallback.
 *
 * Order of preference, per request:
 *   1. OpenRouter (Moonshot Kimi) — OPENROUTER_API_KEY. The office's primary
 *      model, and the only one that can run the web-search plugin.
 *   2. Lovable AI gateway (OpenAI model) — LOVABLE_API_KEY. Used when Kimi is
 *      not configured, out of credits (402), rejects its key (401), or is
 *      rate-limited / down. The office keeps getting answers either way.
 *
 * Both endpoints speak the same OpenAI chat-completions dialect (messages,
 * tools, tool_choice), so a tool-calling loop written once runs on either.
 * Once a turn has fallen back it stays on that provider for the rest of the
 * turn: tool messages already in the history must be answered by the same
 * model that asked for them.
 */

export const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
export const LOVABLE_CHAT_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
export const DEFAULT_OPENROUTER_MODEL = "moonshotai/kimi-k3";
/** OpenAI through Lovable's gateway — same slug other functions here use. */
export const DEFAULT_LOVABLE_MODEL = "openai/gpt-5.5";

export type ProviderName = "openrouter" | "lovable";

export interface ChatProvider {
  name: ProviderName;
  url: string;
  model: string;
  apiKey: string;
  /** Human label for prompts and logs. */
  label: string;
}

type Env = { get: (name: string) => string | undefined };

/** Providers in the order they should be tried. Empty when nothing is configured. */
export function resolveChatProviders(env: Env = Deno.env): ChatProvider[] {
  const providers: ChatProvider[] = [];
  const openrouterKey = env.get("OPENROUTER_API_KEY");
  if (openrouterKey) {
    providers.push({
      name: "openrouter",
      url: OPENROUTER_CHAT_URL,
      model: env.get("OPENROUTER_MODEL") ?? DEFAULT_OPENROUTER_MODEL,
      apiKey: openrouterKey,
      label: "Kimi (OpenRouter)",
    });
  }
  const lovableKey = env.get("LOVABLE_API_KEY");
  if (lovableKey) {
    providers.push({
      name: "lovable",
      url: LOVABLE_CHAT_URL,
      model: env.get("LOVABLE_CHAT_MODEL") ?? DEFAULT_LOVABLE_MODEL,
      apiKey: lovableKey,
      label: "OpenAI (Lovable gateway)",
    });
  }
  return providers;
}

export interface CompletionRequest {
  // deno-lint-ignore no-explicit-any
  messages: any[];
  // deno-lint-ignore no-explicit-any
  tools?: any[];
  tool_choice?: "auto" | "none";
  max_tokens?: number;
  temperature?: number;
}

export type CompletionResult =
  // deno-lint-ignore no-explicit-any
  | { ok: true; completion: any; provider: ChatProvider }
  | { ok: false; status: number; provider: ChatProvider | null; error: string };

/** Statuses after which the next provider is worth trying. */
const FALLBACK_STATUSES = new Set([401, 402, 403, 404, 408, 425, 429, 500, 502, 503, 504]);

export interface ChatClient {
  /** The provider the turn is currently pinned to (null until the first call). */
  readonly active: ChatProvider | null;
  /** True while OpenRouter is still the live provider — the web plugin needs it. */
  readonly openrouter: ChatProvider | null;
  complete(request: CompletionRequest, timeoutMs?: number): Promise<CompletionResult>;
}

/**
 * Build a client for one request/turn. `fetchImpl` is injectable for tests.
 */
export function createChatClient(
  providers: ChatProvider[],
  fetchImpl: typeof fetch = fetch,
): ChatClient {
  let index = 0;
  let pinned = false;
  const openrouter = providers.find((p) => p.name === "openrouter") ?? null;

  const post = async (
    provider: ChatProvider,
    request: CompletionRequest,
    timeoutMs: number,
  ): Promise<{ status: number; body: unknown } | { status: 0; body: null }> => {
    try {
      const response = await fetchImpl(provider.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          "Content-Type": "application/json",
          ...(provider.name === "openrouter"
            ? {
                "HTTP-Referer": "https://github.com/mvincen55/clock-wise-keeper",
                "X-Title": "Purple Envelope Office Assistant",
              }
            : {}),
        },
        body: JSON.stringify({ model: provider.model, ...request }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        /* non-JSON error bodies are fine — the status carries the meaning */
      }
      return { status: response.status, body };
    } catch {
      return { status: 0, body: null };
    }
  };

  return {
    get active() {
      return pinned ? providers[index] ?? null : null;
    },
    get openrouter() {
      // Once the turn has moved past OpenRouter it is out of play for search too.
      return openrouter && (!pinned || providers[index]?.name === "openrouter") ? openrouter : null;
    },
    async complete(request, timeoutMs = 90_000) {
      if (providers.length === 0) {
        return { ok: false, status: 0, provider: null, error: "No AI provider is configured." };
      }
      let last: CompletionResult | null = null;
      for (; index < providers.length; index++) {
        const provider = providers[index];
        const { status, body } = await post(provider, request, timeoutMs);
        if (status >= 200 && status < 300) {
          pinned = true;
          return { ok: true, completion: body, provider };
        }
        const reason =
          status === 0
            ? "did not respond"
            : status === 402
              ? "is out of credits"
              : status === 401
                ? "rejected its API key"
                : status === 429
                  ? "is rate-limited"
                  : `returned HTTP ${status}`;
        console.warn(`chat-provider: ${provider.label} ${reason}`);
        last = { ok: false, status, provider, error: `${provider.label} ${reason}.` };
        // A turn already pinned to this provider cannot switch mid-history.
        if (pinned) break;
        if (!(status === 0 || FALLBACK_STATUSES.has(status))) break;
      }
      if (index >= providers.length) index = providers.length - 1;
      return last ?? { ok: false, status: 0, provider: null, error: "AI request failed." };
    },
  };
}

/** The message staff see when every provider failed. */
export function describeProviderFailure(result: Extract<CompletionResult, { ok: false }>): string {
  if (!result.provider) return "Office AI is not configured yet — add OPENROUTER_API_KEY or LOVABLE_API_KEY.";
  if (result.status === 402) {
    return `${result.provider.label} is out of credits. Add credits, or add the other provider's key so Office AI can fall back.`;
  }
  if (result.status === 429) return "Office AI is busy right now — try again in a moment.";
  return "Office AI could not answer right now — try again in a moment.";
}
