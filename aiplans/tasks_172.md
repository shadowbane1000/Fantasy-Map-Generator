# Tasks — Plan 172 (`clear_rulers`)

## Research (done)

- [x] Locate `rulers` global (public/main.js:145 — `let rulers = new Rulers();`).
- [x] Inspect `Rulers` class (`public/modules/ui/measurers.js:1-52`) —
      has `draw`, `undraw`, `remove(id)`, no built-in `clearAll`; the
      UI pattern is `rulers.undraw(); rulers = new Rulers();`.
- [x] Inspect remove-all UI (`public/modules/ui/units-editor.js:254-272`).
- [x] Note DOM group `#ruler` (public/main.js:87 — `viewbox.append("g").attr("id", "ruler")…`).
- [x] Confirm runtime-seam pattern from `regenerate-zones.ts`.
- [x] Confirm shared helpers from `src/ai/tools/_shared/index.ts`.

## Implementation

- [ ] Write `src/ai/tools/clear-rulers.ts`.
  - Interface `ClearRulersRuntime` with `clearAll(): { cleared: number }`.
  - `defaultClearRulersRuntime.clearAll()`:
    - Grab `globalThis.rulers` via `getGlobal`.
    - Throw descriptive error if missing or shape is invalid.
    - Record `cleared = rulers.data.length`.
    - Call `rulers.undraw()`.
    - Reset `rulers.data = []` (mutate in place).
    - Best-effort: wipe children of `document.getElementById("ruler")`.
    - Return `{ cleared }`.
  - `createClearRulersTool(runtime)`:
    - `name: "clear_rulers"`, no params, idempotent.
    - Calls `runtime.clearAll()`, wraps errors with `errorResult`.
    - Returns `okResult({ cleared })`.
  - Export default tool `clearRulersTool`.

- [ ] Write `src/ai/tools/clear-rulers.test.ts`.
  - Factory tests (mock runtime).
  - Integration block against `globalThis.rulers` + real `document`.

- [ ] Register tool in `src/ai/index.ts` (import + export + registry).

- [ ] Add README_AI.md row near `regenerate_zones` (line 36-ish),
      include API key note and three example prompts.

## Verification

- [ ] `npm run build` succeeds.
- [ ] `npm test` — all pass, count grows by the new tests.
- [ ] `npm run lint` matches baseline (7 warnings / 1 info / 0 errors).
- [ ] Commit with `feat(ai): add clear_rulers tool`.
