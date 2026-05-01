# Plan 325: `set_namesbase_multiword_rate` tool

## Use case

Add an AI chat tool that updates the `.m` (multiword-rate) field on a
single entry in `window.nameBases`. The legacy Namesbase Editor in
`public/modules/ui/namesbase-editor.js` does **not** expose a UI input
for this field — it is normally derived from the corpus by
`analyzeNamesbase` and consumed by the name generator (see `Names.getBase`
and the `m` reads in `public/modules/names-generator.js`). However, the
field IS part of the namesbase data model: `namesbaseAdd` initializes it
on every new entry,

```js
nameBases.push({name: "Base" + base, min: 5, max: 12, d: "", m: 0, b});
```

…and `add_namesbase` (plan 320, merged) along with the rest of the
field-setter family (`rename_namesbase`, `set_namesbase_length_range`,
`set_namesbase_names`, `set_namesbase_duplication`) leaves `m` as the
only remaining unsettable field. The AI/user may want to bias name
generation toward more or fewer multiword names (e.g. boost it for an
"American" namesbase, zero it for a clipped "Old Norse" one). This plan
fills that final gap with an explicit setter — analogous to how
`set_namesbase_duplication` exposes `.d` directly even though it's a
single-line input on the editor.

The field is a probability used at name-generation time. Conventional
values are in `[0, 1]`; many built-in bases use `0`, a few use `0.1`.

## Lint baseline

`cd /workspace/.claude/worktrees/plan-325 && npm run lint 2>&1 | tail -40`
on the worktree base (master @ 5fb22ff, plan-325 branch, working tree
clean) reports the pre-existing warnings inherited from the renderer
modules:

- 2 `lint/performance/noDynamicNamespaceImportAccess` warnings on
  `src/renderers/draw-heightmap.ts` (lines 34 and 64).
- 5 other warnings in pre-existing renderer/module code.

Final summary line: **"Found 7 warnings. Found 1 info."** No errors. We
must not regress this — implementation may not introduce new
warnings.

## Behavior

- Resolve a single namesbase by `index` (preferred) or `current_name`
  (case-insensitive trimmed exact match) using the helpers
  `findNamesbaseByIndex` and `findNamesbasesByName` exported from
  `src/ai/tools/rename-namesbase.ts`.
- Set `nameBases[index].m = multiword_rate`.
- Do **not** call `Names.updateChain(index)`. The editor doesn't expose
  this field at all, so there is no "rebuild" reference behavior to
  mirror; the `m` value is consulted at name-generation time, not
  chain-build time. (Compare `set_namesbase_duplication`, which also
  intentionally skips updateChain.)
- Do **not** clamp. If the value is outside `[0, 1]` we reject; we do
  not silently coerce. Range rationale below.

### Range rationale `[0, 1]`

The `m` field is read by the name generator as a probability gate
("emit two words instead of one with probability `m`"). Values outside
`[0, 1]` are not meaningful: negatives degenerate to "never" and values
> 1 degenerate to "always". The conservative explicit rejection avoids
silent surprise (e.g. an LLM passing `50` thinking it's a percentage).
Both endpoints `0` and `1` are accepted so the user can clamp generation
to single words or to multiword-only.

### Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {
    "index": {
      "type": "integer",
      "minimum": 0,
      "description": "Namesbase array index (matches the position in window.nameBases, where 0 is valid)."
    },
    "current_name": {
      "type": "string",
      "description": "Current namesbase name (case-insensitive, trimmed exact match). Use index when multiple bases share a name."
    },
    "multiword_rate": {
      "type": "number",
      "minimum": 0,
      "maximum": 1,
      "description": "New value for the namesbase's multiword-rate (.m). Probability in [0, 1] that a generated name from this base is multiword. 0 disables multiword names; 1 forces them."
    }
  },
  "required": ["multiword_rate"]
}
```

`index` and `current_name` are individually optional but at least one
must be provided.

### Validation

- `multiword_rate` must be present.
- `multiword_rate` must be `typeof === "number"` AND `Number.isFinite`
  (rejects NaN, Infinity, -Infinity, non-numeric strings).
- `multiword_rate` must be in `[0, 1]` inclusive (`>= 0 && <= 1`).
- At least one of `index` / `current_name` must be supplied.
- `index`, when supplied, must be a non-negative integer.
- `current_name`, when supplied, must be a non-empty string after
  trimming.
- Both `index` and `current_name` may be supplied; in that case they
  must agree.
- The `nameBases` global must exist and be an array.

### Errors

- `multiword_rate` missing/non-number/non-finite →
  `"multiword_rate must be a finite number."`
- `multiword_rate` out of range →
  `"multiword_rate must be in [0, 1]."`
- Neither `index` nor `current_name` provided →
  `"Provide either index or current_name to identify the namesbase."`
- `index` not non-negative integer →
  `"index must be a non-negative integer."`
- `index` out of range → `"No namesbase found at index <n>."`
- `current_name` empty / not string →
  `"current_name must be a non-empty string."`
- `current_name` not found → `"No namesbase found with name <name>."`
- `current_name` ambiguous → `"Multiple namesbases match name <name>.
  Disambiguate by index."` plus `candidates: [{index, name}]`.
- `index` and `current_name` disagree →
  `"index and current_name disagree."`
