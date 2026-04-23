# Plan 174 — `remove_ruler` tool

## Use case

Add a new AI tool `remove_ruler` that removes a single ruler / opisometer /
planimeter by numeric id — the same side-effect as the per-row remove
button in the Ruler Editor (and the delete icon rendered next to each
measurer via `el.on("click", () => rulers.remove(this.id))` inside
`public/modules/ui/measurers.js`). Parallel to:

- `clear_rulers` (plan 172) — bulk-remove every ruler.
- `add_ruler` (plan 173) — create a new ruler.

## Rulers API (confirmed)

`public/modules/ui/measurers.js` exposes:

- `window.rulers` — a `Rulers` collection, allocated once in
  `public/main.js`.
- `Rulers.prototype.data` — array of measurer instances
  (`Ruler | Opisometer | RouteOpisometer | Planimeter`). Each instance
  has a numeric `id` (assigned as `rulers.data.length` at construction
  time by the `Measurer` base-class constructor).
- `Rulers.prototype.remove(id)` — the canonical single-ruler remover
  (see `measurers.js:44`):
  ```js
  remove(id) {
    if (id === undefined) return;
    const ruler = this.data.find(ruler => ruler.id === id);
    ruler.undraw();
    const rulerIndex = this.data.indexOf(ruler);
    rulers.data.splice(rulerIndex, 1);
  }
  ```
  - Calls `ruler.undraw()` which removes the SVG element via
    `this.el?.remove()` (see `Measurer.undraw` at `measurers.js:111`).
  - Splices the entry out of `rulers.data`.
  - Accesses the outer `rulers` global (not `this`) for the splice —
    works because `rulers` is a module-global pointing at the same
    instance.
- Per-row remove UI: every ruler's rendered label attaches
  `el.on("click", () => rulers.remove(this.id))` in each subclass's
  `drawLabel` (Ruler:166, Opisometer:320, RouteOpisometer:458,
  Planimeter:511). The tool mirrors the same call.

## API

Inputs:
- `id: number` — required. The numeric id of the ruler to remove
  (matches `ruler.id`, which is the value `Measurer`'s constructor
  assigned based on `rulers.data.length` at creation).

Return shape: `{ ok: true, id }`.

## Design decisions

- **Runtime-seam pattern** (matches `add_ruler` / `clear_rulers`):
  define a `RulerRemovalRuntime` with `remove(id: number): void`. The
  default implementation:
  - Reads `window.rulers` via `getGlobal`. Throws if missing or if
    `remove` / `data` are not present.
  - Looks up the ruler by id in `rulers.data`. Throws if not found
    (the legacy `rulers.remove` would crash on `ruler.undraw()` in
    this case — we pre-check for a cleaner error).
  - Calls `rulers.remove(id)` (the legacy method). Wrapped in a
    try/catch with a DOM-cleanup fallback: if `rulers.remove` throws
    (e.g. missing `ruler.el` or no `#ruler` parent), still splice the
    entry out of `rulers.data` and best-effort remove any DOM node
    with `id="ruler{id}"` under `#ruler`.
  - Always performs the best-effort DOM cleanup for the specific
    `#ruler` child element even on success (ruler labels draw into
    siblings with various ids; `undraw` removes `ruler.el`, which is
    the root SVG group it created — so the success path is already
    clean, but a safety-net `document.getElementById("ruler" + id)`
    scan matches the pattern used by `remove_marker`).
- **Validation layer** (outside the runtime seam):
  - Require a finite integer `id`. Reject non-finite / non-integer /
    negative values. The tool accepts `0` (the first ruler created
    has id `0`).
- **Find + remove flow**: mirrors `remove_marker`'s pattern — first
  `find`, error if not found, then `remove`. This gives a clean
  error for the common "wrong id" case without leaning on the legacy
  `.find(...)`-then-`.undraw()` crash.

## Files

- `src/ai/tools/remove-ruler.ts` — new tool.
- `src/ai/tools/remove-ruler.test.ts` — unit tests (mocked runtime)
  + `defaultRulerRemovalRuntime` integration block.
- `src/ai/index.ts` — import, register, re-export factory + type.
- `README_AI.md` — add a row near `clear_rulers` / `add_ruler`.

## Risks / edge cases

- `window.rulers` missing (pre-bootstrap) → integration runtime throws
  `"Rulers is not available yet; the map hasn't finished loading."`.
  Surfaced as `errorResult`.
- Id not present in `rulers.data` → runtime throws
  `"Ruler <id> not found."`. Surfaced as `errorResult`.
- `ruler.undraw()` throws (missing SVG element) → legacy `rulers.remove`
  would bubble; we catch, still splice the data, best-effort wipe any
  `#ruler{id}` DOM node.
- id is `0` (first ruler ever created) → accepted (parallels markers,
  which also allow id 0).
- Non-integer numeric input (e.g. `1.5`) → rejected (ids are always
  integers; rejecting early avoids a silent no-op where `find` returns
  `undefined`).
