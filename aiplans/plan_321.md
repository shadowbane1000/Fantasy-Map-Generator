# Plan 321: `set_namesbase_duplication` tool

## Use case

Add an AI chat tool that mirrors the legacy `updateBaseDublication`
handler in `public/modules/ui/namesbase-editor.js` (around line 116):

```js
function updateBaseDublication() {
  const base = +document.getElementById("namesbaseSelect").value;
  nameBases[base].d = this.value;
}
```

The `.d` field on a namesbase entry is a string of characters whose
doubling the name generator should avoid (e.g. `"aeiou"` would prevent
generated names from having repeated vowels). The user-visible flow is
"open the Namesbase Editor → edit the 'Avoid Doubling' input →
generated names avoid doubling those chars".

The AI side already has `list_namesbases`, `rename_namesbase`,
`set_namesbase_length_range`, `set_namesbase_names`, plus an in-flight
`add_namesbase` (plan 320, separate worktree). It does *not* yet have a
setter for the duplication-avoid string. This plan fills that gap.

## Lint baseline

`npm run lint 2>&1 | tail -40` on the worktree base (master @ 86a0ed6,
plan-321 branch, working tree clean) reports:

- `src/modules/provinces-generator.ts:321:32` —
  `lint/complexity/useLiteralKeys` (info, fixable).
- Two `lint/performance/noDynamicNamespaceImportAccess` warnings on
  `src/renderers/draw-heightmap.ts` (lines 34 and 64).
- Other warnings in pre-existing renderer/module code.

Final summary line: **"Found 7 warnings. Found 1 info."** No errors. We
must not regress this — implementation may not introduce new warnings.

## Behavior (mirrors the editor exactly)

- Resolve a single namesbase by `index` (preferred) or `current_name`
  (case-insensitive trimmed exact match), with disambiguation on
  collision; same identification semantics as `rename_namesbase` and
  `set_namesbase_length_range`.
- Set `nameBases[index].d = duplicate_chars`.
- Do **not** trim `duplicate_chars`. The legacy editor binds the input
  value verbatim. Rationale: the user might legitimately include a
  space character among the chars to avoid doubling. Document the
  no-trim decision in the tool description.
- Do **not** sanitize `/` or `|`. Unlike `name` and the names corpus
  (`b`), the duplication field is not user-facing in any place where
  these characters would clash with the `.map` save-format separator
  (the field is dumped into `b` lists and the chains, but `.d` itself
  is short and saved as its own field). The legacy editor passes it
  through verbatim. Mirror exactly.
- Do **not** call `Names.updateChain(index)` after the change. The
  legacy editor only invokes `Names.updateChain` when the names list
  itself is replaced (see `updateChain` calls in `namesbase-editor.js`
  for `b`/corpus changes). The duplication field is consulted at name
  generation time, not at chain build time.

### Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {
    "index": {
      "type": "integer",
      "minimum": 0,
      "description": "Namesbase array index (matches the position in window.nameBases, where 0 is valid)."
    },
    "current_name": {
      "type": "string",
      "description": "Current namesbase name (case-insensitive, trimmed exact match). Use index when multiple bases share a name."
    },
    "duplicate_chars": {
      "type": "string",
      "description": "New value for the namesbase's duplication-avoid string (.d). Each character in this string is one the name generator will avoid doubling. Empty string means 'no doubling restrictions'. The value is stored verbatim — no trim, no '/' or '|' stripping."
    }
  },
  "required": ["duplicate_chars"]
}
```

`index` and `current_name` are individually optional but at least one
must be provided.

### Validation

- `duplicate_chars` must be a string (typeof === "string"). Empty
  string allowed.
- At least one of `index` / `current_name` must be supplied.
- `index`, when supplied, must be a non-negative integer.
- `current_name`, when supplied, must be a non-empty string after
  trimming.
- Both `index` and `current_name` may be supplied; in that case they
  must agree (resolve to the same array index).
- The `nameBases` global must exist and be an array.

### Errors

- Neither `index` nor `current_name` provided → `"Provide either index
  or current_name to identify the namesbase."`
- `duplicate_chars` not a string (incl. number, null, undefined,
  boolean, object) → `"duplicate_chars must be a string."`
- `index` not non-negative integer → `"index must be a non-negative
  integer."`
- `index` out of range → `"No namesbase found at index <n>."`
- `current_name` empty / not string → `"current_name must be a
  non-empty string."`
- `current_name` not found → `"No namesbase found with name <name>."`
- `current_name` ambiguous → `"Multiple namesbases match name <name>.
  Disambiguate by index."` plus `candidates: [{index, name}]`.
- `index` and `current_name` disagree → `"index and current_name
  disagree."`
- `nameBases` missing / not array → `"window.nameBases is unavailable.
  Generate or load a map first."` (from runtime helper).

### Success result

`okResult({ ok: true, index, name, old_duplicate_chars,
new_duplicate_chars })`. `name` is the current name of the resolved
namesbase (helpful for a confirmation message). `old_duplicate_chars`
is the value of `.d` before the write (`""` when missing). The plan
spec calls for `old_duplicate_chars` / `new_duplicate_chars` keys.

