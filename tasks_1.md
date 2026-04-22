# Tasks 1 — Execution checklist for Plan 1

Derived directly from `plan_1.md`. Each task corresponds to a concrete
artifact or a verifiable outcome.

## Setup

- [ ] T1. Confirm baseline: `npm install`, `npm run lint`, `npm test -- --run`.
      Record counts (7 warnings / 1 info / 0 errors / 62 tests pass).

## Types and infrastructure (`src/ai/`)

- [ ] T2. Create `src/ai/api-key.ts`
      - `getApiKey(): string | null`
      - `setApiKey(key: string): void`
      - `clearApiKey(): void`
      - localStorage key: `"ai-chat-anthropic-api-key"`.

- [ ] T3. Create `src/ai/anthropic-client.ts`
      - `class AnthropicClient { async sendMessage(req): Promise<Response>; }`
      - Uses `fetch("https://api.anthropic.com/v1/messages", ...)` with
        headers `x-api-key`, `anthropic-version: 2023-06-01`, and
        `anthropic-dangerous-direct-browser-access: true`.
      - Throws `AnthropicApiError` with message derived from response body
        on non-2xx.
      - Accepts injection seam: the constructor takes an optional `fetchImpl`
        defaulting to `globalThis.fetch`.

- [ ] T4. Create `src/ai/tools/index.ts`
      - `interface Tool<I, O> { name; description; input_schema; execute; }`.
      - `ToolRegistry` class: `register(tool)`, `list()`, `toAnthropicSchemas()`,
        `run(name, input): Promise<ToolResult>` where unknown names return
        `{isError: true, content: "..."}` instead of throwing.

- [ ] T5. Create `src/ai/tools/set-map-name.ts`
      - Tool name: `set_map_name`.
      - Input schema: `{name: string}` (required).
      - Executor: trims input, rejects empty string, locates
        `document.getElementById("mapName")` (HTMLInputElement), sets
        `.value = name`, dispatches `new Event("input", {bubbles: true})`
        and `new Event("change", {bubbles: true})`. Returns
        `{ok: true, name}` on success, `{ok: false, error: "..."}` on
        failure. Tool-result is stringified JSON.

## Chat controller and window

- [ ] T6. Create `src/ai/chat-controller.ts`
      - `class ChatController { constructor({client, registry, model, systemPrompt, maxToolIterations = 8}); async send(userText): Promise<Message[]>; onMessage(cb); }`.
      - Implements the tool-use loop: call API, for each `tool_use` content
        block run the registry and accumulate `tool_result` blocks, then
        repeat until `stop_reason !== "tool_use"` or iteration cap.
      - Emits messages to subscribers as they're produced so the UI can
        render them progressively.

- [ ] T7. Create `src/ai/chat-window.ts`
      - Builds DOM: a floating button (`#ai-chat-toggle`) and a panel
        (`#ai-chat-panel`) with header (title + collapse/close), message
        log (`#ai-chat-log`), input row (`textarea` + Send), and a small
        settings row for the API key.
      - Functions: `mountChatWindow()`, `openChat()`, `closeChat()`,
        `toggleChat()`, `renderMessage({role, text})`,
        `renderToolCall({name, input})`, `renderToolResult({name, output})`.
      - Wires `send` → `chatController.send(input)`; shows loading state.

- [ ] T8. Create `src/ai/index.ts`
      - Barrel export + `bootstrapAiChat()` which constructs the default
        client/registry and calls `mountChatWindow()` after `DOMContentLoaded`.
      - Register `setMapNameTool` into the default registry.

- [ ] T9. Create `public/styles/ai-chat.css`
      - Minimal styles for the panel (fixed, bottom-right), toggle button,
        message bubbles (user / assistant / tool), collapse transition.

- [ ] T10. Wire into `src/index.html`
      - Add `<link rel="stylesheet" href="/styles/ai-chat.css" />` near other
        stylesheets.
      - Add `<script type="module" src="ai/index.ts"></script>` near other
        module script entry points (`src/modules/index.ts`, etc.).
      - Ensure script load order does not break existing scripts.

## Tests (Vitest, node environment)

- [ ] T11. `src/ai/api-key.test.ts` — storage round-trip, unset returns null,
      clear removes entry. Uses a tiny `localStorage` shim in `beforeEach`
      if Vitest's node env doesn't provide one.

- [ ] T12. `src/ai/tools/tools.test.ts`
      - Register + look up.
      - `run(name, input)` calls the executor with parsed input and returns
        stringified output.
      - Unknown tool name → `{isError: true, ...}`.

- [ ] T13. `src/ai/tools/set-map-name.test.ts`
      - Creates an `<input id="mapName">` in a `document` before each test
        (uses `happy-dom` via `@vitest/browser` is unnecessary; use a simple
        DOM stub by setting up `globalThis.document` with minimal
        `getElementById` returning an input-like object).
      - Executor updates `.value`, dispatches `input` event (captured by a
        listener spy).
      - Rejects empty/whitespace-only input with `{ok: false}`.

- [ ] T14. `src/ai/chat-controller.test.ts`
      - Fake client returns scripted responses.
      - Asserts tool was invoked and final assistant message is delivered.
      - Asserts iteration cap stops runaway tool loops.

## Documentation

- [ ] T15. `README_AI.md`
      - Section 1: What it is.
      - Section 2: How to get an Anthropic API key (console.anthropic.com).
      - Section 3: How to enter the key in the app (chat panel → ⚙ → paste;
        stored in localStorage).
      - Section 4: Security / limitations (key is visible to any script in
        the page; not for shared machines).
      - Section 5: Usage examples — "rename my map to Eldoria" and a table
        of supported actions (currently: rename map).
      - Section 6: Troubleshooting (401 = bad key, 429 = rate limit, etc.).

## Verification

- [ ] T16. Run `npm run lint`. If there are new errors or warnings exceeding
      the baseline, fix before calling iteration done.
- [ ] T17. Run `npm test -- --run`. All previous tests still green; new
      tests green.
- [ ] T18. Run `npm run build` to confirm TypeScript compiles cleanly.
- [ ] T19. Update `CLAUDE.md`? — no, not required; memory file already
      covers project layout, and the AI chat is straightforwardly located
      under `src/ai/`.

## Verification of plan↔tasks↔tests

Self-review checklist before implementation:

- Use case ("rename the map via AI chat") maps to T5 (executor) + T6–T8
  (chat loop and UI) + T10 (wiring). ✓
- Success criterion #1 (toggle button + panel) is covered by T7/T9. ✓
- Success criterion #2 (`#mapName` takes the new value) is covered by T5;
  unit-tested in T13. ✓
- Success criterion #3 (collapsible) is covered by T7 (`toggleChat`). ✓
- Success criterion #4 (no API call without key) is covered by T3 (client
  throws if key missing) and T7 (Send button checks via `getApiKey`). ✓
- Tests in T11–T14 cumulatively cover: storage, tool registry, the DOM
  side-effect, and the full controller loop — enough to verify the use case
  works without a real API call. ✓
- Lint/build/test gates captured in T16–T18. ✓
