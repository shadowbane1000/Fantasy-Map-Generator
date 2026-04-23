# Plan 241 — `get_diplomacy_between`

## Use Case

Expose a single-point-lookup tool that reads the current diplomatic relationship between two specific states, mirroring `pack.states[state_a].diplomacy[state_b]`. `list_diplomacy` already emits the full matrix and `get_state_info` already returns the whole row — this tool is the targeted scalar read that avoids either the pagination overhead or dumping an entire state dossier.

## Inputs

- `state_a` (required): numeric id (> 0) or case-insensitive `name` / `fullName`. Neutrals (id 0) rejected.
- `state_b` (required): same shape. Neutrals rejected. Must differ from `state_a` after resolution.

## Behavior

- Resolve both refs via the shared `resolveStateRefInPack` (the same helper `set_diplomacy` / `list_diplomacy` use).
- Guard: reject id 0, removed states, and unresolvable refs.
- Guard: reject when resolved `state_a === state_b` with a clear error.
- Read `pack.states[state_a].diplomacy[state_b]`.
  - When the row is absent OR the slot is the `"x"` self-sentinel, surface `null` as the relationship (consistent with `readDiplomacyFromPack`).
- Return `{ ok, state_a: {i, name}, state_b: {i, name}, relationship }`.
- Read-only — never mutate `pack`.

## Runtime Seam

Mirror the pattern used by `list-diplomacy.ts`:

```ts
export interface DiplomacyBetweenRuntime {
  read(aRef: number | string, bRef: number | string):
    | { aId: number; aName: string; bId: number; bName: string; relationship: string | null }
    | "not-ready"
    | "not-found"
    | "neutral"
    | "same-state";
}
```

The default runtime calls `getPack<BurgPackLike>()`, reuses `resolveStateRefInPack`, and resolves the relation via the state's `diplomacy` array.

## Tests

Pure/seam:

1. Returns `{ ok, state_a, state_b, relationship }` for a normal pair with an Ally relation.
2. Returns `relationship: null` when the slot is `"x"` (self-sentinel / unset).
3. Returns `relationship: "Enemy"` with the same casing the engine writes (no alias expansion).
4. Rejects `state_a === state_b` (after resolving).
5. Rejects `state_a = 0` and `state_b = 0` explicitly (Neutrals).
6. Rejects invalid ref shapes: `null`, `undefined`, `""`, `1.5`, `-1`.
7. Rejects unresolvable ref (returns `"not-found"` seam).
8. Returns not-ready error when the runtime reports `"not-ready"`.
9. Name resolution is case-insensitive.

Integration (defaultDiplomacyBetweenRuntime):

10. Reads from live `globalThis.pack` — Ally pair.
11. Missing `diplomacy` array → `null` relationship (seam returns the ok shape with `relationship: null`, no throw).
12. Removed state rejected.

## Registration

- Import `getDiplomacyBetweenTool` in `src/ai/index.ts` alphabetically (between `getCultureInfoTool` and `getEntityBboxTool`).
- Re-export the module's named exports (`createGetDiplomacyBetweenTool`, `defaultDiplomacyBetweenRuntime`, `getDiplomacyBetweenTool`, `readDiplomacyBetweenFromPack`, type `DiplomacyBetweenRuntime`).
- `registry.register(getDiplomacyBetweenTool)` alongside the other `get_*_info` registrations.

## Docs

Add a README_AI.md row adjacent to `list_diplomacy` / `set_diplomacy`. Include:

- Description (what it returns, the relationship strings).
- Note that it requires an Anthropic API key (see "Getting an API key" below).
- A few natural-language usage examples ("Are Rookhold and Ashholm allies?", "What's state 3's relationship with state 7?").

## Non-Goals

- No writes (that's `set_diplomacy`).
- No matrix output (that's `list_diplomacy`).
- No symmetric echo — the tool reports `state_a`'s view; callers who want `state_b`'s side can swap args.
