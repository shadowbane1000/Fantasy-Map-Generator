# Tasks 367 — `get_selected_entity` AI tool

Reference: `aiplans/plan_367.md`.

## 1. Plan & baseline

- [x] Read all relevant editors and plans 349 / 352 / 365.
- [x] Capture `npm run lint` baseline (837 files, no fixes).
- [x] Build id-pattern → entity-type table (see plan).
- [x] Draft `aiplans/plan_367.md`.
- [x] Self-review pass.

## 2. DOM-shadow fix

- [ ] In `public/main.js:142`, change `let elSelected;` →
      `var elSelected;`.
- [ ] Verify no other `let elSelected` declaration exists in the
      bundle (`grep -rn "let elSelected" public/`).

## 3. Tool implementation

- [ ] Create `src/ai/tools/get-selected-entity.ts`:
  - Export `SelectedEntityNodeView` interface.
  - Export `SelectedEntityRuntime` interface (`read()`, `getPack()`).
  - Export `defaultSelectedEntityRuntime` reading
    `globalThis.elSelected` and `globalThis.pack`.
  - Export `createGetSelectedEntityTool(runtime?)`.
  - Export `getSelectedEntityTool` (default-runtime instance).
  - Implement classifier with the id-pattern table from the plan.
  - Resolve entity name from pack collections (or text() for free
    labels, type for markers, "" for ice/relief).
  - Returns `{ ok: true, type, id, name, raw_id, parent_id, ...}`
    on match; `{ ok: true, type: null, message }` when nothing is
    selected; `{ ok: true, type: "unknown", raw_id, parent_id }` for
    unrecognised patterns.

- [ ] Create `src/ai/tools/get-selected-entity.test.ts` covering all
      29 mocked-runtime cases plus 5 default-runtime integration
      cases (see plan).

## 4. Wire into registry

- [ ] In `src/ai/index.ts`:
  - Add `import { getSelectedEntityTool } from "./tools/get-selected-entity";`
    alphabetically (between `getReligionInfoTool` and
    `getStateDistributionTool`, i.e. `get-religion-info < get-river-distribution
    < get-river-info < get-route-distribution < get-route-info <
    get-selected-entity < get-state-distribution`).
  - Add re-export block in alphabetical position.
  - Add `registry.register(getSelectedEntityTool);` next to peer
    `get_*` registrations.

## 5. Verification

- [ ] `npm test` — full suite passes.
- [ ] `npx tsc --noEmit` — no errors.
- [ ] `npm run lint` — clean (no new warnings).
- [ ] Spot-check the seam test
      (`src/ai/tools/_shared/global-exposure.test.ts`) — should
      auto-pass because `var elSelected` is now in `public/main.js`.

## 6. Commit

- [ ] Stage `public/main.js`, `src/ai/index.ts`, the two new tool
      files, and `aiplans/plan_367.md` + `aiplans/tasks_367.md`.
- [ ] Commit on branch `plan-367-get-selected-entity` with the
      message specified in the plan brief. Do NOT push.
