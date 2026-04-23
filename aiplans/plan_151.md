# Plan 151 — `set_religion_origins` AI tool

## Use case

Set a religion's `origins` array — the list of parent religion indices that
represents religious lineage (e.g. Christianity → Judaism). The Religions
Editor surfaces this through the hierarchy-tree's origin picker
(`public/modules/dynamic/hierarchy-tree.js:408-464`), where `origins[0]` is
the **primary** origin (0 = "Top level" root) and the remaining entries are
**secondary** origins. This tool is the data-layer equivalent of that origin
picker.

Field shape (`src/ai/tools/_shared/pack-types.ts:103`):

```ts
interface RawReligion {
  origins?: number[];
  // ...
}
```

## Data path & UI confirmation

Canonical path: `pack.religions[i].origins` (a `number[]`).

Write sites:

- `public/modules/dynamic/hierarchy-tree.js:399` — click-to-remove: filters
  the clicked origin out; resets to `[0]` if now empty.
- `public/modules/dynamic/hierarchy-tree.js:460` — Select dialog commit:
  `origins = [primary, ...secondary]` after the user hits Select.
- `public/modules/dynamic/hierarchy-tree.js:520` — drag-to-reparent: rewrites
  `origins[0]`.
- `public/modules/dynamic/editors/religions-editor.js:509-510` — on
  `removeReligion`, filters the removed id out of every other religion's
  `origins`, resetting any emptied array to `[0]` (matches
  `src/ai/tools/remove-religion.ts:57-61`).
- `src/modules/religions-generator.ts` — generator seeds each religion's
  `origins` when creating them.

Read sites:

- `public/modules/dynamic/hierarchy-tree.js:184-228` — renders the d3
  hierarchy tree using `origins[0]` as the primary parent id.
- `public/modules/dynamic/editors/religions-editor.js:807-808` — CSV export
  joins active origin names.

**UI surface**: the hierarchy-tree origin picker (Religions Editor →
"Hierarchy tree" toolbar button). No per-row input to refresh. The tree
view is rebuilt lazily when the user re-opens it; no draw call is needed
from this tool. Mirrors `set_religion_culture`'s "no visual redraw" stance.

## Semantics / conventions

From the UI:

- `origins = [0]` means "top level" / no parent.
- `origins[0]` is the **primary** origin (drawn as the tree edge).
- `origins[1..]` are **secondary** origins (additional dashed edges).
- A religion's origins may include `0` only in the primary slot (the UI's
  Select dialog has "Top level" only as a radio option, not a checkbox).
- A religion must not list itself as an origin (would create a cycle).
- Removed religions are stripped from everyone's origins by
  `remove-religion.ts` already.

This tool replaces the array wholesale (full-set semantics, parallel to how
the Select dialog's commit writes `[primary, ...secondary]`). A caller can
therefore "add" an origin by fetching the current array, pushing, and
re-submitting.

## Tool contract

Inputs:

```
{
  religion: number | string  // religion id (>0) or case-insensitive name
  origins: number[]          // parent religion indices (empty allowed)
}
```

Cleaning rules applied to `origins`:

- Deduplicate while preserving first-occurrence order.
- The input array **may** be empty. Empty → normalised to `[0]` to match
  the editor convention ("top level"). Reported as `origins: [0]` in the
  response.
- `0` is only valid as the primary (first) slot. Any non-first `0` is an
  error (matches the hierarchy Select dialog shape).
- Every non-zero entry must be:
  - An integer.
  - In bounds (0 < k < religions.length).
  - Not the religion itself.
  - Not a removed religion.

## Validation

- `religion`: non-negative integer id, or non-empty string name.
- `origins`: must be an `Array` of numbers. Reject `undefined`, non-arrays,
  entries that aren't integers, negatives > 0-primary-slot rule, self-ref,
  out-of-range, references to removed religions.
- Reject religion 0 (the "No religion" placeholder).
- Reject removed religions.
- Reject locked religions (parallels `set_religion_center`'s locked guard).

## Runtime seam

```ts
export interface ReligionOriginsRef {
  i: number;
  name: string;
  previousOrigins: number[];
  locked: boolean;
}

export interface ReligionRef {
  i: number;
  name: string;
  removed: boolean;
}

export interface ReligionOriginsRuntime {
  find(ref: number | string): ReligionOriginsRef | null;
  // Look up a candidate origin religion by id (for validation).
  findCandidate(i: number): ReligionRef | null;
  getReligionCount(): number;
  apply(i: number, origins: number[]): void;
}
```

`defaultReligionOriginsRuntime`:

- `find(ref)` — `findEntityByRef` on `pack.religions`. Returns
  `previousOrigins` as a defensive shallow copy (or `[0]` when unset/not an
  array, to match the UI convention).
- `findCandidate(i)` — returns the slot if it exists and isn't removed.
- `getReligionCount()` — `pack.religions?.length ?? 0`.
- `apply(i, origins)` — writes `religion.origins = [...origins]`.

## Success output

```
{
  ok: true,
  i: number,
  name: string,
  previousOrigins: number[],
  origins: number[]
}
```

## Integration test (globalThis seam)

Mirror `set-religion-center.test.ts`'s integration block:

- `globalThis.pack.religions` with 5 entries: `No religion` (i=0,
  removed=true), 3 active (`Brightpath`, `Old Faith`, `Ancients`), and a
  tombstone (`Gone`, removed=true).
- Cases:
  - writes `religion.origins` in the live pack.
  - refuses locked religions.
  - refuses removed religion references inside `origins`.
  - refuses self-reference.
  - refuses out-of-range origin indices.
  - empty array is accepted and normalised to `[0]`.
  - duplicates are collapsed.

## Files touched

- `src/ai/tools/set-religion-origins.ts` (new)
- `src/ai/tools/set-religion-origins.test.ts` (new)
- `src/ai/index.ts` — import, re-export, register (next to
  `setReligionCultureTool`)
- `README_AI.md` — new row near the other `set_religion_*` rows
