# Plan 322 — Tasks

## Step 1 — Lint baseline

- [x] Run `npm run lint 2>&1 | tail -40` and record into plan_322.md.

## Step 2 — Plan

- [x] Write `aiplans/plan_322.md`.

## Step 3 — Tasks

- [x] Write `aiplans/tasks_322.md` (this file).

## Step 4 — Self-review

- [ ] Re-read `aiplans/plan_322.md` and `aiplans/tasks_322.md`.
- [ ] Verify schema, validation, runtime seam, default runtime, tests
  all line up. Edit if anything is missing.
- [ ] Record review at the bottom of plan_322.md.

## Step 5 — Implementation

### `src/ai/tools/clear-relief-icons.ts`

- [ ] Imports: `errorResult`, `getGlobal`, `okResult` from `./_shared`;
  `Tool`, `ToolResult` from `./index`.
- [ ] `interface ClearReliefIconsRuntime { getTerrainRoot(): Element | null; }`
- [ ] `interface TerrainSelectionLike { node?: () => Element | null; }`
  for the D3 fallback shape.
- [ ] `defaultClearReliefIconsRuntime`:
  - [ ] Try `getGlobal<TerrainSelectionLike>("terrain")?.node?.()` first.
  - [ ] Fall back to `document.getElementById("terrain")` (guard
    `typeof document !== "undefined"`).
  - [ ] Return `null` if neither.
- [ ] `createClearReliefIconsTool(runtime?)`:
  - [ ] `name: "clear_relief_icons"`.
  - [ ] `description`: mention "permanently removes relief icons",
    the optional `#`-prefixed `type`, return shape, that this is a
    DOM-only operation.
  - [ ] `input_schema`: `{ type: "object", properties: { type: {
    type: "string", description: "..." } } }`.
  - [ ] `execute`: validate, locate root, query, capture count,
    remove, return `okResult`.
  - [ ] Surface errors via `errorResult`.
- [ ] Export `clearReliefIconsTool = createClearReliefIconsTool()`.

### `src/ai/tools/clear-relief-icons.test.ts`

- [ ] Stub-runtime tests (1–7 from plan):
  - [ ] No filter — removes all `<use>`.
  - [ ] With filter — removes only matching, non-matching untouched.
  - [ ] Empty root — `removed_count: 0`.
  - [ ] Filter matches nothing — `removed_count: 0`.
  - [ ] `type` without leading `#` → error.
  - [ ] `type` non-string (number / boolean / object) → error.
  - [ ] `getTerrainRoot()` returns `null` → error.
- [ ] Default-runtime tests (8–10):
  - [ ] Sets `globalThis.window`/`globalThis.terrain` with `.node()`
    returning a fake `<g>` containing `<use>` children, invoke
    `clearReliefIconsTool.execute({})`, verify children gone.
  - [ ] `terrain` missing but `document.getElementById("terrain")`
    returns the fake → still works.
  - [ ] Both missing → error.
  - [ ] Restore globals in `afterEach`.
- [ ] Metadata + registry round-trip (11):
  - [ ] `tool.name === "clear_relief_icons"`.
  - [ ] `createClearReliefIconsTool()` produces equivalent tool.

### `src/ai/index.ts`

- [ ] Add `import { clearReliefIconsTool } from "./tools/clear-relief-icons";`
  near `clearRulersTool` import.
- [ ] Add the matching re-export block (`{ clearReliefIconsTool,
  createClearReliefIconsTool }`).
- [ ] Add `registry.register(clearReliefIconsTool);` near
  `registry.register(clearRulersTool);`.

## Step 6 — Verification

- [ ] `npm test` — passes (specifically including the new test file).
- [ ] `npx tsc --noEmit` — clean.
- [ ] `npm run lint` — does NOT regress (same warnings as baseline).

## Step 7 — Commit

- [ ] `git add` only:
  - `src/ai/tools/clear-relief-icons.ts`
  - `src/ai/tools/clear-relief-icons.test.ts`
  - `src/ai/index.ts`
  - `aiplans/plan_322.md`
  - `aiplans/tasks_322.md`
- [ ] Do NOT stage:
  - `.claude/`
  - `current-ralph-loop.prompt`
  - `src/ai/chat-controller.ts` (already dirty on master)
- [ ] Commit message: `feat(ai): add clear_relief_icons tool` with
  Co-Authored-By trailer.
- [ ] Don't push.

## Step 8 — Report back

- Worktree path, branch, commit SHA, tests/tsc/lint status, caveats.
