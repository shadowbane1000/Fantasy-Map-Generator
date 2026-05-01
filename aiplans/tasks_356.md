# Tasks 356 — `regenerate_river_name` AI chat tool

## Implementation

- [ ] Create `src/ai/tools/regenerate-river-name.ts`:
  - [ ] Imports: `errorResult`, `getGlobal`, `getPack`, `okResult`,
        `parseEntityRef`, `RawRiver` from `./_shared`; `Tool`,
        `ToolResult` from `./index`; `findRiverByRef` and
        `RiverPackLike`-equivalent local type from `./rename-river`
        (re-use the existing river-resolution helper). Re-use
        `resolveRiverNameMode` from `./regenerate-river-names` so the
        canonicalization is shared.
  - [ ] Types:
    - [ ] `RegenerateRiverNameRef` —
          `{ i, name, mouth, removed?: boolean }`.
    - [ ] `RegenerateRiverNameRuntime` —
          `{ find(ref): RegenerateRiverNameRef | null;
             generateCulture(mouth: number): string;
             generateRandom(): string;
             apply(i: number, name: string): void;
             redraw(): void }`.
  - [ ] `defaultRegenerateRiverNameRuntime`:
    - [ ] `find(ref)`: walk `pack.rivers` via `findRiverByRef` (which
          already skips removed rivers) — but to surface the
          `"Cannot regenerate name for removed river ${i}."` error we
          ALSO need a path that returns removed rivers. Use a small
          local helper that walks `pack.rivers` matching by `i` or
          name without skipping removed; flag `removed: true` on the
          returned ref so the tool can produce the dedicated error.
    - [ ] `generateCulture(mouth)`:
      - [ ] Look up `Rivers` via `getGlobal<RiversModuleLike>("Rivers")`.
      - [ ] If not present → throw
            `"Rivers.getName is not available; the map hasn't finished loading."`.
      - [ ] If `typeof Rivers.getName !== "function"` → same throw.
      - [ ] Return `Rivers.getName(mouth)`.
    - [ ] `generateRandom()`:
      - [ ] Look up `Names` via `getGlobal<NamesModuleLike>("Names")`.
      - [ ] If `Names.getBase` not a function → throw
            `"Names.getBase is not available; the map hasn't finished loading."`.
      - [ ] Look up `nameBases` via `getGlobal<unknown[]>("nameBases")`.
      - [ ] If not array OR length === 0 → throw
            `"nameBases is not available or empty."`.
      - [ ] Look up legacy `rand` global; if function, use
            `rand(nameBases.length - 1)`; else fall back to
            `Math.floor(Math.random() * nameBases.length)`.
      - [ ] Return `Names.getBase(idx)`.
    - [ ] `apply(i, name)`:
      - [ ] Find live river in `pack.rivers` by id; throw
            `"River ${i} not found."` if missing.
      - [ ] Set `river.name = name`.
      - [ ] Best-effort: if `document` is defined, look up
            `#riverName` (the editor's input) and update its `value`
            when its `data-river-i` (or the open editor) matches —
            keep it minimal: skip if any DOM lookup throws. (Optional;
            not tested. Primarily we mirror the legacy editor's
            `riverName.value = …` side effect, but only when the
            editor for THIS river is open.)
    - [ ] `redraw()`: call `getGlobal<() => void>("drawRivers")?.()`.
  - [ ] `createRegenerateRiverNameTool(runtime)`:
    - [ ] `name = "regenerate_river_name"`.
    - [ ] Description: explain that this mirrors the per-river
          "Generate (culture)" and "Generate (random)" buttons in the
          Rivers Editor; that culture mode calls
          `Rivers.getName(river.mouth)` and random mode calls
          `Names.getBase(rand(nameBases.length - 1))`; that the river
          is identified by id (river.i) or case-insensitive name; that
          rivers removed by `remove_river` cannot be renamed.
    - [ ] `input_schema` per plan (river required, mode optional with
          enum + default-in-description).
    - [ ] `execute`:
      - [ ] Parse `river` via `parseEntityRef(input.river, "river")`.
      - [ ] Resolve mode: default "culture"; if `input.mode` is
            non-null/undefined, run through `resolveRiverNameMode`;
            on null result return
            `errorResult("mode must be 'culture' or 'random'.")`.
      - [ ] `target = runtime.find(parsed.ref)`; if null →
            `errorResult(\`River ${JSON.stringify(parsed.ref)} not found.\`)`.
      - [ ] If `target.removed === true` →
            `errorResult(\`Cannot regenerate name for removed river ${target.i}.\`)`.
      - [ ] Capture `previousName = target.name` BEFORE generating /
            applying.
      - [ ] Try generation:
            ```ts
            const newName = mode === "culture"
              ? runtime.generateCulture(target.mouth)
              : runtime.generateRandom();
            ```
            Wrap in try/catch → `errorResult(err.message)`.
      - [ ] Validate `typeof newName === "string"` and trimmed
            non-empty; else
            `errorResult("Name generator returned an empty/invalid name.")`.
      - [ ] Try `runtime.apply(target.i, newName.trim())`; on throw
            → `errorResult(err.message)`.
      - [ ] Best-effort: `try { runtime.redraw(); } catch {}`.
      - [ ] Return:
            ```ts
            okResult({
              river: {
                i: target.i,
                previous_name: previousName,
                name: newName.trim(),
              },
              mode,
            });
            ```
  - [ ] Export `regenerateRiverNameTool = createRegenerateRiverNameTool();`.

- [ ] Create `src/ai/tools/regenerate-river-name.test.ts`:
  - [ ] Stub-runtime helper `makeRuntime(...)` patterned after
        `regenerate-burg-name.test.ts` — returns
        `{ runtime, find, generateCulture, generateRandom, apply, redraw }`
        with `vi.fn()` implementations.
  - [ ] Stub suite:
    - [ ] Test 1: happy path mode="culture" — verify
          `generateCulture` called with `river.mouth`; `apply(5, "Foo")`;
          previous_name in body equals "Old River".
    - [ ] Test 2: happy path mode="random" — verify `generateRandom`
          called and `apply(5, "Bar")`.
    - [ ] Test 3: default mode (omitted) === "culture" — assert
          `generateCulture` was called and `generateRandom` was not.
    - [ ] Test 4: case-insensitive mode "RANDOM" → random.
    - [ ] Test 5: happy path by river name (case-insensitive) —
          `find` called with the user-provided string; success.
    - [ ] Test 6: river not found — `find` returns null →
          `"River <ref> not found."`.
    - [ ] Test 7: removed river — `find` returns ref with
          `removed: true` →
          `"Cannot regenerate name for removed river <i>."`.
    - [ ] Test 8: bad mode — `mode: "other"` →
          `"mode must be 'culture' or 'random'."`. apply NOT called.
    - [ ] Test 9: bad river refs (null, undefined, 0, -1, 1.5, "")
          → ref-parser error.
    - [ ] Test 10: previous_name captured BEFORE mutation — `apply`
          implementation reads from a shared `state.name` and asserts
          that the body's `previous_name` matches the pre-call value
          (i.e. snapshot was taken before `apply`).
    - [ ] Test 11: empty generator output → error; apply NOT called.
    - [ ] Test 12: generator throws → error message propagated;
          apply NOT called.
    - [ ] Test 13: redraw failure swallowed — response is still
          success.
    - [ ] Test 14: tool name + required schema fields
          (`["river"]`).
  - [ ] Registry round-trip: `register` + `run` via `ToolRegistry`,
        verify pack mutated.
  - [ ] Default-runtime integration suite (`globalThis.pack`,
        `globalThis.Rivers`, `globalThis.Names`,
        `globalThis.nameBases`, `globalThis.rand`,
        `globalThis.drawRivers`):
    - [ ] Test 15: culture mode → `Rivers.getName(mouth)` called,
          `pack.rivers[k].name` mutated.
    - [ ] Test 16: random mode with a stubbed `globalThis.rand`
          returning a fixed index → `Names.getBase(<that index>)`
          called.
    - [ ] Test 17: missing `Rivers.getName` (culture) → error
          mentions `Rivers.getName`.
    - [ ] Test 18: missing `Names.getBase` (random) → error mentions
          `Names.getBase`.
    - [ ] Test 19: empty `nameBases` (random) → error mentions
          `nameBases`.
    - [ ] Test 20: removed river by id → error.
    - [ ] Test 21: river not found by name → error.

- [ ] `src/ai/index.ts`:
  - [ ] Add
        `import { regenerateRiverNameTool } from "./tools/regenerate-river-name";`
        immediately BEFORE the existing
        `import { regenerateRiverNamesTool } from "./tools/regenerate-river-names";`
        line (alphabetical; `regenerate_river_name` <
        `regenerate_river_names`).
  - [ ] Add
        ```ts
        export {
          createRegenerateRiverNameTool,
          defaultRegenerateRiverNameRuntime,
          type RegenerateRiverNameRef,
          type RegenerateRiverNameRuntime,
          regenerateRiverNameTool,
        } from "./tools/regenerate-river-name";
        ```
        immediately BEFORE the existing
        `export { ... regenerateRiverNamesTool ... } from "./tools/regenerate-river-names";`
        block.
  - [ ] Add `registry.register(regenerateRiverNameTool);` immediately
        BEFORE `registry.register(regenerateRiverNamesTool);` in
        `buildDefaultRegistry()`.

## Verification

- [ ] `npm test` — all green.
- [ ] `npx tsc --noEmit` — no errors.
- [ ] `npm run lint` — no warnings.

## Commit

- [ ] Stage `src/ai/tools/regenerate-river-name.ts`,
      `src/ai/tools/regenerate-river-name.test.ts`,
      `src/ai/index.ts`,
      `aiplans/plan_356.md`,
      `aiplans/tasks_356.md`.
- [ ] Commit with the spec-required message.

## Self-review checklist (re-read before implementing)

- [ ] Plan and tasks both name file paths consistently
      (`regenerate-river-name.ts`, `regenerate-river-name.test.ts`).
- [ ] Culture-mode dispatch is `Rivers.getName(mouth)`, NOT
      `Names.getCulture(...)` — verified in tasks (default runtime
      `generateCulture`) and tests (test 15).
- [ ] previous_name captured BEFORE mutation — verified in tasks
      (`execute` step, before generation) and tests (test 10).
- [ ] Default mode (omitted) === "culture" — test 3.
- [ ] Random mode uses an injectable random fn for determinism —
      tasks (default runtime), tests (test 16 stubs `globalThis.rand`).
- [ ] All "Errors (verbatim)" lines from plan exactly match what
      tests assert.
- [ ] Insert points in `src/ai/index.ts` are alphabetical
      (`regenerate_river_name` < `regenerate_river_names`).
