import type { AnthropicToolSchema } from "./tools";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

// Marks a content block as a prompt-cache breakpoint. Everything before and
// including the marked block becomes a cacheable prefix; subsequent requests
// whose prefix matches read at 0.10× input rate, and the marker also resets
// rate-limit accounting at the same fraction. See
// https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching.
export interface CacheControlEphemeral {
  type: "ephemeral";
}

export interface AnthropicTextBlock {
  type: "text";
  text: string;
  cache_control?: CacheControlEphemeral;
}

export interface AnthropicToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
  cache_control?: CacheControlEphemeral;
}

export interface AnthropicToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
  cache_control?: CacheControlEphemeral;
}

export type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock;

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

export interface AnthropicRequest {
  model: string;
  // Array form is required when attaching cache_control to the system prompt.
  system?: string | AnthropicTextBlock[];
  messages: AnthropicMessage[];
  tools?: AnthropicToolSchema[];
  max_tokens?: number;
  temperature?: number;
}

export interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
  // Tokens written into the prompt cache during this request (billed at
  // 1.25× input rate). Present only when prompt caching is active.
  cache_creation_input_tokens?: number;
  // Tokens served from the prompt cache during this request (billed at
  // 0.10× input rate). Present only when a cache hit occurred.
  cache_read_input_tokens?: number;
}

export interface AnthropicResponse {
  id: string;
  type: "message";
  role: "assistant";
  model: string;
  content: AnthropicContentBlock[];
  stop_reason:
    | "end_turn"
    | "max_tokens"
    | "stop_sequence"
    | "tool_use"
    | string;
  stop_sequence: string | null;
  usage?: AnthropicUsage;
}

export class AnthropicApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "AnthropicApiError";
    this.status = status;
  }
}

export interface AnthropicClientOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  url?: string;
}

export class AnthropicClient {
  private apiKey: string;
  private fetchImpl: typeof fetch;
  private url: string;

  constructor(opts: AnthropicClientOptions) {
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.url = opts.url ?? ANTHROPIC_URL;
  }

  async sendMessage(req: AnthropicRequest): Promise<AnthropicResponse> {
    const body: AnthropicRequest = {
      max_tokens: 1024,
      ...req,
    };

    const response = await this.fetchImpl(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let message = `Anthropic API error ${response.status} ${response.statusText}`;
      try {
        const json = (await response.json()) as {
          error?: { message?: string };
        };
        if (json.error?.message) message = json.error.message;
      } catch {}
      throw new AnthropicApiError(response.status, message);
    }

    return (await response.json()) as AnthropicResponse;
  }
}

export type AnthropicClientLike = Pick<AnthropicClient, "sendMessage">;
