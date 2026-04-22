# Plan 36 — Use Case: Remove a burg

## Status

Iteration 36. 35 AI tools. Baseline 7 warnings / 1 info / 0 errors.
445 tests pass.

## Use Case

**"Delete a specific burg from the map."**

The UI flow: Burg Editor → "Remove" button →
`removeSelectedBurg()` in
`public/modules/ui/burg-editor.js:401-427`:

- Refuses capitals ("change state capital first").
- Otherwise confirms and calls `Burgs.remove(burgId)`.

`Burgs.remove(burgId)` at
`src/modules/burgs-generator.ts:715-733`:

1. Clears `pack.cells.burg[burg.cell]`
2. Marks `burg.removed = true`
3. Removes any matching `notes[]` entry
4. Removes the SVG emblem (if any)
5. Calls `removeBurgIcon(i)` and `removeBurgLabel(i)` (SVG cleanup)

Prompts:
- *"Remove the burg Stormport."*
- *"Delete burg 7."*

### Success criteria

1. `remove_burg({burg: 7})` calls `window.Burgs.remove(7)`.
2. `remove_burg({burg: "stormport"})` resolves case-insensitively.
3. Refuses to remove a capital (same as the UI) — structured
   error suggests running `set_state_capital` first.
4. Refuses burg 0 placeholder.
5. Refuses unknown / already-removed burgs.
6. Runtime throws → error.
7. Response reports `{i, name}`.

## Scope

In-scope:
- `remove_burg` tool with `BurgRemovalRuntime` seam.
- Registry + README + tests.

Out-of-scope:
- Undo (the UI also doesn't undo a burg removal).
- Removing states / cultures / religions (different consequences;
  future tools).

## Design

New file: `src/ai/tools/remove-burg.ts`.

```ts
export interface RemoveBurgRef {
  i: number;
  name: string;
  isCapital: boolean;
}
export interface BurgRemovalRuntime {
  find(ref: number | string): RemoveBurgRef | null;
  remove(i: number): void;
}
```

Default runtime:
- `find`: `findEntityByRef(pack.burgs, ref)` →
  `{i, name, isCapital: !!burg.capital}`.
- `remove(i)`: call `window.Burgs.remove(i)`. Throws if
  `window.Burgs` or `Burgs.remove` is missing.

## Files

Create: `plan_36.md`, `tasks_36.md`,
`src/ai/tools/remove-burg.ts`,
`src/ai/tools/remove-burg.test.ts`.

Modify: `src/ai/index.ts`, `README_AI.md`.

## Testing

Unit (`remove-burg.test.ts`):

1. Numeric id → `remove(i)` called; result reports `{ok, i, name}`.
2. Case-insensitive name lookup.
3. Refuses a capital burg with a suggestion to call
   `set_state_capital` first.
4. Refuses burg 0 placeholder.
5. Unknown burg → error.
6. Runtime throws → error.
7. Invalid ref types rejected.

## Plan ↔ tasks ↔ tests verification

Each criterion has a test. Capital-rejection suggestion is the
interesting bit; explicit test.

Lint / test / build gates in tasks_36.md.
