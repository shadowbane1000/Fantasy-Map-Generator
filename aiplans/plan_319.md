# Plan 319: `set_namesbase_names` AI tool

## Lint baseline (pre-implementation)

Ran `npm run lint`:

```
Checked 736 files in 582ms. No fixes applied.
Found 7 warnings.
Found 1 info.
```

No errors. Same 7 pre-existing warnings as elsewhere in the tree (all in
unrelated files: `src/renderers/draw-heightmap.ts`,
`src/modules/provinces-generator.ts`, `src/modules/emblem/generator.ts`,
`src/modules/military-generator.ts`). Adding `set_namesbase_names` must not
regress this.

## Use case

A user opens the Namesbase Editor, picks a namesbase, pastes a new
comma-separated list of names into the textarea, and the corpus that drives
the Markov-chain name generator is replaced. The legacy DOM handler is
`updateNamesData()` in `public/modules/ui/namesbase-editor.js`:

```js
function updateNamesData() {
  const base = +document.getElementById("namesbaseSelect").value;
  const input = document.getElementById("namesbaseTextarea");
  if (input.value.split(",").length < 3)
    return tip("The names data provided is too short of incorrect", false, "error");
  const securedNamesData = input.value.replace(/[/|]/g, "");
  nameBases[base].b = securedNamesData;
  input.value = securedNamesData;
  Names.updateChain(base);
}
```

The AI currently has `list_namesbases` (plan 316), `rename_namesbase` (plan
317), and the in-flight `set_namesbase_length_range` (plan 318) but no corpus
setter. This plan fills that gap.

## Behaviour summary

`set_namesbase_names` mutates `window.nameBases[index].b` in place and then
calls `window.Names.updateChain(index)` to recompute the Markov chain so the
next `Names.getBase(index, ...)` call uses the new corpus. Identification
mirrors `rename_namesbase` (plan 317): accept either an array `index` or the
current `current_name` (case-insensitive exact match). Reuse
`findNamesbaseByIndex` and `findNamesbasesByName` directly from
`./rename-namesbase`.

## Data shape

- `window.nameBases: { name: string; b: string; min: number; max: number; d: string; m: number }[]`
- `window.Names.updateChain(index: number): void` — recomputes
  `Names.chains[index]` from `nameBases[index].b`. Defined in
  `src/modules/names-generator.ts`.

The legacy editor identifies entries by their **array index** — the
`<select>`'s `value` is the index. We keep that convention.

## Inputs

- `index` (integer, optional). Non-negative integer < `nameBases.length`.
- `current_name` (string, optional). Case-insensitive exact match against
  `nameBases[i].name` (after trimming the input). At least one of `index` or
  `current_name` must be supplied.
- `names` (string OR array of strings, required) — the new corpus.

JSON schema (the schema `oneOf`s string vs array because the AI may pass
either shape; `description` documents both forms):

```ts
{
  type: "object",
  properties: {
    index: { type: "integer", minimum: 0, description: "..." },
    current_name: { type: "string", description: "..." },
    names: {
      oneOf: [
        { type: "string", description: "Comma-separated names." },
        {
          type: "array",
          items: { type: "string" },
          description: "Array of names. Joined with ','."
        },
      ],
      description: "...",
    },
  },
  required: ["names"],
}
```

## Sanitisation rules

Mirrors the legacy editor (`rawValue.replace(/[/|]/g, "")`):

1. If `names` is an **array of strings**, trim each entry, drop empty entries
   (after trim), then join with `,`.
2. If `names` is a **string**, take it as-is (no per-segment trimming;
   matches the legacy textarea blob behaviour where users paste a comma list
   and only `/` and `|` are stripped).
3. Strip `/` and `|` characters from the result (`.replace(/[/|]/g, "")`).

## Validation rules

After sanitisation:

