# Plan 190 — `get_regiment_info` AI tool

## Goal
Add a read-only AI tool that reports detailed info for a single military
regiment — the per-regiment parallel of `get_state_info` /
`get_burg_info` / `get_province_info` / `get_marker_info` /
`get_river_info`. Enables the AI to inspect a regiment before issuing
any regiment-targeted action (`rename_regiment`, `set_regiment_icon`,
`set_regiment_unit`, `set_regiment_naval`, `move_regiment`,
`split_regiment`, `remove_regiment`, `regenerate_regiment_names`).

## Use case
Regiments live nested per-state at `pack.states[stateI].military[]`.
Their `i` is per-state (not globally unique), so callers identify one
with two refs — `state` (id or name) and `regiment` (id or name within
that state) — the same two-part ref `rename_regiment` /
`set_regiment_icon` / `set_regiment_unit` / `set_regiment_naval` use.

Given a `(state, regiment)` pair, return:
- `state`: `{ id, name }` — the parent state.
- `i` — the regiment's per-state id (`regiment.i`).
- `name` — `regiment.name`.
- `icon` — `regiment.icon`; `null` when unset (renderer falls back to
  the class-based default).
- `type` — regiment type label (e.g. `"melee"`, `"ranged"`,
  `"cavalry"`, `"artillery"`, `"fleet"`); `null` when unset.
