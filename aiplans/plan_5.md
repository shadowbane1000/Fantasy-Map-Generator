# Plan 5 — Use Case: Regenerate the map

## Status

Iteration 5. Previous tools: `set_map_name`, `set_layer_visibility`,
`apply_layers_preset`, `get_map_info`. Baseline 7 warnings / 1 info / 0
errors. 100 tests pass.

## Use Case

**"Regenerate the map (optionally with a specific seed)."**

The user does this by clicking the "New Map" button (`#newMapButton`,
shortcut F2) in the Options pane. That button calls
`regeneratePrompt()` in `public/modules/ui/options.js`, which in turn
calls the global `regenerateMap(options)` from `public/main.js:1260`.
`regenerateMap` is a debounced async function: it does `undraw()`,
`await generate(options)`, redraws all layers, fits to screen, then
dispatches `window.CustomEvent("map:generated", {detail:{seed, mapId}})`.

Optional seed: the user can type a seed in `#optionsSeed` and press
regenerate, which is the same as calling `regenerateMap({seed: "123"})`.

User prompts:
- *"Generate a new map"*
- *"Regenerate the map"*
- *"Make a new map with seed 12345"*

### Success criteria

1. `regenerate_map({})` calls `window.regenerateMap("ai-chat")` (or any
   non-null argument) to trigger the same debounced regenerator the UI
   uses.
2. `regenerate_map({seed: "12345"})` calls
   `window.regenerateMap({seed: "12345"})`.
3. The tool waits for the `map:generated` event (with a sensible
   timeout, e.g. 60s) so the next turn can reliably read the new state
   via `get_map_info`.
4. On timeout, the tool returns `{isError: true, error: "…"}` rather
   than hanging forever.
5. If the application isn't ready (`window.regenerateMap` missing), a
   structured error is returned.

## Scope

In-scope:
- New tool `regenerate_map` taking optional `{seed?: string | number}`.
- `RegenerateRuntime` interface with `regenerate(options)` and
  `waitForRegeneration(timeoutMs)` methods so tests can stub both.
- Registry wiring + README entry.

Out-of-scope:
- Changing other generation options (size, latitude, templates); those
  get their own tools later.

## Design

New file: `src/ai/tools/regenerate-map.ts`.

```ts
export interface RegenerateRuntime {
  regenerate(options: string | { seed: string }): void;
  waitForRegeneration(timeoutMs: number): Promise<void>;
}
```

Default runtime:
- `regenerate(options)` — calls `(globalThis as any).regenerateMap(options)`;
  throws if missing.
- `waitForRegeneration(timeout)` — returns a Promise that resolves on
  the next `map:generated` event on `window`, or rejects after `timeout`
  ms.

The tool:
1. Validates `seed` is a string/number if present, converts to string.
2. Calls `runtime.regenerate({seed}) | "ai-chat"`.
3. `await runtime.waitForRegeneration(60000)`.
4. On success returns `{ok: true, seed?: string}`.
5. Catches timeouts and missing-runtime errors and returns structured
   error results.

## Files

Create:
- `plan_5.md`, `tasks_5.md`.
- `src/ai/tools/regenerate-map.ts`.
- `src/ai/tools/regenerate-map.test.ts`.

Modify:
- `src/ai/index.ts` — register + export.
- `README_AI.md` — tool table row.

## Testing plan

Unit (`src/ai/tools/regenerate-map.test.ts`):

1. No args → `regenerate("ai-chat")` called, wait resolves, tool returns
   `{ok: true}`.
2. `{seed: "12345"}` → `regenerate({seed: "12345"})` called with string
   seed.
3. `{seed: 42}` (number) → coerced to string; same assertion.
4. Invalid seed type (object, boolean) → `{isError: true}` before
   calling regenerate.
5. `waitForRegeneration` rejects (timeout) → tool returns
   `{isError: true}` with timeout message; does NOT swallow the error.
6. `regenerate` throws (pre-load) → tool returns `{isError: true}`.

## Plan ↔ tasks ↔ tests verification

| Criterion            | Implementation              | Test |
| -------------------- | --------------------------- | ---- |
| #1 triggers rebuild  | `runtime.regenerate`        | 1, 2, 3 |
| #2 seed support      | param coercion              | 2, 3 |
| #3 waits for event   | `waitForRegeneration`       | 1 |
| #4 timeout handling  | catch → structured error    | 5 |
| #5 missing runtime   | catch throw                 | 6 |

Lint/test/build gates in tasks_5.md.
