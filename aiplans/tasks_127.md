# Tasks 127 — remove_river AI tool

- [ ] Create `src/ai/tools/remove-river.ts`:
  - Imports:
    - `./_shared`: errorResult, getGlobal, getPack,
      okResult, parseEntityRef, type RawRiver.
    - `./index`: type Tool, type ToolResult.
    - `./rename-river`: findRiverByRef.
  - Exports:
    - `RemoveRiverRef { i, name, type }`.
    - `RiverRemovalRuntime { find, remove }`.
    - `defaultRiverRemovalRuntime`:
      - `find(ref)` — findRiverByRef over
        `getPack<RiverPackLike>()?.rivers`; returns null
        when unfound, else `{ i, name: r.name ?? "",
        type: r.type ?? "" }`.
      - `remove(i)`:
        - Get `Rivers` global via `getGlobal<RiversModule>`.
        - If `Rivers?.remove` is not a function → throw
          "Rivers.remove is not available yet; wait for
          the map to finish loading.".
        - Re-verify the river exists (filter
          `!removed`) → throw `River ${i} not found.` if
          missing.
        - Call `Rivers.remove(i)` (note: the generator
          takes the id, not the RawRiver object).
    - `createRemoveRiverTool(runtime?)`, `removeRiverTool`.
  - Tool name: `remove_river`.
  - Description: references the Rivers Editor delete
    dialog, notes delegation to `Rivers.remove()`, calls
    out that tributaries (`parent` / `basin`) are also
    removed, cell.r / cell.fl / cell.conf are reset, and
    the confirm dialog is skipped.
  - Schema: `river` (int | string, required).
  - Validation:
    - `parseEntityRef(input.river, "river")` — error on
      failure.
    - `runtime.find(ref)` returns null → "No river
      found matching ...".
  - Return payload: `{ ok: true, i, previousName,
    previousType }`.

- [ ] Register in `src/ai/index.ts`:
  - Import `removeRiverTool` after `removeReligionTool`
    (alphabetical with peers) or next to `removeRouteTool`
    — match existing file order.
  - Barrel re-export `createRemoveRiverTool`,
    `removeRiverTool`.
  - `registry.register(removeRiverTool)` inside
    `buildDefaultRegistry`.

- [ ] Write `src/ai/tools/remove-river.test.ts`:
  - Unit (stubbed):
    - removes by numeric id (asserts `remove` called
      with id, payload has ok/i/previousName/previousType).
    - removes by case-insensitive name (asserts find
      receives the raw string).
    - errors when river is unknown (find returns null →
      isError, remove not called).
    - rejects invalid river refs (null, undefined, 0,
      -1, 1.5, "") — all isError, remove not called.
    - surfaces runtime failures (remove throws → error
      content carries /not available/ or similar).
  - `defaultRiverRemovalRuntime (integration)`:
    - Stub `globalThis.pack.rivers` with three entries:
      live id 1 + live id 5 + tombstoned id 9 `{removed:
      true}`.
    - Stub `globalThis.Rivers = { remove: vi.fn() }`.
    - Removes id 5 → `Rivers.remove` called once with 5.
    - Removing id 9 (tombstoned) → isError, remove not
      called.
    - Removing when `globalThis.Rivers = undefined` →
      isError matching /Rivers\.remove/.
  - Reset globals in afterEach.

- [ ] `pack-types.ts` — no change required
  (`RawRiver.removed?: boolean` already present).

- [ ] Update `README_AI.md` — row after
  `set_river_width` (row 71). Include sentence
  describing delegation to `Rivers.remove()`, tributary
  cascade, cell.r / fl / conf cleanup, SVG path
  removal, confirm dialog skipped.

- [ ] `npm test` (node scope) — passes.

- [ ] `npx vitest run src/ai --root /workspace` — all
  pass (1493 before → 1498+ after).

- [ ] `npm run lint` — still 7 warnings / 1 info /
  0 errors.

- [ ] `npm run build` — succeeds.

- [ ] Commit with `feat(ai): add remove_river tool` and
  a 1-2 line body citing Rivers.remove delegation.

## Verification: tasks → plan

- File + registration covers "callable".
- Runtime shape (`find` + `remove(id)`) matches the
  `Rivers.remove` signature from river-generator.ts.
- Description + README mention tributary cascade to
  match the editor dialog copy ("All tributaries will
  be auto-removed").

## Verification: plan → use case

- Editor delete handler calls `Rivers.remove(river)`
  where `river` is the numeric id (rivers-overview.js
  line 184) or the string "riverN" in the editor (line
  262). The tool's `remove(i)` takes the id.
- `Rivers.remove` cascades tributaries + cleans cells +
  cleans SVG. Tool delegates → same side effects.
- Unknown / already-removed refs are rejected so the
  LLM knows removal didn't happen.

## Verification: tests → regressions

- If the tool forgot to call `Rivers.remove`, the
  integration "calls Rivers.remove" test fails.
- If runtime forgot to guard missing `Rivers`, the
  "errors when Rivers is not available" test fails.
- If double-delete was silently accepted, the
  tombstoned-river test fails.
- If invalid refs slipped through, parseEntityRef unit
  tests fail.
