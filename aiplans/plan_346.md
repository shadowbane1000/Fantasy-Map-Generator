# Plan 346: `set_emblem_shield` tool

## Use case

Add an AI chat tool `set_emblem_shield` that sets the heraldic
shield/shape used for a single state, province, or burg's
coat-of-arms (`entity.coa.shield`). This mirrors the legacy
`changeShape` function in `public/modules/ui/emblems-editor.js`
(lines ~169-174):

```js
function changeShape() {
  el.coa.shield = this.value;
  const coaEl = document.getElementById(id);
  if (coaEl) coaEl.remove();
  COArenderer.trigger(id, el.coa);
}
```

…where `el` is `pack.states[i]` / `pack.provinces[i]` /
`pack.burgs[i]` depending on which the user opened the emblem editor
for, and `id` is `"stateCOA<i>"` / `"provinceCOA<i>"` / `"burgCOA<i>"`
(see `selectState` / `selectProvince` / `selectBurg` lines 126-167 of
the same file).

The user can already trigger this via the "Shape" select in the per-
entity emblem editor (opened from any of state/province/burg editors).
The AI cannot per-entity, but can globally via
`set_default_emblem_shape`.

We already have:

- `set_default_emblem_shape` (global default for all newly-generated
  emblems).
- `set_culture_shield` (per-culture default — affects all entities of
  that culture).
- `regenerate_burg_coa`, `regenerate_state_coa`,
  `regenerate_province_coa` (regenerate the procedural emblem; can
  optionally pass a `shield` override).

This plan adds the missing **per-entity shield override** action.
Unlike the regenerate tools, this preserves all other coa fields
(tinctures, charges, ordinaries, etc.) and only swaps the shield
shape — equivalent to the user changing the shield-shape select while
keeping every other detail of the existing arms intact.

## Lint baseline

`npm run lint 2>&1 | tail -50` on the worktree base
(branch `plan-346-set-emblem-shield`, master @ a51a5ad, working tree
clean for `src/`) reports:

```
> fantasy-map-generator@1.114.1 lint
> biome check --write

Checked 797 files in 634ms. No fixes applied.
```

**0 errors, 0 warnings, 0 info.** Implementation must not regress
this.

## Behavior

- Resolve `entity_type` ∈ {state, province, burg} (case-insensitive,
  trimmed).
- Resolve the entity by `entity` (positive integer id or
  case-insensitive name) within `pack[<entity_type>+'s']`.
  - States / provinces / burgs are stored as
    `pack.states` / `pack.provinces` / `pack.burgs`.
  - Use the shared `parseEntityRef` + `findEntityByRef` helpers.
- Reject burg 0 / state 0 / province 0 / removed entities.
- Validate `shield` is one of the canonical shape names exported by
  `set_culture_shield` (`CULTURE_SHIELDS` — same set surfaced by
  `list_emblem_shapes`). **Import `CULTURE_SHIELDS` and
  `resolveCultureShield` from `./set-culture-shield`** — do NOT
  re-declare. (The diversiform keys `culture` / `state` / `random`
  exposed by `set_default_emblem_shape` are NOT valid per-entity
  values — they are only meaningful for the global `options.emblemShape`
  setting.)
- Initialize `entity.coa = entity.coa ?? {}` if missing — the field
  can legitimately be absent on neutral burgs that haven't been
  emblem-edited yet.
- Set `entity.coa.shield = shield`. Other coa fields (tinctures,
  charges, etc.) are preserved.
- Best-effort: remove the existing `<g id="<type>COA<i>">` element and
  call `COArenderer.trigger(id, entity.coa)` to redraw. Both DOM
  removal and the trigger call are best-effort — neither blocks the
  mutation.
- Capture `previous_shield` BEFORE mutation. Returns `null` when the
  entity had no `coa.shield` (or no `coa` at all).

### Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {
    "entity_type": {
      "type": "string",
      "enum": ["state", "province", "burg"],
      "description": "Which collection the entity belongs to."
    },
    "entity": {
      "type": ["integer", "string"],
      "description": "Numeric id (> 0) or case-insensitive name."
    },
    "shield": {
      "type": "string",
      "description": "One of the recognized shield names (e.g. 'heater', 'oval', 'square'). Use list_emblem_shapes for the full set."
    }
  },
  "required": ["entity_type", "entity", "shield"]
}
```

### Validation

- `entity_type` required, must be one of `state | province | burg`
  (case-insensitive, trimmed).
- `entity` required, must resolve via `parseEntityRef` + the
  per-collection `findEntityByRef` lookup.
- `shield` required, must be a non-empty string in the recognized set
  (`CULTURE_SHIELDS`).
- Reject id 0 / removed entities (these are explicitly filtered out by
  `findEntityByRef`'s `isActive` check, but we also re-assert the
  rejection in the runtime / message text for clarity).
- `pack` must exist with the relevant collection.

### Errors (verbatim, consistent with neighbouring tools)

- `"entity_type must be one of: state, province, burg."`
- `"<EntityType> ${ref} not found."` (e.g. `"State 7 not found."` —
  uses the canonical Title-Case `State` / `Province` / `Burg`).
- `"Cannot set shield on entity 0 (the placeholder)."`
- `"Cannot set shield on removed <entity_type> ${i}."`
- `"shield must be a non-empty string."`
- `"Unknown shield '${value}'. Valid shields: <comma-separated list>."`
  (renders the recognized set so the AI can immediately retry; also
  attaches `supported: [...CULTURE_SHIELDS]` to the error body for
  programmatic access).
- `"window.pack is not available; the map hasn't finished loading."`
- Runtime errors propagated via `errorResult(err.message)`.

### Success result

```jsonc
{
  "ok": true,
  "entity_type": "state",
  "entity": { "i": 3, "name": "Valoria" },
  "previous_shield": "heater",   // null when entity had no coa or no coa.shield
  "shield": "oval"
}
```

## Files

- **NEW** `src/ai/tools/set-emblem-shield.ts` — the tool. Exports:

  - `type EmblemShieldEntityType = "state" | "province" | "burg"`.
  - `interface EmblemShieldRef { i: number; name: string;
    previousShield: string | null; }`.
  - `interface EmblemShieldRuntime`:
    ```ts
    {
      /**
       * Locate the entity. Returns null when not found (including the
       * id-0 placeholder, removed entries, and unknown numeric ids /
       * unknown names). Captures the current `coa.shield` for the
       * `previous_shield` field of the response.
       */
      find(entityType: EmblemShieldEntityType, ref: number | string):
        EmblemShieldRef | null;
      /**
       * Apply the shield change. Initializes coa as an empty object
       * when missing, sets coa.shield = shield, then best-effort
       * removes the existing `<g id="<type>COA<i>">` DOM node and
       * calls COArenderer.trigger(id, coa). Throws on missing pack /
       * collection / entity (the find() pre-check normally avoids
       * this).
       */
      apply(entityType: EmblemShieldEntityType, i: number, shield: string):
        void;
    }
    ```
  - `defaultEmblemShieldRuntime`:
    - `find(type, ref)`: dispatches on `type`, calls
      `findEntityByRef(getPackCollection<RawState|RawProvince|RawBurg>(<plural>), ref)`,
      filters out id-0 / removed (already done by `findEntityByRef`),
      returns `{i, name: entry.name ?? "", previousShield: entry.coa?.shield ?? null}`.
    - `apply(type, i, shield)`:
      ```ts
      const pack = getPack<Pack>();
      if (!pack) throw new Error("window.pack is not available; the map hasn't finished loading.");
      const collection = pack[<plural>];
      if (!Array.isArray(collection)) throw new Error(`pack.${plural} is not available.`);
      const entity = collection[i];
      if (!entity) throw new Error(`${TitleType} ${i} not found.`);
      if (!entity.coa) entity.coa = {};
      entity.coa.shield = shield;
      try {
        const id = `${type}COA${i}`;
        if (typeof document !== "undefined") {
          const existing = document.getElementById(id);
          if (existing && typeof existing.remove === "function") existing.remove();
        }
        const renderer = getGlobal<{trigger?: (id: string, coa: RawCoa) => unknown}>("COArenderer");
        if (renderer && typeof renderer.trigger === "function") renderer.trigger(id, entity.coa);
      } catch {
        // best-effort — DOM work must never block the mutation
      }
      ```
  - `createSetEmblemShieldTool(runtime?)` returning a `Tool` named
    `set_emblem_shield`.
  - `setEmblemShieldTool` — default-runtime instance.

  **Tool execute flow:**
  1. Parse `{ entity_type?, entity?, shield? }`.
  2. Validate `entity_type`: must be a string; lowercase-trim must be
     one of `state | province | burg`. Otherwise error
     `"entity_type must be one of: state, province, burg."`.
     - If the user passes a number for `entity_type`, that's also
       caught by the `typeof !== "string"` branch.
  3. Validate `entity` via `parseEntityRef(input.entity, "entity")`.
     The shared helper rejects 0, negatives, non-integer numbers, and
     empty/whitespace strings.
  4. Validate `shield`: must be a non-empty string. Resolve to the
     canonical CULTURE_SHIELDS member via `resolveCultureShield`. On
     unknown value return
     `"Unknown shield '${input.shield}'. Valid shields: ${CULTURE_SHIELDS.join(", ")}."`
     with `supported: [...CULTURE_SHIELDS]` extra. On non-string /
     empty / whitespace return `"shield must be a non-empty string."`
     (also with `supported`).
  5. `runtime.find(entityType, ref)`. Null → return
     `"<TitleType> ${ref} not found."`.
  6. `runtime.apply(entityType, current.i, shape)` — wrap in
     try/catch and surface errors.
  7. Return `okResult({entity_type, entity: {i, name},
     previous_shield, shield})`.

- **NEW** `src/ai/tools/set-emblem-shield.test.ts` — Vitest spec
  (see Tests below).

- **MODIFY** `src/ai/index.ts`:
  - Add import alphabetically between `setDiplomacyTool` (line 272)
    and `setEntityExpansionismTool` (line 273):
    ```ts
    import { setDiplomacyTool } from "./tools/set-diplomacy";
    import { setEmblemShieldTool } from "./tools/set-emblem-shield";
    import { setEntityExpansionismTool } from "./tools/set-entity-expansionism";
    ```
  - Add re-export block alphabetically between the `set-diplomacy`
    re-export (lines 2342-2348) and the `set-entity-expansionism`
    re-export (line 2349):
    ```ts
    export {
      createSetEmblemShieldTool,
      defaultEmblemShieldRuntime,
      type EmblemShieldEntityType,
      type EmblemShieldRef,
      type EmblemShieldRuntime,
      setEmblemShieldTool,
    } from "./tools/set-emblem-shield";
    ```
  - Add `registry.register(setEmblemShieldTool);` at the end of the
    registration block (after the last `registry.register(...)` call,
    matching recent plan convention).

## Tests (Vitest)

Mirror the layout of `set-culture-shield.test.ts` (unit + integration
+ registry round-trip describe blocks). All tests stub the runtime so
they don't depend on the legacy boot.

Helper:

```ts
function makeRuntime(
  find: (
    type: EmblemShieldEntityType,
    ref: number | string,
  ) => EmblemShieldRef | null = () => null,
): {
  runtime: EmblemShieldRuntime;
  find: ReturnType<typeof vi.fn<EmblemShieldRuntime["find"]>>;
  apply: ReturnType<typeof vi.fn<EmblemShieldRuntime["apply"]>>;
} {
  const findFn = vi.fn(find);
  const apply = vi.fn<EmblemShieldRuntime["apply"]>();
  return { runtime: { find: findFn, apply }, find: findFn, apply };
}
```

### `set_emblem_shield tool` (unit, runtime stubbed)

1. **Happy path: state by numeric id.**
   - `find` returns `{ i: 7, name: "Valoria", previousShield: "heater" }`.
   - Execute `{ entity_type: "state", entity: 7, shield: "oval" }`.
   - `find` called with `("state", 7)`, `apply` called with
     `("state", 7, "oval")`.
   - Body:
     ```jsonc
     {
       ok: true,
       entity_type: "state",
       entity: { i: 7, name: "Valoria" },
       previous_shield: "heater",
       shield: "oval",
     }
     ```

2. **Happy path: province by numeric id.**
   - Same pattern; `entity_type: "province"`, `entity: 4`,
     `shield: "swiss"`. Asserts `find` and `apply` both called with
     `"province"`.

3. **Happy path: burg by numeric id.**
   - Same pattern; `entity_type: "burg"`, `entity: 5`,
     `shield: "noldor"`. Asserts `find` and `apply` both called with
     `"burg"`.

4. **Resolves entity by case-insensitive name.**
   - `find` returns `{ i: 3, name: "Ashholm", previousShield: null }`.
   - Execute `{ entity_type: "BURG", entity: "ASHHOLM",
     shield: "Heater" }`.
   - `find` called with `("burg", "ASHHOLM")` (entity_type lowercased).
   - `apply` called with `("burg", 3, "heater")` (shield canonicalised).
   - Body has `previous_shield: null`.

5. **previous_shield is `null` when entity.coa.shield is unset.**
   - `find` returns `{ i: 1, name: "X", previousShield: null }`.
   - Body has `previous_shield: null`.

6. **Trims and lowercases entity_type.**
   - For each of `[" State ", "STATE", "state"]`, `find` is called
     with `"state"` (lowercase, trimmed).

7. **Rejects unknown entity_type.**
   - For `["foo", "states", "kingdom", "", "   "]`, error exactly
     `"entity_type must be one of: state, province, burg."`.
   - `find` and `apply` NOT called.

8. **Rejects missing entity_type.**
   - Execute `{ entity: 1, shield: "heater" }`. Same error.

9. **Rejects non-string entity_type.**
   - For `[42, null, true, []]`, same error.

10. **Rejects entity 0.**
    - Execute `{ entity_type: "state", entity: 0, shield: "heater" }`.
    - Error matches `/entity must be a positive integer id/`
      (parseEntityRef's standard message).
    - `find` and `apply` NOT called.

11. **Rejects negative / non-integer entity.**
    - For `[-1, 1.5, NaN]`, parseEntityRef rejects with the same
      message.

12. **Rejects empty / whitespace / non-string non-numeric entity.**
    - For `["", "   ", null, undefined, true]`, parseEntityRef
      rejects with the same message.

13. **Rejects entity not found.**
    - `find` returns `null`.
    - Execute `{ entity_type: "state", entity: 999, shield: "heater" }`.
    - Error exactly `"State 999 not found."`.
    - For `entity_type: "province"` → `"Province 999 not found."`.
    - For `entity_type: "burg"` → `"Burg 999 not found."`.
    - When entity is a string ref, the unquoted ref string appears in
      the error: `"State Ghost not found."`.
    - `apply` NOT called.

14. **Rejects missing shield.**
    - Execute `{ entity_type: "state", entity: 1 }`.
    - Error exactly `"shield must be a non-empty string."`.
    - Body has `supported: [...CULTURE_SHIELDS]`.
    - `find` and `apply` NOT called.

15. **Rejects empty / whitespace shield.**
    - For `["", "   "]`, same error.

16. **Rejects non-string shield.**
    - For `[42, null, true, []]`, same error.

17. **Rejects unknown shield with the recognized list in the message.**
    - Execute `{ entity_type: "state", entity: 1, shield: "notashape" }`.
    - Error matches
      `/^Unknown shield 'notashape'\. Valid shields: .+/` and
      contains `"heater"`, `"swiss"`, `"oval"` somewhere in the list.
    - Body has `supported: [...CULTURE_SHIELDS]`.
    - `find` and `apply` NOT called (validation runs before lookup).

18. **Canonicalises shield case-insensitively.**
    - For `["HEATER", "Heater", "heater", "  heater  "]`, `apply` is
      called with `"heater"`.

19. **Surfaces apply errors.**
    - Runtime `apply` throws `new Error("write blocked")`.
    - Body error matches `/write blocked/`.

20. **Validation order: entity_type before entity before shield.**
    - Execute `{}` → `entity_type` error.
    - Execute `{ entity_type: "state" }` → entity error.
    - Execute `{ entity_type: "state", entity: 1 }` → shield error.

21. **Tolerates null / undefined / extraneous input properties.**
    - `tool.execute(null)` and `tool.execute(undefined)` both return
      the entity_type error.
    - `tool.execute({ entity_type: "state", entity: 1, shield: "heater",
      bogus: "x" })` ok.

22. **Tool name + schema + registry round-trip.**
    - `expect(setEmblemShieldTool.name).toBe("set_emblem_shield")`.
    - `expect(setEmblemShieldTool.input_schema.type).toBe("object")`.
    - `expect(setEmblemShieldTool.input_schema.required).toEqual(
        ["entity_type", "entity", "shield"])`.
    - Properties has `entity_type`, `entity`, `shield`.
    - Build a fresh `ToolRegistry`, register, assert
      `reg.list().map(t => t.name).includes("set_emblem_shield")`.

23. **previous_shield captured BEFORE mutation (LOAD-BEARING).**
    - This test pins down ordering even at the unit-test level: `find`
      returns `{ i: 7, name: "Valoria", previousShield: "heater" }`
      and `apply` mutates a stub object. The body MUST report
      `previous_shield: "heater"` (the value `find` returned), not
      whatever mutation `apply` performed. Implemented by reading
      `current.previousShield` into the result before calling apply.

### `defaultEmblemShieldRuntime (integration)`

Save/restore `globalThis.pack`, `globalThis.COArenderer`, and
`globalThis.document` per test, in the
`set-culture-shield.test.ts` / `regenerate-burg-coa.test.ts` style.

24. **End-to-end: state — sets coa.shield, removes DOM node, triggers
    renderer.**
    - Pack with `states[3] = { i:3, name:"Valoria", coa: {t1:"or",
      shield:"heater", size: 1.2} }`.
    - Stub `globalThis.COArenderer = { trigger: vi.fn() }` and
      `globalThis.document = { getElementById: vi.fn(id => id ===
      "stateCOA3" ? { remove: vi.fn() } : null) }`.
    - Execute `setEmblemShieldTool.execute({ entity_type: "state",
      entity: 3, shield: "oval" })`.
    - `pack.states[3].coa.shield === "oval"`.
    - `pack.states[3].coa.t1 === "or"` (preserved).
    - `pack.states[3].coa.size === 1.2` (preserved).
    - `document.getElementById` called with `"stateCOA3"`; the returned
      element's `.remove()` was called.
    - `COArenderer.trigger` called with `("stateCOA3", state.coa)`.
    - Body has `previous_shield: "heater"`, `shield: "oval"`.

25. **End-to-end: province — sets coa.shield with id "provinceCOA{i}".**
    - Pack with `provinces[7] = { i:7, name:"North Mark", coa:{t1:"azure",
      shield:"swiss"} }`. Execute with `entity_type: "province",
      entity: 7, shield: "noldor"`. Asserts:
      `pack.provinces[7].coa.shield === "noldor"`,
      `document.getElementById` called with `"provinceCOA7"`,
      `COArenderer.trigger` called with `("provinceCOA7", coa)`.

26. **End-to-end: burg — sets coa.shield with id "burgCOA{i}".**
    - Pack with `burgs[5] = { i:5, name:"Rookhold", coa:{t1:"sable",
      shield:"swiss"} }`. Execute with `entity_type: "burg", entity: 5,
      shield: "fantasy1"`. Asserts:
      `pack.burgs[5].coa.shield === "fantasy1"`,
      `document.getElementById` called with `"burgCOA5"`,
      `COArenderer.trigger` called with `("burgCOA5", coa)`.

27. **Initialises coa when missing.**
    - Pack with `burgs[5] = { i:5, name:"Rookhold" }` (no coa field).
    - Execute `{ entity_type: "burg", entity: 5, shield: "heater" }`.
    - `pack.burgs[5].coa` is now `{ shield: "heater" }`.
    - Body has `previous_shield: null`.

28. **Preserves other coa fields when only shield is set
    (LOAD-BEARING).**
    - Pack with `burgs[5] = { i:5, name:"Rookhold", coa:{t1:"sable",
      t2:"or", charges:[{type:"lion"}], size: 1.2, shield:"swiss",
      custom:true} }`.
    - Execute `{ entity_type: "burg", entity: 5, shield: "heater" }`.
    - Asserts the resulting coa object has:
      - `shield === "heater"` (mutated),
      - `t1 === "sable"`, `t2 === "or"` (preserved),
      - `charges` is the same array reference (preserved),
      - `size === 1.2` (preserved),
      - `custom === true` (preserved).
    - This pins down that the implementation does
      `entity.coa.shield = shield` rather than
      `entity.coa = { shield }`.

29. **previous_shield captured BEFORE mutation (LOAD-BEARING,
    integration).**
    - Same fixture as test 24. Body MUST report
      `previous_shield: "heater"` (the value before mutation), even
      though after the call `pack.states[3].coa.shield === "oval"`.

30. **Resolves entity by case-insensitive name (integration).**
    - Pack with `burgs[5] = { i:5, name:"Rookhold", coa:{shield:"swiss"} }`.
    - Execute `{ entity_type: "burg", entity: "rookhold",
      shield: "heater" }`. ok.

31. **Rejects entity 0 (integration).**
    - Pack with `states[0] = {i:0, name:"Neutrals"}, states[3] = {i:3,
      name:"X", coa:{shield:"heater"}}`.
    - Execute `{ entity_type: "state", entity: 0, shield: "heater" }`.
    - Errors via parseEntityRef.

32. **Rejects removed entities (integration).**
    - Pack with `burgs[5] = { i:5, name:"Rookhold", removed:true,
      coa:{shield:"swiss"} }`.
    - Execute `{ entity_type: "burg", entity: 5, shield: "heater" }`.
    - Error exactly `"Burg 5 not found."` (since `findEntityByRef`
      treats removed as not-present).
    - `COArenderer.trigger` NOT called.

33. **Errors when pack is missing.**
    - `globalThis.pack = undefined`.
    - Execute `{ entity_type: "state", entity: 3, shield: "heater" }`.
    - Error matches `/State 3 not found/` (find returns null because
      `getPackCollection` returns undefined).

34. **Errors when collection is missing.**
    - `globalThis.pack = {}` (no `states`).
    - Execute `{ entity_type: "state", entity: 3, shield: "heater" }`.
    - Error matches `/State 3 not found/`.

35. **COArenderer.trigger missing — succeeds (best-effort).**
    - `globalThis.COArenderer = undefined`.
    - Execute `{ entity_type: "state", entity: 3, shield: "oval" }`.
    - `result.isError` falsy. `pack.states[3].coa.shield === "oval"`.

36. **COArenderer.trigger throws — succeeds (best-effort).**
    - `globalThis.COArenderer = { trigger: vi.fn(() => { throw new
      Error("renderer down"); }) }`.
    - Execute `{ entity_type: "state", entity: 3, shield: "oval" }`.
    - `result.isError` falsy. `pack.states[3].coa.shield === "oval"`.

37. **Document missing — succeeds (best-effort).**
    - `globalThis.document = undefined`.
    - `globalThis.COArenderer = { trigger: vi.fn() }`.
    - Execute `{ entity_type: "state", entity: 3, shield: "oval" }`.
    - `result.isError` falsy. `pack.states[3].coa.shield === "oval"`.
    - `COArenderer.trigger` still called (DOM removal is independent).

38. **Document.getElementById returns null — no remove call, no
    error.**
    - `getElementById` returns `null` for everything.
    - Execute happy path.
    - `result.isError` falsy. `COArenderer.trigger` still called.

39. **Registry round-trip end-to-end.**
    - Set up the integration globals as test 24.
    - `registry.run("set_emblem_shield", { entity_type: "state",
      entity: 3, shield: "oval" })` — body has `ok: true`,
      `shield: "oval"`.

## Verification

- `npm test` — all green (existing tests + new tool tests).
- `npx tsc --noEmit` — clean.
- `npm run lint 2>&1 | tail -10` — still **0 errors, 0 warnings,
  0 info**. Baseline must hold.

## Self-review (added during step 5)

Reviewed the plan + tasks against the use case and the prompt's
mandatory checks:

- **All three entity types are tested individually.** Test §1
  (state by id), §2 (province by id), §3 (burg by id), §4 (burg by
  name), §24 (state integration), §25 (province integration), §26
  (burg integration), §27 (burg, no coa initially), §28 (burg, coa
  with extra fields), §13 (error message uses correct title-case for
  each type). All three types have explicit happy-path coverage at
  both the unit and integration level.
- **Missing entity.coa initialization is tested.** Test §27 covers
  the case where the entity has no `coa` field at all (a legitimate
  state for neutral burgs). Asserts `coa` ends up as
  `{ shield: "heater" }` and `previous_shield` is `null`. The
  implementation must do `entity.coa = entity.coa ?? {}` before
  setting `coa.shield`.
- **Other coa fields preserved when only shield is set.** Test §28
  is LOAD-BEARING — sets up a coa with `t1`, `t2`, `charges` (an
  array), `size`, `shield`, `custom`, runs the tool, then asserts
  every other field is preserved with reference equality on `charges`.
  This pins down that the implementation mutates `coa.shield` rather
  than reassigning the whole `coa` object.
- **previous_shield captured BEFORE mutation.** Tests §23 (unit) and
  §29 (integration) both pin this down. The implementation must
  read `current.previousShield` (the value `find` captured) into the
  result BEFORE calling `apply`. If the implementation accidentally
  read `entity.coa.shield` after `apply`, both tests would fail.
- **Validation order pinned (§20).** Even though all three fields
  are required, the order of error reporting matters for AI UX: the
  first missing/invalid field reports first. Test §20 pins
  entity_type → entity → shield order.
- **Best-effort DOM/renderer calls cannot block (§35-§38).** Four
  separate tests cover: renderer missing, renderer throws, document
  missing, getElementById returns null. All four assert
  `result.isError` is falsy AND that the underlying `coa.shield`
  mutation still went through.

## Corrections (added during step 5 review)

Re-read both files. No structural corrections needed — the plan
covers all four mandatory checks with explicit tests. Two
clarifications added during review:

- **Validation order test (§20) added** to pin down the
  entity_type → entity → shield order. Without it, a future refactor
  could silently change which field reports first when multiple are
  missing.
- **Test §28's reference-equality assertion on `charges`** added
  explicitly — this rules out any "spread the old coa into a new
  object" implementation that would pass field-equality checks but
  break consumers that rely on coa subobject identity.
