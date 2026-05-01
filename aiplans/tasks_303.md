# Tasks 303 — `regenerate_label_name`

Sequential checklist. Run lint / tsc / tests after the implementation.

## 1. Implementation: `src/ai/tools/regenerate-label-name.ts`

- [ ] Imports:
  - `errorResult, getGlobal, getPack, okResult` from `./_shared`.
  - `Tool, ToolResult` types from `./index`.
  - `LabelLookup` type from `./set-label-group`.
- [ ] `RegenerateLabelNameRuntime` interface with:
  - `findLabel(labelId)` → `LabelLookup`
  - `getTextpath(textEl)` → `Element | null`
  - `getBBox(textEl)` → `{ x; y; width; height }`
  - `findCell(x, y)` → `number`
  - `getStateCulture(stateId)` → `number`
  - `getCellCulture(cellIndex)` → `number`
  - `generateStateName(culture)` → `string`
  - `generateCultureName(culture)` → `string`
  - `setTextpathContent(textPathEl, html)` → `void`
- [ ] Local helpers:
  - `getDocument()`
  - `resolveLabelsRoot()`
  - `isDirectGroupChildOfLabels()`
  - `classifyFoundElement()`
- [ ] `defaultRegenerateLabelNameRuntime`:
  - `findLabel`: identical algorithm to `set-label-size.ts`.
  - `getTextpath`: first child whose tagName is `textpath`.
  - `getBBox`: `(el as SVGGraphicsElement).getBBox()`; rethrow errors.
  - `findCell`: read `getGlobal<(x: number, y: number) => number>("findCell")`;
    throw if missing.
  - `getStateCulture`: read `getPack().states[stateId].culture`; throw
    descriptive errors for missing `pack`/`pack.states`/state/culture.
  - `getCellCulture`: read `getPack().cells.culture[cellIndex]`; throw
    descriptive errors for missing `pack`/`pack.cells`/`pack.cells.culture`/value.
  - `generateStateName(culture)`:
    `Names.getState(Names.getCulture(culture, 4, 7, ""), culture)`,
    throw if `Names`/`Names.getCulture`/`Names.getState` missing.
  - `generateCultureName(culture)`:
    `Names.getCulture(culture)`, throw if missing.
  - `setTextpathContent`: `textPathEl.innerHTML = html`.
- [ ] `createRegenerateLabelNameTool(runtime?)`:
  - Validate `label_id`.
  - Resolve label via `runtime.findLabel`.
  - Resolve textpath via `runtime.getTextpath`.
  - Compute `old_text`:
    - Walk tspan children of `<textPath>` and join their `textContent`
      with `"|"`. Use `Array.from(textPathEl.children)` and filter on
      `tagName.toLowerCase() === "tspan"`.
    - If no tspans, fall back to `textPathEl.textContent`. If still
      empty/null → `null`.
  - Branch: if `labelId.startsWith("stateLabel")`:
    - Suffix `labelId.slice(10)`. Validate `Number.isInteger(parsed) && parsed >= 0`
      using `Number(suffix)` after rejecting non-numeric strings.
      Reject empty suffix too.
    - `culture = runtime.getStateCulture(stateId)` (try/catch).
    - `name = runtime.generateStateName(culture)` (try/catch).
    - `kind = "state"`, `note = "This is just a label. Use rename_state to change the state's actual name."`.
    Else:
    - `box = runtime.getBBox(textEl)` (try/catch).
    - `cellX = (box.x + box.width) / 2` (legacy quirk — comment).
    - `cellY = (box.y + box.height) / 2`.
    - `cell = runtime.findCell(cellX, cellY)` (try/catch).
    - Validate `Number.isInteger(cell) && cell >= 0`.
    - `culture = runtime.getCellCulture(cell)` (try/catch).
    - `name = runtime.generateCultureName(culture)` (try/catch).
    - `kind = "other"`, no note.
  - Validate `name` is non-empty trimmed string.
  - Build new tspan HTML (multi-line vs single-line).
  - Try/catch `setTextpathContent`.
  - Return `okResult({ label_id, kind, old_text, new_text, ...(note ? { note } : {}) })`.
