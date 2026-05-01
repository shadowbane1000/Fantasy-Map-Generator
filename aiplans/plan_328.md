# Plan 328: `regenerate_diplomacy` tool

## Use case

Add an AI chat tool `regenerate_diplomacy` that re-randomizes the
diplomatic relations between every pair of states. This mirrors the
legacy `regenerateRelations` function in
`public/modules/ui/diplomacy-editor.js` (line 345):

```js
function regenerateRelations() {
  States.generateDiplomacy();
  refreshDiplomacyEditor();
}
```

`window.States.generateDiplomacy()` is the existing global helper
defined in `src/modules/states-generator.ts` (line 399). It rewrites
`state.diplomacy` on every state with a freshly randomized matrix of
relations: `Friendly`, `Neutral`, `Suspicion`, `Enemy`, `Vassal`,
`Suzerain`, `Ally`, `Rival`, `Unknown` (with `"x"` on the diagonal
and against the neutral state 0).

The user can already trigger this via the **Regenerate** button in
the Diplomacy editor; the AI chat had no equivalent until now.

We already have:

- `set_diplomacy` (sets one specific pair)
- `list_diplomacy`
- `get_diplomacy_between`

This plan adds the missing **regenerate-everything** action — analogous
to `regenerate_zones`, `regenerate_emblems`, `regenerate_domain`,
`regenerate_all_state_names`, etc.

## Lint baseline

`cd /workspace/.claude/worktrees/plan-328 && npm run lint 2>&1 | tail -50`
on the worktree base (master @ ecc699a, branch
`plan-328-regenerate-diplomacy`, working tree clean) reports:

```
Checked 761 files in 612ms. No fixes applied.
```

**0 errors, 0 warnings, 0 info.** Implementation must not regress
this — any new warning is a fail.

## Behavior

- The tool takes no arguments.
- Look up `window.States` via `getGlobal<…>("States")`. If
  `typeof States.generateDiplomacy !== "function"`, return an error
  result.
- Call `States.generateDiplomacy()` exactly once.
- After the call, walk `pack.states` and compute:
  - `states_count` — number of active states (`i > 0`, not `removed`).
  - `histogram` — counts of each relation value across all unordered
    pairs of active states (we read the relation from `state_a.diplomacy[b.i]`
    for `a.i < b.i`). Keys are the relation strings as stored
    (`"Ally"`, `"Friendly"`, `"Neutral"`, `"Suspicion"`, `"Enemy"`,
    `"Unknown"`, `"Rival"`, `"Vassal"`, `"Suzerain"`, plus the `"x"`
    placeholder if it ever shows up). Zero-count keys are omitted.
- The success payload is intentionally a small histogram — not the
  full pair list — because for N states the matrix has N(N-1)/2
  entries (e.g. 15 states ≈ 105 entries) and would bloat tool
  responses with low information density. The histogram tells the LLM
  what the new diplomatic landscape looks like at a glance; if it
  needs the full breakdown, it can call `list_diplomacy`.
- No SVG redraw is required. Diplomacy data is not on-canvas — only
  the editor matrix shows it, and that only exists while the editor
  is open. (The legacy `refreshDiplomacyEditor()` call is purely a
  DOM refresh of the diplomacy editor popup; if that popup happens
  to be open when the AI runs the tool the user can refresh it
  manually. Mirroring this best-effort would mean calling out to a
  closure-scoped function which is not exposed globally — so we
  skip it. Test §6 documents this is intentional.)

### Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {}
}
```

No required fields. The tool takes no input.

### Validation

- `pack` must exist and `pack.states` must be an array — but rather
  than gating on this in the tool layer, we let the runtime call
  through. `States.generateDiplomacy()` itself reads `pack.states`
  internally, and any failure throws synchronously; we catch and
  surface as `errorResult`. This matches `regenerate_emblems` /
  `regenerate_zones` precedent — no pre-flight validation, just
  delegate and surface errors.
- The post-call histogram walk treats a missing `pack.states` as
  zero active states (returns `{ states_count: 0, histogram: {} }`)
  rather than throwing. If `States.generateDiplomacy` succeeded,
  the data is by definition there, but defensively returning empty
  counts is safer than a second throw site.
- Diplomacy is undefined when `< 2` states exist; `States.generateDiplomacy`
  itself returns early in that case (states-generator.ts line 415:
  `if (valid.length < 2) return;`). The tool still returns
  `okResult` with `states_count: 0|1` and `histogram: {}` — empty
  histogram is the correct signal that no pairs exist.

### Errors

- `States` global missing or `generateDiplomacy` not a function:
  `"States.generateDiplomacy is not available; the map hasn't finished loading."`
  (matches the wording style of the `Zones.generate is not available
  yet; the map hasn't finished loading.` error used by
  `regenerate_zones`.)
- Runtime throw inside `generateDiplomacy()`: surfaced via
  `errorResult(err instanceof Error ? err.message : String(err))`
  (mirrors all other regenerate-* tools).

### Success result

`okResult({ ok: true, states_count: N, histogram: { ... } })`

Example for a 5-state map:

```json
{
  "ok": true,
  "states_count": 5,
  "histogram": {
    "Friendly": 2,
    "Neutral": 3,
    "Suspicion": 2,
    "Enemy": 1,
    "Ally": 1,
    "Unknown": 1
  }
}
```

When fewer than 2 active states exist:

```json
{ "ok": true, "states_count": 1, "histogram": {} }
```

## Files

- **NEW** `src/ai/tools/regenerate-diplomacy.ts` — the tool, patterned
  on `regenerate-emblems.ts` + `regenerate-zones.ts`. Exports:
  - `interface RegenerateDiplomacyResult { states_count: number; histogram: Record<string, number>; }`
  - `interface RegenerateDiplomacyRuntime { regenerate(): void; summarize(): RegenerateDiplomacyResult; }`
  - `defaultRegenerateDiplomacyRuntime` — `regenerate()` calls
    `getGlobal<{ generateDiplomacy?: () => void }>("States")` and
    invokes `generateDiplomacy()`; `summarize()` reads
    `getPackCollection<RawState>("states")` and computes the
    histogram across unordered active-state pairs.
  - `createRegenerateDiplomacyTool(runtime?)` returning `Tool` named
    `regenerate_diplomacy`.
  - `regenerateDiplomacyTool` — default-runtime instance.
- **NEW** `src/ai/tools/regenerate-diplomacy.test.ts` — Vitest spec
  (see Tests below).
- **MODIFY** `src/ai/index.ts`:
  - Add `import { regenerateDiplomacyTool } from "./tools/regenerate-diplomacy";`
    between line 182 (`regenerate-burg-name`) and line 183
    (`regenerate-domain`) — alphabetical.
  - Add re-export block (createTool + types + default tool) between
    the `regenerate-burg-name` re-export (line 1834-1839) and the
    `regenerate-domain` re-export (line 1840-1846).
  - Add `registry.register(regenerateDiplomacyTool);` in
    `defaultToolRegistry()` adjacent to other regenerate-*
    registrations — between `regenerateRouteNameTool` (line 2923)
    and `regenerateZonesTool` (line 2924) keeps the
    alphabetical-by-suffix grouping the file already prefers.

## Tests (Vitest)

Mirror the layout of `regenerate-emblems.test.ts` +
`regenerate-zones.test.ts`:

### `regenerate_diplomacy tool`

1. **Happy path**: stub runtime returns `{ states_count: 4,
   histogram: { Friendly: 3, Neutral: 2, Enemy: 1 } }`; tool returns
   `{ ok: true, states_count: 4, histogram: { Friendly: 3, Neutral: 2,
   Enemy: 1 } }`; `regenerate` was called exactly once;
   `summarize` was called exactly once and called **after**
   `regenerate` (use `vi.fn().mock.invocationCallOrder` to assert
   ordering — load-bearing: the histogram must reflect post-call
   state).
