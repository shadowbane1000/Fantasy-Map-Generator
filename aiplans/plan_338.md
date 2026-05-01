# Plan 338 — `regenerate_regiment_name` AI tool

## Use case

Add an AI chat tool that regenerates the procedural name of a single regiment, mirroring the "Restore name" button in the Regiment Editor (`public/modules/ui/regiment-editor.js`):

```js
function restoreName() {
  const reg = getRegiment(),
    regs = pack.states[elSelected.dataset.state].military;
  const name = Military.getName(reg, regs);
  elSelected.dataset.name = reg.name = byId("regimentName").value = name;
}
```

Today the AI can rename a regiment to a user-supplied string (`rename_regiment`) or bulk-regenerate all regiments of a state / all states (`regenerate_regiment_names`). What is missing is the **single-regiment regenerate** action — analogous to how `regenerate_burg_name` is the per-burg counterpart of `regenerate_all_burg_names`. This plan adds it.

`window.Military.getName(reg, militaryArray)` is the existing global helper that produces the procedural label ("1st Regiment", "2nd (Rookhold) Regiment", "1st Fleet", …). It needs the regiment plus the siblings array to compute its position number among regiments with the same naval flag.

## Lint baseline

`npm run lint` on the worktree at HEAD (`588a524` plus the empty branch tip):

```
> fantasy-map-generator@1.114.1 lint
> biome check --write

Checked 781 files in 618ms. No fixes applied.
```

Clean — zero warnings, zero fixes. Anything new must keep it clean.

## Behavior

- Resolve the regiment by **(state ref, regiment ref)** pair. Regiment ids (`reg.i`) are unique only within their owning state's `military` array, so the global single-regiment lookup pattern from `rename-regiment.ts` is reused.
  - `state` may be a numeric id (`>= 0`, `0` = Neutrals is rejected here per the legacy editor — Neutrals never holds regiments, but to stay consistent with the `regenerate_regiment_names` "removed/Neutrals not addressable" stance for *single*-regiment writes, we explicitly reject state 0; this matches the spec). Or a case-insensitive `name`/`fullName`.
  - `regiment` may be the numeric `regiment.i` (per-state) or the regiment's case-insensitive current `name` within that state.
  - **Ambiguity check (regiment by name):** if more than one sibling has the same name (case-insensitive trim), error out with candidates so the model can disambiguate by id. Numeric ids never ambiguate.
- Look up `pack.states[stateId].military` and pass it to `Military.getName(reg, military)` — Military relies on it to compute the positional number relative to siblings sharing the same naval flag.
- **Capture `previousName` BEFORE mutating** `reg.name`. (A test enforces this so a buggy "save after mutation" implementation fails.)
- Set `reg.name = newName`.
- Best-effort: update the `#regiment{stateId}-{i}` SVG `data-name` attribute (mirrors `rename-regiment.ts` and `regenerate-regiment-names.ts`), then call `drawMilitary()` if available.
- Return the resolved state, regiment id, previous name, and new name.

### Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {
    "state": {
      "type": ["integer", "string"],
      "description": "State id (> 0) or case-insensitive name / fullName. Identifies which state owns the regiment."
    },
    "regiment": {
      "type": ["integer", "string"],
      "description": "Regiment id (within the state's military array, integer >= 0) or case-insensitive regiment name within that state."
    }
  },
  "required": ["state", "regiment"]
}
```

### Validation / errors (verbatim)

- Malformed `state` (non-integer, negative, non-string, blank string): `state must be a non-negative integer id or a non-empty name string.`
- Malformed `regiment` (non-integer, negative, non-string, blank string): `regiment must be a non-negative integer id or a non-empty name string.`
- State ref does not resolve: `State ${ref} not found.`
- State 0 / removed: `Cannot regenerate regiment for state 0 / removed state.`
- State has no `military` array (or it's empty): `State ${i} has no military regiments.`
- Regiment ref doesn't resolve in that state: `Regiment ${ref} not found in state ${stateName}.`
- Multiple regiments with the same name: `Multiple regiments match name '${name}' in state ${stateName}. Disambiguate by id.` plus a `candidates: [{ i, name }]` list.
- `Military.getName` not loaded: `Military.getName is not available; the map hasn't finished loading.`
- Runtime errors during `generate` / `apply`: propagate the underlying error message.

### Success result

```jsonc
{
  "ok": true,
  "state": { "i": 3, "name": "Valoria" },
  "regiment": { "i": 0, "previous_name": "1st Cohort", "name": "5th Cohort" }
}
```

## Files

### NEW

- `src/ai/tools/regenerate-regiment-name.ts`
- `src/ai/tools/regenerate-regiment-name.test.ts`

### MODIFY

- `src/ai/index.ts` — add the `regenerate-regiment-name` import (alphabetically slotted **before** `regenerate-regiment-names`), the `export { … }` re-export block (alphabetically slotted **before** the existing `regenerate-regiment-names` export block), and `registry.register(regenerateRegimentNameTool)` (slotted right before the existing `registry.register(regenerateRegimentNamesTool)` line).

## Module shape

Mirroring the per-burg / per-regiment patterns:

```ts
export interface RegenerateRegimentNameRef {
  stateId: number;
  stateName: string;
  i: number;        // regiment.i (per-state)
  name: string;     // current (pre-mutation) name
}

export interface RegenerateRegimentNameRuntime {
  find(
    stateRef: number | string,
    regRef: number | string,
  ): { kind: "ok"; ref: RegenerateRegimentNameRef }
  | { kind: "state-not-found"; ref: number | string }
  | { kind: "state-inactive"; stateId: number }
  | { kind: "no-military"; stateId: number }
  | { kind: "regiment-not-found"; stateId: number; stateName: string; ref: number | string }
  | { kind: "regiment-ambiguous"; stateId: number; stateName: string; name: string; candidates: Array<{ i: number; name: string }> };
  generate(stateId: number, ref: RegenerateRegimentNameRef): string;
  apply(stateId: number, regimentI: number, name: string): void;
  redraw(): void;
}
```

This shape lets the test suite distinguish the precise error case without reaching into the default runtime, while keeping the default runtime's behaviour the same as `regenerate-regiment-names.ts` (uses `getPack`, `resolveStateRefInPack`, `Military.getName`, `drawMilitary`).

## Tests (Vitest)

Unit (factory-based, fake runtime):

1. **happy path by ids** — `state: 3, regiment: 1` → tool calls `find` then `generate(stateId=3, ref)` then `apply(3, 1, name)` then `redraw`. Result echoes `state.i, state.name, regiment.i, regiment.previous_name, regiment.name`.
2. **happy path by name pair** — case-insensitive state `fullName` + regiment name resolves through `find`.
3. **stub `Military.getName` returning a deterministic value** — exercise default runtime (`defaultRegenerateRegimentNameRuntime`); verify `Military.getName` is invoked with the regiment object and the *full sibling military array*. (No isolated runtime stub for this — see #11 below for the integration check.)
4. **state ref unresolved** → `State {ref} not found.` error; no apply, no redraw.
5. **state 0 (Neutrals) / removed state** → `Cannot regenerate regiment for state 0 / removed state.` error; no apply, no redraw.
6. **state has no military** → `State {i} has no military regiments.` error.
7. **regiment not found within state** → `Regiment {ref} not found in state {stateName}.` error.
8. **regiment name ambiguous within state** → error message above + `candidates` array in error data.
9. **`Military.getName` missing** → `Military.getName is not available; the map hasn't finished loading.` error from default runtime.
10. **runtime throws during `generate`** → error surfaces; no apply, no redraw.
11. **runtime throws during `apply`** → error surfaces; redraw is NOT called (per existing single-action tools' precedent — `regenerate-burg-name.ts` does not redraw on apply error either).
12. **registry round-trip** — `createToolRegistry()` includes `regenerate_regiment_name` exactly once.
13. **default-runtime integration** with `globalThis.pack` and `globalThis.Military`:
    - all-states pack with regiments; tool resolves by id pair, mutates `pack.states[i].military[j].name`, calls `drawMilitary` once.
    - tool resolves by name pair (state name + regiment name).
    - state 0 rejected.
    - removed state rejected.
    - state with empty `military` rejected.
    - missing `Military.getName` → error.
14. **`previous_name` captured BEFORE mutation** — the test installs an `apply` mock that mutates the in-memory regiment to a sentinel value `"AFTER-MUTATION"` and a `find` that always reads from the same in-memory object. The test then asserts the response's `regiment.previous_name` equals the original name (NOT `"AFTER-MUTATION"`). A bug where `previousName` is captured by re-reading the regiment after `apply` would set `previous_name` to `"AFTER-MUTATION"` and fail.

## Verification

- `npm test`
- `npx tsc --noEmit`
- `npm run lint`

All three must come back green.

## Self-review

Re-read both files. Findings + corrections:

1. **Result key casing — `previous_name` (snake) vs `previousName` (camel).** The spec's success-result example uses snake_case (`previous_name`). Sister tools (`rename_regiment`, `regenerate_regiment_names`, `regenerate_burg_name`) all use camelCase (`previousName`). The plan honours the spec verbatim → snake_case in the response. Tests assert snake_case. This is a deliberate divergence from sister tools; if the user wants camelCase to match precedent, swap one literal in the implementation and the test.
2. **Alphabetical slot.** `regenerate-regiment-name` < `regenerate-regiment-names` lexicographically (shorter wins on identical prefixes). Confirmed: insert BEFORE the existing `*-names` lines in import / re-export / registration sites. ✓
3. **`previous_name` BEFORE mutation regression** is in the plan as test #14 and called out in tasks_338.md. ✓
4. **Test #3 phrasing.** The plan said test #3 exercises the default runtime; clearer: it's a *unit* test using a fake runtime that documents the `generate(stateId, ref) → string` runtime contract. The default runtime's `Military.getName(reg, military)` invocation (and that the *full* sibling military array is forwarded) is covered in the integration block (#13). Keeping #3 as a contract-shape unit test, with #13 covering the live `Military.getName` call.
5. **State 0 / Neutrals rejection.** The legacy `restoreName` reads `pack.states[elSelected.dataset.state].military` — `elSelected` is only set when a regiment was clicked, and Neutrals never has regiments, so the question never arises in the UI. We explicitly reject `state: 0` to keep error semantics predictable for the AI and consistent with `rename-regiment`'s `isActive` filter.
6. **Runtime shape.** Used a tagged-union return for `find` so tests can pin down each error code without depending on the precise error string casing of the default runtime. The tool surface still emits the verbatim error strings spec'd in § Validation/errors.
