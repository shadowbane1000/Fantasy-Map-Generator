# Tasks 43 — rename_zone AI tool

## Task 1 — Implement the tool

- [ ] Create `src/ai/tools/rename-zone.ts`:
  - Imports `errorResult`, `getPack`, `okResult`, `parseEntityRef`
    from `_shared`; `findZoneByRef` from `./set-zone-visibility`.
  - Exports `ZoneRenameRef`, `ZoneRenameRuntime`,
    `defaultZoneRenameRuntime`, `createRenameZoneTool`,
    `renameZoneTool`.
  - `defaultZoneRenameRuntime.rename(i, name)`:
    - `findZoneByRef(getPack()?.zones, i)` → throw if null.
    - `zone.name = name`.
    - If `typeof document !== "undefined"`, set `data-description` on
      `#zone{i}` to the new name.
  - Tool schema: `zone` (int|string, required), `name` (string,
    required, non-empty).

## Task 2 — Register in ai/index

- [ ] Add `import { renameZoneTool } from "./tools/rename-zone";`.
- [ ] Add barrel re-export:
  ```ts
  export {
    createRenameZoneTool,
    renameZoneTool,
  } from "./tools/rename-zone";
  ```
- [ ] Call `registry.register(renameZoneTool);` next to the other
  `rename*` tools (after renameProvinceTool).

## Task 3 — Unit tests (runtime-injected)

- [ ] `src/ai/tools/rename-zone.test.ts` covers:
  - Rename by numeric id.
  - Rename by case-insensitive name.
  - Rejects unknown zone ref (isError).
  - Rejects invalid `zone` (null, 0, -1, 1.5, "").
  - Rejects invalid `name` (non-string, empty string, whitespace).
  - Rename to the same name still calls runtime.rename (no special
    no-op logic in the tool).
  - Surfaces runtime failures.

## Task 4 — Default-runtime integration test

- [ ] Same describe-block pattern as
  `set-zone-visibility.test.ts` integration section:
  - Set `globalThis.pack.zones` with non-contiguous ids.
  - Mount a fake DOM element `<g id="zone5">` via
    `document.body.innerHTML = "<svg><g id='zone5'></g></svg>"` (Vitest
    runs in node; check if jsdom is active — if not, use the existing
    happy-dom/jsdom setup the other tool tests rely on).
  - Call `renameZoneTool.execute({ zone: 5, name: "Black Death" })`.
  - Assert `pack.zones[1].name === "Black Death"`.
  - Assert `document.getElementById("zone5")?.getAttribute("data-description")
    === "Black Death"`.

## Task 5 — README

- [ ] Add a row below `set_zone_visibility`:
  ```
  | `rename_zone` | Rename a zone (also updates its SVG tooltip). Zones Overview calls this field "Description" but it writes to `zone.name`. Matches by `zone.i` or current name. | "Rename the Plague zone to Black Death", "Call zone 3 'Ash Invasion'" |
  ```

## Task 6 — Verify

- [ ] `npm test -- --run src/ai/tools/rename-zone` passes.
- [ ] `npm test -- --run` — full suite passes.
- [ ] `npm run lint` — baseline intact.
- [ ] `npm run build` — succeeds.

## Task 7 — Commit

- [ ] Stage and commit: tool + test + ai/index + README + plan/tasks.
- [ ] Message: `feat(ai): add rename_zone tool`.

## Verification that tasks accomplish the plan

- Plan step 1 (new file) → Task 1.
- Plan step 2 (register) → Task 2.
- Plan step 3 (injected-runtime tests) → Task 3.
- Plan step 4 (default-runtime test) → Task 4.
- Plan step 5 (README) → Task 5.
- Plan "Verification" section → Task 6.

## Verification that plan accomplishes the use case

- Use case: user can rename zones in the UI, AI cannot.
- Plan writes the exact same `zone.name` field the UI writes and
  updates the same `data-description` attribute the UI updates — so
  the Zones Overview row label and the map tooltip both reflect the
  change identically to a user-driven rename.
- Reuses `findZoneByRef` so non-contiguous id handling is already
  proven by plan 42's tests.

## Verification that tests prove the use case

- Injected-runtime tests verify input validation, resolution, and
  that `runtime.rename` is called with the right args.
- Default-runtime integration test proves the mutation AND the SVG
  data-description update happen end-to-end — which together with the
  existing `findZoneByRef` tests from plan 42 cover every side-effect
  the UI produces.
