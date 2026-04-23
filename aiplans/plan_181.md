# Plan 181 — `get_entity_cells` AI Tool

## Use case

Expose a read-only AI tool that, given an entity type (`state` | `province` | `culture` | `religion`) and an entity reference (numeric id or case-insensitive name), returns every packed-grid cell index currently assigned to that entity. The AI layer can then use that list to reason about territory distribution (centroid, area, border cells, etc.) without having to scan `pack.cells.*` itself.

## Shape

- Name: `get_entity_cells`
- Inputs:
  - `entity_type` (required, string, case-insensitive) — one of `"state"`, `"province"`, `"culture"`, `"religion"`.
  - `entity` (required, integer|string) — numeric id (>0) or case-insensitive name / fullName.
  - `limit` (optional, integer in [1, 100000], default 10000) — caps the returned `cells` array size so large territories don't blow up the context window. `count` is the unlimited total.
- Behavior:
  - Picks the matching `pack.<collection>` and `pack.cells.<field>`:
    - `state` → `pack.states` / `pack.cells.state`
    - `province` → `pack.provinces` / `pack.cells.province`
    - `culture` → `pack.cultures` / `pack.cells.culture`
    - `religion` → `pack.religions` / `pack.cells.religion`
  - Resolves `entity` via `findEntityByRef` (accepts positive integer id OR name/fullName; skips index-0 placeholder and `removed:true`).
  - Iterates `pack.cells.i` and collects all indices `k` where `pack.cells.<field>[k] === entity.i`.
  - Returns `{ ok, entity_type, i, name, cells, count }` with `cells` truncated to `limit`.
- Errors:
  - Missing / non-string `entity_type`, or not one of the four accepted.
  - Missing / invalid `entity`.
  - `limit` not an integer in [1, 100000].
  - `pack` not ready (no `pack.cells.i`).
  - Entity not found in its collection.

## Files

- New: `src/ai/tools/get-entity-cells.ts` — runtime-seam pattern (pure `collectCellsForEntity(pack, type, ref)` + `GetEntityCellsRuntime` + `defaultGetEntityCellsRuntime` + `createGetEntityCellsTool` + module-level `getEntityCellsTool`).
- New: `src/ai/tools/get-entity-cells.test.ts` — pure/seam unit tests and a `defaultGetEntityCellsRuntime` integration block (sets `globalThis.pack` in `beforeEach`, restores in `afterEach`, uses `as unknown as { ... }` casts).
- Modified: `src/ai/index.ts` — import + re-export + `registry.register(getEntityCellsTool)` near `getCellInfoTool` registration.
- Modified: `README_AI.md` — new row in the AI tools table right after `get_cell_info`.

## Testing

- Vitest pure/seam tests: happy path, numeric and name resolution, case-insensitive name, each of the four entity types, skipping placeholder/removed, unknown ref errors, unknown type errors, `limit` truncation while preserving `count`, default limit, not-ready surface, invalid `limit`.
- Integration block: drives `defaultGetEntityCellsRuntime` through `globalThis.pack`, verifies ok and not-ready paths.

## Risk / Scope

Pure read of `pack`, no mutation, no renderer calls. Lint scope stays src-only; adds one warning/info-neutral file.

## Build / Lint / Test gates

- `npm run build` must succeed.
- `npm test` must stay green; new file adds ~15+ tests.
- `npm run lint` must match baseline (7 warnings / 1 info / 0 errors).
