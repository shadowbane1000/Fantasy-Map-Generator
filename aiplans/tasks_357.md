# Tasks 357 — `set_river_parent` AI chat tool

## Implementation

- [ ] Create `src/ai/tools/set-river-parent.ts`:
  - [ ] Imports: `errorResult`, `getPack`, `okResult`,
        `parseEntityRef`, `RawRiver` from `./_shared`; `Tool`,
        `ToolResult` from `./index`; `findRiverByRef` from
        `./rename-river`.
  - [ ] Types:
    - [ ] `RiverParentRef` —
          `{ i: number; name: string; previousParent: number; previousBasin: number; }`.
    - [ ] `ParentResolution` —
          `{ basin: number }` (parent river's basin id, normalized).
    - [ ] `RiverParentRuntime` — interface with:
      - `find(ref: number | string): RiverParentRef | null;`
      - `resolveParent(parentId: number): "not-ready" | "not-found" | "removed" | ParentResolution;`
      - `apply(i: number, parent: number, basin: number): void;`
  - [ ] `RiverPackLike` interface with optional `rivers?: RawRiver[]`.
  - [ ] `defaultRiverParentRuntime`:
    - [ ] `find(ref)`: walks `pack.rivers` via `findRiverByRef`. If
          missing, return `null`. Otherwise return `{ i, name: name ?? "",
          previousParent: typeof parent === "number" ? parent : 0,
          previousBasin: typeof basin === "number" ? basin : i }`.
    - [ ] `resolveParent(parentId)`:
      - If `pack.rivers` not array → `"not-ready"`.
      - Walk `pack.rivers` directly (not via `findRiverByRef`, since
        we want to distinguish "removed" from "not-found").
      - If no entry has `i === parentId` → `"not-found"`.
      - If found entry has `removed: true` → `"removed"`.
      - Otherwise return `{ basin: typeof entry.basin === "number" ? entry.basin : entry.i }`.
    - [ ] `apply(i, parent, basin)`:
      - Pull `rivers = getPack<RiverPackLike>()?.rivers`.
      - If not array → throw
        `"window.pack.rivers is not available; the map hasn't finished loading."`.
      - Find via `findRiverByRef(rivers, i)`. If null → throw
        `"River ${i} not found."`.
      - Set `river.parent = parent` and `river.basin = basin`
        in place.
  - [ ] `createSetRiverParentTool(runtime = defaultRiverParentRuntime)`:
    - [ ] `name = "set_river_parent"`.
    - [ ] Description: explain it sets `pack.rivers[k].parent` and
          updates `.basin` to the parent's basin (or to the river's
          own id when `parent=0`), mirroring the river editor's
          "Parent" select. Note: rivers match on `river.i` (non-
          contiguous) or case-insensitive name; removed rivers are
          skipped; `parent=0` clears the parent and resets basin.
    - [ ] `input_schema`:
      ```jsonc
      {
        type: "object",
        properties: {
          river: {
            type: ["integer", "string"],
            description: "Numeric river id (matches river.i, not array index — ids are non-contiguous because the generator skips removed rivers) or current case-insensitive name.",
          },
          parent: {
            type: "integer",
            minimum: 0,
            description: "Parent river id (0 means no parent / this river is a trunk; basin will be set to the river's own id).",
          },
        },
        required: ["river", "parent"],
      }
      ```
    - [ ] `execute(rawInput)`:
      - [ ] Coerce input.
      - [ ] Validate `river` via `parseEntityRef`.
      - [ ] Validate `parent`: typeof number AND
            `Number.isInteger` AND `>= 0`. Otherwise:
            `errorResult("parent must be a non-negative integer.")`.
      - [ ] Resolve current via `runtime.find(refResult.ref)`. If
            null → `errorResult(\`River ${JSON.stringify(refResult.ref)} not found.\`)`.
      - [ ] If `parent !== 0`:
        - [ ] If `parent === current.i` →
              `errorResult("Cannot set parent to the river itself.")`.
        - [ ] Resolve parent via `runtime.resolveParent(parent)`.
          - `"not-ready"` →
            `errorResult("window.pack.rivers is not available; the map hasn't finished loading.")`.
          - `"not-found"` →
            `errorResult(\`Parent river ${parent} not found.\`)`.
          - `"removed"` →
            `errorResult(\`Parent river ${parent} is removed.\`)`.
          - Otherwise pull `parentBasin = resolution.basin`.
      - [ ] Compute final basin:
        - `parent === 0` → `basin = current.i`.
        - else → `basin = parentBasin`.
      - [ ] Try `runtime.apply(current.i, parent, basin)`. On error
            return `errorResult(err.message)` (also masks "removed
            river" errors that the runtime may surface, e.g. when
            current was removed BETWEEN find and apply — defensive).
      - [ ] If `current.i` resolved but find detected removed flag —
            handled differently: rather than letting apply throw,
            we should detect removed in `find` itself. Update
            `find` to return `null` for removed rivers (matching
            `findRiverByRef` which already skips removed). The
            "removed river" error only applies during dispatch when
            the runtime can't apply due to a stale state. To enforce
            the spec error message `"Cannot set parent on removed river ${i}."`,
            instead: change `find` to return removed-flag info OR
            leave `findRiverByRef` skipping removed rivers (so a
            removed river simply produces "River ${ref} not found.").
            **Decision:** Per spec the error message
            `"Cannot set parent on removed river ${i}."` is required.
            To support it: `find` does NOT skip removed rivers (we
            walk pack.rivers directly within `defaultRiverParentRuntime.find`),
            and `find` returns `RiverParentRef | { removed: i, name }`.
            **Refined Decision:** simpler — extend `RiverParentRef`
            with `removed: boolean`. The execute step inspects it
            and emits the correct error.
  - [ ] **Refinement (post-self-review):** `RiverParentRef` includes
        `removed: boolean`. `defaultRiverParentRuntime.find` walks
        `pack.rivers` directly (NOT via `findRiverByRef` — that
        skips removed) so removed rivers are still surfaced.
        Execute step: if `current.removed === true` →
        `errorResult(\`Cannot set parent on removed river ${current.i}.\`)`.
  - [ ] Build success body:
    ```ts
    okResult({
      river: { i: current.i, name: current.name },
      previous_parent: current.previousParent,
      previous_basin: current.previousBasin,
      parent,
      basin,
    });
    ```
  - [ ] Export `setRiverParentTool = createSetRiverParentTool()`.

