# Plan 347: `set_emblem_size` tool

## Use case

Add an AI chat tool `set_emblem_size` that sets the per-entity COA
size (`entity.coa.size`) for a single state, province, or burg,
mirroring the legacy `changeSize` function in
`public/modules/ui/emblems-editor.js` (lines 180-204):

```js
function changeSize() {
  const size = +this.value;
  el.coa.size = size;

  document.getElementById("emblemSizeSlider").value = size;
  document.getElementById("emblemSizeNumber").value = size;

  const g = emblems.select("#" + type + "Emblems");
  g.select("[data-i='" + el.i + "']").remove();
  if (!size) return;

  const categotySize = +g.attr("font-size");
  const shift = (categotySize * size) / 2;
  const x = el.coa.x || el.x || el.pole[0];
  const y = el.coa.y || el.y || el.pole[1];

  g.append("use")
    .attr("data-i", el.i)
    .attr("x", rn(x - shift), 2)
    .attr("y", rn(y - shift), 2)
    .attr("width", size + "em")
    .attr("height", size + "em")
    .attr("href", "#" + id);
}
```

The "Size" slider/number-input wired in `emblems-editor.js` (lines
29-30) calls this. Setting size to 0 hides the emblem (the legacy
function returns early after the existing `<use>` is removed). The
slider's HTML range is `min="0" max="5" step=".1"` (verified in
`src/index.html` line 5160). The user can already trigger this from
the emblem editor; the AI cannot.

This plan ships in parallel with plan 346 (`set_emblem_shield`); both
touch `entity.coa` and use the same entity-type/entity resolution
pattern.

## Lint baseline

```
$ npm run lint 2>&1 | tail -50
> fantasy-map-generator@1.114.1 lint
> biome check --write

Checked 797 files in 642ms. No fixes applied.
```

Clean.

## Behavior

1. Validate `entity_type` ∈ {state, province, burg} (case-insensitive,
   trimmed).
2. Validate `entity` as positive integer id or non-empty name string
   via `parseEntityRef` (rejects 0 / negative / blank automatically).
3. Validate `size` is a finite number in `[0, 5]`. Reject NaN,
   Infinity, negative, non-numbers, out-of-range values. 0 is allowed
   and special-cased (hides the emblem).
4. Resolve the entity from the appropriate pack collection
   (`pack.states`, `pack.provinces`, or `pack.burgs`) using
   `findEntityByRef` (skips id-0 placeholder + `removed: true`
   entries). Reject removed/missing entities.
5. Capture `previous_size` BEFORE mutation: `entity.coa?.size ?? null`.
6. Initialize `entity.coa = entity.coa ?? {}` if missing, then set
   `entity.coa.size = size`.
7. Best-effort DOM update (wrapped in try/catch — any DOM failure
   never blocks the data write):
   - If `window.emblems` (d3 selection) is available:
     - Select `<g id="<type>Emblems">`.
     - Remove the existing `<use data-i="<i>">` element, if any.
     - If `size > 0`: re-append the `<use>` with computed x/y/width/
       height/href, mirroring the legacy code (uses `rn` for x/y,
       `<size>em` for width/height, `#<type>COA<i>` for href, and
       reads `font-size` off the group for the `categotySize`
       multiplier; falls back to coordinate fallback chain
       `coa.x || x || pole[0]`).
8. Return success summary.

## Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {
    "entity_type": { "type": "string", "enum": ["state", "province", "burg"] },
    "entity":      { "type": ["integer", "string"] },
    "size":        { "type": "number", "minimum": 0, "maximum": 5 }
  },
  "required": ["entity_type", "entity", "size"]
}
```

## Validation rules

- `entity_type` required, must lower-case to one of state/province/burg.
- `entity` required; resolves to non-removed, id > 0 entry.
- `size` required, finite number in `[0, 5]`.
- `pack` must exist and the chosen collection must be present.

## Errors (verbatim)

- `"entity_type must be one of: state, province, burg."`
- `"<EntityType> ${ref} not found."` (e.g. `"State 42 not found."` or
  `"Burg \"Foo\" not found."`)
- `"Cannot set size on entity 0 (the placeholder)."`
- `"Cannot set size on removed <entity_type> ${i}."`
- `"size must be a finite number in [0, 5]."`
- `"window.pack is not available; the map hasn't finished loading."`
- Runtime errors from the apply function are propagated.

## Success result

```jsonc
{
  "ok": true,
  "entity_type": "state",
  "entity": { "i": 3, "name": "Valoria" },
  "previous_size": 1,
  "size": 2.5
}
```

`previous_size` is `null` when `entity.coa` was missing or
`entity.coa.size` was unset.

## Files

NEW:
- `src/ai/tools/set-emblem-size.ts`
- `src/ai/tools/set-emblem-size.test.ts`

MODIFY:
- `src/ai/index.ts`
  - alphabetical import block (between `setDefaultEmblemShapeTool` and
    `setEntityExpansionismTool`).
  - alphabetical re-export block.
  - registry registration (after `setDefaultEmblemShapeTool` /
    `listEmblemShapesTool`).

## Tests (Vitest)

Custom-runtime tests via `createSetEmblemSizeTool`:

1. happy path for `entity_type=state` (numeric id).
2. happy path for `entity_type=province` (numeric id).
3. happy path for `entity_type=burg` (numeric id).
4. happy path resolving by case-insensitive name string.
5. `entity_type` accepted case-insensitively (e.g. `"State"`).
6. `size = 0` allowed (hides emblem). Apply still called with 0.
7. boundary: `size = 0` (min) and `size = 5` (max) accepted.
8. out-of-range size rejected (`-0.1`, `5.1`, `100`, `-100`).
9. invalid size types rejected (NaN, +Inf, -Inf, string, null,
   undefined).
10. missing `entity_type` → error with `entity_type must be one of`.
11. unknown `entity_type` value (e.g. `"culture"`, `""`) → error.
12. unknown entity (find returns null) → "<EntityType> ... not found".
13. invalid entity ref (0, -1, 1.5, "", null) → reject from
    `parseEntityRef`.
14. `previous_size = null` when entity has no `coa`.
15. `previous_size = null` when entity has `coa` but no `size`.
16. `previous_size` captured BEFORE mutation (apply spy receives the
    new size; the response's `previous_size` reflects the pre-mutation
    state).
17. runtime errors propagated from `apply`.

Default-runtime integration tests (against a stub `globalThis.pack`):

18. writes `entity.coa.size` for a state.
19. writes `entity.coa.size` for a province.
20. writes `entity.coa.size` for a burg.
21. initializes missing `entity.coa = {}` if absent and writes `size`.
22. preserves existing `coa.shield` when only size is set.
23. rejects when `pack` is absent
    (`"window.pack is not available; the map hasn't finished loading."`).
24. rejects when the pack collection is absent
    (e.g. `pack.states` undefined → "<EntityType> ... not found.").
25. rejects removed entities ("not found" — `findEntityByRef` skips
    them).
26. DOM ops best-effort: tool succeeds when `window.emblems` is
    undefined (no throw, data write succeeds).
27. DOM ops best-effort: tool succeeds when the `<use>` element is
    missing (size > 0 still appends a new one; size = 0 noop).
28. DOM ops best-effort: tool succeeds even when `g.append` throws.
29. size = 0 special case: when `window.emblems` exists, the existing
    `<use>` is removed and NO new `<use>` is appended.

Registry round-trip:

30. `set_emblem_size` is registered in the default registry exposed by
    `src/ai/index.ts` and round-trips via `toAnthropicSchemas()`.

## Verification

- `npm test`
- `npx tsc --noEmit`
- `npm run lint`

## Self-review

After re-reading plan_347.md and tasks_347.md:

- All three entity types (state/province/burg) covered in custom-runtime
  happy-path tests (1-3) and default-runtime integration tests (18-20).
- `size = 0` special case covered:
  - Custom-runtime test 6: validation accepts 0 and apply gets called
    with 0.
  - Default-runtime test 29: when `window.emblems` is set, the
    existing `<use>` is removed and NO new `<use>` is appended.
- `coa` initialization covered (test 21): missing `coa` is initialized
  to `{}` before `size` is written.
- Existing `coa.shield` preservation covered (test 22).
- `previous_size` captured BEFORE mutation covered:
  - Custom-runtime test 16: spies on `apply` to confirm the response's
    `previous_size` reflects the pre-mutation value while `apply`
    receives the new size.
  - Default-runtime tests 14/15: confirm `previous_size = null` when
    `coa` or `coa.size` was unset.

Corrections / clarifications applied to behavior section:

- `parseEntityRef` already rejects ref values of `0`, negative, or
  non-integer numbers with its standard message
  ("entity must be a positive integer id or a non-empty name string").
  The "Cannot set size on entity 0" message in the spec is therefore
  unreachable in practice; `parseEntityRef`'s pre-validation message
  serves the same role and we don't need a duplicate post-find check.
  Removed/missing entries are caught by `findEntityByRef` returning
  `null`, which surfaces as the "<EntityType> ... not found" error,
  matching the spec's intended behavior for removed entities.
- Coordinate fallback chain mirrors the legacy code exactly:
  `coa.x ?? entity.x ?? entity.pole?.[0]` (and same for y). For
  states/provinces `entity.x` is undefined; `pole[0]` provides the
  fallback. For burgs `entity.x` is the canonical coordinate.
