# Plan 15 — Use Case: Rename a religion

## Status

Iteration 15. 14 tools implemented (`list_religions` added last).
Baseline 7 warnings / 1 info / 0 errors. 196 tests pass.

## Use Case

**"Rename a specific religion."**

The user does this in the Religions Editor; `religionChangeName` in
`public/modules/dynamic/editors/religions-editor.js:356-364` runs:

```js
pack.religions[id].name = newName;
pack.religions[id].code = abbreviate(newName, allCodes);
```

This is structurally identical to culture rename (iter 13), so we'll
reuse the `fallbackAbbreviate` helper from `rename-culture.ts`.

Prompts:
- *"Rename Old Faith to Wildshrine."*
- *"Rename religion 2 to Dawnkeepers."*

### Success criteria

1. `rename_religion({religion: 2, name: "Dawnkeepers"})` sets
   `pack.religions[2].name = "Dawnkeepers"` and regenerates the code.
2. `rename_religion({religion: "old faith", name: "Wildshrine"})` →
   case-insensitive resolution.
3. Rejects the index-0 "No religion" placeholder.
4. Rejects unknown id / name.
5. Rejects empty / whitespace names; trims valid input.
6. Runtime errors surfaced as structured tool errors.
7. Pre-load (pack / religions missing) → error via runtime returning
   null.

## Scope

In-scope: `rename_religion` tool, `ReligionMutationRuntime` seam,
pure helper `findReligionForRenameInPack`, registry, README, tests.

Out-of-scope: changing type / form / color / deity (future).

## Design

New file: `src/ai/tools/rename-religion.ts`.

```ts
export interface ReligionRef { i: number; name: string; code: string | null; }
export interface ReligionMutationRuntime {
  find(ref: number | string): ReligionRef | null;
  rename(i: number, name: string): { code: string };
}
```

Default runtime calls `window.abbreviate(name, otherCodes)` (same
approach as `rename-culture`), with `fallbackAbbreviate` as a safe
default. Re-use `fallbackAbbreviate` by importing it from
`rename-culture.ts` to avoid duplication.

## Files

Create: `plan_15.md`, `tasks_15.md`,
`src/ai/tools/rename-religion.ts`,
`src/ai/tools/rename-religion.test.ts`.

Modify: `src/ai/index.ts`, `README_AI.md`.

## Testing

Unit (`rename-religion.test.ts`):

1. Numeric-id rename → `rename(i, name)` called with trimmed name;
   code returned.
2. Case-insensitive string lookup.
3. Reject index 0.
4. Unknown id / name → error.
5. Trim and reject empty names.
6. Runtime throw → error surfaced.
7. Invalid ref types rejected.

Pure helper test:

8. `findReligionForRenameInPack` — id + string resolution, skip
   removed, skip 0, empty input rejected.

## Plan ↔ tasks ↔ tests verification

Each criterion has a matching test. Runtime-seam pattern is the same
as `rename-culture` so the blast radius is minimal.

Lint / test / build gates in tasks_15.md.