## Files

- **New** `src/ai/tools/set-namesbase-duplication.ts` — the tool,
  patterned on `set-namesbase-length-range.ts`. Exports:
  - `interface NameBaseLike` (name?, d?).
  - `interface SetNamesbaseDuplicationRuntime { getNameBases():
    NameBaseLike[]; setDuplication(index: number, value: string): void;
    }`.
  - `defaultSetNamesbaseDuplicationRuntime` reading
    `window.nameBases`.
  - `createSetNamesbaseDuplicationTool(runtime?)` returning `Tool`.
  - `setNamesbaseDuplicationTool` — the default-runtime instance.
- **New** `src/ai/tools/set-namesbase-duplication.test.ts` — Vitest
  spec, full coverage (see Tests below).
- **Modify** `src/ai/index.ts`:
  - Import `setNamesbaseDuplicationTool` near
    `setNamesbaseLengthRangeTool` / `setNamesbaseNamesTool` imports
    (alphabetical: between LengthRange and Names).
  - Re-export `createSetNamesbaseDuplicationTool`,
    `defaultSetNamesbaseDuplicationRuntime`, type
    `SetNamesbaseDuplicationRuntime`, and `setNamesbaseDuplicationTool`
    in the same alphabetical position.
  - Register via `registry.register(setNamesbaseDuplicationTool);` in
    `defaultToolRegistry()`, alongside the other namesbase
    registrations.

Identification helpers `findNamesbaseByIndex` and
`findNamesbasesByName` are already exported by
`src/ai/tools/rename-namesbase.ts` and reused; no new shared utilities
needed.

## Tests (Vitest)

Mirror the structure of `set-namesbase-length-range.test.ts`:

1. **Happy path index**: `nameBases[1].d = ""` → call with `{ index:
   1, duplicate_chars: "aeiou" }` → `setDuplication(1, "aeiou")`,
   result `{ ok: true, index: 1, name: <name>, old_duplicate_chars:
   "", new_duplicate_chars: "aeiou" }`.
2. **Empty string accepted**: `nameBases[0].d = "aeiou"` → call with
   `duplicate_chars: ""` → `setDuplication(0, "")`,
   `new_duplicate_chars: ""`.
3. **Old defaults to "" when `.d` missing**: `nameBases[0]` has no `.d`
   field → success, `old_duplicate_chars: ""`.
4. **Special chars preserved verbatim**: e.g. `duplicate_chars: "a/|"`
   → stored exactly as-is.
5. **Whitespace preserved**: `duplicate_chars: "   "` → stored
   verbatim, not trimmed.
6. **`duplicate_chars` missing** → error `"duplicate_chars must be a
   string."`, no setDuplication call.
7. **`duplicate_chars` non-string types** (number, null, true, {}) →
   same error.
8. **Index out of range** → `"No namesbase found at index <n>."`.
9. **Index negative / non-integer / NaN / Infinity / numeric string** →
   `"index must be a non-negative integer."`.
10. **`current_name` not found** → `"No namesbase found with name
    Ghost."`.
11. **`current_name` ambiguous** → multi-match error with `candidates`.
12. **Index + current_name disagree** → `"index and current_name
    disagree."`.
13. **Neither identifier supplied** → `"Provide either index or
    current_name..."`.
14. **`current_name` empty / whitespace / non-string** →
    `"current_name must be a non-empty string."`.
15. **Tool name + registry round-trip**: `setNamesbaseDuplicationTool.name
    === "set_namesbase_duplication"`; the registry round-trip mutates
    `window.nameBases[i].d` and returns the expected payload.
16. **Default runtime integration**: with a populated
    `globalThis.nameBases`, the tool mutates the matching entry; with
    `nameBases` missing/non-array it errors clearly.
17. **Runtime failure pass-through**: `getNameBases` throws → error
    surfaces; `setDuplication` throws → error surfaces.

## Verification

- `npm test` — green.
- `npm run lint` — does NOT regress (still 7 warnings, 1 info; no new
  output).
- `npx tsc --noEmit` — clean.

## Self-review (added during step 4)

Reviewed the plan against the spec:

- No-trim, no-sanitize, no-updateChain decisions are documented in the
  Behavior section and will be repeated in the tool description.
- Error messages match the patterns used by `rename_namesbase` and
  `set_namesbase_length_range`, so the LLM's prior-art reasoning
  applies cleanly.
- Identification logic is fully delegated to `rename-namesbase`'s
  exports; we don't fork the resolver.
- Test list covers: happy path, empty allowed, no trim, no sanitize,
  missing/wrong-type duplicate_chars, every identifier-error branch,
  default-runtime integration, registry round-trip, runtime failure
  pass-through.
- The spec's "old_duplicate_chars" / "new_duplicate_chars" key names
  are honored verbatim (matching the spec, not the verb-style of
  `old_min`/`new_min`).
- The required field `duplicate_chars` is in the schema's `required`
  array — unlike `set_namesbase_length_range`, which had neither
  required (because either of `min`/`max` is optional).
