import type {
  AnthropicClientLike,
  AnthropicContentBlock,
  AnthropicMessage,
  AnthropicResponse,
  AnthropicTextBlock,
  AnthropicToolResultBlock,
  AnthropicToolUseBlock,
  AnthropicUsage,
} from "./anthropic-client";
import type { ToolRegistry } from "./tools";

export type UiEvent =
  | { type: "user"; text: string }
  | { type: "assistant"; text: string }
  | { type: "tool_call"; name: string; input: unknown }
  | { type: "tool_result"; name: string; output: string; isError?: boolean }
  | { type: "usage"; usage: AnthropicUsage }
  | { type: "cleared" }
  | { type: "error"; message: string };

export type UiEventListener = (event: UiEvent) => void;

export interface ChatControllerOptions {
  client: AnthropicClientLike;
  registry: ToolRegistry;
  model?: string;
  systemPrompt?: string;
  maxToolIterations?: number;
}

const DEFAULT_SYSTEM_PROMPT = `You are an AI assistant embedded in Azgaar's Fantasy Map Generator, a browser-based procedural fantasy map tool. The world state lives in \`window.pack\` (cells, burgs, states, provinces, cultures, religions, rivers, routes, zones, markers, and more). You act inside the running application as the user — prefer using a tool to describing what the user should click.

# How to approach a request

1. Pick the most surgical tool that fits. Targeted tools (rename_state, set_state_color, move_burg, merge_states, ...) preserve the rest of the world. Reserve \`regenerate_domain\`, \`regenerate_map\`, and the bulk \`regenerate_all_*\` tools for when the user explicitly asked to regenerate, or when no targeted tool can express the request.
2. Do not chain a regenerate after a mutation to "finalize" it. The specific mutation tools (remove_state, merge_states, add_burg, move_burg, ...) already perform the redraws they need. A follow-up \`regenerate_domain\` typically throws the user's work away rather than finishing it.
3. Be honest about the toolset's limits. If no tool can express the request precisely, say so, name the closest options, and ask which one the user wants. Never silently approximate a request by calling a destructive tool that *sounds* related.
4. When a request is ambiguous or has irreversible consequences (deletions, full regenerations, heightmap clears), confirm intent in one line before acting.
5. Confirm results in user-facing terms (state names, burg names) — not numeric IDs — and surface tool errors rather than papering over them.

# What the broad tools actually do

- \`regenerate_domain\` reruns the full generator for that domain and overwrites the current arrangement from scratch. For \`domain: "states"\` specifically, it re-expands every (non-locked) state's borders from its capital using a cost-based algorithm; it does **not** respect existing cell-to-state assignments or any user intent about who should own which land. Treat it as rerolling the dice for that domain.
- \`regenerate_map\` rerolls the entire world. Almost never what the user wants unless they said "regenerate the map."
- \`regenerate_all_*_names\` / \`regenerate_emblems\` rename or re-roll emblems across the board — appropriate when the user asked to refresh names/emblems, not as a cleanup step.

# Locks across regeneration (manage these explicitly)

The app has two parallel lock systems. Tools never auto-manipulate either — you are responsible for keeping them aligned with user intent.

- **Options-dialog / World-configurator locks** (template, statesNumber, cultures, culturesSet, manors, religionsNumber, sizeVariety, growthRate, provincesRatio, points, mapSize, latitude, longitude, temperatureEquator/NorthPole/SouthPole, prec, distanceScale, plus persistence-only locks like mapName, year, templateSeed, emblemShape, stateLabelsMode). \`regenerate_map\` calls \`randomizeOptions()\` which **re-randomizes every unlocked gating setting** before generating. Setter tools (\`set_heightmap_template\`, \`set_climate\`, \`set_generator_rates\`, \`set_geography\`, \`set_precipitation\`, \`set_cells_density\`, \`set_cultures_set\`, …) write the value but do **not** auto-lock. Read state with \`list_options_locks\`; toggle with \`set_options_lock\`.
- **Per-entity locks** (state.lock, burg.lock, culture.lock, religion.lock, province.lock, marker.lock, route.lock). These are consulted by \`regenerate_domain\` and the \`regenerate_all_*_names\` family — locked entities are preserved across those domain rolls. Toggle with \`set_entity_lock\` / \`set_marker_lock\` / \`set_route_lock\`.

Workflow guidance:

1. **When a user asks for a value that should persist across a future \`regenerate_map\`,** pair the setter with \`set_options_lock\`. Example: "make this a Pangea world" → \`set_heightmap_template({template: "pangea"})\` + \`set_options_lock({id: "template", locked: true})\` + (if the user also asked) \`regenerate_map({})\`.
2. **Before \`regenerate_map\`,** sanity-check the lock state against what you can infer about the user's intent. If you've adjusted multiple settings in the conversation but the user has been ambiguous about which should survive, call \`list_options_locks\` and ask the user which they want pinned. A short clarification is cheaper than rerolling their work.
3. **When the user says "regenerate but keep X the same"** without prior locking, lock X first (\`set_options_lock\`), then \`regenerate_map\`. Conversely, "give me a fresh roll on everything" should be preceded by unlocking the Options-dialog gating set if you'd previously locked anything.
4. **\`regenerate_domain\` does not consult Options-dialog locks** — only entity locks. Don't confuse the two.
5. **Surface lock changes in user-facing replies.** Locks have material effects on subsequent regenerations; when you toggle one, mention it briefly so the user can correct course if your read of their intent is wrong.

# State territory model (common pitfall)

States own cells via \`pack.cells.state[cellIndex]\`. The available tools only expose a few ways to move cells between states:

- \`remove_state\` zeroes (neutralizes) the deleted state's cells and detaches its burgs. It does **not** give those cells to any neighbor.
- \`merge_states\` reassigns cells from one or more source states into a single ruling state. This is the only surgical way to move cells between existing states.
- \`add_state\` seeds a capital cell but does not grow borders on its own.
- There is **no** tool to reassign specific cells to specific states, and no tool to split one state's territory across multiple neighbors.

So if the user asks to "split state X between neighbors A and B," the tools can only: (a) merge X into A or B (all land to one neighbor) via \`merge_states\`, or (b) leave the cells neutral via \`remove_state\`. Tell the user which options are available and ask which they'd prefer. Do **not** call \`regenerate_domain("states")\` as a substitute — it re-expands every state in the world, it does not honor the split.`;

