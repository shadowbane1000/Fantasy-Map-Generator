# Plan 327: `set_burg_link` tool

## Use case

Add an AI chat tool `set_burg_link` that sets or clears the `burg.link`
field on a single burg. This mirrors the legacy `setCustomPreview`
function in `public/modules/ui/burg-editor.js` (around line 298), wired
to the "Set preview link" button (`burgSetPreviewLink`):

```js
function setCustomPreview() {
  const id = +elSelected.attr("data-id");
  const burg = pack.burgs[id];

  prompt(
    "Provide custom URL to the burg map. ...",
    {default: Burgs.getPreview(burg).link, required: false},
    link => {
      if (link) burg.link = link;
      else delete burg.link;
      updateBurgPreview(burg);
    }
  );
}
```

The user can already attach a custom URL to a burg via the burg
editor's "Set preview link" button; the AI chat had no equivalent. The
field is persisted as `burg.link` on `pack.burgs[i]` and is part of the
`Burg` interface in `src/modules/burgs-generator.ts` (line 29:
`link?: string;`). It is consumed by `Burgs.getPreview(burg)` (also in
`burgs-generator.ts` around line 637) — when a burg has a `link`, the
preview popup uses it directly instead of the auto-generated MFCG /
village-generator URL.

The legacy editor's empty-input behaviour is `delete burg.link` (NOT
`burg.link = ""`); we must mirror that so downstream readers see the
field as absent (`'link' in burg === false`) when cleared.

We already have many `set_burg_*` tools (`set-burg-coa-custom`,
`set-burg-culture`, `set-burg-feature`, `set-burg-group`,
`set-burg-population`, `set-burg-port`, `set-burg-type`). This plan
adds the missing `set_burg_link` setter, slotting in alphabetically
between `set-burg-group-default` and `set-burg-population`.

`add-burg.ts` does NOT currently set or accept a `link` at burg
creation time — it returns only `i, cell, state, culture, name, x, y,
port, capital`. The `link` field is unset on a freshly created burg.
Setting it via this new tool is the only AI path to attach a custom
preview URL.

## Lint baseline

`cd /workspace/.claude/worktrees/plan-327 && npm run lint 2>&1 | tail
-50` on the worktree base (master @ 1d137af, plan-327-set-burg-link
branch, working tree clean) reports a clean baseline:

```
Checked 757 files in 614ms. No fixes applied.
```

**0 errors, 0 warnings, 0 info.** We must not regress this — any new
warning is a fail.

## Behavior

- Resolve a burg by numeric id or current name (case-insensitive),
  using the shared `findEntityByRef(pack.burgs, ref)` helper. Match
  the resolution semantics of neighbouring tools (`set-burg-port`,
  `set-burg-coa-custom`): first match wins for name (the shared helper
  does not raise on duplicate names — neighbouring tools delegate
  identically; we will not introduce ambiguity-handling here, since
  doing so would diverge from the rest of the burg-setter family).
- Reject burg 0 (the placeholder entry) and `removed: true` burgs.
  Locked burgs (`burg.lock === true`) are NOT rejected — the legacy
  `setCustomPreview` UI does not check `lock`, and `link` is purely a
  cosmetic preview-URL override (does not affect generation).
- A non-empty trimmed string `link` writes `burg.link = link` (the
  trimmed form).
- A `null` `link` deletes the field via `delete burg.link` (so
  `'link' in burg` becomes `false`). This is the explicit "clear" path.
- An empty / whitespace-only string `link` is rejected with an error
  rather than silently treated as a clear — neighbour-consistent (the
  rename-burg tool rejects empty trimmed names; we mirror that
  strictness, and require callers to be explicit about clearing via
  `null`). This is a deliberate departure from the UI's "empty input
  clears" affordance: in a UI text box "" and "absent" are
  indistinguishable, but in a JSON tool call they are distinct
  intents.
- After mutation, attempt a best-effort call to `updateBurgPreview` if
  it is exposed on `globalThis` (it is a closure in `burg-editor.js`
  and is generally NOT global). Wrap in try/catch and swallow.
  Rationale: the only purpose of the editor's `updateBurgPreview` call
  is to refresh the DOM preview in the editor popup IF that popup is
  currently open; it has no effect on the underlying state. Persisting
  to `pack.burgs[i].link` is sufficient for everything downstream
  (saves, exports, future preview popups).

### Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {
    "burg": {
      "type": ["integer", "string"],
      "description": "Numeric burg id (> 0) or the burg's current name (case-insensitive)."
    },
    "link": {
      "type": ["string", "null"],
      "description": "URL string to set as burg.link, or null to clear it. An empty / whitespace-only string is rejected — pass null to clear explicitly."
    }
  },
  "required": ["burg", "link"]
}
```

`link` is `required` (and may be explicitly `null`) so that the LLM
must always declare intent — there is no overload mode where omitting
`link` clears.

### Validation

- `burg` must resolve via `parseEntityRef` (positive integer id or
  non-empty name string).
- The resolved burg must exist; `burg.i > 0`; not `removed`.
- `link` must be either:
  - `null` (clear), OR
  - a `string` whose `.trim()` is non-empty (set).
- Any other type (`number`, `boolean`, `object`, `array`, `undefined`,
  empty/whitespace string) is rejected.
- We do NOT URL-validate. The legacy UI does no validation; the field
  may be a generator URL, an image URL, or anything else the user
  considers valid.

### Errors (verbatim, neighbour-consistent tone)

- Bad ref (non-positive integer / empty / wrong type): from
  `parseEntityRef` —
  `"burg must be a positive integer id or a non-empty name string."`
- Bad `link` type / empty string:
  `"link must be a non-empty string or null."`
- Resolver returns `null` (no match, burg 0, removed):
  `` `No burg found matching ${JSON.stringify(refResult.ref)}.` ``
- Pack collection missing (from runtime layer): the underlying error
  message bubbles up unchanged, mirroring `set-burg-port`.
- Runtime mutation throw: surfaced via
  `errorResult(err instanceof Error ? err.message : String(err))`.

### Success result

`okResult({ ok: true, burg: { i, name }, previous_link, link })`

- `previous_link` — the burg's prior `burg.link` value, or `null`
  if it was unset / empty / not a string.
- `link` — the trimmed string that was written, or `null` when
  cleared.

`noop` is also surfaced when previous and new values both equal
`null` (clearing an already-clear field) or when both are equal
strings.

## Files

- **New** `src/ai/tools/set-burg-link.ts` — the tool, patterned on
  `set-burg-coa-custom.ts` + `rename-burg.ts`. Exports:
  - `interface SetBurgLinkRef { i: number; name: string;
    previousLink: string | null; }`.
  - `interface SetBurgLinkRuntime { find(ref): SetBurgLinkRef | null;
    apply(i: number, link: string | null): void; }`.
  - `defaultSetBurgLinkRuntime` reading via
    `getPackCollection<RawBurg>("burgs")`, writing through, calling
    best-effort `updateBurgPreview` if globally available.
  - `createSetBurgLinkTool(runtime?)` returning `Tool` named
    `set_burg_link`.
  - `setBurgLinkTool` — default-runtime instance.
- **New** `src/ai/tools/set-burg-link.test.ts` — full Vitest spec
  (see Tests below).
- **Modify** `src/ai/index.ts`:
  - Add `import { setBurgLinkTool } from "./tools/set-burg-link";`
    between `setBurgGroupDefaultTool` (line 238) and
    `setBurgPopulationTool` (line 239) imports.
  - Add re-export block (createTool, default tool) between
    `set-burg-group-default` (line 2113) and `set-burg-population`
    (line 2114) re-export blocks.
  - Add `registry.register(setBurgLinkTool);` in
    `defaultToolRegistry()` adjacent to other burg-setter
    registrations (after `setBurgPortTool` line 2820).
- **Modify** `src/ai/tools/_shared/pack-types.ts`:
  - Add `link?: string;` to `RawBurg` (mirrors the canonical `Burg`
    interface in `src/modules/burgs-generator.ts:29`). Without this
    the runtime layer would have to cast or use `any`.

## Tests (Vitest)

Mirror the layout of `set-burg-coa-custom.test.ts`:

1. **Happy path set (id)**: previous `link` undefined → call `{ burg:
   5, link: "https://example.com/foo" }` → `apply(5,
   "https://example.com/foo")`, payload `{ ok: true, burg: { i: 5,
   name: "Rookhold" }, previous_link: null, link:
   "https://example.com/foo", noop: false }`.
2. **Happy path set (name, case-insensitive)**: `{ burg:
   "ROOKHOLD", link: "https://x" }` resolves to id 5 via the
   runtime's `find`.
3. **Happy path set trims the input**: `{ burg: 5, link: "  https://y
   " }` → `apply(5, "https://y")`, `link: "https://y"` in payload.
4. **Happy path clear (id)**: previous `link: "old"` → call `{ burg:
   5, link: null }` → `apply(5, null)`, payload `{ previous_link:
   "old", link: null, noop: false }`.
5. **Noop when already cleared**: previous `link: null`, call with
   `link: null` → no `apply` call, `noop: true` in payload.
6. **Noop when same string**: previous `link: "https://x"`, call with
   `link: "https://x"` → no `apply` call, `noop: true`.
7. **Rejects empty / whitespace string**: `link: ""`, `link: "   "`
   → error `"link must be a non-empty string or null."`, no apply.
8. **Rejects wrong link types**: `link: 5`, `link: true`, `link: {}`,
   `link: []`, `link: undefined` (missing key) → same error.
9. **Rejects bad burg ref**: `burg: 0`, `burg: -1`, `burg: 1.5`,
   `burg: ""`, `burg: null`, `burg: undefined` → error from
   `parseEntityRef`, no apply.
10. **Rejects unknown burg** (resolver returns null) → error
    `"No burg found matching <ref>."`.
11. **Surfaces runtime apply errors**: runtime throws → error
    `"<thrown message>"`.
12. **Tool name + registry round-trip**: tool name === `"set_burg_link"`;
    registering and dispatching mutates the burg.

### Default-runtime integration (`globalThis.pack`)

13. **Sets a non-empty string** on burg 5 → `pack.burgs[5].link ===
    "https://example.com"`.
14. **`delete`s the field on clear**: prepopulate `pack.burgs[5].link
    = "old"`, call with `link: null` → `'link' in pack.burgs[5] ===
    false`. (NOT `pack.burgs[5].link === ""` and NOT `=== null`.)
    This is the load-bearing assertion that ensures we mirror the
    editor's `delete` semantics, not a `= null` substitute.
15. **Rejects burg 0**.
16. **Rejects removed burg**.
17. **Rejects when pack is missing** → error from runtime, surfaced.
18. **Resolves by case-insensitive name** at runtime.
19. **Best-effort `updateBurgPreview`**: when present on
    `globalThis`, it is called once with the burg object after
    `burg.link` is mutated; when absent, no throw; when it throws,
    the error is swallowed and the success payload is unaffected.
    (Three sub-cases.)

## Verification

- `npm test` — green.
- `npm run lint 2>&1 | tail -50` — still 0 warnings, 0 info, 0
  errors. No new noise.
- `npx tsc --noEmit` — clean.

## Self-review (added during step 5)

Reviewed the plan + tasks against the use case:

- **`delete` semantics preserved.** Plan §Behavior + Tests §14
  explicitly call out that clearing must `delete burg.link`, and the
  test asserts `'link' in burg === false` (not `=== null` / `===
  ""`). This is the load-bearing detail of the legacy
  `setCustomPreview` implementation.
- **Empty-string-vs-null divergence justified.** The legacy UI
  conflates "" and "missing" because a textbox can only emit ""; a
  JSON tool MUST distinguish. Plan §Behavior documents the
  rationale; Tests §7 covers the rejection.
- **Trim semantics.** We trim before storing (so leading/trailing
  whitespace doesn't pollute the field) but reject if the trim is
  empty (consistent with `rename-burg`'s `name.trim()` check).
- **`updateBurgPreview` is best-effort.** Test §19 covers all three
  sub-cases (present, absent, throws). The plan documents WHY this
  side-effect is purely cosmetic (refreshes the editor's preview
  popup if open).
- **Lock semantics.** Plan §Behavior explicitly does NOT check
  `burg.lock` — the legacy UI doesn't, and `link` is cosmetic, so a
  locked burg is still allowed. This diverges from
  `set-burg-coa-custom` (which DOES check lock) but matches
  `set-burg-port` (which does NOT). The diverging precedent is
  correctly chosen here based on field semantics, not blindly
  copied.
- **Alphabetical insertion point.** `set-burg-link` slots between
  `set-burg-group-default` and `set-burg-population` in every place
  (import, re-export, registration); confirmed via the existing
  ordering in `src/ai/index.ts`.
- **`RawBurg` extension.** `link?: string` must be added to
  `_shared/pack-types.ts`'s `RawBurg`; this is a minor type
  enhancement, not a regression. Other tools that import `RawBurg`
  are unaffected (additive optional field).
- **Error message tone.** All messages match the terse style of
  `set-burg-coa-custom`, `set-burg-port`, `rename-burg`.
- **Field naming.** Result uses `previous_link` / `link` (snake_case)
  to match the JSON-schema convention used by other tools (e.g.
  `set-burg-population` uses `previous_population`). Note: some
  neighbours use camelCase (`previousCustom`, `previousEnabled`).
  Snake_case is more in line with the JSON-schema input field naming
  ("previous_link" matches `link` in the schema). To stay consistent
  with the IMMEDIATE neighbours (`set-burg-coa-custom`,
  `set-burg-port`), we will use **camelCase**: `previousLink` /
  `link`. Updated below.
- **Result shape revision (post-review):** use camelCase
  `previousLink` (not `previous_link`) and flatten — payload becomes
  `{ ok: true, i, name, previousLink, link, noop }`, matching
  set-burg-coa-custom's flat shape. This is the form the
  implementation and tests must use; plan-body description above is
  updated accordingly.
