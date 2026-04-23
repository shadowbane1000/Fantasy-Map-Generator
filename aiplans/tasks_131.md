# Tasks — Plan 131 (`set_onload_behavior`)

1. **Confirm option ID + values.**
   - `src/index.html:1908` — `<select id="onloadBehavior" data-stored="onloadBehavior">` with options `random` (default) and `lastSaved`.
   - `public/main.js:334` — reads `byId("onloadBehavior").value === "lastSaved"` on boot.
   - `public/modules/ui/options.js:106` — the `data-stored` pattern writes `localStorage[key] = value` on change.
   - `window.options` does **not** carry `onloadBehavior`.

2. **Implement `src/ai/tools/set-onload-behavior.ts`.**
   - Export `ONLOAD_BEHAVIORS = ["random", "lastSaved"] as const`.
   - Export `OnloadBehavior` type.
   - Build alias lookup (case-insensitive) with synonyms: `new`, `generate`, `new-map`, `random-map` → `random`; `saved`, `last-saved`, `last`, `restore` → `lastSaved`.
   - Export `resolveOnloadBehavior(value: unknown): OnloadBehavior | null`.
   - Export `SetOnloadBehaviorRuntime { readCurrent, apply }`.
   - Default runtime:
     - `readCurrent`: prefer `#onloadBehavior.value`; fall back to `localStorage.getItem("onloadBehavior")`; return `null` when empty.
     - `apply`: best-effort DOM write (try/catch), then `localStorage.setItem("onloadBehavior", value)`.
   - Tool returns `{ ok, behavior, previousBehavior, noop }`.

3. **Implement tests `src/ai/tools/set-onload-behavior.test.ts`.**
   - `resolveOnloadBehavior` — canonical + alias + reject.
   - `ONLOAD_BEHAVIORS` shape.
   - Tool: canonicalizes case, rejects empty / unknown / non-string, canonical delegated to `apply`, noop when current matches, surfaces runtime errors.
   - `defaultRuntime` integration block — stub `globalThis.document` + `globalThis.localStorage`, assert DOM value + localStorage write, assert noop path, assert fallback read when DOM element missing.

4. **Register in `src/ai/index.ts`.**
   - Add import at the right alphabetical position.
   - Add `registry.register(setOnloadBehaviorTool)`.
   - Add public export block.

5. **README_AI.md.**
   - Add row in the options/settings area (near `set_measurement_units`, `set_state_labels_mode`). Describe behavior, canonical values, aliases, localStorage key, idempotency, example prompts.

6. **Verify.**
   - `cd /workspace && npm run build`
   - `cd /workspace && npm test`
   - `cd /workspace && npm run lint` — should stay at 7 warnings / 1 info / 0 errors.

7. **Commit.**
   - `feat(ai): add set_onload_behavior tool`
   - Body: short description of the selector it targets.