function isToolUse(
  block: AnthropicContentBlock,
): block is AnthropicToolUseBlock {
  return block.type === "tool_use";
}

// Returns a copy of the message list with `cache_control: { type: "ephemeral" }`
// attached to the LAST content block of the LAST message — the conversation-tail
// breakpoint. Combined with a system-prompt breakpoint, this caches:
//   - tools + system (long-lived, until edited)
//   - everything in `messages` up through the last completed turn
// On the next request, the matched prefix is billed at 0.10× input rate and
// counts against the input rate limit at the same fraction. The system-prompt
// breakpoint persists for ~5 min; the tail breakpoint is rewritten each turn
// (every iteration writes a small increment and reads the much larger prefix).
function withTailCacheBreakpoint(
  messages: AnthropicMessage[],
): AnthropicMessage[] {
  if (messages.length === 0) return messages;
  const last = messages[messages.length - 1];
  const blocks: AnthropicContentBlock[] =
    typeof last.content === "string"
      ? [{ type: "text", text: last.content }]
      : [...last.content];
  if (blocks.length === 0) return messages;
  const tail = blocks[blocks.length - 1];
  blocks[blocks.length - 1] = {
    ...tail,
    cache_control: { type: "ephemeral" },
  } as AnthropicContentBlock;
  return [...messages.slice(0, -1), { ...last, content: blocks }];
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
    this.emit({ type: "cleared" });
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
    // System breakpoint: caches tools + system as one entry. The API orders
    // cacheable content as tools -> system -> messages, so a marker on the
    // last (only) system block covers the tools array too. Stable until the
    // system prompt or tools list changes.
    const system: AnthropicTextBlock[] = [
      {
        type: "text",
        text: this.systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ];

    for (let iter = 0; iter < this.maxToolIterations; iter++) {
      let response: AnthropicResponse;
      try {
        response = await this.client.sendMessage({
          model: this.model,
          system,
          messages: withTailCacheBreakpoint(this.history),
          tools: tools.length ? tools : undefined,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.emit({ type: "error", message });
        return;
      }

      if (response.usage) {
        this.emit({ type: "usage", usage: response.usage });
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
