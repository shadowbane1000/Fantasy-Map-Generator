# Plan 31 — Use Case: Set a marker's note (name + legend)

## Status

Iteration 31. 30 AI tools. Baseline 7 warnings / 1 info / 0 errors.
390 tests pass.

## Use Case

**"Rename a marker (POI) or update its legend."**

Marker display names and lore live in `window.notes` — an array of
`{id, name, legend}` records keyed by `id === "marker" + marker.i`
(see `public/modules/ui/notes-editor.js:1-60`,
`public/modules/ui/markers-overview.js:228-239`). When the user
Ctrl-clicks a marker in the UI the Notes Editor opens and writes to
the corresponding `note.name` / `note.legend`. If no note exists
yet, the editor pushes a new one with
`{id: "marker{i}", name, legend: ""}`.

Prompts:
- *"Rename the Rookhold castle to Dragon's Keep."*
- *"Add a legend to the castle marker: 'Seat of the red king.'"*
- *"Rename marker 5 to 'Sunken Chapel'."*

### Success criteria

1. `set_marker_note({marker: 5, name: "Dragon's Keep"})` writes the
   note name for `id: "marker5"`. If the note doesn't exist,
   creates it with `legend: ""`.
2. Optional `legend` field updates the legend. If omitted the
   legend is preserved (or initialised to `""` when creating).
3. `set_marker_note({marker: "Rookhold", name: "Dragon's Keep"})`
   resolves the marker ref by *note name* (case-insensitive) —
   since markers themselves don't have a `.name` field; the
   user-facing name lives in notes.
4. Rejects empty/whitespace name.
5. Rejects non-empty whitespace-only legend when explicitly provided
   (empty string "" IS allowed to clear the legend).
6. Missing marker → structured error.
7. Runtime throws → structured error.
8. Returns `{i, previousName, previousLegend, name, legend}`.

## Scope

In-scope:
- `set_marker_note` tool with `MarkerNoteRuntime` seam.
- Registry + README + tests.

Out-of-scope:
- Editing the marker's type/icon/position (different concerns).
- Rich markdown handling for legend (the notes editor uses an HTML
  editor but the underlying field is a plain string; we pass it
  through unchanged).
- Adding / removing markers entirely.

## Design

New file: `src/ai/tools/set-marker-note.ts`.

```ts
export interface MarkerNoteRef {
  i: number;
  previousName: string | null;
  previousLegend: string | null;
}
export interface MarkerNoteRuntime {
  find(ref: number | string): MarkerNoteRef | null;
  setNote(
    i: number,
    name: string,
    legend: string | undefined,
  ): void;
}
```

Default runtime:
- `find(ref)`:
  - number: verify `pack.markers` has an entry with `i === ref` and
    not `removed`; look up note `marker{i}` for previous values.
  - string: iterate `notes` for one whose `id.startsWith("marker")`
    and `name.toLowerCase() === ref.trim().toLowerCase()`; extract
    the numeric id from `id.slice(6)` and verify the marker still
    exists.
- `setNote(i, name, legend)`:
  - Find note `marker{i}` in `notes`. If missing, push
    `{id: "marker{i}", name, legend: legend ?? ""}`.
  - Otherwise set `note.name = name`; if `legend !== undefined`, set
    `note.legend = legend`.

Executor:
1. Validate `marker` ref (integer > 0 or non-empty string).
2. Validate `name` (non-empty string after trim).
3. Validate `legend` — optional; if provided must be a string
   (empty string allowed to clear).
4. `runtime.find` → null → error.
5. `runtime.setNote(...)` → catch throws.
6. Return okResult with previous + new.

## Files

Create: `plan_31.md`, `tasks_31.md`,
`src/ai/tools/set-marker-note.ts`,
`src/ai/tools/set-marker-note.test.ts`.

Modify: `src/ai/index.ts`, `README_AI.md`.

## Testing

Unit (`set-marker-note.test.ts`):

1. `{marker: 5, name: "X"}` with existing note → `setNote(5, "X",
   undefined)` called.
2. `{marker: 5, name: "X", legend: "new lore"}` → setNote called
   with legend.
3. `{marker: "Rookhold", name: "Dragon's Keep"}` — resolves by note
   name (case-insensitive).
4. New marker with no existing note → runtime.find succeeds (marker
   exists), setNote creates note (test default-runtime separately or
   verify via fake runtime that setNote is called).
5. Empty/whitespace name → error.
6. `legend: ""` (explicitly empty string) is allowed — clears legend.
7. `legend: "   "` (whitespace-only) → rejected.
8. `legend: 42` (wrong type) → rejected.
9. Missing marker → error.
10. Runtime throws → error.
11. Invalid ref types rejected.

Plus a default-runtime unit test (using a controllable pack + notes
on globalThis) that verifies:
12. `setNote` creates a new note when one doesn't exist for the
    marker.

## Plan ↔ tasks ↔ tests verification

Every criterion has a test. `legend: ""` vs `legend: "   "` is the
trickiest edge case — explicit test.

Lint / test / build gates in tasks_31.md.
