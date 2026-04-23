# Plan 127 — remove_river AI tool

## Use case

Both river UIs delete rivers by calling the generator
helper `Rivers.remove(id)`:

- `public/modules/ui/rivers-editor.js:262` — the Rivers
  Editor's "Remove river and tributaries" dialog.
- `public/modules/ui/rivers-overview.js:184` — the Rivers
  Overview per-row trash icon.

`Rivers.remove` is implemented in
`src/modules/river-generator.ts:601-617`. It:

1. Collects the target river and all tributaries
   (rivers whose `parent === id` or `basin === id`).
2. For each one, removes the matching `#river{i}` SVG
   path from the `rivers` D3 group.
3. Walks `pack.cells.r` and for every cell that
   referenced any of the removed river ids, zeroes
   `cells.r[i]`, resets `cells.fl[i]` to the grid
   precipitation baseline, and zeroes `cells.conf[i]`.
4. Splices the removed rivers out of `pack.rivers`
   (physical delete, NOT tombstone).

The AI chat has `rename_river`, `set_river_type`,
`set_river_width`, `list_rivers`, but no way to delete a
river. This tool adds that.

## Delete approach chosen

**Delegate to the generator's `Rivers.remove()`** — same
pattern as `remove_route` (which delegates to
`Routes.remove()`). This mirrors the editor exactly:

- Tributary cascade happens automatically.
- Cell-level cleanup (`cells.r`, `cells.fl`, `cells.conf`)
  is handled by the generator.
- SVG `#river{i}` paths for the river AND every
  tributary are removed.
- `pack.rivers` is physically pruned (not tombstoned).

The task prompt mentioned "preferred: tombstone-style
`{i, removed: true}`". I rejected this approach because:

1. The editor does not tombstone — it physically
   removes. Mirroring the editor is the primary rule
   ("CRITICAL: verify the delete approach... Match its
   behavior").
2. `remove_route` (the nearest analog) also delegates to
   `Routes.remove()` and does not tombstone.
3. Rivers have a tributary graph (`parent` / `basin`)
   that would need cascade-tombstoning; reinventing that
   logic would duplicate `Rivers.remove`.
4. `RawRiver.removed?: boolean` already exists on
   pack-types.ts — consumers like `findRiverByRef`
   filter removed rivers out, so a river that somehow
   ended up tombstoned is still handled correctly; but
   we don't write that flag ourselves.

## Scope

Add one tool: `remove_river(river)`.

- `river` — numeric river id (`river.i`) OR
  case-insensitive current name. Required.
- Rejects non-integer / negative / zero / empty refs
  (reuses `parseEntityRef`).
- Errors when the river can't be found (matches
  `remove_route` / `remove_zone`).
- Delegates to `Rivers.remove(i)`. Errors when the
  global isn't available.
- Already-removed rivers are skipped by
  `findRiverByRef` → produce a "not found" error (same
  semantics as `remove_route`: the route filter already
  excludes `removed: true`, and the lookup thus returns
  null on double-delete).

## Implementation

1. **New file `src/ai/tools/remove-river.ts`**:
   - Imports: errorResult, getGlobal, getPack, okResult,
     parseEntityRef, type RawRiver from `./_shared`;
     findRiverByRef from `./rename-river`; Tool +
     ToolResult types from `./index`.
   - `RemoveRiverRef { i, name, type }`.
   - `RiverRemovalRuntime { find, remove }`.
   - `defaultRiverRemovalRuntime`:
     - `find(ref)` — resolves via findRiverByRef; returns
       `{ i, name, type }` or null.
     - `remove(i)` — gets `window.Rivers`, throws when
       unavailable, throws on missing river, calls
       `Rivers.remove(i)`. Note the generator signature
       takes the id (a number), not the RawRiver object
       — differs from `Routes.remove(route)`.
   - `createRemoveRiverTool(runtime?)` and
     `removeRiverTool`.
   - Schema: `river` (integer | string, required).
   - Returns `{ ok: true, i, previousName, previousType }`.

2. **Register** in `src/ai/index.ts`:
   - Import after `removeRouteTool`.
   - Barrel re-export `createRemoveRiverTool`,
     `removeRiverTool`.
   - `registry.register(removeRiverTool)`.

3. **Tests** `src/ai/tools/remove-river.test.ts`:
   - Unit (stubbed runtime):
     - removes by numeric id
     - removes by case-insensitive name
     - errors when river is unknown
     - rejects invalid river refs (null, undefined, 0,
       -1, 1.5, "")
     - surfaces runtime failures
   - `defaultRiverRemovalRuntime (integration)`:
     - Stubs `globalThis.pack.rivers` (incl. one
       `removed: true` river to verify the find filter).
     - Stubs `globalThis.Rivers = { remove: vi.fn() }`.
     - Calls remove → `Rivers.remove` invoked with id.
     - Pre-tombstoned river → "not found" error, no
       delegation.
     - Missing `Rivers` global → clear error matching
       /Rivers\.remove/.

4. **pack-types.ts** — already has
   `removed?: boolean` on `RawRiver` (line 159). No edit
   needed.

5. **README_AI.md** — row between `set_river_width` and
   `list_routes` (grouped with other river tools).

## Verification

- Baseline lint: 7 warnings / 1 info / 0 errors.
- Baseline tests: 1493 passing across 135 files (ai
  scope).
- `npm test` (node scope) and full ai scope remain green
  after changes.
- `npm run lint` still 7 / 1.
- `npm run build` succeeds.

## Success criteria

- Tool callable, wired, documented.
- Delegates to `Rivers.remove()` for parity with the
  editor (tributary cascade + cell cleanup + SVG
  cleanup).
- Rejects unknown / already-removed rivers.
- Return payload includes `previousName` /
  `previousType` so the LLM can confirm what got deleted.