2. **Surfaces runtime errors**: stub `regenerate` throws
   `"States.generateDiplomacy is not available; the map hasn't finished loading."`
   → result `isError: true`, error contains
   `"States.generateDiplomacy"`. `summarize` is NOT called.
3. **Tool name + schema + registry round-trip**: `tool.name ===
   "regenerate_diplomacy"`; `input_schema.type === "object"`;
   `input_schema.properties` equals `{}`; `input_schema.required ===
   undefined`. Then import `ToolRegistry` from `./index`, instantiate
   a fresh registry, `registry.register(regenerateDiplomacyTool)`,
   and assert
   `registry.list().map(t => t.name).includes("regenerate_diplomacy")`.
   (Mirrors the pattern in `add-burg-group.test.ts`.)
4. **Empty-input handling**: passing `{}`, `null`, `undefined`, and a
   payload with extraneous keys all execute identically — the tool
   ignores its input.

### `defaultRegenerateDiplomacyRuntime (integration)`

5. **Calls States.generateDiplomacy and reports histogram**:
   - Set `globalThis.States = { generateDiplomacy: vi.fn(() => {
     /* mutate pack.states[i].diplomacy */ }) }`. The mock writes
     a deterministic post-state: 3 active states with diplomacy
     arrays such that the unordered-pair walk produces a known
     histogram (e.g. (1,2)=Ally, (1,3)=Enemy, (2,3)=Friendly →
     `{ Ally: 1, Enemy: 1, Friendly: 1 }`).
   - Set `globalThis.pack = { states: [{ i: 0 }, { i: 1, diplomacy: [] }, …] }`
     pre-call. The mock populates `diplomacy` arrays.
   - Call `regenerateDiplomacyTool.execute({})`.
   - Assert `generateDiplomacy` was called once, no args. Assert
     payload `{ ok: true, states_count: 3, histogram: { Ally: 1,
     Enemy: 1, Friendly: 1 } }`.
6. **Histogram skips removed states and state 0**: pack has states
   `[{ i:0 }, { i:1 }, { i:2, removed: true }, { i:3 }]`; mock
   populates diplomacy. The walk should consider only the (1,3)
   pair → histogram has exactly one entry.
7. **Empty histogram when < 2 active states**: pack has only state
   0 plus a single active state. `generateDiplomacy` returns early
   per states-generator.ts:415; tool still returns ok with
   `states_count: 1, histogram: {}`.
8. **Errors when States global missing**:
   `globalThis.States = undefined` → result `isError: true`,
   error matches `/States\.generateDiplomacy/`.
9. **Errors when States.generateDiplomacy is not a function**:
   `globalThis.States = { generateDiplomacy: "nope" }` (or the key
   omitted entirely) → same error.
10. **Surfaces a thrown runtime error**:
    `globalThis.States = { generateDiplomacy: () => { throw new
    Error("boom"); } }` → result `isError: true`, error
    `"boom"`.

### Setup/teardown

Per integration test, save and restore `globalThis.States` and
`globalThis.pack` (mirror `regenerate-emblems.test.ts` lines
58-91).

## Verification

- `npm test` — all green.
- `npx tsc --noEmit` — clean.
- `npm run lint 2>&1 | tail -50` — still **0 errors, 0 warnings, 0
  info**. Baseline must hold.

## Self-review (added during step 5)

Reviewed the plan + tasks against the use case:

- **Use case fidelity.** The legacy `regenerateRelations` does
  exactly two things: (1) call `States.generateDiplomacy()`, and
  (2) refresh the editor matrix. The tool faithfully mirrors (1).
  (2) is a UI affordance only relevant when the editor popup is
  open — skipped intentionally per Behavior section. A future
  enhancement could expose a global hook for it, but that is out
  of scope.
- **`States.generateDiplomacy` is called exactly once.** Test §1
  asserts this with `toHaveBeenCalledTimes(1)`. Test §5 (integration)
  also asserts it. The plan does not allow any retry / fallback
  semantics — single call, propagate errors.
