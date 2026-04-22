# Plan 52 — remove_regiment AI tool

## Use case

The Regiment Editor's "Remove" button (`removeRegiment` at
`public/modules/ui/regiment-editor.js:392`) deletes a regiment: it
splices it out of `pack.states[stateId].military`, drops the matching
note from `window.notes`, and removes the `#regiment{stateId}-{i}`
SVG element. Users do this to disband a regiment entirely (vs
transferring, merging, or weakening it).

The chat has `list_regiments` (plan 50) and `rename_regiment`
(plan 51) but no way to delete a regiment. The UI's confirmation
dialog is skipped for tools (non-interactive, matching how
`remove_zone` / `remove_burg` handle this).

## Scope

Add one tool: `remove_regiment(state, regiment)`. Two-part ref
identical to `rename_regiment`. Side-effects:
- Splice out of `state.military` by matching `regiment.i`.
- Splice the note whose `id === "regiment{stateId}-{i}"` out of
  `window.notes`.
- Remove the `#regiment{stateId}-{i}` SVG element.

No drawMilitary / overview refresh necessary — the UI only refreshes
when open; removing the DOM element takes care of the live map, and
the next time the Regiments Overview renders it'll reflect the
filtered `military[]`.

## Implementation

1. **New file `src/ai/tools/remove-regiment.ts`**, modelled on
   `remove-zone.ts` + `rename-regiment.ts`:
   - Imports: `errorResult`, `getNotes`, `getPack`, `isActive`,
     `okResult`, `type RawNote` from `_shared`; `BurgPackLike` +
     `resolveStateRefInPack` from `./list-burgs`;
     `findRegimentByRef` from `./rename-regiment`.
   - `RemoveRegimentRef { stateId, stateName, i, name }`.
   - `RegimentRemovalRuntime { find(stateRef, regRef), remove(stateId,
     i) }`.
   - `defaultRegimentRemovalRuntime.find`: resolve state →
     findRegimentByRef → return `{ stateId, stateName, i, name }`.
   - `defaultRegimentRemovalRuntime.remove(stateId, i)`:
     - Get state; throw if missing / inactive.
     - Get military; find index of regiment with matching `i`;
       throw if missing; splice.
     - Get notes; find index of note with
       `id === "regiment" + stateId + "-" + i`; splice if found.
     - If `document` available:
       `document.getElementById("regiment" + stateId + "-" + i)?.remove()`.
   - Tool schema: `state` (int|string required), `regiment`
     (int|string required).

2. **Register** in `src/ai/index.ts`: import, barrel, register.

3. **Tests `src/ai/tools/remove-regiment.test.ts`**:
   - Runtime-injected: remove by (state id, regiment id); remove by
     (state name, regiment name); unknown state; unknown regiment;
     invalid refs; surface runtime failures.
   - Default-runtime integration:
     - Stub pack with a state carrying two regiments.
     - Stub notes with a matching note entry.
     - Stub document with a fake SVG element exposing `remove` spy.
     - Remove regiment 2 → `military` length drops by one, the other
       regiment (i=0) remains, note is gone, SVG `remove` called.
     - Soft failures: no SVG element → still succeeds; no matching
       note → still succeeds.

4. **README_AI.md** — row under `rename_regiment`.

## Verification

- `npm test -- --run src/ai/tools/remove-regiment` green.
- `npm test -- --run` — full suite green (642 before).
- `npm run lint` — 7/1 baseline intact (mind unused-import /
  optional-chain).
- `npm run build` succeeds.

## Success criteria

- Tool registered and callable.
- AI can say "disband Rookhold's fleet" / "remove regiment 2 from
  Ashholm" and the regiment disappears from the map, note list, and
  state.military identically to a user clicking Remove in the editor.
- Two-part ref handles non-globally-unique regiment ids (same
  contract as rename_regiment).
