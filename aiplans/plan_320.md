# Plan 320: `add_namesbase` AI tool

## Lint baseline (pre-implementation)

Ran `npm run lint`:

```
Checked 740 files in 592ms. No fixes applied.
Found 7 warnings.
Found 1 info.
```

No errors. Same 7 pre-existing warnings as elsewhere in the tree (all in
unrelated files: `src/renderers/draw-heightmap.ts`,
`src/modules/provinces-generator.ts`, `src/modules/emblem/generator.ts`,
`src/modules/military-generator.ts`). Adding `add_namesbase` must not
regress this.

## Use case

A user opens the Namesbase Editor, clicks the **Add** button, and a new
placeholder namesbase appears in the select, ready to be customised
(rename, paste names, tweak min/max, set duplication chars, set multiword
rate). The legacy DOM handler is `namesbaseAdd()` in
`public/modules/ui/namesbase-editor.js`:

```js
function namesbaseAdd() {
  const base = nameBases.length;
  const b =
    "This,is,an,example,of,name,base,showing,correct,format,It,should,have,at,least,one,hundred,names,separated,with,comma";
  nameBases.push({name: "Base" + base, min: 5, max: 12, d: "", m: 0, b});
  // ... UI: add option to select, switch to it, populate fields ...
}
```

The AI currently has `list_namesbases` (plan 316), `rename_namesbase`
(plan 317), `set_namesbase_length_range` (plan 318), and
`set_namesbase_names` (plan 319) — all readers/mutators of existing
namesbases. There is **no creator**. This plan fills that gap so the AI
can compose `add → set names → set length range → rename`.

## Behaviour summary

`add_namesbase` appends a new entry to `window.nameBases` matching the
shape `{ name, b, min, max, d, m }`. All inputs are **optional**, with
defaults that mirror `namesbaseAdd`'s placeholder values exactly. The
tool returns the index of the newly added entry.