- **Histogram is computed post-call.** Test §1 explicitly asserts
  invocation order via `mock.invocationCallOrder` so a regression
  that swaps `summarize()` and `regenerate()` would fail. This is
  the load-bearing test for "the tool reports the NEW state, not
  the prior state".
- **Histogram counts each pair once.** The walk iterates `a.i <
  b.i` only — skipping the symmetric duplicate (`b → a` is the
  reverse of `a → b`, and Vassal↔Suzerain are paired). Test §5
  uses 3 states with 3 distinct relations, so a duplicate-counting
  bug would inflate the histogram to 6 entries instead of 3.
- **Diagonal/neutral exclusion.** Active-state filter (`s.i > 0 &&
  !s.removed`) excludes the neutral state 0 (whose diplomacy is
  the chronicle, not real relations) and removed states. Test §6
  pins this.
- **`x` placeholder.** Live diplomacy arrays use `"x"` as the
  diagonal sentinel and as the value for any pair involving a
  removed/neutral state (states-generator.ts:413). Because the
  walk filters to active-state pairs and uses `a.i !== b.i` by
  construction (`a.i < b.i`), `"x"` should never appear in the
  histogram in practice. We do NOT pre-filter `"x"` out of the
  counter — if it does show up (e.g. a partial regen leaves stale
  values), reporting it is more useful than hiding it. Plan
  Behavior section reflects this.
- **Empty histogram when < 2 states.** `States.generateDiplomacy`
  returns early; the tool's summarize walks zero pairs and
  produces `{}`. This is the correct "nothing to report"
  signal — better than a misleading nonzero or an error. Test §7
  pins this.
- **Error wording matches neighbours.** `"States.generateDiplomacy
  is not available; the map hasn't finished loading."` mirrors
  `"Zones.generate is not available yet; the map hasn't finished
  loading."` in `regenerate-zones.ts`. Slight difference: omit
  the "yet" because the Zones wording is itself slightly redundant
  ("not available yet; … hasn't finished") and the diplomacy
  wording is cleaner without it. This is a minor style
  improvement, not a regression.
- **Result field naming.** `states_count` and `histogram` are
  snake_case + plain English, matching `regenerate_emblems`'s
  `states / burgs / provinces` plain-noun style. The integer
  field uses `_count` suffix to disambiguate from a list — there
  is no `states` list in this payload, just a count. Histogram
  keys are PascalCase (matching the storage form). All neighbour
  tools that emit relation strings (set_diplomacy, list_diplomacy)
  also use PascalCase — consistent.
- **No-input schema.** `properties: {}`, no `required` — matches
  `regenerate_emblems` exactly. Test §3 asserts the schema shape.
- **Alphabetical insertion.** `regenerate-diplomacy` slots between
  `regenerate-burg-name` and `regenerate-domain` in imports,
  re-exports, AND in the registry block. The registry currently
  groups regenerate-* roughly alphabetically with COA tools first
  then names then zones — placing the new tool just before
  `regenerateZonesTool` keeps it inside the "regenerate cluster"
  without breaking the implicit grouping.
- **Test isolation.** Integration tests save/restore
  `globalThis.States` and `globalThis.pack` in beforeEach /
  afterEach; this matches the pattern in
  `regenerate-emblems.test.ts` and avoids cross-test bleed.
- **Registry round-trip correction.** Initial draft proposed
  dispatching through `ToolRegistry.run` for §3, but inspection of
  `regenerate-emblems.test.ts`, `regenerate-zones.test.ts`, and
  `regenerate-domain.test.ts` shows none of the regenerate-* tools
  do dispatch-level round-tripping — they only assert tool name +
  exercise execute() directly. Following that precedent, §3 now
  asserts name + schema shape and adds a lightweight
  `registry.register(...) → registry.list()` membership check
  (mirroring `add-burg-group.test.ts`). This is a strict superset
  of the regenerate-family precedent without overshooting.
