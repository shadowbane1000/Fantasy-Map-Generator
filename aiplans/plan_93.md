# Plan 93 — set_burg_group AI tool

## Use case

The Burg Editor's Group dropdown
(`public/modules/ui/burg-editor.js:129`) calls
`Burgs.changeGroup(burg, value)` which:

1. Writes `burg.group = group`.
2. Calls `drawBurgIcon(burg)` + `drawBurgLabel(burg)` so
   the on-map icon / label reparent under the new group
   container (each burg-group has its own
   `<g id="{groupName}">` under `#burgIcons` /
   `#burgLabels` — that's why the SVG needs redrawing).

The group list is stored in `Burgs.groups` (loaded from
localStorage or `Burgs.getDefaultGroups()`) with entries
like `capital`, `city`, `fort`, `monastery`,
`caravanserai`, etc. The user picks one via the dropdown.

The AI chat can set a burg's culture, type, population,
port, feature flags, and name — but not its group.

## Scope

Add one tool: `set_burg_group(burg, group)`.

- `burg` — id (> 0) or case-insensitive name.
- `group` — required non-empty string; must match an
  existing group name in `Burgs.groups`. Case-insensitive
  match, canonicalized to the stored casing.
- Delegates to `Burgs.changeGroup(burg, group)` which
  performs the data write + SVG redraw.
- Idempotent: noop when `burg.group === group`.
- Rejects burg 0 and removed burgs.

## Implementation

1. **New file `src/ai/tools/set-burg-group.ts`**:
   - Imports: errorResult, findEntityByRef, getGlobal,
     getPackCollection, okResult, parseEntityRef,
     type RawBurg from `./_shared`.
   - `BurgGroupRef { i, name, previousGroup }`.
   - `BurgGroupRuntime { find, listGroups, apply }`.
   - `defaultBurgGroupRuntime`:
     - find: findEntityByRef on burgs; guard i > 0 and
       !removed.
     - listGroups: read `window.Burgs.groups` (array of
       `{name: string}`); returns string[] names, empty
       if not available.
     - apply(ref, group): call
       `window.Burgs.changeGroup(burg, group)` — delegates
       to the module so we get the SVG redraw for free.
   - Schema: `burg` (int|string required), `group`
     (string required).
   - Validation:
     - parseEntityRef(burg).
     - group must be non-empty string.
     - If listGroups() returns a non-empty list, group
       must match (case-insensitive); canonicalize.
     - If listGroups() returns empty (Burgs module not
       ready), skip validation and pass through — log a
       warning in the response.
   - Noop when previousGroup === canonicalGroup.

2. **Register** in `src/ai/index.ts`.

3. **Tests** `set-burg-group.test.ts`:
   - Unit (stubbed):
     - sets by numeric id
     - resolves by case-insensitive name
     - canonicalizes lowercase group input
     - rejects unknown group
     - rejects empty / non-string group
     - rejects invalid burg refs
     - rejects unknown burg
     - noop when already at target
     - surfaces runtime errors
   - Integration:
     - stubs `globalThis.pack.burgs`, `globalThis.Burgs
       = { groups: [...], changeGroup: vi.fn() }`.
     - apply delegates to Burgs.changeGroup with the
       resolved burg object and canonical group.
     - rejects group not in Burgs.groups list.
     - rejects removed burg.

4. **README_AI.md** — row near `set_burg_type`.

## Verification

- `npm test -- --run src/ai/tools/set-burg-group` green.
- `npm test -- --run` — 1147 before.
- `npm run lint` — 7 / 1.
- `npm run build` succeeds.

## Success criteria

- Tool callable, wired, documented.
- Delegates to Burgs.changeGroup for SVG + data.
- Validates group against live Burgs.groups when
  available.
- Idempotent.
