# Plan 66 — set_regiment_unit AI tool

## Use case

The Regiment Editor (`public/modules/ui/regiment-editor.js:168
changeUnit`) lets the user set how many of each unit type a
regiment has (Swordsmen, Archers, Cavalry, Sailors, etc.). Writing
`regiment.u[unitName] = value` is the core of military balancing —
the AI can list regiments and see each regiment's composition via
`list_regiments`, but can't actually change it.

## Scope

Add one tool: `set_regiment_unit(state, regiment, unit, count)`.

- `state` required — id or case-insensitive name/fullName (resolved
  via `resolveStateRefInPack`).
- `regiment` required — id or case-insensitive name within that
  state (via `findRegimentByRef`).
- `unit` required non-empty string — unit name key. Free-form;
  matches the editor's keys (doesn't enforce that the unit exists
  in `options.military` — the regiment may have legacy units from
  an earlier generation).
- `count` required non-negative integer.

Side-effects matching the UI's `changeUnit`:
1. `regiment.u[unit] = count`.
2. Recompute `regiment.a = sum(Object.values(regiment.u))`.
3. Update the regiment's SVG `<text>` to `Military.getTotal(regiment)`
   (best-effort — requires the Military global).

Changing `reg.t` — the "total troops" — is what `Military.getTotal`
returns. Let me verify: `getTotal(r)` in the generator computes
crew-weighted total. Updating `reg.a` captures the raw unit sum;
`reg.t` we'll leave alone (the UI doesn't update it either —
`reg.t` is static from generation, and `getTotal` recomputes from
`u` on demand).

## Implementation

1. **New file `src/ai/tools/set-regiment-unit.ts`**:
   - Imports: `errorResult`, `getGlobal`, `getPack`, `isActive`,
     `okResult`.
   - Reuse `BurgPackLike`, `resolveStateRefInPack` from
     `./list-burgs`; `findRegimentByRef` from `./rename-regiment`.
   - `RegimentUnitRef { stateId, stateName, i, name,
     previousCount }`.
   - `RegimentUnitRuntime { find, apply }`.
   - `defaultRegimentUnitRuntime.find(stateRef, regRef, unit)`:
     resolve state + regiment, return previousCount =
     `regiment.u?.[unit] ?? 0`.
   - `defaultRegimentUnitRuntime.apply(stateId, i, unit, count)`:
     - Look up state + regiment.
     - Ensure `regiment.u` exists (object); set
       `regiment.u[unit] = count`.
     - Recompute `regiment.a = Object.values(regiment.u).reduce(
       (s, v) => s + (typeof v === "number" ? v : 0), 0)`.
     - Best-effort: update the SVG text for the regiment.
       `document.getElementById("regiment{stateId}-{i}")?.querySelector
       ("text")` → set `textContent` to a recomputed total. If
       `Military.getTotal` exists, use it; otherwise just use
       `regiment.a`.
   - Tool schema: state (int|string), regiment (int|string),
     unit (string), count (integer ≥ 0).

2. **Register** in `src/ai/index.ts`.

3. **Tests**:
   - Runtime-injected:
     - Sets count for existing unit key.
     - Creates a new unit key if not present.
     - Rejects invalid state/regiment/unit refs.
     - Rejects negative / non-integer count.
     - Surface runtime errors.
   - Default-runtime integration:
     - Stub pack with a state + regiment with `u: { Swordsmen: 100,
       Archers: 50 }`.
     - Apply `Swordsmen: 200` → `regiment.u.Swordsmen === 200`,
       `regiment.a === 250`.
     - Apply a new unit `Cavalry: 50` → `regiment.u.Cavalry === 50`,
       `regiment.a === 200` (100 + 50 + 50).
     - Apply `0` to remove... wait, UI sets to 0, doesn't delete.
       We'll mirror that: 0 count stays as a key with value 0.
     - Stub `globalThis.Military` with `getTotal: vi.fn(() => 350)`
       and verify the text element gets the return value.
     - When Military is absent, text still updates to regiment.a.

4. **README_AI.md** — row near `rename_regiment`.

## Verification

- `npm test -- --run src/ai/tools/set-regiment-unit` green.
- `npm test -- --run` — 809 before.
- `npm run lint` — 7/1.
- `npm run build` succeeds.

## Success criteria

- AI can say "give the Royal Guard 200 more Swordsmen" (user
  provides the delta after reading `list_regiments`) or "set
  Rookhold's 1st Army archers to 500" and the regiment's
  composition + army total reflect it.
- Adds unit keys that didn't exist (narrative additions).
- `regiment.a` (army sum) stays in sync with `regiment.u`.
- Matches the UI's field-editing flow.
