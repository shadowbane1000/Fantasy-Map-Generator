# Plan 128 — regenerate_state_coa AI tool

## Use case

The Emblem Editor (`public/modules/ui/emblems-editor.js`) has
a per-element "Regenerate" button. When the selected element
is a state, its handler (lines 206-223) does:

```js
// parent = null (states are top-level)
const shield = el.coa.shield || COA.getShield(el.culture || 0, el.state);
el.coa = COA.generate(null, 0.3, 0.1, null);
el.coa.shield = shield;
const coaEl = document.getElementById(id); // "stateCOA" + state.i
if (coaEl) coaEl.remove();
COArenderer.trigger(id, el.coa);
```

That's the operation this tool exposes to the AI chat. It is
the state-level parallel of the just-merged
`regenerate_burg_coa` tool (`src/ai/tools/regenerate-burg-coa.ts`).

## Shape

One tool: `regenerate_state_coa(state, shield?)`.

- `state` — numeric state id (> 0) OR case-insensitive name.
  Required.
- `shield` — optional string override. Trimmed; must be
  non-empty when provided.

## Semantics

- State 0 (Neutrals) → `errorResult("Cannot regenerate coa
  for state 0 (the Neutrals placeholder).")`.
- Removed state → error.
- Locked state → error (`state.lock === true`).
- `parent` passed into `COA.generate`: **null**. States are
  top-level in the heraldry hierarchy; the per-state
  Regenerate handler in `emblems-editor.js` passes no parent
  when the element is a state. (Culture is not a heraldic
  parent here — cultures supply default shield shape via
  `COA.getShield`, not a parent coa.)
- Kinship / dominion / type: `(0.3, 0.1, null)` — matches
  the emblem-editor handler verbatim.
- Shield resolution (explicit > existing > generated):
  1. `shield` input param, if provided.
  2. `state.coa.shield` if present.
  3. `COA.getShield(state.culture || 0, state.i)` —
     mirrors `el.coa.shield || COA.getShield(el.culture || parent?.culture || 0, el.state)`
     from the editor. For a state, `el.state === state.i` and
     `parent?.culture` is always undefined (no parent).
- Write `state.coa = newCoa; newCoa.shield = resolvedShield`.
- Best-effort DOM refresh: remove `#stateCOA{i}` then
  `COArenderer.trigger("stateCOA" + i, newCoa)`. Wrapped in
  try/catch so DOM failures never block the mutation —
  matches `regenerate-burg-coa.ts`.
- Return payload: `{ ok: true, i, previousCoa, coa }` where
  `previousCoa` is the old `state.coa` (or null) and `coa` is
  the new one.

## Implementation

1. **New file `src/ai/tools/regenerate-state-coa.ts`**, with
   the runtime-seam pattern mirroring `regenerate-burg-coa.ts`:

   - `RegenerateStateCoaRef { i, name, coa }`.
   - `RegenerateStateCoaRuntime { find, generate, apply }`.
   - `defaultRegenerateStateCoaRuntime`:
     - `find(ref)` → `findEntityByRef` over
       `getPackCollection<RawState>("states")`. Reject
       `i <= 0` (Neutrals), `removed`, `lock` → return
       null (so the tool surfaces a "no state found"
       style error — but see validation below: we also
       pre-check `state === 0` at the input layer to give
       a clearer Neutrals-specific message).
     - `generate(i, shield?)`:
       - `pack = getPack()`; throw "pack is not available"
         when missing.
       - Look up `pack.states?.[i]`; throw `State ${i} not
         found.` when missing.
       - `coaMod = getGlobal<CoaModule>("COA")`; throw
         when `COA.generate` missing.
       - `newCoa = coaMod.generate(null, 0.3, 0.1, null)`.
       - resolve shield (explicit → existing →
         `coaMod.getShield(state.culture || 0, state.i)`).
       - assign `newCoa.shield = resolvedShield` when set.
       - return `newCoa`.
     - `apply(i, coa)`:
       - `states = getPackCollection("states")`; throw
         when missing.
       - `state.coa = coa`.
       - try/catch block:
         - `id = "stateCOA" + i`.
         - `document.getElementById(id)?.remove()`.
         - `COArenderer.trigger(id, coa)`.
   - `createRegenerateStateCoaTool(runtime?)`:
     - name: `regenerate_state_coa`.
     - description: parallels `regenerate_burg_coa`.
       Mentions parent is null (top-level in heraldic
       hierarchy), shield resolution, DOM refresh, rejects
       Neutrals / removed / locked states.
     - Schema:
       - `state` (integer | string, required).
       - `shield` (string, optional).
     - Validation:
       - Early reject `state === 0` (numeric) with Neutrals
         message.
       - `parseEntityRef` for the ref.
       - Shield override: must be non-empty string when
         provided.
       - `runtime.find(ref)` null → "No state found
         matching ...".
       - Post-find: `current.i === 0` guard (belt + braces).
     - Call `runtime.generate(current.i, shield)`. Surface
       errors.
     - Validate returned coa is a non-null object.
     - Call `runtime.apply(current.i, newCoa)`. Surface errors.
     - Return `okResult({ i, previousCoa: current.coa ?? null, coa: newCoa })`.

