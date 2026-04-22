# Plan 13 — Use Case: Rename a culture

## Status

Iteration 13. Existing tools: `set_map_name`, `set_layer_visibility`,
`apply_layers_preset`, `get_map_info`, `regenerate_map`, `list_states`,
`rename_state`, `focus_on_map`, `list_burgs`, `rename_burg`,
`set_year_and_era`, `list_cultures`. Baseline 7 warnings / 1 info / 0
errors. 176 tests pass.

## Use Case

**"Rename a specific culture."**

The user does this in the Cultures Editor: changes the value in the
culture's name input. `cultureChangeName` in
`public/modules/dynamic/editors/cultures-editor.js:337-345` runs:

```js
pack.cultures[i].name = newName;
pack.cultures[i].code = abbreviate(newName, allOtherCodes);
```

The `code` field is a short abbreviation used for labels and is kept
unique within the cultures array. `abbreviate()` lives at
`src/utils/languageUtils.ts:187`.

Prompts:
- *"Rename the Highlanders culture to Pinegarde."*
- *"Rename culture 2 to Wayfarers."*

### Success criteria

1. `rename_culture({culture: 2, name: "Wayfarers"})` sets
   `pack.cultures[2].name = "Wayfarers"` and regenerates
   `pack.cultures[2].code` via `abbreviate`.
2. `rename_culture({culture: "highlanders", name: "Pinegarde"})`
   resolves case-insensitively.
3. Rejects index-0 (Wildlands) — the UI never lets you rename it.
4. Rejects unknown id / name.
5. Rejects empty / whitespace names.
6. Pre-load error when `pack` / `pack.cultures` missing.

## Scope

In-scope:
- `rename_culture` tool with `CultureMutationRuntime` seam.
- Pure helper `findCultureForRenameInPack`.
- Registry + README.
- Tests.

Out-of-scope:
- Changing color / type / base / shield / expansionism (future).

## Design

New file: `src/ai/tools/rename-culture.ts`.

```ts
export interface CultureRef { i: number; name: string; code: string | null; }
export interface CultureMutationRuntime {
  find(ref: number | string): CultureRef | null;
  rename(i: number, name: string): { code: string };
}
```

Default runtime:
- `find(ref)`:
  - number: `pack.cultures[ref]` if `i > 0`, `!removed`.
  - string: lowercase/trim match against `culture.name`.
- `rename(i, name)`:
  - Compute new code via `window.abbreviate(name, existingCodesExceptThis)`
    if available, falling back to a local implementation (duplicated
    to avoid coupling test to window). This way tests can stub the
    runtime.
  - Apply `pack.cultures[i].name = name`, `pack.cultures[i].code = code`.
  - Return `{code}`.

The tool:
1. Validates input types.
2. Finds culture; errors on 0/unknown.
3. Trims name; rejects empty.
4. Runs `runtime.rename`, catches throws.
5. Returns `{ok, i, previousName, previousCode, name, code}`.

## Files

Create: `plan_13.md`, `tasks_13.md`,
`src/ai/tools/rename-culture.ts`,
`src/ai/tools/rename-culture.test.ts`.

Modify: `src/ai/index.ts`, `README_AI.md`.

## Testing

Unit (`rename-culture.test.ts`):

1. Numeric id rename → `rename(id, name)` called, code returned.
2. String-name resolution (case-insensitive).
3. Reject index 0.
4. Reject unknown ref.
5. Trim and reject empty names.
6. Runtime throws → structured error.
7. Invalid ref types rejected (nulls, negative, fractional).

Pure helper test:

8. `findCultureForRenameInPack` — id & string lookup, skip removed,
   skip 0, empty string.

## Plan ↔ tasks ↔ tests verification

| Criterion | Implementation | Test |
| --------- | -------------- | ---- |
| #1 id rename + code regen | runtime.rename | 1 |
| #2 string lookup | runtime.find | 2 |
| #3 reject 0 | guard | 3 |
| #4 unknown | null → error | 4 |
| #5 validation | trim + guard | 5, 7 |
| #6 error | catch | 6 |

Lint / test / build gates in tasks_13.md.
