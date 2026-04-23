# Plan 135 — Use Case: Toggle the custom/lock flag on a burg's coat of arms

## Status

Iteration 135. Baseline 7 warnings / 1 info / 0 errors. 1691 tests pass
(146 files). The Emblem Editor lets a user upload a hand-crafted emblem;
when it does, it sets `burg.coa = {custom: true, ...}` (see
`public/modules/ui/emblems-editor.js:288-292`). Downstream code checks
`coa.custom` to decide whether to skip the emblem during bulk
regeneration:

- `src/ai/tools/set-culture-shield.ts` — `if (!burg.coa || burg.coa.custom) continue;`
- `src/ai/tools/regenerate-burg-coa.ts` — when resolving the heraldic
  parent, a parent with `coa.custom` is treated as opaque (no kinship).
- `src/modules/emblem/renderer.ts` — `if (coa.custom) return console.warn("Cannot render custom emblem", coa);`
- `public/modules/ui/emblems-editor.js:226` — "Open in Armoria"
  refuses a custom emblem.

So `custom: true` means "this emblem is user-provided, do not touch it".
Without a tool, the AI cannot protect a hand-crafted emblem before
running `regenerate_emblems`, `regenerate_burg_coa`, or a culture-wide
shield change.

## Use Case

**"Lock the hand-crafted emblem for Stormport so it survives the next
Regenerate Emblems."**

The field is confirmed as `burg.coa.custom` (boolean-ish; truthy value
means locked). The Emblem Editor:

- **Sets `custom: true`** when the user uploads a custom SVG / raster
  (lines 288-292). It also strips any generated heraldic fields,
  retaining only optional `size / x / y` alongside `custom: true`.
- **Clears `custom`** by replacing `el.coa` entirely with a fresh
  `COA.generate(...)` result (line 215) — i.e. the Regenerate button
  on the same editor. There is no dedicated "toggle custom flag"
  button in the editor; the field is an implicit side-effect of
  Upload vs. Regenerate.

For the AI tool we model it as a simple boolean toggle on an existing
emblem:
- `custom: true` → set `burg.coa.custom = true` (write; no other
  fields touched).
- `custom: false` → `delete burg.coa.custom` (match the "absent ===
  not custom" convention everywhere else in the codebase — searching
  for `coa.custom` shows truthy checks, never `=== false`).

Requires an existing `burg.coa` — you can't lock an emblem that isn't
there yet. Refuses burg 0 (placeholder) and removed / `lock: true`
burgs (parity with `regenerate_burg_coa`).

Prompts:
- *"Lock the emblem on Stormport."*
- *"Protect the coat of arms for burg 5 from regeneration."*
- *"Unlock burg 12's emblem so it gets rerolled next time."*

### Success criteria

- `set_burg_coa_custom` registered on the default registry.
- Accepts `burg` (numeric id or `"burg-5"` / case-insensitive name) —
  required.
- Accepts `custom` (boolean) — required. `true` writes
  `burg.coa.custom = true`; `false` deletes the key.
- Rejects burg 0, removed burgs, and burgs with `lock: true`.
- Rejects burgs that have no `burg.coa` (nothing to lock).
- Idempotent: returns `noop: true` when `custom` already matches the
  requested value (comparing by truthiness).
- Returns `{ ok, i, name, previousCustom, custom, noop }`.
- `npm run build` succeeds, `npm test` all pass, lint matches baseline
  (7 warnings / 1 info / 0 errors).

## Shape

```
src/ai/tools/
  set-burg-coa-custom.ts        — new tool (runtime-seam pattern)
  set-burg-coa-custom.test.ts   — unit + integration tests

src/ai/tools/_shared/pack-types.ts — RawCoa already has `custom?: unknown`
                                      (no change needed)
src/ai/index.ts                    — import + export + registry wire-up
README_AI.md                       — table row near `regenerate_burg_coa`
```

## Runtime seam

```ts
export interface SetBurgCoaCustomRef {
  i: number;
  name: string;
  hasCoa: boolean;
  previousCustom: boolean;
}

export interface SetBurgCoaCustomRuntime {
  find(ref: number | string): SetBurgCoaCustomRef | null;
  apply(i: number, custom: boolean): void;
}
```

Default runtime:
- `find` uses `findEntityByRef(getPackCollection<RawBurg>("burgs"), ref)`.
  Returns `null` for: missing, `i <= 0`, `removed: true`, `lock: true`.
  Reports `hasCoa = !!entry.coa` and `previousCustom =
  !!entry.coa?.custom` so the tool can reject missing-coa without
  needing a second lookup.
- `apply(i, true)` — `burg.coa.custom = true`.
- `apply(i, false)` — `delete burg.coa.custom`.
- `apply` throws if the burg or its coa disappeared between `find` and
  `apply` (defensive — the legacy editor model never reuses the coa
  reference across ticks, but the tool is synchronous so this is just
  a safety net).

No DOM side-effect is needed: `custom` is a data flag that only affects
future generate / render calls. The emblem SVG already on-screen (the
custom upload, or the generated art) stays as-is.

## Skip reasons / error messages

- `"burg must be provided"` — missing ref.
- `"custom must be a boolean"` — non-boolean value.
- `"No burg found matching ..."` — find returned `null`.
- `"Burg {i} has no coat of arms to lock. Generate one first via regenerate_burg_coa."`
  — `hasCoa === false`.
- `"Burg {i} is removed."` / `"Burg {i} is locked."` — handled by `find`
  returning null with an appropriate message-from-runtime pattern; we
  fold all three into the standard "No burg found matching" to match
  `regenerate_burg_coa` semantics exactly.

## Tests

Unit (injected runtime) tests:
1. sets `custom: true` when not previously set; returns `previousCustom: false`,
   `custom: true`, `noop: false`.
2. clears `custom` when previously true; returns `previousCustom: true`,
   `custom: false`, `noop: false`.
3. idempotent: setting `custom: true` when already true returns `noop: true`
   and does NOT call `apply`.
4. idempotent: setting `custom: false` when already absent returns `noop: true`
   and does NOT call `apply`.
5. resolves by numeric id.
6. resolves by case-insensitive name.
7. rejects unknown burg (find returns null).
8. rejects burg with no coa (hasCoa: false).
9. rejects invalid refs (`null`, `undefined`, `0`, `-1`, `1.5`, `""`).
10. rejects non-boolean `custom` (`"true"`, `1`, `null`, `undefined`).
11. surfaces `apply` errors.

Integration block with `defaultSetBurgCoaCustomRuntime` via
`setBurgCoaCustomTool.execute(...)`:
- Sets `pack.burgs[5].coa.custom = true` when the burg has a coa.
- Deletes the `custom` key when called with `false`.
- Rejects burg 0.
- Rejects locked (`burg.lock = true`) burgs.
- Rejects removed (`burg.removed = true`) burgs.
- Rejects when pack is missing.
- Rejects when the burg has no `coa` at all.
