import type {
  AnthropicClientLike,
  AnthropicContentBlock,
  AnthropicMessage,
  AnthropicResponse,
  AnthropicToolResultBlock,
  AnthropicToolUseBlock,
} from "./anthropic-client";
import type { ToolRegistry } from "./tools";

export type UiEvent =
  | { type: "user"; text: string }
  | { type: "assistant"; text: string }
  | { type: "tool_call"; name: string; input: unknown }
  | { type: "tool_result"; name: string; output: string; isError?: boolean }
  | { type: "error"; message: string };

export type UiEventListener = (event: UiEvent) => void;

export interface ChatControllerOptions {
  client: AnthropicClientLike;
  registry: ToolRegistry;
  model?: string;
  systemPrompt?: string;
  maxToolIterations?: number;
}

const DEFAULT_SYSTEM_PROMPT = `You are an AI assistant embedded in Azgaar's Fantasy Map Generator, a browser-based procedural fantasy map tool. The current world state lives in \`window.pack\` with burgs, states, cultures, religions, rivers, routes, and more.

You act inside the running application as if you were the user. Use the provided tools to perform actions the user would normally perform via the UI. Prefer using a tool to describing what the user should click.

When a user asks you to change something, use the appropriate tool and then briefly confirm what you did. If you don't have a tool for what the user wants, say so honestly.`;

function isToolUse(
  block: AnthropicContentBlock,
): block is AnthropicToolUseBlock {
  return block.type === "tool_use";
}

export class ChatController {
  private client: AnthropicClientLike;
  private registry: ToolRegistry;
  private model: string;
  private systemPrompt: string;
  private maxToolIterations: number;
  private history: AnthropicMessage[] = [];
  private listeners = new Set<UiEventListener>();

  constructor(opts: ChatControllerOptions) {
    this.client = opts.client;
    this.registry = opts.registry;
    this.model = opts.model ?? "claude-haiku-4-5-20251001";
    this.systemPrompt = opts.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    this.maxToolIterations = opts.maxToolIterations ?? 8;
  }

  on(listener: UiEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: UiEvent): void {
    for (const l of this.listeners) l(event);
  }

  reset(): void {
    this.history = [];
  }

  getHistory(): AnthropicMessage[] {
    return this.history;
  }

  async send(userText: string): Promise<void> {
    const trimmed = userText.trim();
    if (!trimmed) return;
    this.emit({ type: "user", text: trimmed });
    this.history.push({ role: "user", content: trimmed });

    const tools = this.registry.toAnthropicSchemas();

    for (let iter = 0; iter < this.maxToolIterations; iter++) {
      let response: AnthropicResponse;
      try {
        response = await this.client.sendMessage({
          model: this.model,
          system: this.systemPrompt,
          messages: this.history,
          tools: tools.length ? tools : undefined,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.emit({ type: "error", message });
        return;
      }

      this.history.push({ role: "assistant", content: response.content });

      for (const block of response.content) {
        if (block.type === "text" && block.text) {
          this.emit({ type: "assistant", text: block.text });
        }
      }

      const toolUses = response.content.filter(isToolUse);
      if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
        return;
      }

      const toolResults: AnthropicToolResultBlock[] = [];
      for (const call of toolUses) {
        this.emit({ type: "tool_call", name: call.name, input: call.input });
        const result = await this.registry.run(call.name, call.input);
        this.emit({
          type: "tool_result",
          name: call.name,
          output: result.content,
          isError: result.isError,
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: result.content,
          is_error: result.isError,
        });
      }

      this.history.push({ role: "user", content: toolResults });
    }

    this.emit({
      type: "error",
      message: `Stopped after ${this.maxToolIterations} tool iterations.`,
    });
  }
}