- [ ] Create `src/ai/tools/set-river-parent.test.ts`:
  - [ ] Imports per stub-runtime pattern in `set-river-type.test.ts`.
  - [ ] `makeRuntime(find, resolveParent)` helper that returns
        `{ runtime, apply }` with `apply` as a `vi.fn()`.
  - [ ] **Stub-runtime suite (tests 1-13):**
    - [ ] Test 1: happy path (set parent) — river i=5
          previousParent=0 previousBasin=5; parent=12 resolves with
          basin=12 → apply called with (5, 12, 12). Result body:
          previous_parent=0, previous_basin=5, parent=12, basin=12.
    - [ ] Test 2: happy path (clear parent) — river i=5
          previousParent=12 previousBasin=12; parent=0 → apply
          called with (5, 0, 5). Result body: previous_parent=12,
          previous_basin=12, parent=0, basin=5.
    - [ ] Test 3: basin propagates from parent's basin (NOT id) —
          parent has i=20 basin=3 → apply called with (5, 20, 3),
          NOT (5, 20, 20). Result body: parent=20, basin=3.
    - [ ] Test 4: self-parent rejection — parent=5 when river.i=5
          → error `"Cannot set parent to the river itself."`.
          `apply` not called.
    - [ ] Test 5: removed river → `find` returns ref with
          `removed: true` → error
          `"Cannot set parent on removed river 5."`. `apply` not
          called.
    - [ ] Test 6: parent missing — `resolveParent` returns
          `"not-found"` → error `"Parent river 99 not found."`.
          `apply` not called.
    - [ ] Test 7: parent removed — `resolveParent` returns
          `"removed"` → error `"Parent river 99 is removed."`.
          `apply` not called.
    - [ ] Test 8: parent negative — parent=-1 → error
          `"parent must be a non-negative integer."`. `apply` not
          called.
    - [ ] Test 9: parent invalid — for `[1.5, "x", null, undefined,
          {}, true]` → error
          `"parent must be a non-negative integer."`.
    - [ ] Test 10: river ref invalid — for `[null, undefined, 0, -1,
          1.5, ""]` → ref-parser error.
    - [ ] Test 11: river string that doesn't resolve — `find`
          returns null → error `"River \"ghost\" not found."`.
    - [ ] Test 12: previous values captured BEFORE mutation —
          stub `find` returns `previousParent=0`, `previousBasin=5`;
          stub `apply` mutates a side variable to a new value;
          assert returned `previous_parent=0` and `previous_basin=5`
          (the snapshot, not post-mutation). Also assert apply is
          called once.
    - [ ] Test 13: registry round-trip — register
          `setRiverParentTool` in a fresh `ToolRegistry`, dispatch
          via `tools.find("set_river_parent")?.execute(...)`,
          assert default-runtime path mutates the populated
          `globalThis.pack`.
  - [ ] **Default-runtime integration suite (tests 14-20):**
    - [ ] `globalThis.pack` populated in `beforeEach` with rivers:
          `{i:0}, {i:5,name:"Mistwater",parent:0,basin:5},
          {i:12,name:"Trunk",parent:0,basin:12},
          {i:20,name:"Quirk",parent:0,basin:3},
          {i:9,name:"Ghost",parent:0,basin:9,removed:true}`.
    - [ ] Test 14: missing pack.rivers — `globalThis.pack = {}` →
          error
          `"window.pack.rivers is not available; the map hasn't finished loading."`.
          (Use a fresh pack set inside the test only.)
    - [ ] Test 15: integration set parent — set river 5 parent=12
          → pack.rivers entry for i=5 has parent=12, basin=12.
    - [ ] Test 16: integration clear parent — first set river 5
          parent=12 (or directly mutate to that state in setup),
          then call with parent=0 → pack.rivers entry for i=5 has
          parent=0, basin=5.
    - [ ] Test 17: integration basin propagates — set river 5
          parent=20 (parent has basin=3) → child.basin=3 (NOT 20).
    - [ ] Test 18: integration removed parent — set river 5
          parent=9 (which is removed) → error
          `"Parent river 9 is removed."`. River 5 unchanged.
    - [ ] Test 19: integration self-parent — set river 5
          parent=5 → error `"Cannot set parent to the river itself."`.
          River 5 unchanged.
    - [ ] Test 20: in-place mutation — capture
          `pack.rivers.find(r => r.i === 5)` reference before, run
          set parent=12, assert reference identity preserved
          (`===` same object) and that `parent`/`basin` updated
          on it.
  - [ ] Assertions on `setRiverParentTool.name === "set_river_parent"`
        and `input_schema.required === ["river", "parent"]`.

