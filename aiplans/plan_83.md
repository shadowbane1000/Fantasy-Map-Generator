# Plan 83 — set_burg_port AI tool

## Use case

The Burg Editor's feature-row Port button, when clicked,
runs `togglePort(burgId)` in
`public/modules/ui/burg-editor.js:177`:

- If disabling: `burg.port = 0`, then
  `document.querySelector("#anchors [data-id='" + burgId + "']")
  ?.remove()`.
- If enabling:
  - `haven = pack.cells.haven[burg.cell]`;
  - `portFeature = haven ? pack.cells.f[haven] : -1`;
  - `burg.port = portFeature`;
  - Append a `<use href="#icon-anchor" id="anchor{i}"
    data-id="{i}" x="{burg.x}" y="{burg.y}"/>` into the
    `#anchors #<burg.group>` container (the seaside anchor
    glyph that labels a port on the map).

The AI chat can't currently toggle port status — this was
explicitly carved out of `set_burg_feature` because it
needs haven lookup + SVG manipulation. This tool fills
that gap.

## Scope

Add one tool: `set_burg_port(burg, enabled)`.

- `burg` — id (> 0) or case-insensitive name. Rejects
  burg 0 and removed burgs.
- `enabled` — boolean.
- On enable:
  - Look up haven feature; set `burg.port = haven ?
    pack.cells.f[haven] : -1`.
  - Append the anchor `<use>` element under
    `#anchors #<burg.group>`.
  - `-1` means "no haven" — matches UI behavior, which
    still sets port but warns via tip. The tool returns
    `{warning: "no haven"}` in that case (non-error; the
    UI doesn't error either).
- On disable:
  - Set `burg.port = 0`.
  - Remove `#anchor{i}` / `#anchors [data-id='{i}']`.
- Idempotent: noop when the port is already in the
  requested state (`enabled === !!burg.port`).
- Does NOT call drawBurgs / regenerate anything — matches
  the UI.

## Implementation

1. **New file `src/ai/tools/set-burg-port.ts`**:
   - Imports: `errorResult`, `findEntityByRef`,
     `getGlobal`, `getPack`, `getPackCollection`,
     `okResult`, `parseEntityRef`, type `RawBurg`.
   - `BurgPortRef { i, name, cell, x, y, group,
     previousEnabled }`.
   - `BurgPortRuntime { find, enable, disable }`.
   - `defaultBurgPortRuntime.find`: findEntityByRef on
     `burgs`, guard `i > 0` and `!removed`, then hydrate
     with the cell/x/y/group fields.
   - `defaultBurgPortRuntime.enable(ref)`:
     - Look up pack.cells.haven[burg.cell] (may be 0 /
       undefined → no haven).
     - `portFeature = haven ? pack.cells.f[haven] : -1`.
     - Write burg.port = portFeature.
     - Append SVG `<use>` (namespace
       "http://www.w3.org/2000/svg") to
       `document.getElementById("anchors")
        ?.querySelector("#" + burg.group)` with attrs
       `href=#icon-anchor`, `id=anchor{i}`,
       `data-id={i}`, `x={burg.x}`, `y={burg.y}`.
     - Return whether a haven was found (for the warning).
   - `defaultBurgPortRuntime.disable(i)`:
     - Write burg.port = 0.
     - Remove `#anchors [data-id='{i}']` via
       `document.querySelector`.
   - Schema: `burg` (int|string, required), `enabled`
     (boolean, required).
   - Return payload:
     `{ i, name, enabled, previousEnabled, noop, port,
       warning? }`.
     - `port` is the new value of burg.port (featureId,
       -1, or 0).

2. **Register** in `src/ai/index.ts`.

3. **Tests** `src/ai/tools/set-burg-port.test.ts`:
   - Unit (stubbed runtime):
     - enables port on a burg with a haven (no warning).
     - enables port on a burg with no haven (warning
       attached to ok result).
     - disables port.
     - noop when already enabled/disabled.
     - rejects invalid burg refs.
     - rejects non-boolean enabled.
     - rejects unknown burg.
     - surfaces runtime errors.
   - Integration (`defaultBurgPortRuntime`):
     - Stubs `globalThis.pack = { burgs, cells: { haven,
       f } }` and `globalThis.document` with a minimal
       getElementById / querySelector / createElementNS.
     - enable: asserts burg.port becomes the feature id
       and the SVG `<use>` is appended.
     - disable: asserts burg.port becomes 0 and the SVG
       element is removed.
     - enable with no haven: burg.port becomes -1 and
       warning is present in result.

4. **README_AI.md** — add a row near `set_burg_feature`.

## Verification

- `npm test -- --run src/ai/tools/set-burg-port` green.
- `npm test -- --run` — 1024 before.
- `npm run lint` — 7 / 1.
- `npm run build` succeeds.

## Success criteria

- Tool registered and callable.
- Enabling a port writes the correct feature id (or -1)
  and inserts the anchor SVG.
- Disabling writes 0 and removes the anchor SVG.
- No-haven case is a non-error warning, matching the UI's
  tip behavior.
- Idempotent (noop when already at target).
