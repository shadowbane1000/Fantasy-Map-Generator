# Plan 28 — Use Case: Reassign a burg to a different culture

## Status

Iteration 28. 27 AI tools. Baseline 7 warnings / 1 info / 0 errors.
352 tests pass.

## Use Case

**"Change which culture a specific burg belongs to."**

The Burg Editor has a Culture dropdown (`#burgCulture`). The
handler `changeCulture` in
`public/modules/ui/burg-editor.js:140-143` is a one-liner:

```js
pack.burgs[id].culture = +this.value;
```

There's no SVG redraw — the culture link is metadata, not visual.
It feeds back into population rollups and naming suggestions.

Prompts:
- *"Change Stormport's culture to Coastalfolk."*
- *"Assign burg 5 to culture 3."*

### Success criteria

1. `set_burg_culture({burg: 5, culture: 3})` sets
   `pack.burgs[5].culture = 3`.
2. `set_burg_culture({burg: "stormport", culture: "coastalfolk"})`
   resolves both refs case-insensitively.
3. Rejects burg 0 (placeholder).
4. Rejects unknown burg ref.
5. Rejects unknown culture ref.
6. `culture: 0` (Wildlands) is *allowed* — the UI lets you pick
   Wildlands. Document this explicitly.
7. Runtime throws → structured error.
8. Response reports `{i, name, previousCulture: {id, name},
   culture: {id, name}}`.

## Scope

In-scope:
- `set_burg_culture` tool with `BurgCultureRuntime` seam.
- Registry + README + tests.

Out-of-scope:
- Regenerating the burg's name from the new culture (the user can
  invoke `rename_burg` separately).
- Changing `state` / `province` — separate tools when needed.

## Design

New file: `src/ai/tools/set-burg-culture.ts`.

```ts
export interface BurgCultureRef {
  i: number;
  name: string;
  previousCulture: { id: number; name: string | null };
}
export interface BurgCultureRuntime {
  findBurg(ref: number | string):
    | { i: number; name: string; previousCultureId: number }
    | null;
  findCulture(ref: number | string):
    | { id: number; name: string }
    | null;
  setCulture(burgId: number, cultureId: number): void;
}
```

Default runtime:
- `findBurg`: `findEntityByRef(pack.burgs, ref)` → `{i, name,
  previousCultureId: burg.culture ?? 0}`.
- `findCulture`: need to accept id 0 (Wildlands) AND non-zero ids.
  Custom: if `ref` is the integer 0 or the string "wildlands",
  return `{id: 0, name: "Wildlands"}`. Otherwise delegate to
  `findEntityByRef(pack.cultures, ref)`.
- `setCulture(burgId, cultureId)`: mutate `pack.burgs[burgId].culture
  = cultureId`.

Executor:
1. Validate burg ref and culture ref types.
2. `findBurg` → null → error; burg 0 → error.
3. `findCulture` → null → error.
4. `runtime.setCulture(burg.i, culture.id)`.
5. Return okResult with previous + new id/name.

## Files

Create: `plan_28.md`, `tasks_28.md`,
`src/ai/tools/set-burg-culture.ts`,
`src/ai/tools/set-burg-culture.test.ts`.

Modify: `src/ai/index.ts`, `README_AI.md`.

## Testing

Unit (`set-burg-culture.test.ts`):

1. Numeric ids → `setCulture` called; previous reported.
2. Case-insensitive names for both burg and culture.
3. Wildlands (id 0 / "wildlands") accepted as a valid target.
4. Reject burg 0.
5. Unknown burg → error; setCulture not called.
6. Unknown culture → error; setCulture not called.
7. Runtime throws → error.
8. Invalid ref types rejected.

## Plan ↔ tasks ↔ tests verification

Each success criterion has a test. Wildlands special-case is unusual
enough to deserve its own test.

Lint / test / build gates in tasks_28.md.
