# Plan 10 — Use Case: Rename a burg

## Status

Iteration 10. Existing tools: `set_map_name`, `set_layer_visibility`,
`apply_layers_preset`, `get_map_info`, `regenerate_map`,
`list_states`, `rename_state`, `focus_on_map`, `list_burgs`.
Baseline 7 warnings / 1 info / 0 errors. 147 tests pass.

## Use Case

**"Rename a specific burg (city/town)."**

The user does this in the Burg Editor (`public/modules/ui/burg-editor.js`):
opens the editor for a burg, types a new name in `#burgName`, and the
editor:
1. Sets `pack.burgs[id].name = newName`.
2. Updates the SVG label text node `#burgLabel{id}` so the new name
   appears on the map immediately.

With `list_burgs` the AI can discover ids. This tool gives it
parity with the Burg Editor's rename action:

- *"Rename Stormport to Tidegarde."*
- *"Rename burg 7 to Arkhaven."*

### Success criteria

1. `rename_burg({burg: 5, name: "Tidegarde"})` sets
   `pack.burgs[5].name = "Tidegarde"` and updates the SVG text node
   `#burgLabel5` (when present).
2. `rename_burg({burg: "Stormport", name: "Tidegarde"})`
   case-insensitively resolves the id and renames.
3. Rejects the index-0 placeholder.
4. Rejects unknown/removed burgs.
5. Rejects empty/whitespace names.
6. Returns `{ok, i, previousName, name}` on success.

## Scope

In-scope:
- `rename_burg` tool with `BurgMutationRuntime` seam.
- Registry + README.
- Unit tests.

Out-of-scope:
- Changing population / state / culture / capital flag (future tools).
- Generating a name via the Names helpers (future: `generate_burg_name`).

## Design

New file: `src/ai/tools/rename-burg.ts`.

```ts
export interface BurgMutationRuntime {
  find(ref: number | string): { i: number; name: string } | null;
  rename(i: number, name: string): void;
}
```

Default runtime:
- `find(ref)`:
  - number → `pack.burgs[ref]` if `i > 0` and `!removed`.
  - string → exact-then-lowercase match on `burg.name`, skip index 0 /
    removed.
- `rename(i, name)`:
  - Validates `pack.burgs[i]` exists, not removed.
  - `pack.burgs[i].name = name`.
  - If `document.getElementById("burgLabel" + i)` exists, update its
    `textContent`.

## Files

Create: `plan_10.md`, `tasks_10.md`,
`src/ai/tools/rename-burg.ts`,
`src/ai/tools/rename-burg.test.ts`.

Modify: `src/ai/index.ts`, `README_AI.md`.

## Testing plan

Unit (`rename-burg.test.ts`):

1. Numeric id → rename + label update.
2. String name (case-insensitive) → resolved id.
3. Reject id 0.
4. Reject unknown id / name.
5. Trim name; reject empty/whitespace.
6. Runtime `rename` throws → structured error.
7. Reject non-string / non-number refs.

Additionally, pure helper tests:

8. `findBurgInPackForRename` — id & string resolution, skips removed.

## Plan ↔ tasks ↔ tests verification

| Criterion | Implementation | Test |
| --------- | -------------- | ---- |
| #1 id rename + label | default runtime + test | 1 |
| #2 string lookup | runtime.find(string) | 2 |
| #3 reject 0 | id guard | 3 |
| #4 unknown | runtime returns null | 4 |
| #5 empty | input guard | 5 |
| #6 runtime throw | catch | 6 |

Lint / test / build gates captured in tasks_10.md.
