# Plan 318: `set_namesbase_length_range` AI tool

## Use case

Add a new AI tool, `set_namesbase_length_range`, that updates the `min`
and/or `max` recommended name-length bounds on a single namesbase entry
in `window.nameBases`. This mirrors the legacy Namesbase Editor sliders
`#namesbaseMin` / `#namesbaseMax` and the editor handlers
`updateBaseMin` / `updateBaseMax` in
`public/modules/ui/namesbase-editor.js`:

```js
function updateBaseMin() {
  const base = +document.getElementById("namesbaseSelect").value;
  if (+this.value > nameBases[base].max) return tip("Minimal length cannot be greater than maximal", false, "error");
  nameBases[base].min = +this.value;
}

function updateBaseMax() {
  const base = +document.getElementById("namesbaseSelect").value;
  if (+this.value < nameBases[base].min) return tip("Maximal length should be greater than minimal", false, "error");
  nameBases[base].max = +this.value;
}
```

User-visible feature: "open Namesbase Editor → tweak min/max → name
lengths shift". The AI surface already has `list_namesbases` (plan
316) and `rename_namesbase` (plan 317); this is the third namesbase
tool, focused specifically on length bounds.

We bundle `min` and `max` into a single AI tool because the editor
enforces a cross-field invariant `min ≤ max`. A combined setter avoids
the AI having to make two consecutive calls that pass through an
intermediate invalid state (e.g. raising `min` above the current `max`,
which would error, before being able to also raise `max`).

## Lint baseline

Captured `npm run lint 2>&1 | tail -40` on master @ a217a7e (worktree
HEAD before this work):

```
src/renderers/draw-heightmap.ts:34:34 lint/performance/noDynamicNamespaceImportAccess
  Avoid accessing namespace imports dynamically… (line 34)
src/renderers/draw-heightmap.ts:64:34 lint/performance/noDynamicNamespaceImportAccess
  Avoid accessing namespace imports dynamically… (line 64)
Skipped 2 suggested fixes.
Checked 736 files in 587ms. No fixes applied.
Found 7 warnings.
Found 1 info.
```

Pre-existing warnings only; no errors. New code must not regress this.

## Range rationale

The slider definitions in `src/index.html` (lines ~4889–4890):

```html
<input id="namesbaseMin" data-tip="Recommended minimum name length" type="number" min="2" max="100" />
<input id="namesbaseMax" data-tip="Recommended maximum name length" type="number" min="2" value="10" />
```

- `min` slider is constrained to `[2, 100]`.
- `max` slider has `min="2"` but no explicit upper bound; the legacy
  UI implicitly trusts the user.

For the AI tool we cap both `min` and `max` to `[2, 100]`. Reasons:

- `min`'s `[2, 100]` follows the slider spec exactly.
- `max` gets the same cap: it makes the schema symmetric, matches
  user expectations (you wouldn't pick a max > 100 in the UI without
  bypassing it deliberately), and rejects pathological values
  without affecting any realistic generator preset (the seven
  built-in `nameBases` configs all have `min` and `max` well below
  20). If a real user need to exceed 100 ever surfaces, widening
  the cap later is a one-line change.

## Behavior

### Inputs

```ts
{
  index?: integer >= 0,        // namesbase array index (preferred)
  current_name?: string,       // case-insensitive exact match
  min?: integer in [2, 100],   // new minimum length
  max?: integer in [2, 100],   // new maximum length
}
```

- One of `index` or `current_name` is required to identify the
  target. If both are supplied they must agree (mirrors plan 317).
- At least one of `min` or `max` must be supplied.

### Validation order

1. `nameBases` global is reachable and is an array.
2. At least one of `min` / `max` provided. Each, if present, is a
   finite integer in `[2, 100]`.
3. If both `min` and `max` supplied: `min ≤ max`.
4. One of `index` / `current_name` supplied.
5. Resolve target (mirroring `rename-namesbase.ts`).
6. Cross-field invariant against existing entry:
   - If only `min` supplied: `min ≤ existing max`.
   - If only `max` supplied: `max ≥ existing min`.
   - (Both-supplied case already validated in step 3.)
7. Apply: `nameBases[index].min = min` and/or
   `nameBases[index].max = max`.

### Effect

In-place mutation of `window.nameBases[index]` via the runtime seam.
Returns `okResult` with:

```json
{
  "ok": true,
  "index": <number>,
  "name": <string>,
  "old_min": <number>,
  "old_max": <number>,
  "new_min": <number>,
  "new_max": <number>
}
```

`new_min` / `new_max` reflect the post-write values (so partial
updates show the unchanged field at its original value).

### Error cases (each → `errorResult`)