- `x`, `y` — SVG pixel coords from `regiment.x` / `regiment.y`; each
  defaults to `0` when the underlying field isn't a finite number
  (matches `list_regiments`' defensive zero fallback).
- `cell` — `regiment.cell`; defaults to `0` when missing (again
  matching `list_regiments`).
- `n` — total soldiers (`regiment.t` in the raw pack — `list_regiments`
  surfaces this as `total`; the output key `n` mirrors the task spec so
  the AI reads it as "the regiment's head-count").
- `army` — `regiment.a` (sum of units computed by
  `set_regiment_unit`); `0` when absent.
- `units` — a shallow clone of `regiment.u` (`Record<string, number>`);
  `{}` when absent.
- `naval` — `regiment.n === 1` (the raw `n` field is a 0/1 naval flag,
  per `set_regiment_naval.ts`).
- `overall` — integer cap of `n` (same as `list_regiments`' `total`)
  surfaced alongside `n` for clarity when the AI wants "how big is this
  regiment overall?"; identical to `n`. Exposed because the task ask
  mentions it.

## Shape
- **Tool name**: `get_regiment_info`
- **Inputs**:
  - `state` (integer or string, required) — the parent state. Numeric
    id (> 0) or case-insensitive state name / fullName (resolved via
    `resolveStateRefInPack` + the shared `isActive` gate, which
    matches `rename_regiment` / `set_regiment_*`; state 0 — the
    Neutrals placeholder — is rejected).
  - `regiment` (integer or string, required) — the regiment within
    that state. Numeric `regiment.i` or case-insensitive regiment
    name (resolved via `findRegimentByRef`).
- **Output** (on success):
  ```
  {
    ok: true,
    state: { id, name },
    i,
    name,
    icon: string | null,
    type: string | null,
    x, y, cell,
    n, army, overall,
    units: Record<string, number>,
    naval: boolean
  }
  ```
- **Errors**:
  - map not ready (no `pack` / no `pack.states`) → `Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).`
  - invalid `state` ref → `state must be a non-negative integer id or a non-empty name string.`
  - invalid `regiment` ref → `regiment must be a non-negative integer id or a non-empty name string.`
  - no match / removed state → `No regiment found matching state=<state>, regiment=<regiment>.`

## Runtime seam
```ts
export interface RegimentInfoRuntime {
  readRegiment(
    stateRef: number | string,
    regRef: number | string,
  ): RegimentInfo | "not-ready" | "not-found";
}
export const defaultRegimentInfoRuntime: RegimentInfoRuntime = {
  readRegiment(stateRef, regRef) { /* reads globalThis.pack */ }
};
```
Internally a pure helper `readRegimentInfoFromPack(pack, stateRef, regRef)`
does the work without touching globals, reusing
`resolveStateRefInPack` (from `list-burgs`) for the state leg and
`findRegimentByRef` (from `rename-regiment`) for the regiment leg so
we don't duplicate resolution logic.

## Tests (Vitest, node env)
### Pure-function / seam block
1. Returns all fields for a fully populated fake regiment (icon,
   type, x/y, cell, n (t), army (a), units (u), naval (n=1)).
2. `icon` and `type` resolve to `null` when absent on the raw regiment.
3. `units` is a fresh object (not aliased to `regiment.u`).
4. `naval` is `true` when `regiment.n === 1`, `false` otherwise
   (including `0`, `undefined`, other truthy values).
5. `x` / `y` / `cell` / `n` / `army` default to `0` when missing.
6. `overall` always equals `n`.
7. `state` echoes `{ id, name }` of the resolving state.
8. State-ref resolution: numeric id AND case-insensitive name both
   work (via `resolveStateRefInPack`).
9. Regiment-ref resolution: numeric `regiment.i` AND case-insensitive
   name both work (via `findRegimentByRef`).
10. Returns `"not-found"` when the state doesn't exist / is removed.
11. Returns `"not-found"` when the state exists but the regiment
    doesn't / the regiment ref can't be resolved.
12. Returns `"not-ready"` when pack or `pack.states` is missing.
13. State 0 (the Neutrals placeholder) is rejected via the shared
    `isActive(state)` gate — matches `rename_regiment` /
    `set_regiment_*` / `add_regiment` behaviour.

Schema / tool sanity:
14. Tool name is `get_regiment_info`; both `state` and `regiment`
    are required.
15. Invalid state / regiment refs produce the matching error.
16. Unknown ref → structured error with both refs quoted.
17. `"not-ready"` surfaces a clear error at the tool layer.

### defaultRuntime integration block
Uses `(globalThis as unknown as { pack?: … })` writes +
`afterEach` restores, mirroring the `get_state_info` /
`get_marker_info` tests.
1. Reads a real packed regiment through the default runtime.
2. Returns `"not-ready"` when `pack` is missing → tool surfaces error.
3. Returns `"not-found"` for an unknown (state, regiment) pair.

## Registration
- Add `import { getRegimentInfoTool } from "./tools/get-regiment-info";`
  in `src/ai/index.ts`.
- Add `registry.register(getRegimentInfoTool);` next to
  `registry.register(getMarkerInfoTool);`.
- Add a re-export block:
  `export { createGetRegimentInfoTool, defaultRegimentInfoRuntime,
    getRegimentInfoTool, type RegimentInfo, type RegimentInfoRuntime,
    readRegimentInfoFromPack } from "./tools/get-regiment-info";`.

## README_AI.md
Add a row after the `get_marker_info` row — same column shape
(description with API-key note + 2–3 example prompts).

## Verification
- `npm run build` — must succeed.
- `npm test` — 2742 + N new tests, all pass.
- `npm run lint` — matches baseline (7 warnings / 1 info / 0 errors).

## Risks / non-goals
- We do NOT resolve downstream entities (culture, religion, etc.)
  from the regiment's cell — use `get_cell_info({ cell: regiment.cell })`
  for that cross-walk.
- We do NOT compute sums from `u` on the read side; we echo
  `regiment.t` (as `n` / `overall`) and `regiment.a` (as `army`) as
  stored by the generator / `set_regiment_unit`. This keeps the
  shape stable when the two diverge (e.g. manual edits).
- We reject state 0 (the Neutrals placeholder) via the shared
  `isActive(state)` gate, matching `rename_regiment` /
  `set_regiment_icon` / `set_regiment_unit` / `set_regiment_naval` /
  `add_regiment` (all of which reject state 0 in their
  implementations, even though their descriptions mention
  Neutrals — the `isActive` helper requires `e.i > 0`).
