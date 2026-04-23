# Plan 122 — regenerate_all_state_names AI tool

## Use case

The States Editor has a "Regenerate Names" button that rolls
fresh short names for all non-locked states at once (skipping
Neutrals, state i=0). We already have the single-state
equivalent (`regenerate_state_name`) and the bulk-burgs
equivalent (`regenerate_all_burg_names`). This plan adds the
bulk-states counterpart so the AI can say "reroll every state
name" with one tool call.

## Scope

Add one tool: `regenerate_all_state_names(mode?)`.

- `mode` (optional, case-insensitive, default `"culture"`):
  - `"culture"` — calls
    `Names.getState(Names.getCultureShort(state.culture),
    state.culture)` per state (matches UI).
  - `"random"` — picks a random name-base per state and calls
    `Names.getState(Names.getBase(base), undefined, base)`.
- Skips state 0 (Neutrals) and any state with `state.lock`.
- Also skips removed states (`state.removed`) for safety.
- Redraws all labels once at the end via
  `window.drawStateLabels()` (no arg — full redraw).
- Per-state generator errors are logged to `skipped` with a
  reason; the loop continues. `execute` never throws out.

Return payload:

```
{
  ok: true,
  mode: "culture" | "random",
  renamed: [{ i, previousName, name }],
  skipped: [{ i, name, reason }]
}
```

## Implementation

1. **New file** `src/ai/tools/regenerate-all-state-names.ts`:
   - Reuses `STATE_NAME_MODES`, `StateNameMode`,
     `resolveStateNameMode` from `./regenerate-state-name`.
   - Runtime seam with four methods (`list`, `generate`,
     `apply`, `redraw`) so the tool-layer logic is testable
     without touching globals.
   - `defaultRegenerateAllStateNamesRuntime`:
     - `list()` — reads `pack.states` via `getPackCollection`.
     - `generate(mode, culture)` — same algorithm as the
       single-state tool (shares the same `NamesModule`
       access pattern).
     - `apply(i, name)` — writes `states[i].name`.
     - `redraw()` — calls `window.drawStateLabels()` with no
       args (matches States Editor behavior for bulk rerolls).

2. **Register** in `src/ai/index.ts`: import factory + tool,
   re-export the factory and tool in the barrel, and
   `registry.register(regenerateAllStateNamesTool)`.

3. **Tests** `regenerate-all-state-names.test.ts`:
   - Unit (stubbed runtime):
     - default mode is culture
     - explicit random mode
     - rejects unknown mode
     - surfaces list/apply errors without throwing
     - skips state 0, locked, removed
     - includes generator errors in `skipped`, continues
     - redraws exactly once at the end
   - `defaultRegenerateAllStateNamesRuntime` integration:
     - stubs `globalThis.pack`, `globalThis.Names`,
       `globalThis.nameBases`, `globalThis.drawStateLabels`.
     - culture mode updates only eligible states.
     - random mode calls `getBase` + `getState`.
     - errors when `Names` is missing.

4. **README_AI.md** — add a row right after
   `regenerate_all_burg_names` (and before
   `regenerate_state_name`).

## Verification

- `npm test -- --run` — expect 1495 → 1495 + N green.
- `npm run lint` — 7 warnings, 1 info, 0 errors (unchanged).
- `npm run build` — succeeds.

## Success criteria

- Tool callable, wired into default registry, documented.
- Matches the States Editor "Regenerate Names" button.
- Skips Neutrals + locked + removed; renames all others.
- `execute` never throws — partial progress reported via
  `renamed` / `skipped`.
- One single redraw at the end, not one per state.