- [ ] `src/ai/index.ts`:
  - [ ] Add `import { setRiverParentTool } from "./tools/set-river-parent";`
        immediately AFTER the `setReligionTypeTool` import line and
        BEFORE the `setRiverTypeTool` import line (alphabetical:
        set-religion-type < set-river-parent < set-river-type).
  - [ ] Add re-export block immediately BEFORE the `set-river-type`
        re-export:
        ```ts
        export {
          createSetRiverParentTool,
          setRiverParentTool,
        } from "./tools/set-river-parent";
        ```
  - [ ] Add `registry.register(setRiverParentTool);` immediately
        BEFORE `registry.register(setRiverTypeTool);`.

## Verification

- [ ] `npm test` — all green.
- [ ] `npx tsc --noEmit` — no errors.
- [ ] `npm run lint` — no warnings.

## Commit

- [ ] Stage:
  - `src/ai/tools/set-river-parent.ts`
  - `src/ai/tools/set-river-parent.test.ts`
  - `src/ai/index.ts`
  - `aiplans/plan_357.md`
  - `aiplans/tasks_357.md`
- [ ] Commit with the spec-required message:
  ```
  feat(ai): add set_river_parent tool

  Implements plan 357. Adds an AI chat tool that sets a river's parent
  (which other river it flows into) and updates its basin to the
  parent's basin (or to the river's own id when parent=0), mirroring the
  "Parent" select in the river editor.
  ```

## Self-review checklist (re-read before implementing)

- [ ] Plan and tasks both name file paths consistently
      (`set-river-parent.ts`, `set-river-parent.test.ts`).
- [ ] Stub-runtime tests: 13 (1-13). Integration tests: 7 (14-20).
      Total: 20 tests.
- [ ] Basin-from-parent's-basin (NOT parent's id) — tests 3 (stub)
      and 17 (integration).
- [ ] parent=0 special case (basin = river.i) — tests 2 (stub) and
      16 (integration).
- [ ] Self-parent rejection — tests 4 (stub) and 19 (integration).
- [ ] Removed river — test 5 (stub).
- [ ] Removed parent — tests 7 (stub) and 18 (integration).
- [ ] Missing parent — test 6 (stub).
- [ ] previous values captured BEFORE mutation — test 12 (stub).
- [ ] In-place mutation — test 20 (integration).
- [ ] Errors-verbatim list matches plan and tests.
- [ ] Index registration alphabetically slotted near `setRiverTypeTool`.
