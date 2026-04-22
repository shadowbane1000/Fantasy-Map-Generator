# Plan 21 — Use Case: Load a saved map

## Status

Iteration 21 (of the broader effort). 20 AI tools + the shared-helpers
refactor are already in place. Baseline 7 warnings / 1 info / 0 errors.
277 tests pass.

## Use Case

**"Load a saved map — either the last map stored in the browser, or
a map from a URL."**

The user does this through the Menu → Load pane:
- `quickLoad()` in `public/modules/io/load.js:4-11` loads the last
  blob from IndexedDB (`ldb.get("lastMap")`) — the counterpart of
  `save_map({target: "storage"})`.
- `loadMapFromURL(url)` (same file, line 74) fetches a `.map` file
  over HTTP and feeds its blob into `uploadMap`.
- The "Load from File" button is a user-only affordance (a security-
  gated file picker we cannot drive from code), so we'll scope to
  the two programmatic paths.

Both end up calling `uploadMap(blob)`, which parses the map and
dispatches `window.CustomEvent("map:generated", ...)` on completion
— the same event `regenerate_map` waits on.

Prompts:
- *"Load the last saved map"* / *"Reload from storage"*
- *"Load the map at https://example.com/fantasy.map"*

### Success criteria

1. `load_map({source: "storage"})` → calls the global
   `quickLoad()` (no-args) and waits for `map:generated` before
   returning success.
2. `load_map({source: "url", url: "https://..."})` → calls
   `loadMapFromURL(url)` and waits for `map:generated`.
3. Friendly aliases accepted (`"browser"`/`"local"` → storage;
   `"http"` → url).
4. `source: "url"` without `url` → structured error.
5. `url` must be a non-empty string starting with `http://` or
   `https://` (reject `file:`, `javascript:`, etc. for safety).
6. Missing global (`quickLoad` / `loadMapFromURL` not on window) →
   structured error.
7. 60s timeout on `map:generated` → structured error (same shape as
   `regenerate_map`).
8. Underlying load throws (quick-load empty storage, URL 404) → error
   surfaced from the runtime.

## Scope

In-scope:
- `load_map` tool with `LoadMapRuntime` seam: `load(instr)` +
  `waitForLoad(timeoutMs)`.
- Pure helper `resolveLoadSource(s)` for alias lookup (paralleling
  `resolveSaveTarget`).
- Pure helper `isValidMapUrl(s)` — allowlist check.
- Registry wiring + README entry.
- Unit tests.

Out-of-scope:
- Disk file upload (can't drive a `<input type="file">` picker
  headlessly).
- Dropbox (requires auth).
- Reading the loaded map's contents after load (a follow-up tool can
  combine with `get_map_info`).

## Design

New file: `src/ai/tools/load-map.ts`.

```ts
export type LoadSource = "storage" | "url";
export type LoadInstruction =
  | { source: "storage" }
  | { source: "url"; url: string };

export interface LoadMapRuntime {
  load(instruction: LoadInstruction): Promise<void> | void;
  waitForLoad(timeoutMs: number): Promise<void>;
}
```

Default runtime:
- `load({source: "storage"})` → `(globalThis as any).quickLoad()`;
  throws if missing.
- `load({source: "url", url})` →
  `(globalThis as any).loadMapFromURL(url)`; throws if missing.
- `waitForLoad(ms)` — copy-paste of the `map:generated` wait loop
  from `regenerate-map.ts` (single-use `addEventListener` with
  `AbortController`-style timeout). *Deliberately not refactoring
  out into a shared helper yet — two call sites is still within the
  "rule of three" threshold, and the shapes differ slightly.*

Aliases (`resolveLoadSource`):
- `storage` / `browser` / `local` / `indexeddb` / `last` / `lastmap` → `"storage"`
- `url` / `http` / `https` / `web` / `link` → `"url"`

URL validator (`isValidMapUrl`):
- Must be a string.
- Must match `^https?://` after trim.
- Length 7..2000.

Executor:
1. Resolve source; unknown → error.
2. If `"url"`, validate `url`; invalid → error.
3. Build instruction.
4. Call `runtime.load(instruction)`; catch throws.
5. Await `runtime.waitForLoad(60000)`; catch timeout / errors.
6. Return `{ok, source, url?}`.

## Files

Create: `plan_21.md`, `tasks_21.md`,
`src/ai/tools/load-map.ts`,
`src/ai/tools/load-map.test.ts`.

Modify: `src/ai/index.ts` (register + export),
`README_AI.md` (tool-table row).

## Testing plan

Unit (`load-map.test.ts`):

1. `{source: "storage"}` → `load({source: "storage"})` called,
   `waitForLoad` awaited, result `{ok: true, source: "storage"}`.
2. `{source: "browser"}` alias → same as #1.
3. `{source: "url", url: "https://x.com/map.map"}` →
   `load({source: "url", url})` called; result includes `url`.
4. `{source: "url"}` (missing url) → `{isError: true}`.
5. `{source: "url", url: "file:///tmp/x"}` → invalid-url error.
6. Empty/whitespace url → error.
7. Unknown source → error with `supported` list.
8. `runtime.load` throws → error surfaced, `waitForLoad` not called.
9. `waitForLoad` rejects (timeout) → error surfaced, with
   `triggered: true`.
10. Non-string source → error.

Plus pure helper tests:

11. `resolveLoadSource` alias coverage.
12. `isValidMapUrl` accepts `http://…` / `https://…`, rejects
    `file:`, `ftp:`, `javascript:`, empty, non-strings.

## Plan ↔ tasks ↔ tests verification

| Criterion | Implementation | Test |
| --------- | -------------- | ---- |
| #1 storage | `resolveLoadSource` + runtime.load | 1, 2 |
| #2 url | validator + runtime.load | 3 |
| #3 aliases | `resolveLoadSource` | 2, 11 |
| #4 missing url | executor guard | 4 |
| #5 safe URL | `isValidMapUrl` | 5, 6, 12 |
| #6 missing runtime | runtime throws | 8 |
| #7 timeout | runtime.waitForLoad rejects | 9 |
| #8 load error | runtime throws | 8 |

Lint / test / build gates in tasks_21.md.