- The resulting string must be non-empty / non-whitespace-only.
- `result.split(",").length >= 3` (matches the legacy "too short or
  incorrect" gate). Error message: `"Names corpus must have at least 3
  names"`.

## Effect

1. Validate `names` shape (string or array-of-strings).
2. Build the sanitised corpus string.
3. Validate length (>= 3 entries by `split(",")` count).
4. Resolve target by `index` (preferred) or `current_name`.
5. If both supplied, ensure they refer to the same array index (otherwise
   `"index and current_name disagree."`).
6. **Write order — matches the legacy editor:**
   - First: `nameBases[index].b = sanitised`.
   - Then: `Names.updateChain(index)`.
   - This means **if `updateChain` throws, `b` has already been mutated**.
     We deliberately mirror this behaviour. The chain remains stale (the
     previous `chains[index]` value) but the corpus is updated. This matches
     the editor's behaviour exactly. Tests assert `b` is mutated even when
     `updateChain` throws.
7. Return `{ ok: true, index, name, name_count, sample_names }`.
   - `name` = `nameBases[index].name` (so callers can confirm which entry).
   - `name_count` = `sanitised.split(",").length`.
   - `sample_names` = first 5 trimmed non-empty entries.

No SVG redraw — namesbases drive name generation, not rendering.

## Files

- `src/ai/tools/set-namesbase-names.ts` — the tool.
- `src/ai/tools/set-namesbase-names.test.ts` — Vitest unit tests.
- `src/ai/index.ts` — register and export the tool. Imports near
  `setMapNameTool`; registry register near other set-* names. Alphabetical
  position: between `setMapNameTool` and `setMarkerColorsTool`.

## Public API

```ts
export interface SetNamesbaseNamesRuntime {
  /** Returns the live `window.nameBases`. Throws when missing/not an array. */
  getNameBases(): { name: string; b?: string }[];
  /** Sets `nameBases[index].b = b`. Throws if index invalid. */
  setNamesData(index: number, b: string): void;
  /** Calls `window.Names.updateChain(index)`. Throws if Names module missing. */
  updateChain(index: number): void;
}

export const defaultSetNamesbaseNamesRuntime: SetNamesbaseNamesRuntime;
export function createSetNamesbaseNamesTool(runtime?): Tool;
export const setNamesbaseNamesTool: Tool;
```

The runtime split (a) reuses identification helpers from `rename-namesbase`
and (b) exposes the same delegate-to-runtime pattern used in
`regenerate-lake-name` for the `Names`-module dependency, so tests can stub
out `updateChain`.

## Validation / error cases

| Input                                                          | Error message                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `names` missing / wrong type (not string, not string-array)    | `"names must be a string or an array of strings."`                        |
| `names` is array containing non-string                         | `"names must be a string or an array of strings."`                        |
| Sanitised corpus is empty / whitespace-only                    | `"names must be a non-empty string."`                                     |
| Sanitised corpus has < 3 comma-separated entries               | `"Names corpus must have at least 3 names"`                               |
| Neither `index` nor `current_name`                             | `"Provide either index or current_name to identify the namesbase."`       |
| `index` not finite / not integer / negative                    | `"index must be a non-negative integer."`                                 |
| `index` >= `nameBases.length`                                  | `"No namesbase found at index N."`                                        |
| `current_name` not a non-empty string                          | `"current_name must be a non-empty string."`                              |
| `current_name` matches nothing                                 | `"No namesbase found with name X."`                                       |
| `current_name` matches > 1                                     | `"Multiple namesbases match name X. Disambiguate by index."` + candidates |
| `index` and `current_name` disagree                            | `"index and current_name disagree."`                                      |
| `nameBases` missing/not an array                               | `"window.nameBases is unavailable. Generate or load a map first."`        |
| `Names.updateChain` not on window                              | `"Names.updateChain is not available."`                                   |
| `updateChain` throws                                           | Surfaced as `errorResult(err.message)`. **`b` is mutated in this case.**  |

## Wiring

In `src/ai/index.ts`:

- Add `import { setNamesbaseNamesTool } from "./tools/set-namesbase-names";`
  in the alphabetical slot between `setMapNameTool` and `setMarkerColorsTool`.
- Add the corresponding `export { ... } from "./tools/set-namesbase-names"`
  block in the same alphabetical slot.
- Add `registry.register(setNamesbaseNamesTool);` in the registry-setup
  block, near other rename/set namesbase tools (after
  `registry.register(setMapNameTool);`).

## Tests

In `src/ai/tools/set-namesbase-names.test.ts`:

1. Happy path with array `["Foo", "Bar", "Baz", "Qux"]` →
   `nameBases[i].b = "Foo,Bar,Baz,Qux"`; `updateChain` called once with `i`;
   result `name_count === 4`, `sample_names === ["Foo", "Bar", "Baz", "Qux"]`.
2. Happy path with comma-string `"Foo,Bar,Baz"` → `b = "Foo,Bar,Baz"`;
   `updateChain` called.
3. Sanitisation strips `/` and `|`: `"Alpha,Bet|a,Gam/ma,Delta"` →
   `b = "Alpha,Beta,Gamma,Delta"`, success (4 entries).
4. Array with empty/whitespace entries (`[" ", "", "Foo", "Bar", "Baz"]`):
   trim and filter empties → `"Foo,Bar,Baz"` → success.
5. Less than 3 names: array `["Foo", "Bar"]` → error.
6. Less than 3 names: string `"Foo,Bar"` → error.
7. Empty array → error.
8. Empty string → error.
9. Whitespace-only string `"   "` → error.
10. `updateChain` throws → error surfaced; **`b` IS mutated** (legacy order).
11. `Names.updateChain` not available → error before mutation.
12. Identification by index out of range → error.
13. Identification by current_name not found → error.
14. Identification ambiguous → error with candidates.
15. Identification mismatch → error.
16. Neither provided → error.
17. `nameBases` missing/not array → error (via runtime getNameBases throwing).
18. `current_name` empty/non-string → error.
19. Negative / non-integer / non-finite / NaN / "5" string `index` → error.
20. Tool name + registry round-trip via `ToolRegistry`.
21. `oneOf` schema includes both shapes (smoke check).

## Self-review

Re-read plan and tasks before implementation. Findings:

- **Write order divergence** — the legacy editor writes `b` and *then*
  calls `Names.updateChain(base)`. We mirror this exactly. If `updateChain`
  throws, the corpus has already changed but the chain hasn't. The
  alternative would be to call `updateChain` first (or wrap both in a
  try/restore) and that would diverge from editor behaviour. Decision: keep
  the legacy order; capture the divergence in a dedicated test (test #10).

- **Reusing helpers from rename-namesbase** — `findNamesbaseByIndex` and
  `findNamesbasesByName` already exist and are exported. Importing them
  rather than duplicating reduces drift between the two tools when (e.g.)
  case-insensitivity rules change.

- **Validation order** — validating `names` *first* (like rename's
  `new_name`-first order) keeps the error UX consistent: garbage corpus
  fails fast, regardless of whether identification was wrong.

- **Sanitisation order for arrays** — trim per-element, filter empties,
  then join. For strings, do not trim per-segment (matches legacy paste
  blob). Both paths still strip `/` and `|` post-join. This matches
  `updateNamesData` exactly while making the array form ergonomic.

- **`name` in the result** — the editor opens with a select whose label is
  the `nameBases[i].name`, so returning the resolved name helps callers
  confirm which base they wrote to. Cheap to include and matches what
  list_namesbases returns.

- **Index 0 is valid** — same as plan 317. JSON schema uses `minimum: 0`.

- **Don't trim per-segment for the string form** — paste-blob users expect
  `"Foo, Bar, Baz"` to keep the whitespace (legacy behaviour). The
  sample-names field still trims for display only.

- **Pre-existing dirty files in main worktree** must NOT be staged: only
  stage `src/ai/tools/set-namesbase-names.ts`,
  `src/ai/tools/set-namesbase-names.test.ts`, `aiplans/plan_319.md`,
  `aiplans/tasks_319.md`, and `src/ai/index.ts` line edits.
