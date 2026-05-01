# Plan 366: `request_map_click` tool

## Use case

Add a brand-new kind of AI chat tool: `request_map_click`. The AI calls
this when it needs the user to point at a specific feature on the map
(e.g. "add a new burg" with no specified location → the AI asks the
user where to place it). The tool puts the app into a one-shot
click-await mode and resolves with what the user clicked.

This is the **first AI tool that interacts with the user via the chat
UI** — every prior tool has been a fire-and-forget mutation or a
synchronous query. Consequences:

- The chat panel needs a new visual state: a banner showing the prompt
  + a Cancel button while we're waiting on a click.
- We need new `UiEvent` discriminator variants (`click_request`,
  `click_request_end`) so the chat window can render and clear the
  banner. The chat-controller's existing emitter is reused.
- The tool execution is async (mirrors `regenerate-map.ts` which
  already uses `waitForWindowEvent`) but unlike regenerate we wait on a
  USER action, not a `map:generated` event.

Existing legacy patterns we mirror for the click-mode UX:

- `viewbox.style("cursor", "crosshair").on("click", relocateBurgOnClick)`
  in `public/modules/ui/burg-editor.js` (lines ~327-390) — set cursor,
  attach click handler, validate cell on click, restore on success.
- `selectZoneOnMapClick` in `public/modules/ui/zones-editor.js` (~line
  211) — uses `d3.event.target.parentElement.id` to identify which SVG
  layer the click hit, which is how we'll detect entity targets like
  burg icons, route paths, label text, etc.
- `findCell(x, y)` (legacy global) — converts an SVG point to a
  Voronoi cell index. Foundation for cell / state / province / culture
  / religion / river / zone hit-tests via `pack.cells.X[cellId]`.

### Why strict targeting

When `target: "any"`, we resolve on any click and return everything
under that point (cell + every entity present there). When `target` is
a specific entity type (`burg`, `route`, `state`, …), a click that
doesn't hit a matching entity is treated as a mis-click — we surface a
`tip("…")` nudge and **keep listening**. Rationale:

- An AI that asked "where should I put the new burg" needs a land
  cell. Resolving on a water click forces the AI to re-prompt and
  re-call the tool, which is wasteful and confusing.
- A user who's been told "click on a burg" but accidentally hits empty
  ocean should get immediate feedback ("not a burg, try again"), not a
  tool error several seconds later in the chat.
- The Cancel button is always available, so users aren't trapped if
  they change their mind.

The catch-all (`any`) variant exists so the AI can also do "click
anywhere on the map" when it just needs a coordinate.

## Lint baseline

`cd /workspace/.claude/worktrees/plan-366 && npm run lint 2>&1 | tail -10`
on the worktree base (master @ `e70996f`, branch
`plan-366-request-map-click`, working tree clean) reports:

```
> fantasy-map-generator@1.114.1 lint
> biome check --write

Checked 837 files in 693ms. No fixes applied.
```

**0 errors, 0 warnings, 0 info.** Implementation must hold this — any
new warning is a fail.

## Behavior

### Tool lifecycle

1. **Start**: validate input. Confirm `viewbox` and `findCell` are
   both available globally. Emit `{ type: "click_request", prompt,
   target, cancelToken }` so the chat window can render the banner +
   Cancel button. Set the `viewbox` cursor (crosshair for `cell` /
   `any`, pointer for entity targets).

2. **Wait**. Three settlement paths:
   - User clicks the map → run the `viewbox` click handler. If it's
     a strict-target mis-match, call `tip("Click a {target} — that
     was a {what-they-hit}.", false, "warn")` and stay in the
     waiting state. If it matches (or `target: "any"` or `cell`),
     resolve.
   - User clicks Cancel in the chat banner OR presses ESC → reject
     with "User cancelled the click request."
   - Timeout elapses → reject with "Click request timed out after
     `${ms}`ms."

3. **Cleanup** (idempotent): clear the timeout, remove the click
   handler, restore the cursor to `default`, remove the ESC key
   listener, emit `{ type: "click_request_end", cancelToken }` so the
   chat window clears its banner. Calling cleanup twice is a no-op.

### Hit-test resolution

Given a click point `(x, y)`:

1. `cell = findCell(x, y)` (an integer cell index).
2. Build a `RawHits` object — for every entity type, populate the
   field iff there's an entity at this point:
   - `burg`: `pack.cells.burg[cell]` is a positive integer →
     look up `pack.burgs[id]` for `{i, name}`.
   - `state`: `pack.cells.state[cell]` is a positive integer →
     look up `pack.states[id]` for `{i, name}`.
   - `province`: `pack.cells.province[cell]` is a positive integer →
     `pack.provinces[id]` for `{i, name}`.
   - `culture`: `pack.cells.culture[cell]` is a positive integer →
     `pack.cultures[id]` for `{i, name}`.
   - `religion`: `pack.cells.religion[cell]` is a positive integer →
     `pack.religions[id]` for `{i, name}`.
   - `river`: `pack.cells.r[cell]` is a positive integer →
     `pack.rivers.find(r => r.i === id)` for `{i, name}`.
   - `marker`: `event.target` (or any ancestor) has `data-id` and is
     inside the `markers` SVG layer → look up
     `pack.markers.find(m => m.i === id)` for `{i, name, type}`.
   - `route`: `event.target` is a `<path>` inside the `routes` SVG
     layer with a `data-id` → `pack.routes.find(r => r.i === id)`
     for `{i, name}`.
   - `zone`: cell is in `pack.zones` (any zone whose `cells` array
     contains `cell`) → `{i, name}`. (Use the FIRST matching zone;
     overlap is rare.)
   - `label`: `event.target` is a `<text>` inside the `labels` SVG
     layer with an `id` → return `{i: id, text: textContent}`.

3. Determine `target_matched`:
   - If `target === "any"`, `target_matched = "any"`.
   - If `target === "cell"`, `target_matched = "cell"` (a click
     anywhere is in *some* cell, so this always matches).
   - Else if the corresponding `RawHits.{target}` is populated,
     `target_matched = target`.
   - Else **mis-click**: tip the user, keep listening, do not
     resolve.

4. The success result includes `x`, `y`, `cell`, `target_matched`,
   plus every populated `RawHits` field. So a click on a cell with a
   burg, in a state, in a province, with `target: "any"` returns all
   four entities — the AI can use the extra context.

### Cancellation

- The chat-window Cancel button calls a method on the controller
  that emits a "cancel" against the active token. The tool's
  cleanup observes this and rejects.
- ESC key cancellation is wired in the chat window: while a
  `click_request` is active, document-level keydown for `Escape`
  triggers cancel.
- The cancel token is an opaque object the tool generates and emits
  alongside `click_request`. The chat window stashes it; clicking
  Cancel calls `controller.cancelClickRequest(token)`. This
  guarantees stale UI buttons can't cancel a *different* request.

### Cleanup idempotency

`cleanup()` is closed over local handles (timer, click handler,
keydown handler, original cursor, cancel-token). It uses a `done`
flag — second invocation is a no-op. Every settlement path calls
`cleanup()` exactly once before resolving / rejecting.

### Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {
    "target": {
      "type": "string",
      "enum": ["any", "cell", "burg", "state", "province",
               "culture", "religion", "marker", "route",
               "river", "zone", "label"],
      "default": "any",
      "description": "What the user must click. 'any' resolves on any click and returns everything at that point. Specific types only resolve on a matching hit."
    },
    "prompt": {
      "type": "string",
      "minLength": 1,
      "description": "Banner text shown to the user explaining what to click and why."
    },
    "timeout_ms": {
      "type": "integer",
      "minimum": 1000,
      "maximum": 600000,
      "default": 60000,
      "description": "Max time to wait before giving up."
    }
  },
  "required": ["prompt"]
}
```

### Validation

- `prompt` required, must be a non-empty trimmed string.
- `target` if provided must be in the enum.
- `timeout_ms` if provided must be an integer in [1000, 600000].
- Required globals at runtime: `viewbox` (D3 selection), `findCell`.
- For non-cell targets, the corresponding `pack` collection must exist
  — but if the user clicks on a cell that has no matching entity,
  that's a mis-click, not an error.

### Errors (verbatim)

- `"prompt must be a non-empty string."`
- `"target must be one of: any, cell, burg, state, province, culture, religion, marker, route, river, zone, label."`
- `"timeout_ms must be an integer in [1000, 600000]."`
- `"window.viewbox is not available; the map hasn't finished loading."`
- `"window.findCell is not available; the map hasn't finished loading."`
- `"User cancelled the click request."`
- `"Click request timed out after ${ms}ms."`

### Success result

```jsonc
{
  "ok": true,
  "x": 123.45,
  "y": 456.78,
  "cell": 1234,
  "target_matched": "burg",
  "burg":     { "i": 17, "name": "Bree" },
  "state":    { "i": 3,  "name": "Valoria" },
  "province": { "i": 7,  "name": "Northshire" },
  "culture":  { "i": 2,  "name": "Elvish" },
  "religion": { "i": 1,  "name": "Sun Worship" },
  "route":    { "i": 5,  "name": "Coast Road" },
  "river":    { "i": 12, "name": "Mistwater" },
  "marker":   { "i": 4,  "name": "...", "type": "..." },
  "zone":     { "i": 5,  "name": "Plague" },
  "label":    { "i": "labelXYZ", "text": "..." }
}
```

`target_matched` is the user-supplied target if matched, or `"cell"` /
`"any"` for the catch-all cases. Every populated entity at the click
point is included regardless of `target`, so `target: "any"` returns
the full picture.

## Files

### NEW

- `src/ai/tools/request-map-click.ts` — the tool. Exports:
  - `REQUEST_MAP_CLICK_TARGETS = ["any", "cell", "burg", "state", "province", "culture", "religion", "marker", "route", "river", "zone", "label"] as const`
  - `type ClickTarget = (typeof REQUEST_MAP_CLICK_TARGETS)[number]`
  - `interface ClickRequestRuntime` — abstracts away the DOM /
    `viewbox` / `pack` access for testability:
    - `getViewbox(): D3SelectionLike | undefined`
    - `getFindCell(): ((x: number, y: number) => number) | undefined`
    - `getPack(): PackLike | undefined`
    - `attachClickHandler(handler: (evt: MouseEvent, point: [number, number]) => void): () => void`
      — returns a detach function. Default impl: `viewbox.on("click", listener)`; uses `d3.mouse(this)` semantics (or pass-through `event.offsetX/Y` for tests).
    - `setCursor(value: string): void` and `getCursor(): string`
    - `tip(message: string): void` — wraps `globalThis.tip` if present;
      no-op if missing.
    - `emitUi(event)` and `onCancel(token, callback): () => void` —
      bridge to the chat controller's emitter and cancel queue.
    - `addEscListener(callback): () => void` — installs a document
      keydown listener for `Escape`; returns a remove function.
    - `now(): number` and `setTimeout` / `clearTimeout` (so tests can
      use fake timers cleanly).
  - `defaultClickRequestRuntime` — production wiring.
  - `createRequestMapClickTool(runtime?, controllerHooks?)` returning a
    `Tool` named `request_map_click`. The controller hooks are an
    optional interface providing `emit`, `registerCancelListener` —
    these come from the `ChatController`. When omitted (e.g. tests)
    the tool falls back to the runtime's local emitter and cancel
    queue.
  - `requestMapClickTool` — default-runtime instance.

- `src/ai/tools/request-map-click.test.ts` — Vitest spec.

### MODIFY

- `src/ai/index.ts`:
  - Add `import { requestMapClickTool } from "./tools/request-map-click";`
    in the alphabetical `r` section, AFTER
    `regenerate-zones` and BEFORE `remove-all-burgs`.
  - Add a re-export block of the public types and the
    `createRequestMapClickTool` factory in the `r` section of
    re-exports.
  - Add `registry.register(requestMapClickTool);` to the
    `buildDefaultRegistry()` body, near the other regenerate / async
    tools.

- `src/ai/chat-controller.ts`:
  - Extend the `UiEvent` union with two new variants:
    ```ts
    | {
        type: "click_request";
        prompt: string;
        target: ClickTarget;
        cancelToken: object;
      }
    | { type: "click_request_end"; cancelToken: object }
    ```
  - Add an internal `cancelClickListeners: Set<{ token: object;
    callback: () => void }>` and three methods:
    - `emitClickRequest(payload)` — emits the event (used by tool).
    - `emitClickRequestEnd(token)` — emits the end event (used by
      tool).
    - `registerClickCancel(token, callback): () => void` — registers
      a one-shot listener; returns an unsubscribe function. Used by
      the tool to learn when the user pressed Cancel.
    - `cancelClickRequest(token): void` — fires every cancel
      listener whose token matches. Called by the chat window's
      Cancel button + ESC handler.
  - Re-export the `ClickTarget` type for chat-window consumption.

- `src/ai/chat-window.ts`:
  - Add a banner div that's hidden by default. Build during
    `buildChatWindow`, append to the panel below `usageBar`.
  - Banner contains: prompt text + a Cancel button.
  - In `handleEvent`, add cases for `click_request` and
    `click_request_end`:
    - On `click_request`: show banner, set its text, wire its Cancel
      button to call `controller.cancelClickRequest(event.cancelToken)`,
      attach a document-level keydown listener for `Escape` that does
      the same.
    - On `click_request_end`: hide banner, detach the keydown
      listener.
  - The keydown listener and Cancel button onclick must be cleaned up
    on `click_request_end` to avoid leaks across requests.
  - Export the banner element on `ChatWindowElements` for testing.

### NOT MODIFIED

- `public/main.js` — no globals need to be exposed. `viewbox` and
  `findCell` are already on `window`.

## Tests (Vitest)

All tests use stub runtimes — no real D3 or DOM SVG. The two
non-stub tests (default-runtime smoke and chat-window integration)
use `vitest-environment` jsdom semantics already in use by
neighboring tests.

### Stub-runtime suite (`request_map_click tool`)

For most tests we build a `makeRuntime()` factory that creates a
synthetic runtime with `vi.fn()` mocks for every seam, plus a
`fireClick(point, eventTarget)` helper that invokes the captured
click handler.

1. **Tool name + schema + registry round-trip**:
   - `tool.name === "request_map_click"`.
   - `tool.input_schema.type === "object"`.
   - `prompt` is required.
   - `tool.input_schema.properties.target.enum` matches the constant.
   - Default values present where documented.
   - `new ToolRegistry()` registers and `list()` returns it.

2. **Bad inputs (each error string)**:
   - `prompt: ""` / `prompt: "  "` / `prompt: 42` / missing → "prompt must be a non-empty string."
   - `target: "nope"` → "target must be one of: …"
   - `timeout_ms: 500` (below min) / `timeout_ms: 9_000_000` (above max) / `timeout_ms: 1.5` (non-integer) / `timeout_ms: "60s"` → "timeout_ms must be an integer in [1000, 600000]."

3. **Missing globals**:
   - viewbox missing → "window.viewbox is not available; …"
   - findCell missing → "window.findCell is not available; …"

4. **Happy path `target: "any"`**: stub a click on cell 17 with a burg
   present. Tool resolves. Result has `target_matched: "any"`,
   `cell: 17`, `burg: {i, name}`, `x, y`.

5. **Happy path `target: "burg"`**: same setup, target burg. Resolves
   with `target_matched: "burg"`.

6. **Strict mismatch (burg)**: target `burg`, click on a cell with no
   burg. Tool does NOT resolve. `runtime.tip` was called once.
   Trigger a SECOND click on a cell with burg 9. Tool resolves with
   `burg: {i: 9, …}`.

7. **Strict mismatch (route)**: target `route`, click on event whose
   target has no `data-id` route. Tip called, no resolve. Second
   click on a `<path data-id="3">` inside `routes` layer →
   resolves with `route: {i: 3, name}`.

8. **Each entity target hit-test (positive case)**: parameterized
   table — for each of `cell, burg, state, province, culture,
   religion, river, zone, marker, route, label`, build a click
   scenario that satisfies that entity. Assert `target_matched`
   equals the requested target and the entity is populated.

9. **Each entity target hit-test (negative → tip)**: parameterized
   — for each entity type, build a click scenario that doesn't have
   that entity. Assert tip is called and tool stays open. Then
   simulate cancel to free the assertion.

10. **Cancel via controller token**: invoke tool. Before any click,
    fire the registered cancel callback for the active token. Tool
    rejects with "User cancelled the click request."

11. **Cancel via ESC**: invoke tool. The runtime captures the ESC
    callback. Fire it. Tool rejects with "User cancelled the click
    request."

12. **Timeout**: invoke tool with `timeout_ms: 100`, never click.
    Use `vi.useFakeTimers()`, advance 100ms. Tool rejects with
    "Click request timed out after 100ms."

13. **Cleanup on resolve** (load-bearing): inject a successful
    click. Verify, in order: cancel listener unregistered, ESC
    listener detached, click handler detached, cursor restored,
    timer cleared, `click_request_end` emitted with the matching
    token.

14. **Cleanup on cancel** (load-bearing): same checks after a
    cancel.

15. **Cleanup on timeout** (load-bearing): same checks after a
    timeout. No leaked handlers.

16. **Cleanup is idempotent**: cancel then advance fake timers past
    timeout — no double-emit, no throw.

17. **UiEvent emission**: verify `emitUi` was called with
    `{ type: "click_request", prompt, target, cancelToken }` first
    and `{ type: "click_request_end", cancelToken }` last, with
    matching tokens.

18. **`x`/`y` rounding**: clicks at `(123.456789, 456.123)` come
    back as `123.46` and `456.12` (2-decimal rounding for
    consistency with legacy `rn(point[0], 2)` in burg-editor).

19. **Result aggregation when `target: "any"`**: a click on a cell
    with burg + state + province + culture + religion + zone + a
    river populates ALL six fields plus `cell` and the matched
    burg event target was a `<path data-id="…">` route. Single
    deep-equal asserts the full shape.

20. **Empty pack collections degrade gracefully**: if
    `pack.markers === []` and target is `marker`, click is treated
    as mis-click + tip. (Edge case verifying we don't crash on
    empty arrays.)

21. **Cursor restoration on early-validation error**: when the
    runtime is healthy but `viewbox` is missing, the tool errors
    BEFORE setting cursor — assert cursor was never written.

### Default-runtime integration suite (`defaultClickRequestRuntime`)

22. **Globals roundtrip**: with `globalThis.viewbox` set to a stub
    selection that records `.on()` and `.style()` calls, and
    `globalThis.findCell = vi.fn().mockReturnValue(42)`, invoke the
    tool and trigger the captured handler. Tool resolves, cursor
    set + restored.

23. **Default `tip` call**: with `globalThis.tip = vi.fn()`, a
    strict mis-match triggers `tip`. Without `globalThis.tip`, the
    runtime no-ops silently.

24. **ESC listener installed on document**: with a JSDOM `document`,
    invoke tool, dispatch a `keydown` for `Escape`, tool rejects
    with cancel error.

### Chat-controller suite (`ChatController click-request glue`)

25. **`emitClickRequest` / `emitClickRequestEnd` reach
    listeners**: subscribe a spy via `controller.on(...)`. Call
    each method with a payload. Assert the spy was called with the
    right shape.

26. **`registerClickCancel` + `cancelClickRequest` round-trip**: a
    callback registered for token A fires when
    `cancelClickRequest(A)` is called. Token B's callback does
    not fire.

27. **`registerClickCancel` returns an unsubscribe function**:
    after unsubscribe, calling `cancelClickRequest` with that token
    does not fire.

### Chat-window suite (`mountChatWindow click-request banner`)

28. **`click_request` event renders the banner with prompt + Cancel
    button**: emit a `click_request` event from a mock controller.
    Assert the banner element is visible (no `hidden` attribute /
    matching className) and contains the prompt text.

29. **Cancel button click invokes
    `controller.cancelClickRequest(token)`**: emit `click_request`,
    click the Cancel button, assert the controller method was called
    with the original token.

30. **`click_request_end` clears the banner**: emit start, then end.
    Banner is hidden again; the Cancel button no longer triggers
    `cancelClickRequest` (or is detached from the DOM).

31. **ESC cancels while banner is open**: emit `click_request`,
    dispatch a `keydown` for `Escape` on `document`, assert
    `cancelClickRequest` called with the original token. After the
    `click_request_end` event, dispatch ESC again — should NOT call
    `cancelClickRequest` (handler removed).

## Verification

- `npm test` — all green.
- `npx tsc --noEmit` — clean.
- `npm run lint 2>&1 | tail -10` — still 0 errors / 0 warnings /
  837 (or 838 with new files counted) files.

## Self-review (added during step 5)

Reviewed plan + tasks against the use case checklist. Findings and
corrections:

- **Strict-mismatch keep-listening behavior is tested.** Tests §6
  and §7 exercise it explicitly (one for cell-property entities like
  burg, one for SVG-target entities like route). §9 parameterizes
  it across all entity types. The implementation MUST keep the
  click handler attached after a mis-match — only clear it on
  successful match, cancel, or timeout. Confirmed in the Behavior
  section.

- **Cancel via chat UI button AND via ESC key both tested.** §10
  (controller token cancel — what the UI Cancel button triggers),
  §11 (ESC), §29 (UI button hooks up to controller correctly), §31
  (ESC routes through chat-window, also handles unmount).

- **Timeout cleanup tested (no leaked handlers after timeout).** §15
  pins this — after timeout, the runtime spies report click handler
  detached, ESC listener detached, cancel listener unregistered,
  cursor restored.

- **Cleanup idempotent.** §16 explicitly fires cancel + timeout in
  sequence. The `done` flag in the implementation guards against
  double-emit, double-detach, and "rejecting an already-resolved
  promise" (which Node would warn about with
  `[UnhandledPromiseRejection]`).

- **Result shape covers every populated field.** §19 deep-equals
  the full multi-entity result so any field accidentally omitted
  during refactor surfaces as a test failure. §8 tests each
  individual entity field is populated under its target. §4 tests
  the `target: "any"` aggregation specifically.

- **Cancel-token discriminator.** Tokens are opaque objects (`{}`)
  generated per-call, not strings. Stale UI buttons from a previous
  request can't accidentally cancel the current request — token
  identity check (===) gates the cancel callback. Tests §26-§27
  confirm this.

- **`target: "any"` vs `target: "cell"`.** Both are catch-all
  variants. `cell` is for "the AI wants a coordinate, doesn't care
  what's there" and returns `target_matched: "cell"`. `any` is for
  "the AI wants whatever's there" and returns `target_matched:
  "any"`. The result shape is the same — both populate every
  entity at that point. Distinction is only in `target_matched` so
  the AI's prompt-engineering sees the consistent contract.

- **Escape listener installed at document level (not viewbox).**
  Otherwise it only fires when the map has focus — frustrating UX
  if the user has the chat panel focused. JSDOM tests dispatch on
  document.

- **The new UiEvent variants don't break exhaustive handling.**
  `chat-window.ts`'s `switch (event.type)` is non-exhaustive
  today (no `default` case, no `never` exhaustiveness check), so
  adding variants is additive — TypeScript won't catch
  unintentional miss. Compensating control: §28-§31 explicitly
  test the chat-window's response to both new variants. We also
  add `default: { const _exhaustive: never = event; void _exhaustive; }`
  to the chat-window switch as part of this change to lock in
  exhaustiveness going forward.

  **CORRECTION (added during review)**: re-reading existing
  switch — it has no default case and uses `event.type` as the
  discriminator. Adding the exhaustiveness guard is a small
  improvement worth pulling into this plan. Documented in the
  chat-window MODIFY block.

- **The tool description.** Mentions: this is interactive (waits on
  the user), `target` filter modes, `timeout_ms` default, and the
  tip-on-mismatch behavior. ~3 sentences, comparable to other async
  tools.

- **`x`/`y` rounding.** Legacy `relocateBurgOnClick` rounds via
  `rn(point[0], 2)` — 2 decimal places. We mirror that for
  consistency in the success result. Test §18 pins it.

- **Empty `pack` collection edge case.** §20 covers `pack.markers
  === []` to ensure we don't crash. The implementation must guard
  array lookups: `Array.isArray(pack.zones) ? pack.zones.find(...)
  : undefined`.

- **Default-runtime hookup to `ChatController`.** The tool needs the
  controller's emit + cancel-register methods. We pass them via a
  small `controllerHooks` object at tool construction time. The
  default `requestMapClickTool` is built lazily — `bootstrapAiChat`
  in `index.ts` constructs the controller first, then builds the
  tool with `controller`-bound hooks, then registers it. This
  changes the registration shape slightly: instead of importing a
  pre-built `requestMapClickTool` module-singleton, the bootstrap
  creates it.

  **DESIGN DECISION**: keep a module-singleton `requestMapClickTool`
  whose default runtime reads `(globalThis as any).__aiChatController`
  at execution time (set during `bootstrapAiChat`). This avoids
  threading a controller reference through the registry but adds a
  small global. Alternative (controller-aware tool registration) is
  more verbose. We go with the global-controller approach because
  the tool's UI emission is fundamentally tied to a singleton chat
  controller — there's only ever one chat panel. The bootstrap sets
  `globalThis.__aiChatController = controller` immediately after
  construction. Tests stub it via `globalThis.__aiChatController`.

- **`viewbox.on("click", …)` collision.** The legacy app installs
  its own click handler on `viewbox` (the global `clicked` function
  in `public/main.js`). Calling `viewbox.on("click", handler)` at
  cleanup time RESTORES the legacy handler by reattaching `clicked`.
  We capture the previous handler with `viewbox.on("click")` (D3
  getter form) before installing ours, then re-attach on cleanup.
  This is what `toggleRelocateBurg` does in burg-editor.js — same
  pattern.

- **Lint baseline.** Captured at 837 files, 0 issues. New tool +
  test files raise the count to ~839; check passes if it remains 0
  issues.
