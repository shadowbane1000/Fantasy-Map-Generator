# Plan 317: `rename_namesbase` AI tool

## Lint baseline (pre-implementation)

Ran `npm run lint`:

```
Checked 732 files in 581ms. No fixes applied.
Found 7 warnings.
Found 1 info.
```

No errors. Same state of warnings as elsewhere in the tree (all in unrelated files
such as `src/renderers/draw-heightmap.ts` and similar). Adding `rename_namesbase`
must not regress this.

## Use case

A user opens the Namesbase Editor, picks a namesbase, edits its name in the text
input, and the namesbase gets renamed. The legacy DOM handler is
`updateBaseName()` in `public/modules/ui/namesbase-editor.js`:

```js
function updateBaseName() {
  const base = +document.getElementById("namesbaseSelect").value;
  const select = document.getElementById("namesbaseSelect");
  const rawName = this.value;
  const name = rawName.replace(/[/|]/g, "");
  select.options[namesbaseSelect.selectedIndex].innerHTML = name;
  nameBases[base].name = name;
}
```

The AI currently has no namesbase-rename tool. The whole namesbase domain is
fresh; an in-flight `list_namesbases` is being built under plan 316 in another
worktree.

## Behaviour summary

`rename_namesbase` mutates `window.nameBases[index].name` in place. Identification
mirrors `rename_lake` (plan 290): accept either an array `index` or the current
`current_name` (case-insensitive exact match), require they agree if both are
supplied, and return an ambiguity error with candidates when a name matches more
than one entry.

## Data shape

`window.nameBases: { name: string; b: string; min: number; max: number; d: string; m: number }[]`

The legacy editor identifies entries by their **array index** — the `<select>`'s
`value` is the index. We keep that convention.

## Inputs

- `index` (integer, optional). Non-negative integer < `nameBases.length`.
- `current_name` (string, optional). Case-insensitive exact match against
  `nameBases[i].name` (after trimming the input). At least one of `index` or
  `current_name` must be supplied.
