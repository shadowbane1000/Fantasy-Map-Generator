# Plan 1 — AI Chat Window + Use Case: Rename the Map

## Status

Iteration 1 of the Ralph loop. No prior AI chat infrastructure exists in the
application. Initial lint baseline: **7 warnings, 1 info, 0 errors**. All 62
existing unit tests pass.

## Use Case

**"Rename the map via the AI chat."**

A user can already rename the map through the UI: Options panel → Map name
field (`<input id="mapName">` at `src/index.html:1660`). The value is surfaced
in exports and the map header label (see `public/modules/ui/options.js:258`
and `public/modules/ui/editors.js:595`).

This use case requires the chat window to exist, so implementing it forces the
foundational chat shell *and* the first end-to-end tool invocation.

### Success criteria

1. With the app loaded and an Anthropic API key configured, the user clicks a
   chat toggle button, types `"Rename the map to Eldoria"`, and submits.
2. The assistant replies, and the DOM element `#mapName` ends up with value
   `"Eldoria"` (trimmed). The assistant confirms the rename in its reply.
3. The chat window can be collapsed back to an icon/toggle.
4. Without an API key the chat window displays a clear prompt to set one and
   does not attempt an API call.

## Scope (this iteration only)

In-scope:
- Collapsible chat window UI (docked panel + toggle button).
- Anthropic API key storage (localStorage), with a "Set API Key" control.
- Anthropic Messages API client that supports the tool-use loop (model
  requests `tool_use`, app runs tool, app replies with `tool_result`, loop
  until `stop_reason: "end_turn"`).
- One tool: `set_map_name({name: string})` that updates `#mapName.value` and
  dispatches an `input` event so downstream listeners stay consistent.
- Tool registry so future iterations can add tools without touching the chat
  controller.
- `README_AI.md` describing API-key setup, limitations, and how to use the
  chat.
- Unit tests for: tool-registry dispatch, `set_map_name` executor behavior,
  API key storage helpers.

Out-of-scope (deferred to future iterations):
- Streaming responses (initial version uses non-streaming for simpler
  tool-use handling).
- Additional tools (`toggle_layer`, `regenerate_map`, `set_year`, etc.).
- Multi-turn conversation persistence across reloads.
- Rich-text rendering of assistant messages (plain text only).

## Architecture

All new TypeScript lives under `src/ai/`:

```
src/ai/
  index.ts            — barrel + bootstrap
  chat-window.ts      — DOM creation, open/close, message rendering, input
  chat-controller.ts  — conversation loop: submit → call API → run tools → render
  anthropic-client.ts — fetch wrapper for /v1/messages (non-streaming)
  api-key.ts          — get/set/clear API key in localStorage
  tools/
    index.ts          — tool registry (Tool schema + registerTool + runTool)
    set-map-name.ts   — the one tool for iteration 1
```

CSS for the panel lives in `public/styles/ai-chat.css`, linked from
`src/index.html`.

The chat window is mounted from `src/ai/index.ts`, which is imported from
`src/index.html` alongside the existing module entry points. Mounting waits
for `DOMContentLoaded` so `#mapName` and the SVG are present.

The `AnthropicClient` exposes one method, `sendMessage(messages, tools,
system)`, which returns the parsed JSON response. The chat controller runs
the tool-use loop: it calls the API, walks the response `content` blocks,
executes any `tool_use` blocks via the registry, appends a `user` message
containing the `tool_result` blocks, and re-calls the API until the model
stops requesting tools.

### Dependency injection for testability

The controller takes the API client and the tool registry as constructor
parameters. Unit tests inject a fake client that returns scripted responses,
so tests never hit the network.

## Testing Plan

### Unit tests (Vitest, node env)

- `src/ai/tools/tools.test.ts`
  - Registering and looking up a tool by name.
  - `runTool` returns the executor's return value as a `tool_result` content
    block.
  - `runTool` on an unknown name returns an error `tool_result` (not a throw).
- `src/ai/tools/set-map-name.test.ts`
  - With a stub `#mapName` element (via `happy-dom` or manual DOM stub), the
    executor sets `element.value` and returns `{ok: true, name: "Eldoria"}`.
  - Rejects empty/whitespace names with a helpful error message.
  - Trims surrounding whitespace.
- `src/ai/api-key.test.ts`
  - `getApiKey` returns null when unset.
  - `setApiKey` stores and `getApiKey` reads it back.
  - `clearApiKey` removes it.
- `src/ai/chat-controller.test.ts`
  - End-to-end with a scripted fake client: first response is a `tool_use`
    for `set_map_name`; controller runs the tool, feeds `tool_result` back,
    second response is `stop_reason: "end_turn"` with a text confirmation.
    Asserts that the tool was invoked and the final rendered message matches.
  - Guards against infinite tool loops by capping iterations (loop cap
    asserted to stop after N rounds).

Node environment is fine for all of the above because everything touches
standalone data structures. The `set-map-name` test provides its own DOM
element — no Vite HTML required.

### Manual / smoke

- With an API key set, open chat, type "rename to Eldoria", observe:
  - A tool invocation line ("Calling set_map_name…") appears in the chat log.
  - The Options panel's Map name input updates to "Eldoria".
  - The assistant replies with a confirmation.

### Lint

`npm run lint` must end with no more than 7 warnings / 1 info / 0 errors
(the starting baseline). Running Biome with `--write` is allowed.

## Files to Create / Modify

Create:
- `plan_1.md`, `tasks_1.md`, `README_AI.md`
- `src/ai/index.ts`
- `src/ai/chat-window.ts`
- `src/ai/chat-controller.ts`
- `src/ai/anthropic-client.ts`
- `src/ai/api-key.ts`
- `src/ai/tools/index.ts`
- `src/ai/tools/set-map-name.ts`
- `src/ai/tools/tools.test.ts`
- `src/ai/tools/set-map-name.test.ts`
- `src/ai/api-key.test.ts`
- `src/ai/chat-controller.test.ts`
- `public/styles/ai-chat.css`

Modify:
- `src/index.html` (mount the chat window script + link the stylesheet)

## Risk / Unknowns

- **Browser CORS**: Anthropic's browser calls require
  `anthropic-dangerous-direct-browser-access: true`. The existing
  `public/modules/ui/ai-generator.js` already uses this exact header for
  Anthropic non-chat generation, so the pattern is proven in this codebase.
- **API key exposure**: Documented in `README_AI.md`. The key lives only in
  the user's browser localStorage and is sent directly to Anthropic.
- **Tool-use shape**: We rely on the `tool_use` / `tool_result` content-block
  protocol from the Anthropic Messages API (stable since 2024).

## Definition of done

- `npm test -- --run` → all tests pass (existing 62 plus ~8 new).
- `npm run lint` → same-or-better than baseline (≤ 7 warnings, 0 errors).
- `npm run build` succeeds.
- README_AI.md present with key-setup and usage sections.
- Manually: chat window opens, collapses, and (with a real key) renames the
  map.
