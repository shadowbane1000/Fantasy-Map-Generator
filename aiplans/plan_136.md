# Plan 136 — Use Case: Toggle the custom/lock flag on a state's coat of arms

## Status

Iteration 136. Baseline 7 warnings / 1 info / 0 errors. Plan 135 just
landed `set_burg_coa_custom`; this plan adds the state-level parallel.
The Emblem Editor applies the same upload-sets-`custom: true`
convention to state emblems (see `public/modules/ui/emblems-editor.js`
upload handler), and the same truthy check governs whether
`regenerate_emblems`, `regenerate_state_coa`, or any culture-wide
heraldry changes touch `state.coa`:

- `src/modules/emblem/renderer.ts` — `if (coa.custom) return console.warn("Cannot render custom emblem", coa);`
- Bulk regenerators skip any emblem where `coa.custom` is truthy.

So the semantics mirror burgs exactly. Without a tool, the AI cannot
protect a hand-crafted state emblem before running a regenerate.

## Use Case

**"Lock the hand-crafted emblem for the Kingdom of Altaria so it
survives the next Regenerate Emblems."**

The field is confirmed as `state.coa.custom` (same `RawCoa.custom?:
unknown` shape shared with burgs / provinces in
`src/ai/tools/_shared/pack-types.ts:15`).

For the AI tool we model it as a simple boolean toggle on an existing
emblem (parity with `set_burg_coa_custom`):
- `custom: true` → set `state.coa.custom = true` (write; no other
  fields touched).
- `custom: false` → `delete state.coa.custom` (match the "absent ===
  not custom" convention everywhere else in the codebase).

Requires an existing `state.coa` — you can't lock an emblem that isn't
there yet. Refuses state 0 (Neutrals), removed states, and
`lock: true` states (parity with `regenerate_state_coa`).

Prompts:
- *"Lock the emblem for Altaria."*
- *"Protect state 3's coat of arms from regeneration."*
- *"Unlock state 7's emblem so it gets rerolled next time."*

### Success criteria

- `set_state_coa_custom` registered on the default registry.
- Accepts `state` (numeric id or `"state-3"` / case-insensitive name) —
  required.
- Accepts `custom` (boolean) — required. `true` writes
  `state.coa.custom = true`; `false` deletes the key.
- Rejects state 0 (Neutrals), removed states, and `lock: true` states.
- Rejects states that have no `state.coa` (nothing to lock).
- Idempotent: returns `noop: true` when `custom` already matches the
  requested value (comparing by truthiness).
- Returns `{ ok, i, name, previousCustom, custom, noop }`.
- `npm run build` succeeds, `npm test` all pass, lint matches baseline
  (7 warnings / 1 info / 0 errors).

## Shape

```
src/ai/tools/
  set-state-coa-custom.ts        — new tool (runtime-seam pattern)
  set-state-coa-custom.test.ts   — unit + integration tests

src/ai/tools/_shared/pack-types.ts — RawCoa.custom already exists
                                      (no change needed)
src/ai/index.ts                    — import + export + registry wire-up
README_AI.md                       — table row near `set_burg_coa_custom`
```

## Runtime seam

```ts
export interface SetStateCoaCustomRef {
  i: number;
  name: string;
  hasCoa: boolean;
  previousCustom: boolean;
}

export interface SetStateCoaCustomRuntime {
  find(ref: number | string): SetStateCoaCustomRef | null;
  apply(i: number, custom: boolean): void;
}
```

Default runtime:
- `find` uses `findEntityByRef(getPackCollection<RawState>("states"), ref)`.
  Returns `null` for: missing, `i <= 0`, `removed: true`, `lock: true`.
  Reports `hasCoa = !!entry.coa` and `previousCustom =
  !!entry.coa?.custom` so the tool can reject missing-coa without
  needing a second lookup.
- `apply(i, true)` — `state.coa.custom = true`.
- `apply(i, false)` — `delete state.coa.custom`.
- `apply` throws if the state or its coa disappeared between `find` and
  `apply` (defensive safety net — tool is synchronous so unlikely).

No DOM side-effect is needed: `custom` is a data flag that only affects
future generate / render calls. The emblem SVG already on-screen stays
as-is.

## Skip reasons / error messages

- `"state must be provided"` — missing ref.
- `"custom must be a boolean"` — non-boolean value.
- `"No state found matching ..."` — find returned `null` (covers
  unknown, Neutrals 0, removed, locked — same pattern as
  `regenerate_state_coa`).
- `"State {i} has no coat of arms to lock. Generate one first via regenerate_state_coa."`
  — `hasCoa === false`.
- Also catches numeric `state <= 0` pre-runtime with the explicit
  Neutrals message, matching `rename_state` and `regenerate_state_coa`.

## Tests

Unit (injected runtime) tests:
1. sets `custom: true` when not previously set; returns
   `previousCustom: false`, `custom: true`, `noop: false`.
2. clears `custom` when previously true; returns `previousCustom: true`,
   `custom: false`, `noop: false`.
3. idempotent: setting `custom: true` when already true returns
   `noop: true` and does NOT call `apply`.
4. idempotent: setting `custom: false` when already absent returns
   `noop: true` and does NOT call `apply`.
5. resolves by numeric id.
6. resolves by case-insensitive name.
7. rejects unknown state (find returns null).
8. rejects state with no coa (hasCoa: false).
9. rejects invalid refs (`null`, `undefined`, `0`, `-1`, `1.5`, `""`).
10. rejects non-boolean `custom` (`"true"`, `1`, `null`, `undefined`).
11. surfaces `apply` errors.
12. rejects explicit numeric `state: 0` with a Neutrals-specific message.

Integration block with `defaultSetStateCoaCustomRuntime` via
`setStateCoaCustomTool.execute(...)`:
- Sets `pack.states[3].coa.custom = true` when the state has a coa.
- Deletes the `custom` key when called with `false`.
- Returns noop when already custom.
- Rejects state 0 (Neutrals).
- Rejects locked (`state.lock = true`) states.
- Rejects removed (`state.removed = true`) states.
- Rejects when the state has no `coa` at all.
- Rejects when pack is missing.