**Crucially:** the editor's `namesbaseAdd` does NOT call
`Names.updateChain` for the new entry. The Markov chain is computed
lazily on first call to `Names.getBase(index, ...)`. We mirror this: the
tool does NOT call `updateChain`. (This is in deliberate contrast to
`set_namesbase_names`, which DOES call `updateChain` after mutating an
existing entry's `b`.)

## Data shape

- `window.nameBases: { name: string; b: string; min: number; max: number; d: string; m: number }[]`

The new entry will have all six fields populated.

## Inputs (all optional)

| input             | type                              | default                                    |
| ----------------- | --------------------------------- | ------------------------------------------ |
| `name`            | string                            | `"Base" + nameBases.length`                |
| `min`             | integer in [2, 100]               | `5`                                        |
| `max`             | integer in [2, 100]               | `12`                                       |
| `duplicate_chars` | string                            | `""` (stored as `.d`)                      |
| `multiword_rate`  | finite number in [0, 1]           | `0` (stored as `.m`)                       |
| `names`           | string OR array of strings        | the editor placeholder corpus (see below)  |

Default `names` corpus (matches the editor exactly):

```
"This,is,an,example,of,name,base,showing,correct,format,It,should,have,at,least,one,hundred,names,separated,with,comma"
```

JSON schema:

```ts
{
  type: "object",
  properties: {
    name: {
      type: "string",
      description: "Desired name. Trimmed, then '/' and '|' stripped. If empty after sanitisation, falls back to 'Base' + nameBases.length.",
    },
    min: { type: "integer", minimum: 2, maximum: 100, description: "Min name length, default 5." },
    max: { type: "integer", minimum: 2, maximum: 100, description: "Max name length, default 12." },
    duplicate_chars: { type: "string", description: "Duplicate-letter chars (`.d`); default ''." },
    multiword_rate: { type: "number", minimum: 0, maximum: 1, description: "Multi-word rate (`.m`); default 0." },
    names: {
      oneOf: [
        { type: "string", description: "Comma-separated names." },
        { type: "array", items: { type: "string" }, description: "Array of names; joined with ','." },
      ],
      description: "Initial corpus. After sanitisation must contain at least 3 comma-separated entries. Defaults to the editor's placeholder corpus.",
    },
  },
}
```

## Sanitisation rules

- **`name`**: `trim()` then `replace(/[/|]/g, "")` (matches
  `rename-namesbase`'s rule). If the result is empty, fall back to the
  default `"Base" + nameBases.length`. This is **not** an error — we
  silently fall back, exactly like the editor's "Add" produces a
  default-named entry regardless of any prior name input.
- **`names`**:
  - If array: trim each entry, drop empties (after trim), join with `,`.
  - If string: take as-is.
  - Then strip `/` and `|`.
  - Validate: must yield `>= 3` comma-separated entries (matches
    `set_namesbase_names`'s rule and the legacy editor's gate).

## Validation rules

- `name` provided but not a string → error.
- `min` / `max` provided but not integer or out of [2, 100] → error.
- Both `min` and `max` provided and `min > max` → error.
- `duplicate_chars` provided but not a string → error.
- `multiword_rate` provided but not finite or out of [0, 1] → error.
- `names` provided but not a string and not a string-array → error.
- After sanitisation, fewer than 3 comma-separated names → error.
- `nameBases` global missing or not an array → error.

## Effect

1. Validate every supplied field individually.
2. Read the live `nameBases` array via the runtime (throws if missing/not
   array).
3. Compute the default name from `nameBases.length` if no `name`
   provided OR if the sanitised `name` is empty.
4. Build the new entry: `{ name, min, max, d: duplicate_chars, m: multiword_rate, b: corpus }`.
5. `runtime.appendNamesbase(newEntry)` — appends to `nameBases`.
6. Return `okResult({ index, name, min, max, duplicate_chars, multiword_rate, name_count, sample_names })`.

No SVG redraw — namesbases drive name generation, not rendering. **No
`Names.updateChain` call** (mirrors editor; chain computed lazily).

## Public API

```ts
export interface AddNamesbaseRuntime {
  /** Returns the live `window.nameBases`. Throws when missing/not array. */
  getNameBases(): NameBaseLike[];
  /** Pushes the entry onto `window.nameBases` (in place). Throws if global missing. */
  appendNamesbase(entry: NameBaseLike): void;
}

export const defaultAddNamesbaseRuntime: AddNamesbaseRuntime;
export function createAddNamesbaseTool(runtime?): Tool;
export const addNamesbaseTool: Tool;
```

The runtime split exposes `appendNamesbase` separately from
`getNameBases` so tests can stub the failure mode where reading works
but writing throws (defensive — matches `set-namesbase-names`'s
runtime-pair shape).

## Files

- `src/ai/tools/add-namesbase.ts` — the tool.
- `src/ai/tools/add-namesbase.test.ts` — Vitest unit tests.
- `src/ai/index.ts` — register and export the tool. Imports near
  `setNamesbaseNamesTool`. Alphabetically `addNamesbaseTool` slots
  between `addMarkerTool` and `addPitTool` in the imports / `register()`
  block, but per task instructions we wire it specifically near
  `setNamesbaseNamesTool` so reviewers can find all namesbase tools
  in one slot. Final placement: import in alphabetical position with
  the other `add*` tools; register call near other namesbase
  registrations.

## Validation / error cases

| Input                                                          | Error message                                                          |
| -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `name` provided non-string                                     | `"name must be a string."`                                             |
| `name` after sanitisation is empty                             | (NOT an error — fall back to default `"Base" + N`)                     |
| `min` not integer or out of [2, 100]                           | `"min must be an integer in [2, 100]."`                                |
| `max` not integer or out of [2, 100]                           | `"max must be an integer in [2, 100]."`                                |
| `min > max`                                                    | `"min must be <= max."`                                                |
| `duplicate_chars` non-string                                   | `"duplicate_chars must be a string."`                                  |
| `multiword_rate` non-finite / out of [0, 1]                    | `"multiword_rate must be a finite number in [0, 1]."`                  |
| `names` not a string and not string-array                      | `"names must be a string or an array of strings."`                     |
| Sanitised corpus is empty / whitespace-only                    | `"names must be a non-empty string."`                                  |
| Sanitised corpus has < 3 comma-separated entries               | `"Names corpus must have at least 3 names"`                            |
| `nameBases` missing/not array                                  | `"window.nameBases is unavailable. Generate or load a map first."`    |

## Wiring

In `src/ai/index.ts`:

- Add `import { addNamesbaseTool } from "./tools/add-namesbase";` in the
  alphabetical slot among other `add*` imports (between
  `addMarkerTool` and `addPitTool`).
- Add the corresponding `export { ... } from "./tools/add-namesbase"`
  block among the other `add*` exports.
- Add `registry.register(addNamesbaseTool);` in the registry-setup
  block, near `registry.register(setNamesbaseNamesTool);` so all
  namesbase tools cluster together.

## Tests

In `src/ai/tools/add-namesbase.test.ts`:

1. **Happy path no inputs**: empty `nameBases` → add → entry at index 0
   has `name="Base0"`, `min=5`, `max=12`, `d=""`, `m=0`,
   `b=` editor placeholder. Result reports `index=0`.
2. **Happy path with N existing**: 3 entries pre-existing → add → entry
   at index 3 has `name="Base3"`, defaults otherwise.
3. **Happy path with all custom inputs**: name, min, max, duplicate_chars,
   multiword_rate, names array — all surface correctly into the new
   entry. Result reports correct fields.
4. **Custom name with `/` and `|`**: `"My/Base|X"` → sanitised to
   `"MyBaseX"` and used as the entry's `.name`.
5. **Sanitised name empty (`"|||"`)** → falls back to default
   `"BaseN"`. Not an error. (Mirrors editor.)
6. **Whitespace-only name (`"   "`)** → falls back to default `"BaseN"`.
7. **Custom names array `["Foo", "Bar", "Baz"]`** → `b="Foo,Bar,Baz"`,
   `name_count=3`, `sample_names=["Foo","Bar","Baz"]`.
8. **Custom names string `"Alpha,Beta,Gamma"`** → `b="Alpha,Beta,Gamma"`.
9. **Names array with `/` and `|`** → stripped: `["A", "B|", "C/"]` →
   `b="A,B,C"`.
10. **Names with < 3 entries (array)** → error: corpus too short.
11. **Names with < 3 entries (string)** → error.
12. **Empty names string `""`** → error: empty corpus.
13. **min/max boundary 2/100 accepted**.
14. **min=1 rejected**, **max=101 rejected**, **min=1.5 rejected**.
15. **min > max rejected**.
16. **multiword_rate=0 and =1 accepted**, **=-0.1 and =1.1 rejected**.
17. **multiword_rate non-finite (`NaN`) rejected**.
18. **duplicate_chars non-string rejected**.
19. **name non-string rejected**.
20. **`names` wrong type (number, object, mixed array)** → error.
21. **`nameBases` missing** → error.
22. **`nameBases` not array** → error.
23. **Tool name + registry round-trip** via `ToolRegistry`.
24. **Schema declares both `names` shapes** (oneOf smoke check).
25. **Default runtime exposes the seam**.

## Self-review

Re-read plan and tasks before implementation. Findings:

- **No `updateChain` call**: I confirmed against the editor source —
  `namesbaseAdd()` does NOT call `Names.updateChain`. The chain is built
  lazily on first `Names.getBase(index, ...)` call. Mirroring this
  exactly is correct: anything else would be more aggressive than the
  legacy "Add" button. Worth a comment in the file.

- **Empty-name fallback is intentional**: the user wants a low-friction
  "create with sensible defaults" path. If the model passes
  `name: "|||"`, falling back to `"Base" + N` keeps the call moving
  rather than erroring. This matches the editor: "Add" never errors on
  bad name input; it just plops down `"Base" + N`. Documenting this in
  the schema description.

- **Default corpus is verbatim**: I copied the editor's placeholder
  string literally. The placeholder is intentionally short (~22 names) —
  enough to make the chain compile but with a hint message
  ("Please provide names data") in the editor. The AI sample_names will
  reflect this and the model can compose `set_namesbase_names`
  immediately to fix it.

- **Reusing helpers**: `set_namesbase_names`'s sanitisation logic
  (array trim/filter/join + strip `/|`) is identical to what we need.
  But it's not exported. Rather than refactoring it out (out of scope
  for this plan), I'll duplicate the small helper. If a future plan
  extracts this into `_shared`, all three tools can switch.

- **`duplicate_chars` and `multiword_rate` field naming**: the on-disk
  fields are `d` and `m` — short legacy names. The tool surface uses
  the verbose names from the editor labels. The result reports the
  verbose names too. (Mirrors how `set_namesbase_length_range` likely
  exposes `min`/`max`.)

- **Name collisions are NOT checked**: the editor doesn't check —
  multiple `"Base3"` entries are entirely possible if you delete and
  re-add. We mirror that. The `list_namesbases` tool already returns
  every entry by index, so collisions don't break identification.

- **No `min ≥ 2 / max ≥ 2` floor in the editor itself** — but plan 318
  set this floor for `set_namesbase_length_range`. We use the same
  range here for consistency.

- **`is_default` / `clearAllDefaults` patterns from `add_burg_group`
  don't apply** — namesbases have no default flag.

- **Pre-existing dirty files in main worktree** must NOT be staged:
  only stage `src/ai/tools/add-namesbase.ts`,
  `src/ai/tools/add-namesbase.test.ts`, `aiplans/plan_320.md`,
  `aiplans/tasks_320.md`, and `src/ai/index.ts` line edits.
