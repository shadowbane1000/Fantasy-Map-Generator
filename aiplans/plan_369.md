# Plan 369 — Tell the AI that up is always north

## Use case

The AI chat assistant has been wasting turns asking the user "which
direction is north?" when interpreting spatial requests
(e.g. "move the burg to the northern coast", "shift the river south").
In Azgaar's Fantasy Map Generator the orientation is fixed: the map
is rendered as SVG with `y=0` at the top, and `y` increases downward;
that top edge of the canvas is the north edge of the world. There is
no rotation control and no UI knob that flips the orientation. The
system prompt should state this so the AI treats it as load-bearing
context and stops asking.

## Lint baseline (before any changes)

`npm run lint` on plan-369 base (branch `plan-369-system-prompt-north`,
based on `master @ 9118fd3`):

```
> fantasy-map-generator@1.114.1 lint
> biome check --write

Checked 842 files in 704ms. No fixes applied.
```

Clean. Post-implementation lint must remain clean.

## Verification of the convention (up = north)

Multiple independent code paths confirm that smaller `y` is more
north:

- **`getLatitude` helper** (`src/utils/commonUtils.ts:252` and exposed
  on `window` at `src/utils/index.ts:244`):

  ```ts
  return rn(mapCoordinates.latN - (y / graphHeight) * mapCoordinates.latT, decimals);
  ```

  At `y = 0` the result is `latN` (north latitude). At
  `y = graphHeight` it's `latN - latT = latS` (south latitude). y
  increases southward.

- **Temperature graph** (`public/modules/ui/temperature-graph.js:5`)
  uses the same formula: `const lat = mapCoordinates.latN - (b.y /
  graphHeight) * mapCoordinates.latT;`.

- **3D viewer** (`public/modules/ui/3d.js:759`) computes its `dy`
  offset as `((90 - mapCoordinates.latN) / 180) * height` — again
  treating the top of the canvas as the most-north edge.

- **Heightmap-editor invert tool**
  (`src/ai/tools/invert-heightmap.ts:144`) describes its `"y"` axis
  flip as "mirror along Y, north↔south", confirming `+y` = south,
  `-y` = north in the codebase's vocabulary.

- **No rotation control.** `grep -rnlE "rotat" src/ public/modules/`
  surfaces only label-rotation logic (`move-label.ts`,
  `draw-state-labels.ts`, regiment glyph rotation, emblem placement)
  — nothing rotates the world coordinate frame.

- **Compass / north-pole references in the World Configurator**
  (`src/ai/tools/get-geography.ts:57`): `latitude` slider doc says
  "0 = north pole, 50 = equator, 100 = south pole" — i.e. north is at
  the top of the latitude range. `temperatureNorthPole` /
  `temperatureSouthPole` options also pin the convention.

Conclusion: the orientation is `+y = south, -y = north, +x = east,
-x = west`. Safe to bake this claim into the system prompt.

## Behavior

Insert a single one-line clause into `DEFAULT_SYSTEM_PROMPT` in
`src/ai/chat-controller.ts`. Placement: between the introduction
paragraph (line 53) and the "# How to approach a request" section
(line 55) — i.e. right after the introduction, before the rule list,
so the AI sees it as an early framing fact rather than tucked under
some sub-heading.

Exact insertion (one new paragraph, blank line above and below):

```
**Map orientation**: up is always north; the map is not rotatable. East is +x, west is -x; south is +y, north is -y.
```

The rest of the prompt stays verbatim.

## Files modified

- `src/ai/chat-controller.ts` — single-clause insertion in the
  `DEFAULT_SYSTEM_PROMPT` template literal.

## Tests

`grep -rnE "DEFAULT_SYSTEM_PROMPT|systemPrompt" tests/ src/ai/`
and `grep -rnE "embedded in Azgaar|window.pack|How to approach" tests/`
both come up empty for any pinned content of the default prompt.
`src/ai/chat-controller.test.ts:176` constructs a controller with a
custom `systemPrompt: "you are a test bot"` — it does not exercise
the default. **No test changes required.**

## Verification

- `npm test` — full suite must remain green.
- `npx tsc --noEmit` — clean.
- `npm run lint` — clean (matches baseline above).

## Self-review

- The clause uses unambiguous wording. "Up is always north" matches
  user-facing language; "+x / -x / +y / -y" matches the SVG /
  generator-coordinate language already used elsewhere in the
  codebase (e.g. `invert-heightmap.ts`'s `"y" → north↔south`).
- The clause does NOT redefine SVG coordinate conventions
  inconsistently. SVG natively has `y` increasing downward; the
  codebase's `getLatitude` formula treats the top of the canvas
  (small y) as north latitude. The new clause says the same thing.
- The map's latitude slider (`get-geography.ts`) already encodes
  "0 = north pole, 100 = south pole" — the new clause is consistent.
- No snapshot test pins the default prompt content (verified via
  grep). Adding a paragraph cannot break a pinned test.
- The change is intentionally tiny: one inserted clause, no
  restructuring of the existing prompt.
- Commit message: `docs(ai): tell the AI that up is always north`.
