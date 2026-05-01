# Plan 348: `set_emblem_position` tool

## Use case

Add an AI chat tool `set_emblem_position` that overrides the displayed
position of a single state, province, or burg's emblem
(`entity.coa.x` / `entity.coa.y`). This mirrors the data side of the
legacy `dragEmblem` end-handler in
`public/modules/ui/emblems-editor.js` (lines 520-537):

```js
function dragEmblem() {
  const x = Number(this.getAttribute("x")) - d3.event.x;
  const y = Number(this.getAttribute("y")) - d3.event.y;

  d3.event.on("drag", function () {
    this.setAttribute("x", x + d3.event.x);
    this.setAttribute("y", y + d3.event.y);
  });

  d3.event.on("end", function () {
    const categotySize = Number(this.parentNode.getAttribute("font-size"));
    const size = el.coa.size || 1;
    const shift = (categotySize * size) / 2;

    el.coa.x = rn(x + d3.event.x + shift, 2);
    el.coa.y = rn(y + d3.event.y + shift, 2);
  });
}
```

…where `el` is `pack.states[i]` / `pack.provinces[i]` /
`pack.burgs[i]` depending on which collection the dragged emblem
belongs to. Both `el.coa.x` and `el.coa.y` are written together by the
drag-end handler — partial state would be ambiguous.

The fallback in the renderer (`changeSize` in the same file, lines
194-195: `const x = el.coa.x || el.x || el.pole[0];`) treats
`coa.x` / `coa.y` as an OPTIONAL override — when absent, the renderer
uses the entity's own `x/y/pole`. So this tool's "clear" semantics
(both x and y null) should `delete` the fields, restoring the default
placement.

The user can already drag any emblem on the map (after enabling the
per-entity emblem editor) to place it; the AI cannot. This plan ships
in the same family as plans 346 (`set_emblem_shield`) and 347
(`set_emblem_size`).

## Lint baseline

```
$ npm run lint 2>&1 | tail -20
> fantasy-map-generator@1.114.1 lint
> biome check --write

Checked 801 files in 642ms. No fixes applied.
```

Clean.

## Behavior

1. Validate `entity_type` ∈ {state, province, burg} (case-insensitive,
   trimmed). Reuses `resolveEmblemEntityType` from
   `set-emblem-size.ts`.
2. Validate `entity` as positive integer id or non-empty name string
   via `parseEntityRef` (rejects 0 / negative / blank automatically).
3. Validate `x` and `y`:
   - Both `null` → CLEAR mode.
   - Both finite numbers → SET mode.
   - Anything else (one null while the other is a number, NaN,
     Infinity, non-number) → error.
4. Resolve the entity from the appropriate pack collection
   (`pack.states`, `pack.provinces`, or `pack.burgs`) using
   `findEntityByRef` (skips id-0 placeholder + `removed: true`
   entries). Reject removed/missing entities.
5. Capture `previous_x` and `previous_y` BEFORE mutation:
   `entity.coa?.x ?? null` and `entity.coa?.y ?? null`.
6. SET mode:
   - Initialize `entity.coa = entity.coa ?? {}` if missing.
   - Set `entity.coa.x = rn(x, 2)` and `entity.coa.y = rn(y, 2)`
     (rounded to 2 decimals, mirroring the legacy `rn(..., 2)` calls).
7. CLEAR mode:
   - If `entity.coa` is present, `delete entity.coa.x` and
     `delete entity.coa.y`. Idempotent — no-op when fields were
     already absent. Other coa fields preserved.
   - When `entity.coa` is missing entirely, no-op (do NOT initialize
     a coa just to delete from it).
8. Best-effort redraw (wrapped in try/catch — never blocks the data
   write):
   - Look up `COArenderer` via `getGlobal`. If present and `coa` is
     defined, call `COArenderer.trigger("<type>COA<i>", entity.coa)`.
   - This triggers the COA renderer to refresh the symbol; the
     `<use>` element is positioned by the emblem layer when it next
     paints.
9. Return success summary.

## Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {
    "entity_type": { "type": "string", "enum": ["state", "province", "burg"] },
    "entity":      { "type": ["integer", "string"] },
    "x":           { "type": ["number", "null"] },
    "y":           { "type": ["number", "null"] }
  },
  "required": ["entity_type", "entity", "x", "y"]
}
```

Note: `x` and `y` are BOTH `required` — both must be present, even
when both are `null`. This forces the AI to be explicit about
clearing vs setting.

## Validation rules

- `entity_type` required, must lower-case to one of state/province/burg.
- `entity` required; resolves to non-removed, id > 0 entry.
- `x` and `y` both required.
- `x` and `y` must be either BOTH `null` OR BOTH finite numbers.
  Partial null/number combinations and non-finite numbers
  (NaN/Infinity) are rejected.
- `pack` must exist and the chosen collection must be present.

## Errors (verbatim)

- `"entity_type must be one of: state, province, burg."`
- `"<EntityType> ${ref} not found."` (e.g. `"State 42 not found."`).
- `"x and y must be both numbers or both null."` — when partial
  null/number is supplied, when types are mixed, or when one is
  non-finite.
- `"window.pack is not available; the map hasn't finished loading."`
- Runtime errors from the apply function are propagated.

`parseEntityRef` already rejects entity refs of 0, negative,
non-integer numbers, and blank/non-string non-numbers with its
standard message
(`"entity must be a positive integer id or a non-empty name string."`),
so the spec's "Cannot set position on entity 0 (the placeholder)" and
"Cannot set position on removed <entity_type> ${i}" bullet points
collapse to the standard `parseEntityRef` message and the
"<EntityType> ${ref} not found." message respectively. Removed
entities are caught by `findEntityByRef` returning `null`, which
surfaces as the "<EntityType> ... not found." error — the intended
behavior for removed entities.

## Success result

```jsonc
{
  "ok": true,
  "entity_type": "state",
  "entity": { "i": 3, "name": "Valoria" },
  "previous_x": 102.3,    // null when coa.x was unset
  "previous_y": 88.5,     // null when coa.y was unset
  "x": 120.4,             // null when cleared
  "y": 95.0               // null when cleared
}
```

`previous_x` / `previous_y` are `null` when `entity.coa` was missing
or the corresponding axis was unset. `x` / `y` in the response are
the post-mutation values (the rounded numbers in SET mode, or `null`
in CLEAR mode).

## Files

NEW:
- `src/ai/tools/set-emblem-position.ts`
- `src/ai/tools/set-emblem-position.test.ts`

MODIFY:
- `src/ai/index.ts`
  - alphabetical import block (between `setEmblemShieldTool` and
    `setEmblemSizeTool` — `position` sorts between `shield` and
    `size`? No: alphabetically `position` < `shield` < `size`, so the
    import goes BEFORE `setEmblemShieldTool`).
  - alphabetical re-export block (likewise).
  - registry registration (adjacent to the existing emblem
    registrations).

## Tests (Vitest)

Custom-runtime tests via `createSetEmblemPositionTool`:

1. happy path SET for `entity_type=state` (numeric id) — apply called
   with `(state, i, x, y)`; response includes `previous_x`,
   `previous_y`, `x`, `y`.
2. happy path SET for `entity_type=province` (numeric id).
3. happy path SET for `entity_type=burg` (numeric id).
4. happy path CLEAR (both `x` and `y` null) — apply called with
   `(type, i, null, null)`; response has `x: null`, `y: null`.
5. happy path resolving by case-insensitive name string.
6. `entity_type` accepted case-insensitively (e.g. `"State"`).
7. partial null rejected: `x` finite, `y` null → error.
8. partial null rejected: `x` null, `y` finite → error.
9. invalid `x` rejected when `y` is a number: NaN, Infinity, string,
   undefined → error.
10. invalid `y` rejected when `x` is a number: NaN, Infinity, string,
    undefined → error.
11. both NaN → error.
12. both Infinity → error.
13. missing `entity_type` → "entity_type must be one of: ...".
14. unknown `entity_type` value (e.g. `"culture"`, `""`) → error.
15. unknown entity (find returns null) → "<EntityType> ... not found".
16. invalid entity ref (0, -1, 1.5, "", null) → reject from
    `parseEntityRef`.
17. `previous_x = null` and `previous_y = null` when entity has no
    `coa`.
18. `previous_x` / `previous_y` captured BEFORE mutation (apply spy
    receives the new values; the response's previous_x/y reflects
    pre-mutation state).
19. runtime errors propagated from `apply`.
20. CLEAR when fields were already absent: tool succeeds, response
    `previous_x` / `previous_y` are `null`.
21. rounding: `x = 12.345`, `y = 67.891` → apply called with
    `(type, i, 12.35, 67.89)`. (Custom runtime asserts the apply
    arguments are pre-rounded so the runtime contract is clear.)
22. `entity_type` validation runs first — invalid `entity_type`
    bypasses entity / coordinate checks.

Default-runtime integration tests (against a stub `globalThis.pack`):

23. SET writes `entity.coa.x` and `entity.coa.y` for a state.
24. SET writes `entity.coa.x` and `entity.coa.y` for a province.
25. SET writes `entity.coa.x` and `entity.coa.y` for a burg.
26. SET initializes missing `entity.coa = {}` if absent and writes
    both axes; `previous_x` / `previous_y` = `null`.
27. SET preserves existing `coa.shield` and `coa.size` when only
    position is set (load-bearing — only x/y are touched).
28. CLEAR removes both `coa.x` and `coa.y` via `delete` (verified
    with `'x' in coa === false` AND `'y' in coa === false`).
29. CLEAR preserves other coa fields (shield, size, custom) intact.
30. CLEAR when `entity.coa` is absent → no-op success;
    `entity.coa` remains undefined (NOT initialized to `{}`).
31. Rounding: SET with `x = 12.345`, `y = 67.891` writes
    `entity.coa.x = 12.35`, `entity.coa.y = 67.89`.
32. rejects when `pack` is absent
    (`"State 1 not found."` because find returns null).
33. rejects when the pack collection is absent
    (e.g. `pack.states` undefined → "<EntityType> ... not found.").
34. rejects removed entities ("not found" — `findEntityByRef` skips
    them).
35. `COArenderer.trigger` best-effort: missing → no error, data write
    succeeds.
36. `COArenderer.trigger` best-effort: throws → no error, data write
    succeeds.
37. `COArenderer.trigger` is called with `<type>COA<i>` and the post
    -mutation `entity.coa` for SET path.
38. Setting both axes to numbers when prior coa.x/y already set:
    response captures previous_x/y from BEFORE the mutation.

Registry round-trip:

39. `set_emblem_position` is registered in the default registry
    exposed by `src/ai/index.ts`.

## Verification

- `npm test`
- `npx tsc --noEmit`
- `npm run lint`

## Self-review

After re-reading plan_348.md and tasks_348.md:

- All three entity types (state/province/burg) covered in
  custom-runtime happy-path tests (1-3) and default-runtime
  integration tests (23-25).
- Both-null CLEAR semantics covered:
  - Custom-runtime test 4: apply called with `(_, _, null, null)`;
    response shows `x: null`, `y: null`.
  - Default-runtime test 28: verified with `'x' in coa === false`
    AND `'y' in coa === false` (proves `delete` is used, not
    assignment to `null`/`undefined`).
- Partial null/number rejected:
  - Tests 7 (x number, y null) and 8 (x null, y number) cover both
    permutations.
- Other coa fields preserved:
  - SET-mode integration test 27 (shield + size preserved).
  - CLEAR-mode integration test 29 (shield + size preserved when x/y
    are deleted).
- Rounding to 2 decimals covered:
  - Custom-runtime test 21 (apply receives rounded values).
  - Default-runtime test 31 (entity.coa.x/y stored at 2 decimals).
- `previous_x` / `previous_y` captured BEFORE mutation:
  - Custom-runtime test 18 (apply spy receives new values; response
    holds previous values).
  - Default-runtime test 38 (end-to-end with prior coa.x/y set).
- Idempotent CLEAR (no-op when fields already absent) covered:
  - Custom-runtime test 20.
  - Default-runtime test 30 (CLEAR with no coa at all does NOT
    initialize coa to `{}`).

Corrections / clarifications applied to behavior section:

- `parseEntityRef` already rejects ref values of `0`, negative, or
  non-integer numbers with its standard message, so the spec's
  "Cannot set position on entity 0 (the placeholder)" message is
  unreachable in practice; collapsed to `parseEntityRef`'s message in
  the Errors section. Removed/missing entries are caught by
  `findEntityByRef` returning `null`, which surfaces as the
  "<EntityType> ... not found" error (matches the spec's intended
  behavior for removed entities).
- The Errors section in the spec includes
  `"x must be a finite number."` / `"y must be a finite number."` for
  the case where one axis is non-finite while the other is set. We
  consolidated this into the single
  `"x and y must be both numbers or both null."` message so the AI
  always sees the exact rule it violated, regardless of which axis
  is broken. Tests 7-12 confirm this single consolidated message is
  emitted for all partial / invalid combinations.
- Best-effort redraw uses `COArenderer.trigger(<type>COA<i>, coa)`,
  not the emblem layer's `<use>` (`<use>` re-positioning is the job
  of the emblem layer paint pass; the COA renderer just refreshes the
  symbol body).
- Alphabetical position in the import / re-export blocks: `position`
  sorts before `shield` and `size`, so the new entry slots
  immediately ABOVE `setEmblemShieldTool`.