| Case | Message |
|------|---------|
| Neither `min` nor `max` supplied | `"Provide min or max (or both)."` |
| `min` not finite integer | `"min must be an integer in [2, 100]."` |
| `max` not finite integer | `"max must be an integer in [2, 100]."` |
| `min` outside `[2, 100]` | `"min must be an integer in [2, 100]."` |
| `max` outside `[2, 100]` | `"max must be an integer in [2, 100]."` |
| Both supplied & `min > max` | `"min must be <= max."` |
| Only `min` & `min > existing max` | `"min (<n>) cannot be greater than existing max (<m>)."` |
| Only `max` & `max < existing min` | `"max (<n>) cannot be less than existing min (<m>)."` |
| Neither `index` nor `current_name` | `"Provide either index or current_name to identify the namesbase."` |
| `index` not non-negative integer | `"index must be a non-negative integer."` |
| `index` out of range | `"No namesbase found at index <n>."` |
| `current_name` empty/non-string | `"current_name must be a non-empty string."` |
| `current_name` no match | `"No namesbase found with name <name>."` |
| `current_name` ambiguous | `"Multiple namesbases match name <name>. Disambiguate by index."` (with `candidates`) |
| `index` and `current_name` disagree | `"index and current_name disagree."` |
| `nameBases` missing/not array | `"window.nameBases is unavailable. Generate or load a map first."` |

## Files

- New: `src/ai/tools/set-namesbase-length-range.ts`
- New: `src/ai/tools/set-namesbase-length-range.test.ts`
- Modified: `src/ai/index.ts` (add import / export / register lines
  alphabetically; near `setMeasurementUnitsTool` /
  `setNoteTool`).

## Implementation outline

- Reuse `findNamesbaseByIndex` / `findNamesbasesByName` from
  `./rename-namesbase` (already exported) — same identification
  semantics as plan 317.
- Runtime seam:
  ```ts
  export interface SetNamesbaseLengthRangeRuntime {
    getNameBases(): NameBaseLike[];
    setLengthRange(index: number, patch: { min?: number; max?: number }): void;
  }
  ```
  A single `setLengthRange` is cleaner than separate setters because
  the writes are atomic from the tool's perspective. The default
  implementation throws if `nameBases` is missing/not an array, or
  if `index` is out of range or points at a non-object.
- Tool factory: `createSetNamesbaseLengthRangeTool(runtime?)`,
  exported `setNamesbaseLengthRangeTool` (instance built with the
  default runtime).
- Wiring in `src/ai/index.ts`:
  - import line near the alphabetical neighbours
    (`setMeasurementUnitsTool` is line 283;
    `set-namesbase-length-range` sorts before `set-note`, so it goes
    right after `setMeasurementUnitsTool`).
  - export from the public surface near the existing
    `setMeasurementUnitsTool` export (line 2371-ish).
  - `registry.register(setNamesbaseLengthRangeTool)` in the
    `defaultToolRegistry` builder, near the existing namesbase tool
    registrations.

## Test list (Vitest)

- Happy path: `nameBases[1].min/max = 5/12`, set `min=4` → min becomes
  4, max unchanged; result reports `old_min=5, old_max=12, new_min=4,
  new_max=12`.
- Both `min` and `max` supplied → both updated.
- Boundary values: `min=2` and `max=100` accepted.
- Out-of-range rejected: `min=1`, `max=101`, `max=0`.
- Non-integer / non-finite / non-numeric `min` / `max` rejected
  (`1.5`, `NaN`, `Infinity`, `"3"`).
- `min > existing max` (only `min` supplied) → error; nameBases
  unchanged.
- `max < existing min` (only `max` supplied) → error; nameBases
  unchanged.
- `min > max` (both supplied) → error; nameBases unchanged.
- Identification by index: out-of-range → error.
- Identification by index: negative / non-integer / non-finite →
  error.
- Identification by `current_name`: case-insensitive exact match
  resolves single namesbase.
- Identification by `current_name`: ambiguous → error with
  `candidates`.
- Identification by `current_name`: not found → error.
- Identification: `index` and `current_name` disagree → error.
- Identification: neither supplied → error.
- Neither `min` nor `max` supplied → error.
- `nameBases` missing → error message mentions `window.nameBases`.
- `nameBases` not array → error message mentions `window.nameBases`.
- Tool name correct (`set_namesbase_length_range`).
- Schema: no `required` (or only the bare-minimum identification
  requirement); description mentions both `min`/`max` and the editor
  invariant.
- Registry round-trip: registering and running by name works.
- Default-runtime integration tests using `globalThis.nameBases` (set
  up / torn down per test) confirming actual mutation of
  `nameBases[idx].min` / `.max`.

## Self-review

(See bottom of this file — appended after first pass.)

### Self-review pass

Re-read against requirements:

- Use case + analogue cited (rename-namesbase, set-label-size). OK.
- Range cap rationale documented for both `min` and `max`. OK.
- Validation order surfaces "both bad" cases (both-supplied
  invariant before per-field cross-check). OK.
- Error case table covers all rubric items: neither id, neither
  min/max, range, integer, ordering, missing/not-array nameBases,
  index disagreement, ambiguity, lookup miss. OK.
- Returned shape includes `old_min`/`old_max`/`new_min`/`new_max` and
  `index`/`name`. OK.
- File list accurate; wiring location confirmed by grepping
  `setMeasurementUnitsTool` neighbours.
- Test list maps 1:1 to spec error cases plus happy paths and
  registry round-trip. OK.

No corrections needed; the plan as written is the implementation
brief.
