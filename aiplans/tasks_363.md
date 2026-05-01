# Tasks for plan 363 — `set_zone_cells`

1. Read `aiplans/plan_363.md`. Skim
   `src/ai/tools/_shared/{globals,results,entity-ref,pack-types}.ts`,
   `src/ai/tools/add-zone.ts` (cell validation + `dedupePreserveOrder`
   + `drawZones` best-effort), `src/ai/tools/set-zone-color.ts`,
   `src/ai/tools/set-zone-visibility.ts` (re-uses `findZoneByRef`).

2. Create `src/ai/tools/set-zone-cells.ts`:
   - Imports: `errorResult`, `getGlobal`, `getPack`, `okResult`,
     `parseEntityRef`, `RawZone` from `./_shared`. `findZoneByRef` from
     `./set-zone-visibility`. `Tool, ToolResult` from `./index`.
   - Local helper `dedupePreserveOrder(values: number[]): number[]`.
   - `interface ZoneCellsRef { i: number; name: string; previousCells: number[]; }`
   - `interface ZoneCellsRuntime { find(ref); getValidCellRange(); setCells(i, cells); }`
     where `getValidCellRange()` returns `{ ok: true; max: number } | { ok: false; error: string }`.
   - `defaultZoneCellsRuntime`:
     - `find` → resolve via `findZoneByRef`. If `removed`, return
       `{ removed: true, i, name }` discriminator. (Or simpler: include
       `removed` flag on the ref and let the tool layer error out.)
     - `getValidCellRange` → reads `getPack()?.cells?.i?.length`.
       Errors if pack/zones/cells missing.
     - `setCells(i, cells)` → re-resolves the zone, throws if missing,
       reassigns `zone.cells = cells` (NEW array), best-effort calls
       `drawZones`.
   - `createSetZoneCellsTool(runtime = default)` returns a Tool with:
     - name `set_zone_cells`
     - description: per plan
     - input_schema: per plan
     - execute:
       - parseEntityRef on `zone`
       - validate `cells` is an array; iterate to ensure each is
         non-negative integer (with index in error)
       - call `runtime.find(ref)`. If null → `Zone ${ref} not found.`
         If removed → `Cannot set cells on removed zone ${i}.`
       - call `runtime.getValidCellRange()` for max; if not ok →
         propagate the error
       - re-iterate cells to enforce range:
         `cells[idx] (value) is out of range (max maxId).`
       - dedupe (preserve first-occurrence order)
       - capture `previous_count = previousCells.length`,
         `previous_cells_sample = previousCells.slice(0, 10)`
       - call `runtime.setCells(current.i, normalized)`
       - return body with samples + truncation flags
   - export `setZoneCellsTool = createSetZoneCellsTool();`

3. Create `src/ai/tools/set-zone-cells.test.ts` covering the 24 cases
   in plan 363:
   - Tool-layer (mocked runtime): cases 1–14.
   - Default-runtime integration with `globalThis.pack`: cases 15–24.

4. Update `src/ai/index.ts`:
   - import `setZoneCellsTool` between `setZoneColorTool` (alphabetical
     — actually `set-zone-c` comes before `set-zone-color` so the
     import goes _above_ `setZoneColorTool`).
     - Wait: alphabetical filename `set-zone-cells` < `set-zone-color`
       lexicographically (`c-e-l-l-s` vs `c-o-l-o-r`), so import goes
       above `setZoneColorTool`.
   - re-export `createSetZoneCellsTool` and `setZoneCellsTool`.
   - register near other zone tools (`registry.register(setZoneCellsTool);`
     just before `registry.register(setZoneColorTool);`).

5. Run `npm test` — all green.

6. Run `npx tsc --noEmit` — clean.

7. Run `npm run lint` — clean.

8. Commit on the existing branch `plan-363-set-zone-cells`:

   ```
   feat(ai): add set_zone_cells tool

   Implements plan 363. Adds an AI chat tool that replaces a zone's
   cell-id list (zone.cells = [...]) with deduplication and per-cell
   range validation, mirroring the zones editor's manual assignment
   mode.
   ```

   No push.
