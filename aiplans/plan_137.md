# Plan 137 — Use Case: Toggle the custom/lock flag on a province's coat of arms

## Status

Iteration 137. Baseline 7 warnings / 1 info / 0 errors. 1725 tests pass
(148 files). Plan 135 (`set_burg_coa_custom`) shipped the burg-level
counterpart; plan 136 targets the state-level counterpart
(`set_state_coa_custom`). This plan adds the province-level parallel.

The Emblem Editor writes `coa.custom = true` on the underlying entity
when a user uploads a hand-crafted emblem, and downstream code checks
`coa.custom` to decide whether to skip the emblem:

- `regenerate_emblems` / `regenerate_province_coa` parent resolution —
  when the province's parent state has `coa.custom`, the parent coa is
  treated as opaque (`null` kinship) so the custom emblem isn't mixed
  in. See `src/ai/tools/regenerate-province-coa.ts:90` (`parent && !parent.coa?.custom ? (parent.coa ?? null) : null`).
- `src/modules/emblem/renderer.ts` — `if (coa.custom) return console.warn("Cannot render custom emblem", coa);`
- `public/modules/ui/emblems-editor.js` — "Open in Armoria" refuses a
  custom emblem.

Without this tool the AI cannot protect a hand-crafted province emblem
before running `regenerate_emblems` or `regenerate_province_coa`.

## Use Case

**"Lock the hand-crafted emblem for the Duchy of Rookwood so it
survives the next Regenerate Emblems."**

Field confirmed as `province.coa.custom` (boolean-ish; truthy means
locked). Parallels `set_burg_coa_custom` exactly — the Emblem Editor
treats burg / state / province the same way (`custom: true` on upload,
replaced entirely by `COA.generate(...)` on Regenerate).

For the AI tool we model it as a simple boolean toggle on an existing
emblem:
- `custom: true` → set `province.coa.custom = true` (write; no other
  fields touched).
- `custom: false` → `delete province.coa.custom` (match the
  "absent === not custom" convention everywhere else in the codebase
  — searching for `coa.custom` shows truthy checks, never `=== false`).

Requires an existing `province.coa`. Refuses province 0 (placeholder)
and removed / `lock: true` provinces (parity with
`regenerate_province_coa`).

Prompts:
- *"Lock the emblem on the Duchy of Rookwood."*
- *"Protect the coat of arms for province 5 from regeneration."*
- *"Unlock province 12's emblem so it gets rerolled next time."*

### Success criteria

- `set_province_coa_custom` registered on the default registry.
- Accepts `province` (numeric id or `"province-5"` / case-insensitive
  name or fullName) — required.
- Accepts `custom` (boolean) — required. `true` writes
  `province.coa.custom = true`; `false` deletes the key.
- Rejects province 0, removed provinces, and provinces with `lock: true`.
- Rejects provinces that have no `province.coa`.
- Idempotent: returns `noop: true` when `custom` already matches the
  requested value (comparing by truthiness).
- Returns `{ ok, i, name, previousCustom, custom, noop }`.
- `npm run build` succeeds, `npm test` all pass, lint matches baseline
  (7 warnings / 1 info / 0 errors).

## Shape

```
src/ai/tools/
  set-province-coa-custom.ts        — new tool (runtime-seam pattern)
  set-province-coa-custom.test.ts   — unit + integration tests

src/ai/tools/_shared/pack-types.ts  — RawCoa already has `custom?: unknown`
                                       and RawProvince already has `coa?: RawCoa`
                                       (no change needed)
src/ai/index.ts                     — import + export + registry wire-up
README_AI.md                        — table row near `set_burg_coa_custom`
```

## Runtime seam

```ts
export interface SetProvinceCoaCustomRef {
  i: number;
  name: string;
  hasCoa: boolean;
  previousCustom: boolean;
}

export interface SetProvinceCoaCustomRuntime {
  find(ref: number | string): SetProvinceCoaCustomRef | null;
  apply(i: number, custom: boolean): void;
}
```

Default runtime:
- `find` uses `findEntityByRef(getPackCollection<RawProvince>("provinces"), ref)`.
  Returns `null` for: missing, `i <= 0`, `removed: true`, `lock: true`.
  Reports `hasCoa = !!entry.coa` and `previousCustom =
  !!entry.coa?.custom` so the tool can reject missing-coa without
  needing a second lookup.
- `apply(i, true)` — `province.coa.custom = true`.
- `apply(i, false)` — `delete province.coa.custom`.
- `apply` throws if the province or its coa disappeared between `find`
  and `apply` (defensive — the tool is synchronous so this is just a
  safety net).

No DOM side-effect is needed: `custom` is a data flag that only affects
future generate / render calls. The emblem SVG already on-screen stays
as-is.

## Skip reasons / error messages

- `"province must be provided"` — missing ref.
- `"custom must be a boolean."` — non-boolean value.
- `"No province found matching ..."` — find returned `null`.
- `"Province {i} has no coat of arms to lock. Generate one first via regenerate_province_coa."`
  — `hasCoa === false`.
- Province 0 / removed / locked are folded into the standard "No
  province found matching" via `find` returning null — matches
  `set_burg_coa_custom` semantics exactly.

## Tests

Unit (injected runtime) tests:
1. sets `custom: true` when not previously set; returns
   `previousCustom: false`, `custom: true`, `noop: false`.
2. clears `custom` when previously true; returns
   `previousCustom: true`, `custom: false`, `noop: false`.
3. idempotent: setting `custom: true` when already true returns
   `noop: true` and does NOT call `apply`.
4. idempotent: setting `custom: false` when already absent returns
   `noop: true` and does NOT call `apply`.
5. resolves by numeric id.
6. resolves by case-insensitive name.
7. rejects unknown province (find returns null).
8. rejects province with no coa (hasCoa: false).
9. rejects invalid refs (`null`, `undefined`, `0`, `-1`, `1.5`, `""`).
10. rejects non-boolean `custom` (`"true"`, `1`, `null`, `undefined`).
11. surfaces `apply` errors.

Integration block with `defaultSetProvinceCoaCustomRuntime` via
`setProvinceCoaCustomTool.execute(...)`:
- Sets `pack.provinces[5].coa.custom = true` when the province has a coa.
- Deletes the `custom` key when called with `false`.
- Returns noop when already custom.
- Rejects province 0.
- Rejects locked (`province.lock = true`) provinces.
- Rejects removed (`province.removed = true`) provinces.
- Rejects provinces without a coa.
- Rejects when pack is missing.
