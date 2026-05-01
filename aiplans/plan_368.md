# Plan 368 — Per-row "Edit notes" buttons in list-style editors

## Use case

The legacy notes system (`window.notes` array, `editNotes(id, name)` in
`public/modules/ui/notes-editor.js:3`) is keyed by id strings of the
form `<entityType><i>` (e.g. `burg7`, `regiment3`, `marker12`). It
already accepts any id and creates a new entry on demand
(`notes-editor.js:23-28`). Most per-entity editors expose a "Legend"
button that calls `editNotes(...)` for the currently-selected entity:

- `public/modules/ui/burg-editor.js:47` — `byId("burglLegend").on("click", editBurgLegend)`,
  body at line 390 calls `editNotes("burg" + id, name)`.
- `public/modules/ui/regiment-editor.js:33` + `editLegend` at line 388 — `editNotes(elSelected.id, getRegiment().name)`.
- `public/modules/ui/labels-editor.js:56` — `editLabelLegend`.
- `public/modules/ui/lakes-editor.js:34` — `editLakeLegend`.
- `public/modules/ui/rivers-editor.js:42` — `editRiverLegend`.
- `public/modules/ui/routes-editor.js:44` — `editRouteLegend`.

The corresponding HTML buttons are defined in `src/index.html` at
lines 2806/2882/2979/3051/3607/3742 — every one of them uses
`class="icon-edit"` with `data-tip="Edit free text notes (legend) for ..."`.

The four list-style editors do NOT currently have any equivalent:

- `public/modules/dynamic/editors/states-editor.js:152` — `statesEditorAddLines`.
- `public/modules/ui/provinces-editor.js:112` — `provincesEditorAddLines`.
- `public/modules/dynamic/editors/cultures-editor.js:118` — `culturesEditorAddLines`.
- `public/modules/dynamic/editors/religions-editor.js:129` — `religionsEditorAddLines`.

The AI tools `set_note` / `get_note_info` / `remove_note` /
`find_notes_by_prefix` already target arbitrary id strings, so notes
written from these new buttons will round-trip with AI-generated notes
automatically. Note ids match the SVG group conventions (`<g
id="state3">`, `<g id="province4">`, etc.).

## Lint baseline

Biome only scans `src/**/*.ts` (per `CLAUDE.md` § Build, test, lint).
All four files we are editing live under `public/modules/**`, which
Biome does not lint. So `npm run lint` is irrelevant to this plan and
will not be run. We will still run `npx tsc --noEmit` to confirm no
incidental TypeScript breakage (no `.ts` files are touched, but
`window.editNotes` is referenced via the global typing system).

Pre-implementation `npx tsc --noEmit`: clean (no output).
Pre-implementation `npm test`: 384 files, 7327 tests passing.

## Icon choice + tooltip

- **Class:** `icon-edit` — verified to be the class every existing
  Legend button uses (grep on `src/index.html` lines 2806, 2882, 2979,
  3051, 3607). None of the four target editors currently uses
  `icon-edit`, so adding it on the row template will not collide with
  any existing event delegation.
- **Tooltip / `data-tip`:** `"Edit notes"` — matches the user's design
  brief. Existing Legend buttons use the longer string `"Edit free
  text notes (legend) for this <entity>"`; we deliberately use the
  shorter "Edit notes" because (a) the user requested it, and (b)
  these list rows are tighter than the per-entity editor toolbars.
- **Placement:** between the lock toggle and the trash/remove icon
  (where present), or at the end of the row if there is no remove
  icon. This puts it next to the existing "destructive" icons and
  matches the visual order users already learned from the existing
  per-entity editors (lock → notes → remove on the burg/regiment
  toolbars).

## Per-editor changes

### `public/modules/dynamic/editors/states-editor.js`

The states editor uses **delegated event handling** on `$body` (line
111) keyed by `classList.contains(...)`. Both the neutral row template
(line 174–211) and the regular row template (line 217–264) need a new
`<span data-tip="Edit notes" class="icon-edit hide"></span>` immediately
before the existing `icon-trash-empty` span. Add a single new branch in
the click delegator at line 122:

```js
else if (classList.contains("icon-edit")) editStateNotes(stateId);
```

Add a small handler near the existing edit functions:

```js
function editStateNotes(stateId) {
  const s = pack.states[stateId];
  if (!s) return;
  editNotes("state" + stateId, s.fullName || s.name);
}
```

The neutral row (id 0) still gets a button — it has a name (e.g.
"Neutrals") and is a perfectly valid notes target.

### `public/modules/ui/provinces-editor.js`

Same delegation pattern (line 41–59). Add the icon span before the
trash icon at line 183. Add a branch in the delegator:

```js
else if (cl.contains("icon-edit")) editProvinceNotes(p);
```

Plus a helper:

```js
function editProvinceNotes(p) {
  const province = pack.provinces[p];
  if (!province) return;
  editNotes("province" + p, province.fullName || province.name);
}
```

### `public/modules/dynamic/editors/cultures-editor.js`

This editor uses **per-element listener attachment** (line 245–247)
via `$body.querySelectorAll("div > span.icon-X").forEach(...)` rather
than delegation. Add the icon span before the trash icon at line 217
(non-neutral) and at the end of the neutral row (line 172). Then add
right after line 247:

```js
$body.querySelectorAll("div > span.icon-edit").forEach($el => $el.on("click", cultureEditNotes));
```

`cultureEditNotes` reads `this.parentNode.dataset.id` like the other
icon handlers in this file:

```js
function cultureEditNotes() {
  const cultureId = +this.parentNode.dataset.id;
  const c = pack.cultures[cultureId];
  if (!c) return;
  editNotes("culture" + cultureId, c.name);
}
```

(Cultures don't have a `fullName`; just `name`.)

### `public/modules/dynamic/editors/religions-editor.js`

Same per-element pattern as cultures (line 246–248). Add the icon span
before the trash icon at line 215 (and to the neutral row at line 179
for parity). Add right after line 248:

```js
$body.querySelectorAll("div > span.icon-edit").forEach($el => $el.on("click", religionEditNotes));
```

```js
function religionEditNotes() {
  const religionId = +this.parentNode.dataset.id;
  const r = pack.religions[religionId];
  if (!r) return;
  editNotes("religion" + religionId, r.name);
}
```

(Religions also use just `name`.)

## Files modified

- `public/modules/dynamic/editors/states-editor.js`
- `public/modules/ui/provinces-editor.js`
- `public/modules/dynamic/editors/cultures-editor.js`
- `public/modules/dynamic/editors/religions-editor.js`

No new files. No HTML changes (the `editNotes` dialog is already
defined at `src/index.html:5015`).

## Tests

Plan adds **one Playwright E2E spec** at
`tests/e2e/notes-buttons.spec.ts`, covering all four editors. The
spec follows the established pattern from `tests/e2e/states.spec.ts`:

1. `await page.goto("/?seed=test-notes&width=1280&height=720")` and
   wait for `mapId`.
2. For each editor (states / provinces / cultures / religions):
   - Click `#optionsTrigger`, then `#toolsTab`.
   - Click the editor button (`#editStatesButton`,
     `#editProvincesButton`, `#editCulturesButton`, `#editReligions`).
   - Wait for the editor body section to be visible.
   - Find the first row that has a real `data-id != "0"` (skip the
     neutral row to avoid name-encoding edge cases) and read the
     entity name from `data-name`.
   - Click that row's `.icon-edit` span (selector:
     `${bodySection} > div[data-id="${id}"] .icon-edit`).
   - Wait for `#notesEditor` to be visible and assert that
     `#notesName` value contains the entity name (or
     `notes` global has a matching entry — using the global is more
     robust than the input value because the editor de-bounces
     name updates).
   - Close the notes dialog (click the jQuery dialog
     `.ui-dialog:has(#notesEditor) .ui-dialog-titlebar-close`).
   - Close the parent editor.

NO Vitest unit tests are added. Classic JS code in `public/modules/`
isn't unit-tested anywhere else in the repo, and adding shimmed DOM
tests for a one-line click handler is out of proportion. Type-level
sanity is covered by `npx tsc --noEmit`.

## Verification

1. `npx tsc --noEmit` — must be clean.
2. `npm test` — must remain at 384 files / 7327 tests passing.
3. `npm run test:e2e -- notes-buttons.spec.ts` — runs the new spec.
   If the local environment can't bring up a Playwright browser
   (missing system deps in the sandbox), document the skip and verify
   the spec parses by static review.

## Self-review

Verified after the implementation pass:

- Verified `icon-edit` is in use elsewhere via grep:
  `grep -n "icon-edit" src/index.html` → 5 hits, all on Legend
  buttons. None of the four target files use `icon-edit` in their
  current row templates (verified by grep) so adding it does not
  conflict with existing class-based delegation.
- Confirmed each row template gets exactly **one** new icon button.
  States, provinces, cultures, religions — one `<span
  class="icon-edit ...">` per row in each file.
- Confirmed each click handler matches the file's existing per-row
  pattern: states + provinces use delegated `body.on("click")` keyed
  by `classList.contains`; cultures + religions use direct
  `querySelectorAll("div > span.icon-X").forEach($el =>
  $el.on("click", ...))`. The new handlers follow the same shape as
  the file's existing trash/lock handlers.
- Playwright spec selectors use the icon class
  (`.icon-edit`), not row-relative `nth-child` — this is robust
  against future column reordering and matches how
  `tests/e2e/states.spec.ts` already targets `.icon-trash-empty`.
- Tooltip wording is `"Edit notes"` everywhere (single source of
  truth — all four files use the same string for consistency).
- The neutral state/culture/religion (id 0) gets a button too because
  `editNotes` accepts any id string and the user may want to annotate
  "Neutrals" / "No religion" / "Uncultured". Province has no neutral
  row (filtered by `p.i && !p.removed` at line 115).
- Final diff is +37 lines across 4 files (no deletions, no
  refactoring); spec adds one new file at
  `tests/e2e/notes-buttons.spec.ts` with 4 tests.
- `npx tsc --noEmit`: clean (post-implementation).
- `npm test`: 384 files, 7327 tests passing (unchanged from
  baseline).
- `npx playwright test tests/e2e/notes-buttons.spec.ts`: did NOT
  execute in this sandbox — `npx playwright install chromium` failed
  with a download error and the cached browser binary
  (`chrome-headless-shell-linux64`) is missing. `--list` confirms all
  4 tests are discovered and parse correctly. The spec was reviewed
  statically: selectors match the body-section ids verified by grep
  (`#statesBodySection`, `#provincesBodySection`, `#culturesBody`,
  `#religionsBody`); editor-open buttons match
  (`#editStatesButton`, `#editProvincesButton`,
  `#editCulturesButton`, `#editReligions`); `.icon-edit` selector is
  the new class added to each row template.
