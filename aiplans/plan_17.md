# Plan 17 — Use Case: Rename a province

## Status

Iteration 17. 16 tools implemented (`list_provinces` added last).
Baseline 7 warnings / 1 info / 0 errors. 214 tests pass.

## Use Case

**"Rename a specific province."**

The user does this in the Provinces Editor "Change province name"
dialog. `applyNameChange(p)` in
`public/modules/ui/provinces-editor.js:579-585` runs:

```js
p.name = <short>;
p.formName = <form>;
p.fullName = <full>;
provs.select("#provinceLabel" + p.i).text(p.name);
```

With `list_provinces` the AI can discover ids. This tool lets it
parallel the Provinces Editor's rename side-effect: update name
(required), `formName` (optional), `fullName` (optional), and refresh
the SVG label `#provinceLabel{i}`.

Prompts:
- *"Rename province 3 to Rookhaven."*
- *"Rename 'Rookwood' to 'Glenhold' and set the form to Duchy."*

### Success criteria

1. `rename_province({province: 3, name: "Rookhaven"})` sets
   `pack.provinces[3].name = "Rookhaven"` and updates the
   `#provinceLabel3` SVG text (when present).
2. `rename_province({province: "rookwood", name: "Glenhold",
   formName: "Duchy", fullName: "Duchy of Glenhold"})` resolves the
   ref case-insensitively and updates all three fields.
3. Rejects index 0 (placeholder).
4. Rejects unknown ref.
5. Trims and rejects empty names (and empty `formName` / `fullName`
   if provided).
6. Runtime throw → structured error.
7. Invalid ref types rejected.

## Scope

In-scope:
- Tool `rename_province` with `ProvinceMutationRuntime` seam.
- Pure helper `findProvinceForRenameInPack`.
- Registry + README + tests.

Out-of-scope:
- Changing color / burg / center / state (future).

## Design

New file: `src/ai/tools/rename-province.ts`.

```ts
export interface ProvinceRef {
  i: number;
  name: string;
  formName: string | null;
  fullName: string | null;
}
export interface ProvinceMutationRuntime {
  find(ref: number | string): ProvinceRef | null;
  rename(i: number, updates: {
    name: string;
    formName?: string;
    fullName?: string;
  }): void;
}
```

Default runtime:
- `find(ref)`:
  - number: `pack.provinces[ref]` if `i > 0`, `!removed`.
  - string: match lower-cased `name` or `fullName`.
- `rename(i, updates)`:
  - Validate target exists.
  - Apply `name` / `formName` / `fullName` individually.
  - Update `document.getElementById("provinceLabel" + i)` textContent
    to the new `name` when the element exists.

Executor:
1. Validate ref + name; optional formName/fullName must be strings
   and non-empty when present.
2. `runtime.find(ref)`; errors for null or id 0.
3. `runtime.rename(i, updates)` catches throws.
4. Returns `{ok, i, previousName, previousFormName, previousFullName,
   name, formName, fullName}`.

## Files

Create: `plan_17.md`, `tasks_17.md`,
`src/ai/tools/rename-province.ts`,
`src/ai/tools/rename-province.test.ts`.

Modify: `src/ai/index.ts`, `README_AI.md`.

## Testing plan

Unit (`rename-province.test.ts`):

1. Numeric id + name only → rename called with `{name}`.
2. String lookup + formName/fullName → all three updated.
3. Reject 0 placeholder.
4. Unknown ref → error.
5. Trim names; reject empty/whitespace for each field provided.
6. Runtime throws → error result.
7. Invalid ref types rejected.
8. Pure helper `findProvinceForRenameInPack` — id/name/fullName
   resolution, skip 0/removed, empty rejected.

## Plan ↔ tasks ↔ tests verification

Same structure as other rename tools; each criterion has a test.

Lint / test / build gates in tasks_17.md.
