# Tasks — Plan 187 (`get_river_info`)

1. **Scaffold the tool file `src/ai/tools/get-river-info.ts`**
   - `RiverInfo` interface with `i`, `name`, `type`, `parent`, `basin`,
     `source`, `mouth`, `length`, `discharge`, `widthFactor`, `cells`.
   - `RiverInfoPackLike` (optional `rivers`, optional `cells.p` / `cells.r`).
   - `readRiverInfoFromPack(pack, ref)` returning
     `RiverInfo | "not-ready" | "not-found"`.
     - `!pack?.rivers` → `"not-ready"`.
     - `findRiverByRef(pack.rivers, ref)` (re-used from `./rename-river`) —
       returns null for removed / unknown / invalid / `i <= 0`.
     - Build `parent` as `{id, name}` when `river.parent` is a number and
       `!== river.i`; null otherwise. Name from `findRiverByRef` keyed by id.
     - Build `basin` as `{id, name}` when `river.basin` is a number; null
       otherwise. Name resolution same as `parent`.
     - `readCellPoint(pack, cell)` helper returning `{x, y}` or `{x: null, y: null}`.
     - `source` / `mouth` shaped `{cell, x, y}`, `null` if cell id missing.
     - `cells` count: prefer `river.cells.length`, fall back to counting
       `pack.cells.r[k] === river.i`, else 0.
   - `RiverInfoRuntime` interface + `defaultRiverInfoRuntime`.
   - `createGetRiverInfoTool(runtime?)` — uses `parseEntityRef`; surfaces
     "not-ready" / "not-found" via `errorResult`.
   - `getRiverInfoTool = createGetRiverInfoTool()`.

2. **Write `src/ai/tools/get-river-info.test.ts`**
   - Seam tests covering every branch above.
   - A `defaultRiverInfoRuntime (integration)` block that mutates
     `globalThis.pack` via `as unknown as { pack?: ... }` casts.

3. **Register the tool**
   - Import `getRiverInfoTool` in `src/ai/index.ts`.
   - Add an export block re-exporting the runtime / types.
   - Add `registry.register(getRiverInfoTool)` next to `getReligionInfoTool`.

4. **Docs**
   - Append a new `| get_river_info ... |` row to `README_AI.md`'s tool table,
     just after the `get_burg_info` row. Include:
     - Intent (per-river parallel).
     - Required `river` ref semantics (non-contiguous ids, name match via
       `findRiverByRef`, skips removed).
     - Output fields list (parent / basin handling, source / mouth coords,
       cells count fallback).
     - Error modes.
     - "Requires an Anthropic API key (see 'Getting an API key' below)."
     - Example prompts.

5. **Verify**
   - Lint baseline is **7 warnings / 1 info / 0 errors**.
   - After changes: `npm run build` → clean, `npm test` → all pass (+ new
     file adds N tests), `npm run lint` matches baseline.

6. **Commit**
   - Stage `src/ai/tools/get-river-info.ts`, `src/ai/tools/get-river-info.test.ts`,
     `src/ai/index.ts`, `README_AI.md`, `aiplans/plan_187.md`, `aiplans/tasks_187.md`.
   - Message: `feat(ai): add get_river_info tool` with a 1–2 line body
     describing the read-only per-river info pattern and that it reuses
     `findRiverByRef` for non-contiguous-id lookup.
