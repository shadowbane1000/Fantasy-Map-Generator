# Plan 51 — rename_regiment AI tool

## Use case

The Regiment Editor (`public/modules/ui/regiment-editor.js:145
changeName`) writes `regiment.name = newName` and updates the SVG
`<g>` element's `data-name` attribute so map tooltips reflect the
change. The user renames regiments to match narrative (e.g. "1st
Rookhold Host" → "Ashguard Legion").

The chat has `list_regiments` (plan 50) so the AI can see regiment
ids + names + parent state, but cannot rename them.

## Scope

Add one tool: `rename_regiment(state, regiment, name)`.

Unlike other `rename_*` tools, regiment ids are **not globally
unique** — they start at array-index per state and may be
renumbered/reused after UI operations. So the ref takes a two-part
key: the owning `state` (id or case-insensitive name/fullName — same
contract as list_regiments' filter) plus the `regiment` ref (numeric
regiment.i or case-insensitive current regiment name within that
state).

Writes `regiment.name` and updates `#regiment{state-id}-{regiment-id}`
data-name attribute if present. Mirrors the UI closely — no redraw
is required beyond the attribute update because the name only shows
up in tooltips and the Regiments Overview re-renders on next open.

## Implementation

1. **New file `src/ai/tools/rename-regiment.ts`**:
   - Imports: `errorResult`, `getPack`, `okResult`, `parseEntityRef`,
     `isActive`, `findEntityByRef`, `RawRegiment`, `RawState` from
     `_shared`; `BurgPackLike` + `resolveStateRefInPack` from
     `./list-burgs`.
   - `RegimentRenameRef { stateId, stateName, i, name }`.
   - `RegimentRenameRuntime { find(stateRef, regRef), rename(stateId,
     i, name) }`.
   - `findRegimentByRef(military, ref)`:
     - Null if not an array.
     - Numeric ref: iterate; return first `r.i === ref` match.
     - String ref: trim + lowercase; match on `r.name?.toLowerCase()`.
     - Exported for reuse by future regiment tools.
   - `defaultRegimentRenameRuntime.find(stateRef, regRef)`:
     - Resolve state via `resolveStateRefInPack(getPack(), stateRef)`.
     - Return null if state id is null or state is missing /
       inactive.
     - Look up military via `pack.states[stateId].military` →
       `findRegimentByRef(military, regRef)` → return
       `{ stateId, stateName, i, name }` or null.
   - `rename(stateId, i, name)`:
     - Find the live state + regiment; throw if missing.
     - Write `regiment.name = name`.
     - If `document` available: find
       `document.getElementById("regiment" + stateId + "-" + i)` and
       set `data-name` attribute. (Check the actual SVG id pattern —
       verify with the UI code before hardcoding.)
   - Tool schema: `state` (int|string required), `regiment`
     (int|string required), `name` (string required non-empty).

2. **Verify the SVG id pattern**: inspect
   `public/modules/ui/regiment-editor.js` and
   `src/renderers/draw-military.ts` for the element id convention.
   Common pattern is `regiment${stateId}-${i}` based on how the
   editor looks up `elSelected.dataset.state` / `dataset.id`. If the
   id uses a hyphen vs underscore vs no separator, match it.

3. **Register** in `src/ai/index.ts`: import, barrel export,
   `registry.register(renameRegimentTool)` next to other rename*
   tools (after renameReligionTool).

4. **Tests `src/ai/tools/rename-regiment.test.ts`**:
   - Runtime-injected tests:
     - Rename by (state id, regiment id).
     - Rename by (state name, regiment name).
     - Trim surrounding whitespace on name.
     - Reject unknown state.
     - Reject unknown regiment (state valid).
     - Reject invalid `state`, `regiment`, `name` refs.
     - Rename to same name still calls runtime.rename.
     - Surface runtime failures.
   - Pack-logic tests for `findRegimentByRef`:
     - Null military.
     - Match by numeric i.
     - Case-insensitive name match; trim whitespace.
     - Return null for unknown.
   - Default-runtime integration test:
     - Stub `globalThis.pack.states` with military arrays.
     - Stub `globalThis.document` with a fake element for the
       regiment SVG node.
     - Call tool → assert `regiment.name` updated + setAttribute
       called with `data-name`.

5. **README_AI.md** — new row under `list_regiments`.

## Verification

- `npm test -- --run src/ai/tools/rename-regiment` green.
- `npm test -- --run` — full suite green (625 before).
- `npm run lint` — 7 / 1 baseline intact (watch for unused-import
  and optional-chain lint).
- `npm run build` succeeds.

## Success criteria

- Tool registered and callable.
- AI can say "rename Rookhold's largest army to Ashguard Legion" and
  — given the output from `list_regiments` — issue the right
  (state, regiment) pair to rename.
- Works with non-globally-unique regiment ids because refs are
  state-scoped.