- [ ] Export `regenerateLabelNameTool = createRegenerateLabelNameTool();`.

## 2. Wiring: `src/ai/index.ts`

- [ ] Add `import { regenerateLabelNameTool } from "./tools/regenerate-label-name";`
  next to the `regenerateLakeNameTool` import.
- [ ] Add a re-export block near the existing
  `regenerate-lake-name` re-export, exposing
  `createRegenerateLabelNameTool`,
  `defaultRegenerateLabelNameRuntime`,
  `RegenerateLabelNameRuntime`,
  `regenerateLabelNameTool`.
- [ ] Add `registry.register(regenerateLabelNameTool);` next to
  `registry.register(regenerateLakeNameTool);`.

## 3. Tests: `src/ai/tools/regenerate-label-name.test.ts`

Section A — unit (mocked runtime):
- [ ] Happy path state: `stateLabel3` → kind="state", note set,
  generator called with culture 7, tspan rebuilt, old/new text.
- [ ] Happy path other: `addedLabel_5` → kind="other", no note,
  generator called with culture 4, bbox quirk verified
  (findCell called with (105, 25) for box {x:10,width:200,y:0,height:50}).
- [ ] Multi-line generator output `"Foo|Bar"` → setTextpathContent
  called with `<tspan x="0" dy="-0.5em">Foo</tspan><tspan x="0" dy="1em">Bar</tspan>`.
- [ ] old_text computed from existing tspans (multi-line round-trip).
- [ ] State label with non-integer suffix → error.
- [ ] State label with negative suffix → error.
- [ ] State label with empty suffix (`stateLabel`) → error.
- [ ] `getStateCulture` throws → error surfaces.
- [ ] Other label: `findCell` returns -1 → error.
- [ ] Other label: `findCell` returns NaN → error.
- [ ] Other label: `getCellCulture` throws → error.
- [ ] `generateCultureName` throws → error; setTextpathContent not called.
- [ ] `generateCultureName` returns "" → error.
- [ ] `generateCultureName` returns non-string → error.
- [ ] `getTextpath` returns null → error "has no <textPath>".
- [ ] `findLabel` not_found / outside_labels / unexpected_parent /
  labels_root_missing → respective errors.
- [ ] Missing/non-string `label_id` → error.
- [ ] Tool name "regenerate_label_name" and registry round-trip.

Section B — integration (default runtime, fake DOM + globals):
- [ ] Setup: fake `document` with `getElementById`, fake `window.pack`,
  fake `window.Names`, `window.findCell`. afterEach restores originals.
- [ ] State branch end-to-end: stateLabel0 → uses Names.getState +
  Names.getCulture, writes new tspan, returns kind="state".
- [ ] Other branch end-to-end: addedLabel_42 → uses findCell +
  Names.getCulture, returns kind="other".
- [ ] Missing `Names` → error names "Names".
- [ ] Missing `Names.getCulture` → error names "Names.getCulture".
- [ ] State branch missing `Names.getState` → error names "Names.getState".
- [ ] Missing `findCell` (other branch) → error names "findCell".
- [ ] State branch: missing `pack` → error names pack.
- [ ] State branch: missing `pack.states[id]` → error.
- [ ] State branch: missing `.culture` → error.
- [ ] Other branch: missing `pack.cells.culture` → error.
- [ ] Both `#labels` and `window.labels` missing → error.

## 4. Verification

- [ ] `npm test` passes.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run lint` matches captured baseline (7 warnings + 1 info, no errors).

## 5. Commit

- [ ] `git add` ONLY:
  - `src/ai/tools/regenerate-label-name.ts`
  - `src/ai/tools/regenerate-label-name.test.ts`
  - `src/ai/index.ts`
  - `aiplans/plan_303.md`
  - `aiplans/tasks_303.md`
- [ ] Commit message: `feat(ai): add regenerate_label_name tool`
  with Co-Authored-By trailer.
- [ ] Do NOT push.
