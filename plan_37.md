# Plan 37 — Use Case: Remove a marker

## Status

Iteration 37. 36 AI tools. Baseline 7 warnings / 1 info / 0 errors.
452 tests pass.

## Use Case

**"Delete a map marker (POI)."**

The Markers Overview has a trash icon per row; clicking it runs
`removeMarker(i)` in
`public/modules/ui/markers-overview.js:195-200`:

```js
notes = notes.filter(note => note.id !== `marker${i}`);
pack.markers = pack.markers.filter(marker => marker.i !== i);
byId(`marker${i}`)?.remove();
```

Three small side-effects, all contained — a rare case where we
can safely replicate the logic directly in the default runtime.

Note: `notes` is a classic-script `let` global (like
`populationRate`), so reassigning it from a module-scoped tool
requires going through `window.notes = ...`. Similarly for
`pack.markers = ...`. Actually, since both live on `window.pack`
and `window.notes`, in-place mutation via `.splice` avoids
reference-swap concerns entirely — and matches how other tools in
this codebase write to pack.

Prompts:
- *"Delete marker 3."*
- *"Remove the Rookhold marker."*

### Success criteria

1. `remove_marker({marker: 3})` removes the marker with i=3 from
   `pack.markers`, removes its note from `window.notes`, and removes
   the SVG `#marker3` element.
2. `remove_marker({marker: "Rookhold"})` resolves by note name
   (case-insensitive, same lookup as `set_marker_note`).
3. Refuses a `lock`ed marker (respecting the user's explicit lock —
   the UI's "remove all" command also skips locked markers). Note:
   single-marker removal in the UI *doesn't* check lock, but for a
   programmatic AI tool respecting the lock is safer. Return an
   error with a suggestion to unlock first (via `set_entity_lock`).
   Wait, `set_entity_lock` doesn't cover markers. Let me refine:
   skip the lock check for markers since the UI itself doesn't
   enforce one, and match UI behavior. **Decision: no lock check**.
4. Rejects unknown marker.
5. Runtime throws → error.
6. Response reports `{i}`.

## Scope

In-scope:
- `remove_marker` tool with `MarkerRemovalRuntime` seam.
- Registry + README + tests.

Out-of-scope:
- Bulk removal (`removeAllMarkers`).

## Design

New file: `src/ai/tools/remove-marker.ts`.

```ts
export interface RemoveMarkerRef { i: number; }
export interface MarkerRemovalRuntime {
  find(ref: number | string): RemoveMarkerRef | null;
  remove(i: number): void;
}
```

Default runtime:
- `find`: numeric → verify marker exists in `pack.markers` (not
  marked `removed`). String → reuse `findMarkerNoteRef` from
  `set-marker-note.ts` to look up by note name.
- `remove(i)`:
  - Splice the note `marker{i}` from `window.notes` in place.
  - Splice the marker from `pack.markers` in place.
  - If `document`: remove `#marker{i}` element.

Executor:
1. Validate ref.
2. Find → null → error.
3. `runtime.remove(i)` → catch throws.
4. Return okResult with `{i}`.

## Files

Create: `plan_37.md`, `tasks_37.md`,
`src/ai/tools/remove-marker.ts`,
`src/ai/tools/remove-marker.test.ts`.

Modify: `src/ai/index.ts`, `README_AI.md`.

## Testing

Unit (`remove-marker.test.ts`):

1. Numeric id → `remove(i)` called; response includes `{i}`.
2. Name lookup (case-insensitive) via the shared finder.
3. Unknown marker → error.
4. Runtime throws → error.
5. Invalid ref types rejected.

Default-runtime test:

6. Splices the note and the marker in place and removes the SVG
   node if present.

## Plan ↔ tasks ↔ tests verification

Each criterion has a test.

Lint / test / build gates in tasks_37.md.