2. **Register in `src/ai/index.ts`**:
   - Import `regenerateStateCoaTool` next to
     `regenerateBurgCoaTool`.
   - Barrel re-export `createRegenerateStateCoaTool`,
     `regenerateStateCoaTool`.
   - `registry.register(regenerateStateCoaTool)` next to
     `regenerateBurgCoaTool` in `buildDefaultRegistry`.

3. **Tests** `src/ai/tools/regenerate-state-coa.test.ts`:

   - Unit tests with stubbed runtime (mirrors
     `regenerate-burg-coa.test.ts`):
     - regenerates by numeric id with previous + new coa.
     - resolves by case-insensitive name.
     - passes explicit shield override through to generate.
     - trims shield override.
     - returns null previousCoa when state had none.
     - rejects unknown state.
     - rejects invalid refs (null, undefined, 0, -1, 1.5, "").
     - rejects empty-string / whitespace shield override.
     - rejects non-string shield override.
     - surfaces generator errors.
     - surfaces apply errors.
     - errors when generator returns non-object.

   - `defaultRegenerateStateCoaRuntime (integration)` block
     — stub `globalThis.pack`, `COA`, `COArenderer`,
     `document` in beforeEach/afterEach. **Use
     `globalThis as unknown as {...}` double cast** when
     accessing pack shape to satisfy tsc vs PackedGraph.
     - regenerates with explicit shield → pack.states[i].coa
       updated; generate called with (null, 0.3, 0.1, null);
       existing `#stateCOA{i}` removed; trigger called.
     - preserves existing state.coa.shield when no override.
     - falls back to COA.getShield when no existing shield
       and no override (called with state.culture, state.i).
     - errors when pack is missing.
     - errors when COA is missing.
     - errors when state is unknown (id 999).
     - rejects locked states.
     - rejects removed states.
     - rejects state 0 (Neutrals).
     - succeeds even when COArenderer is missing.
     - does not throw when #stateCOA{i} DOM node is missing.

4. **README_AI.md** — row below `regenerate_burg_coa` with
   API key setup + usage example.

## Verification

- Baseline lint (via `npx biome check src/`):
  7 warnings / 1 info / 0 errors.
- Baseline tests: 1586 passing across 140 files.
- After: `npm run build` succeeds (tsc pass catches any
  Float64Array-vs-number[] or similar type drift that biome
  misses).
- `npm test` all pass (expected +~20 new tests).
- biome check on src/ matches baseline.

## Success criteria

- Tool callable, wired into registry, documented.
- Regenerating a state mirrors the Emblem Editor handler for
  states: parent=null, kinship 0.3, dominion 0.1, shield
  precedence explicit > existing > culture default.
- Neutrals (state 0), removed states, locked states refused
  with descriptive errors.
- DOM refresh is best-effort (no throw, no block).
- Return payload includes `previousCoa` so the LLM can
  present an undo / confirm path.
