# Plan 33 — Use Case: Change a burg's type

## Status

Iteration 33. 32 AI tools. Baseline 7 warnings / 1 info / 0 errors.
414 tests pass.

## Use Case

**"Change the type category of a specific burg."**

The Burg Editor's Type dropdown (`#burgType` in
`src/index.html:3469-3477`) lets the user pick between 7 categories
that affect naming style and icon choice:

- Generic, River, Lake, Naval, Nomadic, Hunting, Highland.

The handler `changeType` in `public/modules/ui/burg-editor.js:135-138`
writes the selected value directly to `pack.burgs[i].type`.

Prompts:
- *"Make Stormport a Naval burg."*
- *"Change burg 5's type to Highland."*

### Success criteria

1. `set_burg_type({burg: 5, type: "Naval"})` sets
   `pack.burgs[5].type = "Naval"`.
2. `set_burg_type({burg: "stormport", type: "naval"})` resolves both
   refs case-insensitively; type is canonicalized (`"Naval"`).
3. Rejects burg 0 (placeholder).
4. Rejects unknown burg ref.
5. Rejects unknown type with a structured error listing the 7
   canonical values.
6. Runtime throws → structured error.
7. Returns `{i, name, previousType, type}`.

## Scope

In-scope:
- `set_burg_type` tool with `BurgTypeRuntime` seam.
- Pure `BURG_TYPES` tuple + `resolveBurgType(s)` helper.
- Registry + README + tests.

Out-of-scope:
- Regenerating name based on type (future `regenerate_burg_name`).
- Changing icon (the icon is derived from type + group at generation).

## Design

New file: `src/ai/tools/set-burg-type.ts`.

```ts
export const BURG_TYPES = [
  "Generic","River","Lake","Naval","Nomadic","Hunting","Highland"
] as const;
export type BurgType = (typeof BURG_TYPES)[number];

export interface BurgTypeRef {
  i: number;
  name: string;
  previousType: string | null;
}
export interface BurgTypeRuntime {
  find(ref: number | string): BurgTypeRef | null;
  apply(i: number, type: BurgType): void;
}
```

`resolveBurgType(s)` — trim+lowercase, match against lowercased
canonical values, return canonical casing or null.

Default runtime:
- `find`: `findEntityByRef(pack.burgs, ref)` → `{i, name,
  previousType}`.
- `apply(i, type)`: `pack.burgs[i].type = type`.

## Files

Create: `plan_33.md`, `tasks_33.md`,
`src/ai/tools/set-burg-type.ts`,
`src/ai/tools/set-burg-type.test.ts`.

Modify: `src/ai/index.ts`, `README_AI.md`.

## Testing

Unit (`set-burg-type.test.ts`):

1. Numeric id + canonical type → `apply` called.
2. Case-insensitive type + name lookup.
3. Reject burg 0.
4. Reject unknown burg.
5. Reject unknown type with `supported` list.
6. Reject invalid type types (number, null, empty).
7. Runtime throws → error.

Pure helper:

8. `resolveBurgType` for all 7 canonical values (+ alternate casing
   "NAVAL", "  highland  ").
9. Returns null for unknown values and non-strings.

## Plan ↔ tasks ↔ tests verification

Each criterion has a test.

Lint / test / build gates in tasks_33.md.