- `new_name` (string, required). Trimmed, then sanitised by stripping `/` and
  `|` characters (mirrors the editor's `rawName.replace(/[/|]/g, "")`). Must be
  non-empty after sanitisation.

JSON schema:

```ts
{
  type: "object",
  properties: {
    index: { type: "integer", minimum: 0, description: "..." },
    current_name: { type: "string", description: "..." },
    new_name: { type: "string", description: "..." },
  },
  required: ["new_name"],
}
```

## Effect

1. Validate `new_name` first (it's identification-independent — same ordering as
   `rename_lake` for consistent error UX).
2. Resolve target by `index` (preferred) or `current_name`.
3. If both supplied, ensure they refer to the same array index (otherwise
   `"index and current_name disagree."`).
4. Sanitise `new_name`: trim → strip `/` and `|`. Reject empty result.
5. Set `nameBases[index].name = sanitized`.
6. Return `{ ok, index, old_name, new_name }`.

No SVG redraw — namesbase names are only shown inside the editor's own `<select>`,
which the editor rebuilds on next open. (The legacy handler patches the
`<select>` `<option>` text inline because the editor is already open; in our
case the dialog isn't necessarily open, so we just mutate the data.)

## Files

- `src/ai/tools/rename-namesbase.ts` — the tool.
- `src/ai/tools/rename-namesbase.test.ts` — Vitest unit tests.
- `src/ai/index.ts` — register and export the tool (next to other `rename-*`).

## Public API

```ts
export interface NamesbaseRenameRef {
  index: number;
  name: string;
}

export interface RenameNamesbaseRuntime {
  getNameBases(): { name: string }[]; // throws when missing/not an array
  setName(index: number, newName: string): void;
}

export const defaultRenameNamesbaseRuntime: RenameNamesbaseRuntime;
export function createRenameNamesbaseTool(runtime?): Tool;
export const renameNamesbaseTool: Tool;

export function findNamesbaseByIndex(
  bases: unknown[] | undefined,
  index: number,
): NamesbaseRenameRef | null;

export function findNamesbasesByName(
  bases: unknown[] | undefined,
  needle: string,
): NamesbaseRenameRef[];
```

The runtime split mirrors `rename_lake`: pure helpers (`findNamesbaseByIndex`,
`findNamesbasesByName`) take any array and are easy to unit-test; the runtime
binds them to `window.nameBases`.

## Validation / error cases

| Input                                           | Error message                                              |
| ----------------------------------------------- | ---------------------------------------------------------- |
| `new_name` missing / not a string / empty / WS  | `"new_name must be a non-empty string."`                   |
| `new_name` empty after sanitisation (e.g. "//") | `"new_name is empty after removing '/' and '|'."`          |
| Neither `index` nor `current_name`              | `"Provide either index or current_name to identify the namesbase."` |
| `index` not finite / not integer                | `"index must be a non-negative integer."`                  |
| `index` negative                                | `"index must be a non-negative integer."`                  |
| `index` >= `nameBases.length`                   | `"No namesbase found at index N."`                         |
| `current_name` not a non-empty string           | `"current_name must be a non-empty string."`               |
| `current_name` matches nothing                  | `"No namesbase found with name X."`                        |
| `current_name` matches > 1                      | `"Multiple namesbases match name X. Disambiguate by index."` + `candidates` |
| `index` and `current_name` disagree             | `"index and current_name disagree."`                       |
| `nameBases` missing/not an array                | `"window.nameBases is unavailable. Generate or load a map first."` |

## Wiring

In `src/ai/index.ts`:

- Add `import { renameNamesbaseTool } from "./tools/rename-namesbase";` next to
  the other `rename-*` imports (alphabetical position: between `rename-lake`
  and `rename-province`).
- Add the `export { ... } from "./tools/rename-namesbase"` block in the same
  alphabetical slot among the rename exports.
- Add `registry.register(renameNamesbaseTool);` in the registry-setup block,
  near `renameLakeTool`'s `registry.register(...)`.

## Tests

In `src/ai/tools/rename-namesbase.test.ts`:

1. Happy path by index — `index: 1`, `nameBases[1] === { name: "Elvish", ... }`,
   `new_name: "High Elven"` → success, mutation, returned `old_name` correct.
2. Happy path by `current_name` (unique match).
3. Sanitisation — `"foo|bar/baz"` → set to `"foobarbaz"`.
4. Trim — `"  Foo  "` → `"Foo"`.
5. Empty after sanitisation — `"///"` → error.
6. Whitespace-only `new_name` → error.
7. Ambiguous `current_name` → error with `candidates: [{index, name}, ...]`.
8. Non-existent `current_name` → error.
9. `index` out of range → error.
10. Negative / non-integer / non-finite `index` → error.
11. `index` and `current_name` disagree → error.
12. `index` and `current_name` agreeing → success.
13. Neither provided → error.
14. `nameBases` missing → error; `nameBases` not array → error.
15. Tool name + registry round-trip via `ToolRegistry`.

Pure helper tests for `findNamesbaseByIndex` and `findNamesbasesByName`
(case-insensitive, trimmed, etc.).

## Self-review

Re-read plan and tasks before implementation. Findings:

- The unique behaviour vs. `rename_lake`: namesbases are identified by **array
  index** (not `feature.i`), and `index = 0` is a valid namesbase. The
  validation must therefore allow `index = 0`. The plan uses `minimum: 0` in
  the JSON schema and the helper guards `index < 0` (not `<= 0`). Good.
- Sanitisation runs *after* trim. Order matters for cases like `" foo|bar "` →
  trim to `"foo|bar"` → `"foobar"`. Document in the schema description so the
  AI knows this.
- `current_name` lookup is case-insensitive exact match on trimmed input — same
  convention as `rename_lake`. Already documented.
- The legacy `updateBaseName` does not validate non-empty (the editor would
  store `nameBases[base].name = ""` if you delete every char). We are
  intentionally stricter than the editor on that — non-empty post-sanitisation
  is required so the AI can't silently blank a name.
- Disagreement check: `target.index !== byName.index` (compare by index, not
  by name — name compare would let `"Elvish"` and `"elvish"` look different).
- Tests must include `index = 0` is valid (boundary case). Add to the pure
  helper test rather than the tool test (the tool test for index 0 would
  need a base at array slot 0, which is fine).
- Pre-existing dirty files in worktree must NOT be staged: only stage
  `src/ai/tools/rename-namesbase.ts`, `src/ai/tools/rename-namesbase.test.ts`,
  `aiplans/plan_317.md`, `aiplans/tasks_317.md`, and `src/ai/index.ts`.
  Worktree shows clean status though, so this is just a guardrail.
