# Plan 138 — Use Case: Set a province's form name (Duchy, Barony, County, …)

## Status

Iteration 138. Baseline 7 warnings / 1 info / 0 errors. 1764 tests pass
(150 files). Plan 132 (`set_state_form`) ships the state-level
counterpart. This plan adds the province-level parallel.

The Provinces Editor exposes `#provinceNameEditorSelectForm` — a
dropdown of ~36 form labels (Barony, County, Duchy, Principality,
Province, Republic, Territory, Tribe, …) — plus a free-form custom
input. On Apply the editor writes three fields:

```js
p.name     = byId("provinceNameEditorShort").value;
p.formName = byId("provinceNameEditorSelectForm").value;
p.fullName = byId("provinceNameEditorFull").value;
provs.select("#provinceLabel" + p.i).text(p.name);
```

(`public/modules/ui/provinces-editor.js:579-585`).

Unlike `set_state_form`, provinces have **no** `form` / `formName`
split — only `formName` exists (confirmed in
`src/ai/tools/_shared/pack-types.ts:110-123`). There is no category
table, and the dropdown accepts anything the user types via the
"+ custom form" plus-icon. So this tool is a free-form string setter,
not an enum lookup.

## Use Case

**"Make Rookwood a Duchy."** / **"Turn province 7 into a Barony."**

Field confirmed as `province.formName` (free-form string). The tool
also recomposes `province.fullName` the same way the editor's
Regenerate Full Name button does:

```js
// from provinces-editor.js regenerateFullName() + composeProvinceFullName
if (!form) return short;
if (!short && form) return "The " + form;
return short + " " + form;
```

We already have `composeProvinceFullName(short, form)` exported from
`src/ai/tools/regenerate-province-name.ts:33-37` — reuse it so the
behavior stays locked to one place.

Prompts:
- *"Make Rookwood a Duchy."*
- *"Turn province 7 into a Barony."*
- *"Change the form of the Seavale County to Principality."*
- *"Set province 3's form to Territory."*

### Success criteria

- `set_province_form` registered on the default registry.
- Accepts `province` (numeric id `>0` or `"province-7"` /
  case-insensitive name or fullName) — required.
- Accepts `form` (string) — required, non-empty after `trim()`.
  Free-form; no enum validation (matches the UI's "+ custom form"
  behavior).
- Rejects province 0 (placeholder), removed provinces, and locked
  provinces (`lock: true`).
- Mutates `province.formName = form.trim()`.
- Mutates `province.fullName = composeProvinceFullName(short, form)`
  so the ceremonial name stays in sync, matching the editor's
  regenerateFullName button.
- Best-effort updates the `#provinceLabel{i}` SVG label to the short
  name (same as `rename_province`).
- Idempotent-ish: if `formName` already matches (trimmed), still
  recomputes `fullName` because the short name may have changed since
  the last set — but this is rare. Return `{ ok, i, previousForm,
  form, previousFullName, fullName }` regardless.
- Returns `{ ok, i, previousForm, form, previousFullName, fullName }`.
- `npm run build` succeeds, `npm test` all pass, lint matches baseline
  (7 warnings / 1 info / 0 errors).

## Shape

```
src/ai/tools/
  set-province-form.ts         — new tool (runtime-seam pattern)
  set-province-form.test.ts    — unit + integration tests

src/ai/index.ts                — import + export + registry wire-up
README_AI.md                   — table row near set_state_form / rename_province
```

No schema changes: `RawProvince.formName?: string` already exists
(`src/ai/tools/_shared/pack-types.ts:114`).

## Runtime seam

```ts
export interface SetProvinceFormRef {
  i: number;
  name: string;
  previousForm: string | null;
  previousFullName: string | null;
}

export interface SetProvinceFormRuntime {
  find(ref: number | string): SetProvinceFormRef | null;
  apply(i: number, formName: string, fullName: string): void;
}
```

Default runtime:
- `find(ref)` uses
  `findEntityByRef(getPackCollection<RawProvince>("provinces"), ref)`.
  Returns `null` for missing, `i <= 0`, `removed`, or `lock`. Reports
  `name`, `previousForm`, `previousFullName`.
- `apply(i, formName, fullName)` — writes
  `province.formName = formName` and `province.fullName = fullName`;
  best-effort `document.getElementById("provinceLabel" + i).textContent = province.name`
  (the short name, unchanged — still updates because the state label
  renderer doesn't auto-repaint). Actually the short name is not
  changed by this tool, so the label update is redundant but matches
  the editor's end-of-applyNameChange `provs.select` call. Keeping it
  in parallels rename-province's approach and is a cheap no-op when
  the label already matches.

Thrown errors from `apply` (defensive — e.g. the province disappeared
between `find` and `apply`) bubble up as `errorResult` via the
standard try/catch in `execute`.

## Error messages

- `"province must be provided."` — missing ref (from parseEntityRef).
- `"form must be a non-empty string."` — non-string or empty/whitespace form.
- `"No province found matching ..."` — find returned `null` (covers
  missing, province 0, removed, locked — same convention as
  `set_province_coa_custom` / `rename_province`).
- Apply failures surface the underlying error via
  `err instanceof Error ? err.message : String(err)`.

## Tests

Unit (injected runtime) tests:
1. sets `formName` on a province by numeric id; `fullName` is
   recomputed as `"{name} {formName}"`.
2. sets `formName` and recomputes `fullName = "The {formName}"` when
   the province's short name is empty.
3. resolves province by case-insensitive `name`.
4. resolves province by case-insensitive `fullName`.
5. trims whitespace from `form`.
6. rejects unknown province ref (find returns null).
7. rejects invalid refs (`null`, `undefined`, `0`, `-1`, `1.5`, `""`).
8. rejects non-string / empty / whitespace `form`
   (`42`, `null`, `""`, `"   "`).
9. surfaces `apply` errors.
10. result JSON includes `previousForm`, `previousFullName`, `form`,
    `fullName`, `i`, `ok: true`.

Integration block with `defaultSetProvinceFormRuntime` via
`setProvinceFormTool.execute(...)`:
- Writes `pack.provinces[5].formName` and `fullName` end-to-end.
- Updates the `#provinceLabel{i}` DOM text when available.
- Rejects province 0.
- Rejects removed provinces (`removed: true`).
- Rejects locked provinces (`lock: true`).
- Rejects when pack is missing.

Use `as unknown as { ... }` for all `globalThis` casts.
