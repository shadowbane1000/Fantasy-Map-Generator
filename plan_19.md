# Plan 19 — Use Case: Save the map

## Status

Iteration 19. 18 tools implemented (`set_state_color` added last).
Baseline 7 warnings / 1 info / 0 errors. 233 tests pass.

## Use Case

**"Save the current map to a .map file or browser storage."**

The user does this via Ctrl+S or the Save Map menu. The global
`saveMap(method)` function in `public/modules/io/save.js:4-38`
accepts one of `"machine"` (download the .map file), `"storage"`
(persist to IndexedDB), or `"dropbox"` (requires cloud auth).

Prompts:
- *"Save the map."*
- *"Save a copy to local storage."*
- *"Download the .map file."*

### Success criteria

1. `save_map({})` invokes `window.saveMap("machine")` — the common
   "download" path, matching the default UI button.
2. `save_map({target: "download"})` same as #1 (alias for "machine").
3. `save_map({target: "storage"})` invokes `window.saveMap("storage")`.
4. Unsupported `target` → structured error.
5. `saveMap` throws (e.g., in customization mode) → error surfaced.
6. `saveMap` missing (pre-load) → structured error.
7. Returns `{ok, target, canonical}` on success where `canonical`
   is the actual method passed to `saveMap` ("machine" or "storage").

## Scope

In-scope: `save_map` tool with `SaveMapRuntime` seam, registry +
README + tests.

Out-of-scope:
- Dropbox saves (require cloud auth).
- Choosing a custom filename (saveMap derives it from `getFileName()`).
- Loading a .map file (future `load_map` tool).
- Export to other formats like JSON, SVG, PNG (future).

## Design

New file: `src/ai/tools/save-map.ts`.

```ts
export type SaveMethod = "machine" | "storage";
export interface SaveMapRuntime {
  save(method: SaveMethod): Promise<void>;
}
```

Default runtime:
- `save(method)`: `await (globalThis.saveMap as typeof saveMap)(method)`;
  throw if missing.

Alias map for `target` → `SaveMethod`:
- `"machine"` / `"download"` / `"file"` → `"machine"`
- `"storage"` / `"browser"` / `"local"` → `"storage"`

## Files

Create: `plan_19.md`, `tasks_19.md`,
`src/ai/tools/save-map.ts`,
`src/ai/tools/save-map.test.ts`.

Modify: `src/ai/index.ts`, `README_AI.md`.

## Testing

Unit (`save-map.test.ts`):

1. Default → `save("machine")`, canonical="machine".
2. `target: "download"` → `save("machine")`.
3. `target: "storage"` → `save("storage")`.
4. `target: "browser"` → `save("storage")`.
5. Invalid target ("cloud", "xyz", true) → error.
6. Runtime rejects → structured error.
7. Case-insensitive target matching.

## Plan ↔ tasks ↔ tests verification

| Criterion | Implementation | Test |
| --------- | -------------- | ---- |
| #1/2 default + download | alias map | 1, 2 |
| #3/4 storage aliases | alias map | 3, 4, 7 |
| #4 unknown | alias map fallback | 5 |
| #5/6 errors | catch | 6 |

Lint / test / build gates in tasks_19.md.
