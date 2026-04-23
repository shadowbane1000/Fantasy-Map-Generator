# Plan 126 — regenerate_burg_coa AI tool

## Use case

The Burg Editor (`public/modules/ui/burg-editor.js`) and
the Emblem Editor (`public/modules/ui/emblems-editor.js`)
both expose a "Regenerate" button that re-rolls a single
burg's coat of arms. The existing `regenerate_emblems`
tool wipes every emblem on the map; we need the
per-burg equivalent.

Reference implementation (emblems-editor.js lines
206-223):

```js
function regenerate() {
  let parent = null;
  if (type === "province") parent = pack.states[el.state];
  else if (type === "burg") {
    const province = pack.cells.province[el.cell];
    parent = province
      ? pack.provinces[province]
      : pack.states[el.state];
  }
  const shield =
    el.coa.shield ||
    COA.getShield(el.culture || parent?.culture || 0, el.state);
  el.coa = COA.generate(parent ? parent.coa : null, 0.3, 0.1, null);
  el.coa.shield = shield;
  // ...
  const coaEl = document.getElementById(id);
  if (coaEl) coaEl.remove();
  COArenderer.trigger(id, el.coa);
}
```

Signatures (TS):
- `COA.generate(parent: Emblem | null, kinship: number | null,
   dominion: number | null, type?: string): Emblem`
  (src/modules/emblem/generator.ts:51).
- `COA.getShield(culture: number, state?: number): string`
  (src/modules/emblem/generator.ts:556).
- `COArenderer.trigger(id: string, coa: Emblem): Promise<void>`
  (src/modules/emblem/renderer.ts:343). Trigger only draws
  when the element doesn't already exist — so we also
  remove the existing `#burgCOA{i}` before triggering.

The emblem is stored on `burg.coa` and rendered by a
`<use>` inside `#burgEmblems` referencing `#burgCOA{i}`
in defs.

## Scope

Add one tool: `regenerate_burg_coa(burg, shield?)`.

- `burg` — number (id > 0) or case-insensitive burg
  name. Required.
- `shield` — optional string (shield shape); defaults
  to whatever the Emblem Editor's regenerate flow uses
  (existing `coa.shield` → else `COA.getShield`).
- Rejects `burg 0`, `burg.removed`, `burg.lock`, and
  unknown refs.
- Writes `burg.coa = newCoa` (and `coa.shield`).
- Best-effort refresh: remove existing `#burgCOA{i}`
  element, call `COArenderer.trigger(id, newCoa)`.
  Wrap DOM work in try/catch so headless / test
  contexts don't blow up.
- Returns `{ok, i, previousCoa, coa}` (coa objects).

## Implementation

1. **`src/ai/tools/regenerate-burg-coa.ts`** — runtime-seam
   pattern mirroring `regenerate-burg-name.ts`:
   ```ts
   export interface RegenerateBurgCoaRef {
     i: number;
     name: string;
     coa: RawCoa | undefined;
   }
   export interface RegenerateBurgCoaRuntime {
     find(ref: number | string): RegenerateBurgCoaRef | null;
     generate(burgI: number, shield?: string): RawCoa;
     apply(i: number, coa: RawCoa): void;
   }
   ```
   - `defaultRegenerateBurgCoaRuntime` wires up:
     - `find`: `findEntityByRef(getPackCollection<RawBurg>("burgs"), ref)`,
       returns null on i<=0, removed, or lock.
     - `generate`: reads `pack` for the burg, resolves
       parent (province → state), calls `COA.generate`,
       sets `coa.shield` (explicit override >
       existing `burg.coa.shield` > `COA.getShield`).
     - `apply`: sets `burg.coa = newCoa`, then best-effort
       `document.getElementById("burgCOA"+i)?.remove()`
       and `COArenderer.trigger("burgCOA"+i, newCoa)`
       wrapped in try/catch.
   - Throws friendly errors when `pack` / `COA` /
     `COArenderer` missing.

2. **Registration** in `src/ai/index.ts`:
   - Import `regenerateBurgCoaTool`.
   - Barrel re-export (`create…` + tool).
   - `registry.register(regenerateBurgCoaTool)` next to
     `regenerateEmblemsTool`.

3. **`README_AI.md`** — new row directly under the
   `regenerate_emblems` row, explaining per-burg scope
   and usage examples.

4. **Tests** `src/ai/tools/regenerate-burg-coa.test.ts`:
   - Unit (stubbed runtime):
     - regenerates by id, returns previousCoa + new coa.
     - resolves by case-insensitive name.
     - passes explicit `shield` through to generate.
     - omits shield parameter when not provided.
     - rejects unknown ref.
     - rejects invalid refs (0, -1, 1.5, "", null).
     - rejects removed / locked burgs (find returns null).
     - surfaces generator errors as errorResult.
     - surfaces apply errors as errorResult.
   - `defaultRegenerateBurgCoaRuntime` integration:
     - stubs `globalThis.pack` (cells, burgs, states,
       provinces), `COA.generate`, `COA.getShield`,
       `COArenderer.trigger`, `document.getElementById`.
     - writes `burg.coa` and invokes `COArenderer.trigger`
       with the burg's coa id.
     - uses existing `coa.shield` when burg already has
       one; falls back to `COA.getShield` otherwise.
     - uses explicit override shield when supplied.
     - picks province parent when cell has a province,
       else state.
     - errors gracefully when `COA` missing.
     - errors gracefully when pack missing / burg not
       found.

## Verification

- `npx vitest --run src/ai/tools/regenerate-burg-coa`
  green.
- `npx vitest --run` — 1555 before; target 1555 + new
  tests.
- `npm run lint` — baseline 0 errors / 7 warnings / 1
  info; must match.
- `npm run build` — succeeds.

## Success criteria

- Tool callable, wired into registry, exported in barrel.
- `burg.coa` updated in-memory; DOM refreshed via
  `COArenderer.trigger`.
- Shield preservation + override behaviour matches the
  Emblem Editor regenerate flow.
- Errors surfaced via `errorResult` (isError:true).
- Documented in README_AI.md.
