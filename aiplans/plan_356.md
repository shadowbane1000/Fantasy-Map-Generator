# Plan 356 — `regenerate_river_name` AI chat tool

## Use case

Add an AI chat tool `regenerate_river_name` that regenerates the name
of a SINGLE river using the procedural namer. This mirrors the
per-river "Generate (culture)" / "Generate (random)" buttons in the
Rivers Editor — see
`public/modules/ui/rivers-editor.js` lines 205-213:

```js
function generateNameCulture() {
  const r = getRiver();
  r.name = riverName.value = Rivers.getName(r.mouth);
}

function generateNameRandom() {
  const r = getRiver();
  if (r) r.name = riverName.value = Names.getBase(rand(nameBases.length - 1));
}
```

The user can already trigger these per-river via the editor. The AI
cannot per-river — only via the bulk `regenerate_river_names` tool.

We already ship analogous per-entity regenerate tools:
`regenerate_burg_name`, `regenerate_state_name`, `regenerate_route_name`
(plan 326), `regenerate_regiment_name` (plan 338), `regenerate_lake_name`.

This plan adds the missing **single-river regenerate** action.

### Important: `Rivers.getName` vs `Names.getCulture`

The bulk `regenerate_river_names` tool dispatches culture-mode through
`Names.getCulture(pack.cells.culture[mouth])`. The per-river editor
buttons (above) use `Rivers.getName(r.mouth)`.

Looking at `src/modules/river-generator.ts:567-569`:

```ts
getName(cell: number) {
  return Names.getCulture(pack.cells.culture[cell]);
}
```

these are functionally identical TODAY, but the legitimate per-river
UI path is `Rivers.getName(mouth)`. We mirror the per-river UI path
exactly, so this tool calls `Rivers.getName(river.mouth)` directly —
keeping the seam at `Rivers`, not at `Names`. If `Rivers.getName` ever
diverges from `Names.getCulture` (custom culture-by-mouth logic, lake
handling, etc.), this tool tracks the editor button rather than the
bulk tool. Documented in the tool description.

## Lint baseline

`npm run lint 2>&1 | tail -50`:

```
> fantasy-map-generator@1.114.1 lint
> biome check --write

Checked 817 files in 657ms. No fixes applied.
```

Clean baseline.

## Behavior

1. Resolve `river` by id (numeric river.i — non-contiguous, generator
   skips removed rivers) or case-insensitive name. Reject removed
   rivers explicitly with the dedicated error message.
2. Resolve `mode` ∈ {"culture", "random"}. Default to "culture" when
   omitted (matches the bulk tool's default and the editor's primary
   "Generate (culture)" button).
3. Generate the new name:
   - **culture**: `Rivers.getName(river.mouth)` — exactly the
     per-river UI's path.
   - **random**: `Names.getBase(rand(nameBases.length - 1))` — exactly
     the per-river UI's path. The runtime injects a `random` function
     so tests can pin determinism; the default runtime uses the
     legacy `rand(max)` global if available, else falls back to
     `Math.floor(Math.random() * nameBases.length)`.
4. Capture `previousName = river.name` BEFORE mutation.
5. Set `river.name = newName`.
6. Best-effort: call `drawRivers()` if available (rivers have no
   on-map text labels, but we keep parity with the bulk tool and
   refresh the open editor's `#riverName` input if present —
   wrapped in try/catch).
7. Return `{ ok, river: { i, previous_name, name }, mode }`.

## Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {
    "river": {
      "type": ["integer", "string"],
      "description": "River id (matches river.i, not array index — non-contiguous because the generator skips removed rivers) or case-insensitive current name."
    },
    "mode": {
      "type": "string",
      "enum": ["culture", "random"],
      "description": "\"culture\" (default) calls Rivers.getName(river.mouth); \"random\" calls Names.getBase with a random nameBases index."
    }
  },
  "required": ["river"]
}
```

## Validation

- `river` is required and resolves to a non-removed river.
- `mode` if provided must be exactly "culture" or "random"
  (case-insensitive resolution via `resolveRiverNameMode` reused from
  `regenerate-river-names.ts`).
- Mode-specific globals must be present:
  - culture: `Rivers.getName` must be a function.
  - random: `Names.getBase` must be a function AND a non-empty
    `nameBases` global must be available.
- `pack.rivers` must be an array.

## Errors (verbatim)

Consistent with `regenerate_river_names` and `rename_river`:

- `"river must be a positive integer id or a non-empty name string."`
  — emitted by `parseEntityRef`.
- `"River ${ref} not found."` — `${ref}` is JSON.stringified
  (matches the dispatch instruction text exactly).
- `"Cannot regenerate name for removed river ${i}."`
- `"mode must be 'culture' or 'random'."`
- `"Rivers.getName is not available; the map hasn't finished loading."`
- `"Names.getBase is not available; the map hasn't finished loading."`
- `"nameBases is not available or empty."`
- `"Name generator returned an empty/invalid name."` — defensive.
- Runtime errors propagated as their `.message`.

## Success result

```jsonc
{
  "ok": true,
  "river": {
    "i": 5,
    "previous_name": "Old River",
    "name": "Mistwater"
  },
  "mode": "culture"
}
```

## Files

### NEW

- `src/ai/tools/regenerate-river-name.ts` — the tool.
- `src/ai/tools/regenerate-river-name.test.ts` — Vitest suite.

### MODIFY

- `src/ai/index.ts`:
  - Import slot: alphabetically next to
    `regenerate-river-names` (immediately before
    `regenerateRiverNamesTool` import — `regenerate_river_name` <
    `regenerate_river_names` lexicographically).
  - Re-export block: same alphabetical position.
  - `buildDefaultRegistry()`: register call immediately before
    `regenerateRiverNamesTool`.

## Tests (Vitest)

Stub-runtime suite (mocks `find` / `generateCulture` / `generateRandom`
/ `apply` / `redraw`):

1. **happy path mode="culture"** — stub `Rivers.getName(mouth)` returns
   "Foo"; verify `generateCulture` was called with `river.mouth`
   (mouth=42); verify `apply(5, "Foo")`; previous_name captured as
   "Old River".
2. **happy path mode="random"** — stub `generateRandom` returns "Bar";
   verify it was called; `apply(5, "Bar")`.
3. **default mode (omitted) === "culture"** — call without `mode`;
   verify `generateCulture` (not `generateRandom`) is invoked.
4. **case-insensitive mode** — `mode: "RANDOM"` resolves to "random".
5. **happy path by river name (case-insensitive)** — find called with
   "MISTWATER", returns the river ref; success.
6. **river not found** — `find` returns null →
   `"River <ref> not found."` (JSON.stringify of ref).
7. **removed river** — `find` returns ref with `removed: true` →
   `"Cannot regenerate name for removed river ${i}."`.
8. **bad mode** — `mode: "other"` →
   `"mode must be 'culture' or 'random'."`. Verify apply not called.
9. **bad river ref** — null/undefined/0/-1/1.5/"" → ref-parser error.
10. **previous_name captured BEFORE mutation** — `apply` mock asserts
    that at the time it was called, the snapshot's previousName equals
    the original name. Also: re-call after mutation would produce a
    different previousName.
11. **empty generator output** → error.
12. **generator throws** → error message propagated.
13. **redraw failure swallowed** — `redraw.mockImplementation(throw)`;
    response is still success.
14. **registry round-trip** via `ToolRegistry`.

Default-runtime integration suite:

15. **culture mode**: stubs `globalThis.Rivers = { getName }`,
    `globalThis.pack = { rivers: [...] }`. Call tool; verify
    `Rivers.getName` called with `river.mouth`; pack mutated.
16. **random mode with deterministic random**: inject runtime with a
    pinned random fn (or stub `globalThis.rand` to a deterministic
    counter); verify `Names.getBase` called with the expected index
    and pack mutated.
17. **culture mode missing `Rivers.getName`** → error mentions
    `Rivers.getName`. (Set `globalThis.Rivers = {}` or `undefined`.)
18. **random mode missing `Names.getBase`** → error mentions
    `Names.getBase`.
19. **random mode empty `nameBases`** → error mentions `nameBases`.
20. **removed river by id** → error.
21. **river not found by name** → not-found error.

## Verification

- `npm test`
- `npx tsc --noEmit`
- `npm run lint`

All must pass.

## Self-review

After drafting `tasks_356.md`, re-read both files with the following
checklist:

- [x] **culture mode uses `Rivers.getName(mouth)`, NOT
      `Names.getCulture(cellCulture)`** — the bulk `regenerate_river_names`
      tool uses `Names.getCulture(pack.cells.culture[mouth])`, but this
      single-river tool mirrors the per-river UI path
      (`rivers-editor.js` line 207). Documented in the use-case
      section (with the deeper observation that the two are identical
      in the current code, but `Rivers.getName` is the legitimate per-
      river seam and we honour it). Test 15 asserts the tool dispatches
      through `Rivers.getName`, NOT through `Names.getCulture`.
- [x] **previous_name captured BEFORE mutation** — Behavior §4 makes
      this explicit; test 10 asserts it.
- [x] **default mode tested** — test 3 covers the omitted-`mode` case
      and confirms it dispatches through the culture path.
- [x] **deterministic random for random-mode tests** — random tests
      inject the random function into the runtime so the chosen base
      index is predictable (test 16). Avoids flaky tests.
- [x] **JSON-stringify of ref in not-found error** — matches sibling
      conventions; test 6 asserts the formatted text.
- [x] **`mode` validation error format** — `"mode must be 'culture'
      or 'random'."` (single quotes around the literals; matches the
      dispatch spec verbatim).
- [x] **errors-verbatim list matches the dispatch spec exactly** —
      reviewed each line; the only addition is the standard
      ref-parser error from `parseEntityRef` (which is unavoidable
      since we go through the shared helper).

### Corrections made during review

- Initial draft considered using a single `generate(mode, mouth)`
  runtime entry, but splitting into `generateCulture(mouth)` and
  `generateRandom()` makes it cleaner to inject a deterministic
  random function for tests (no `Math.random` plumbing). Final
  runtime shape is:
  `{ find, generateCulture, generateRandom, apply, redraw }`.
- Initial draft considered putting the redraw call inside the
  `apply` runtime method; pulled it out so a redraw failure does
  not roll back the rename. Matches the bulk tool's pattern
  (separate `apply` and `redraw` slots).
- Clarified that the random-mode default runtime uses the legacy
  `rand` global if present (matching the per-river UI verbatim:
  `Names.getBase(rand(nameBases.length - 1))`) and falls back to
  `Math.floor(Math.random() * nameBases.length)` only if `rand` is
  missing — this matches `regenerate-lake-name.ts`'s
  `generateRandomName`.
