# Plan 98 — set_regiment_icon AI tool

## Use case

The Regiment Editor's emblem button
(`public/modules/ui/regiment-editor.js:156`) opens an icon
picker. Selecting a glyph / URL runs `changeEmblem`,
which writes `regiment.icon = value` and updates the
regiment's inline SVG (the `.regimentIcon` text node and
the `.regimentImage` href).

The AI chat has `rename_regiment`, `remove_regiment`,
`set_regiment_unit`, `set_regiment_naval`, `list_regiments`
— but no way to change a regiment's icon.

## Scope

Add one tool: `set_regiment_icon(state, regiment, icon)`.

- `state` — owning state (id ≥ 0 including Neutrals 0) or
  case-insensitive name/fullName. Matches the pattern
  used by the other regiment tools.
- `regiment` — regiment id (per-state) or case-insensitive
  current name within that state.
- `icon` — non-empty trimmed string (emoji or URL).
- Writes `regiment.icon = trimmed`.
- Best-effort `drawMilitary()` refresh (same strategy as
  `set_regiment_naval`).
- Idempotent: noop when already at target.

## Implementation

1. **New file `src/ai/tools/set-regiment-icon.ts`**:
   - Imports: errorResult, getGlobal, getPack, isActive,
     okResult, type RawRegiment from `./_shared`;
     BurgPackLike + resolveStateRefInPack from
     `./list-burgs`; findRegimentByRef from
     `./rename-regiment`.
   - `RegimentIconRef { stateId, stateName, i, name,
      previousIcon }`.
   - `RegimentIconRuntime { find, apply }`.
   - `apply(stateId, i, icon)`:
     - Look up state + regiment; throw if either missing.
     - Write `regiment.icon = icon`.
     - Best-effort `drawMilitary()`.
   - Schema: `state` (int|string required), `regiment`
     (int|string required), `icon` (string required).

2. **Register** in `src/ai/index.ts`.

3. **Tests** `set-regiment-icon.test.ts`:
   - Unit (stubbed):
     - sets by numeric ids
     - resolves by case-insensitive state + regiment
       names
     - trims icon input
     - rejects empty / non-string icon
     - rejects invalid refs
     - rejects unknown regiment
     - noop when unchanged
     - surfaces runtime errors
   - Integration:
     - stubs pack.states[*].military + drawMilitary.
     - writes icon on target regiment; drawMilitary
       called once.
     - succeeds when drawMilitary missing.

4. **README_AI.md** — row near `set_regiment_naval`.

## Verification

- `npm test -- --run src/ai/tools/set-regiment-icon`
  green.
- `npm test -- --run` — 1215 before.
- `npm run lint` — 7 / 1.
- `npm run build` — succeeds.

## Success criteria

- Tool callable, wired, documented.
- Writes regiment.icon; best-effort drawMilitary.
- Same (state, regiment) two-part ref as other
  regiment tools.
- Idempotent.