- `nameBases` missing / not array → `"window.nameBases is unavailable.
  Generate or load a map first."` (from runtime helper).

### Success result

`okResult({ ok: true, index, name, old_multiword_rate, new_multiword_rate })`.
`name` is the current name of the resolved namesbase.
`old_multiword_rate` is the value of `.m` before the write; defaults to
`0` if the field was missing or non-numeric (mirrors how the editor
treats unset values).

## Files

- **New** `src/ai/tools/set-namesbase-multiword-rate.ts` — the tool,
  patterned on `set-namesbase-duplication.ts`. Exports:
  - `interface NameBaseLike` (name?, m?).
  - `interface SetNamesbaseMultiwordRateRuntime { getNameBases():
    NameBaseLike[]; setMultiwordRate(index: number, value: number):
    void; }`.
  - `defaultSetNamesbaseMultiwordRateRuntime` reading
    `window.nameBases`.
  - `createSetNamesbaseMultiwordRateTool(runtime?)` returning `Tool`.
  - `setNamesbaseMultiwordRateTool` — the default-runtime instance.
- **New** `src/ai/tools/set-namesbase-multiword-rate.test.ts` — Vitest
  spec, full coverage (see Tests below).
- **Modify** `src/ai/index.ts`:
  - Import `setNamesbaseMultiwordRateTool` adjacent to the other
    namesbase setters (alphabetical: between `setNamesbaseLengthRangeTool`
    and `setNamesbaseNamesTool`).
  - Re-export `createSetNamesbaseMultiwordRateTool`,
    `defaultSetNamesbaseMultiwordRateRuntime`, type
    `SetNamesbaseMultiwordRateRuntime`, and
    `setNamesbaseMultiwordRateTool`.
  - Register via `registry.register(setNamesbaseMultiwordRateTool);`
    in `defaultToolRegistry()`, near the other namesbase
    registrations.

Identification helpers `findNamesbaseByIndex` and
`findNamesbasesByName` are already exported by
`src/ai/tools/rename-namesbase.ts` and reused; no new shared utilities
needed.

## Tests (Vitest)

Mirror the structure of `set-namesbase-duplication.test.ts`:

1. **Happy path index**: `nameBases[1].m = 0` → call with `{ index: 1,
   multiword_rate: 0.3 }` → `setMultiwordRate(1, 0.3)`, result `{ ok:
   true, index: 1, name: "Elvish", old_multiword_rate: 0,
   new_multiword_rate: 0.3 }`.
2. **Boundary 0**: `multiword_rate: 0` accepted, payload reflects 0.
3. **Boundary 1**: `multiword_rate: 1` accepted, payload reflects 1.
4. **Old defaults to 0** when entry has no `.m` field.
5. **Out-of-range rejected**: `-0.01`, `1.01`, `-1`, `2` →
   `"multiword_rate must be in [0, 1]."`, no setMultiwordRate call.
6. **Non-finite rejected**: `NaN`, `Infinity`, `-Infinity` →
   `"multiword_rate must be a finite number."`.
7. **Non-number rejected**: `"0.5"`, `null`, `true`, `{}`, `[]`,
   `undefined` (missing) → `"multiword_rate must be a finite number."`.
8. **Index out of range** → `"No namesbase found at index <n>."`.
9. **Index negative / non-integer / NaN / numeric string** → `"index
   must be a non-negative integer."`.
10. **`current_name` not found** → `"No namesbase found with name
    Ghost."`.
11. **`current_name` ambiguous** → multi-match error with `candidates`.
12. **Index + current_name disagree** → `"index and current_name
    disagree."`.
13. **Neither identifier supplied** → `"Provide either index or
    current_name..."`.
14. **`current_name` empty / whitespace / non-string** →
    `"current_name must be a non-empty string."`.
15. **Tool name + registry round-trip**: name === `"set_namesbase_multiword_rate"`;
    registry round-trip mutates `window.nameBases[i].m`.
16. **Default runtime integration**: populated `globalThis.nameBases`
    mutates correctly; missing/non-array `nameBases` errors clearly.
17. **Runtime failure pass-through**: `getNameBases` throws → error
    surfaces; `setMultiwordRate` throws → error surfaces.

## Verification

- `npm test` — green.
- `npm run lint` — does NOT regress (still 7 warnings, 1 info; no new
  output).
- `npx tsc --noEmit` — clean.

## Self-review (added during step 4)

Reviewed the plan against the spec:

- Range rationale documented; both endpoints are explicitly accepted.
- Error messages match the patterns used by the other namesbase
  setters, so the LLM's prior-art reasoning applies cleanly.
- The two-stage validation (finiteness first, then range) yields a
  cleaner error message than collapsing into one.
- Identification logic is fully delegated to `rename-namesbase`'s
  exports; we don't fork the resolver.
- Test list covers: happy path, both boundaries, missing-field default,
  every rejection branch, ambiguity, disagree, default-runtime
  integration, registry round-trip, runtime failure pass-through.
- The required schema field is `multiword_rate` (no identifier is
  marked `required` because the validator picks one or the other).
- The behavior section explicitly notes "no updateChain" with the same
  rationale as `set_namesbase_duplication`.
- Old-value default of `0` matches the JS semantics (`{m: 0, ...}`
  initializer in `namesbaseAdd`).
