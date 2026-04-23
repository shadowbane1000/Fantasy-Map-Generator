# Tasks 139 — `regenerate_regiment_names`

- [ ] T1 Create `src/ai/tools/regenerate-regiment-names.ts` with:
  - `RegimentRef` shape containing `i, name, cell, n`.
  - `RegenerateRegimentNamesRuntime` interface (`list`, `generate`, `apply`, `redraw`).
  - `defaultRegenerateRegimentNamesRuntime` that:
    - Reads `pack.states[]`, skips `!isActive(state)` and states whose `state.i` is present but `military` is not an array.
    - Resolves `stateRef` via `resolveStateRefInPack` when caller passes it.
    - `generate` calls `window.Military.getName(reg, siblings)`.
    - `apply` writes `regiment.name` in place and (if `document` is defined) updates `#regiment{stateId}-{i}` `data-name`.
    - `redraw` calls `window.drawMilitary()` if present.
  - `createRegenerateRegimentNamesTool(runtime?)` exports.
  - `regenerateRegimentNamesTool` default instance.
  - `input_schema` exposes optional `state`.
  - `execute`:
    - Validates `state` if provided.
    - If runtime.list returns `null`, returns `errorResult("Could not resolve state ...")`.
    - Iterates states → regiments, try/catch generate/apply, pushes into `renamed` or `skipped`.
    - Best-effort `redraw()` after loop.
    - Returns `okResult({ state: resolvedStateId | null, renamed, skipped })`.

- [ ] T2 Create `src/ai/tools/regenerate-regiment-names.test.ts`:
  - Injected-runtime tests:
    1. default (state=null) processes every state bucket.
    2. explicit `state` forwards to `runtime.list`.
    3. invalid `state` format rejected before list call.
    4. `runtime.list` returning `null` → errorResult.
    5. generate error → skipped, loop continues, redraw still called.
    6. empty generator output → skipped.
    7. apply error → skipped.
    8. `redraw` throwing is swallowed.
  - `defaultRegenerateRegimentNamesRuntime` (integration) block:
    - Install `globalThis.pack` + `Military.getName` + `drawMilitary`.
    - Renames across all states (multi-state coverage).
    - Per-state filter works with numeric id and with case-insensitive name.
    - Missing `Military.getName` → per-regiment skipped.
    - Unresolved `state` → errorResult.

- [ ] T3 Register in `src/ai/index.ts`:
  - Add `import { regenerateRegimentNamesTool } from "./tools/regenerate-regiment-names";` (alphabetically sorted next to `regenerate-river-names`).
  - Add re-export block.
  - `registry.register(regenerateRegimentNamesTool);` near the other `regenerate_*_names` registrations.

- [ ] T4 Add README_AI.md row near `regenerate_river_names` / `regenerate_all_state_names`.

- [ ] T5 Verify: `npm run build` succeeds, `npm test` all pass, `npm run lint` stays at baseline (7 warnings / 1 info / 0 errors).

- [ ] T6 Commit with `feat(ai): add regenerate_regiment_names tool` staging only the four touched files.
