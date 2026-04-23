# Plan 145 — `regenerate_religion_names` AI tool

## Use case

Bulk-regenerate names for every non-locked, non-removed religion (skipping the index-0 "No religion" placeholder). Parallels the already-merged bulk name regenerators:
- `regenerate_all_state_names`
- `regenerate_all_burg_names`
- `regenerate_all_province_names`
- `regenerate_river_names`

The Religions Editor has **no** built-in bulk "regenerate names" button — only per-religion free-text editing and per-religion regenerate-deity buttons. This tool is still valuable as an AI convenience that mirrors the same naming algorithm the map-generator itself uses when creating religions (`ReligionsModule.generateReligionName`).

## Name-generation algorithm (confirmed)

From `src/modules/religions-generator.ts:1093` (`ReligionsModule.generateReligionName`):

```ts
private generateReligionName(
  variety: string,      // the religion's type (Folk / Organized / Cult / Heresy)
  form: string,         // the religion's form (used as key to `types` map)
  deity: string,        // the religion's deity (used for "Supreme + ism" / "Faith of + Supreme" variants)
  center: number,       // the religion's center cell id
): [string, string] {    // returns [name, expansion]
  const { cells, cultures, burgs, states } = pack;
  const random = () => Names.getCulture(cells.culture[center]);
  const type = rw(types[form]);
  const supreme = deity.split(/[ ,]+/)[0];
  const culture = cultures[cells.culture[center]].name;
  const place = (adj?: boolean) => { ... };       // burg.name or state.name at center, adj via getAdjective
  const m = rw(namingMethods[variety]);           // picks one of 11 naming methods
  // ... returns one of ~11 naming patterns (Random+type / Random+ism / Supreme+ism / Faith+of+Supreme /
  //     Place+ism / Culture+ism / Place+ian+type / Culture+type / Burg+ian+type / Random+ian+type /
  //     Type+of+the+meaning), also returns an "expansion" scope string "global" | "state" | "culture".
}
```

This method is **declared `private` in TypeScript** but at runtime the compiled `window.Religions.generateReligionName` is still callable from JS (`private` is a compile-time-only modifier). The runtime seam types the method on the `ReligionsModule` interface so TS doesn't complain.

The generator is called internally from:
- `ReligionsModule.specifyReligions` (line 649) during initial world generation,
- `ReligionsModule.add` (line 1038) when adding a new religion at a cell.

No external UI pathway calls it for regeneration. This tool is the first code to explicitly invoke it for a rename.

## Religion data shape (confirmed)

From `src/ai/tools/_shared/pack-types.ts:89` (`RawReligion`):

```ts
export interface RawReligion {
  i: number;
  name?: string;
  type?: string;       // "Folk" | "Organized" | "Cult" | "Heresy"
  form?: string;       // free-form string
  deity?: string | null;
  color?: string;
  culture?: number;
  cells?: number;
  area?: number;
  rural?: number;
  urban?: number;
  expansion?: string;
  expansionism?: number;
  origins?: number[];
  center?: number;
  code?: string;
  lock?: boolean;
  removed?: boolean;
}
```

Per-religion inputs required by `generateReligionName`:
- `type` (→ `variety` arg) — read from `religion.type`.
- `form` — read from `religion.form`.
- `deity` — read from `religion.deity`. Can be `null` (Non-theism / Animism forms); pass `""` in that case so the naming method's `deity && ...` guards fall through.
- `center` — read from `religion.center`.

All four come straight from the religion object.

## Redraw

`drawReligions` (public/modules/ui/layers.js:463) draws **region fills**, not labels — religions have no on-map text labels in this renderer. Changing `religion.name` doesn't require a repaint. For parity with the other bulk-name tools (and the river-names tool which has the same "no labels" situation), we still invoke `drawReligions()` once at the end as a best-effort no-op.

## Tool contract

Inputs:

```
{
  mode?: "classic"       // optional; only one mode supported today — see below.
}
```

The religion name generator has no user-facing "mode" split (unlike burgs/states/provinces/rivers which toggle between `culture` and `random`). `generateReligionName` already does its own internal random-weighted selection across 11 naming methods. So we expose **no `mode` param** today — the schema accepts no inputs (empty object). This matches the guidance in the task brief: "Accept optional `mode` — if the generator supports modes like 'random' or specific 'type' variations, expose them. Otherwise no mode."

Outputs (matches the pattern of the other bulk-regenerate tools):

```
{
  ok: true,
  renamed: [{ i, previousName, name }],
  skipped: [{ i, name, reason }]   // reason: "placeholder" | "removed" | "locked" | "missing <field>" | "generate failed: …" | "empty generator output" | "apply failed: …"
}
```

Skip reasons:
- `"placeholder"` — religion 0 (the "No religion" sentinel).
- `"removed"` — tombstoned.
- `"locked"` — `religion.lock === true`.
- `"missing type"` / `"missing form"` / `"missing center"` — religion object is missing a required generator input (defensive; normal maps always have these).
- `"generate failed: <err>"` — `generateReligionName` threw.
- `"empty generator output"` — generator returned empty / whitespace-only.
- `"apply failed: <err>"` — write threw (e.g. tombstone discovered mid-loop).

## Runtime-seam split (pattern match for `regenerate-all-state-names` / `regenerate-river-names`)

```ts
interface RegenerateReligionNamesReligionRef {
  i: number;
  name: string;
  type: string | null;
  form: string | null;
  deity: string | null;
  center: number | null;
  lock?: boolean;
  removed?: boolean;
}

interface RegenerateReligionNamesRuntime {
  list(): RegenerateReligionNamesReligionRef[];
  generate(ref: RegenerateReligionNamesReligionRef): string;
  apply(i: number, name: string): void;
  redraw(): void;
}
```

Default runtime implementations:
- `list()` — reads `pack.religions`, pulls `(i, name, type, form, deity, center, lock, removed)`.
- `generate(ref)` — calls `window.Religions.generateReligionName(ref.type, ref.form, ref.deity ?? "", ref.center)` and returns `result[0]` (the name — ignores the `expansion` field because we're preserving the existing `religion.expansion`).
- `apply(i, name)` — writes `pack.religions[i].name = name` after re-validating the entry still exists and isn't removed.
- `redraw()` — `window.drawReligions?.()` best-effort (no-op for labels but matches parity).

## Integration test (globalThis seam)

Mimic `regenerate-river-names.test.ts`'s integration block:
- Install `globalThis.pack` with a `religions` array covering placeholder (i=0), locked (`lock: true`), removed (`removed: true`), and regular entries.
- Install `globalThis.Religions` with a stub `generateReligionName(type, form, deity, center)` returning `[\`Gen-${center}\`, "global"]`.
- Install `globalThis.drawReligions` as a `vi.fn`.
- Verify:
  - Placeholder / locked / removed are skipped with matching reasons.
  - Active religions are renamed; `generateReligionName` is called with `(type, form, deity||"", center)`.
  - `drawReligions` is called exactly once at the end.
  - Missing `Religions` module → every religion skipped with "generate failed: …" reason (no throw).
  - Religion with `deity: null` still works (deity becomes `""`).
  - Religion missing `center` / `type` / `form` is skipped with `"missing …"` reason.
  - `redraw` failure is swallowed; renames still returned.
- Use `as unknown as { ... }` casts when reassigning `globalThis` slots.

Plus seam unit tests (mock the runtime directly, no globals):
- Default call: placeholder / locked / removed skipped, actives renamed.
- Rejects unknown `mode` param (guard even though there are no valid modes) → actually: the schema has no `mode` at all, so the execute impl accepts any input and ignores unknown props. Match the `{}` → success path in the other tools.
- Generator errors go to skipped; loop continues; redraw still called once.
- Empty generator output skipped.
- Apply errors skipped.
- `list`-throws → errorResult, no redraw.
- `redraw` failure swallowed.

## Files touched

- `src/ai/tools/regenerate-religion-names.ts` (new)
- `src/ai/tools/regenerate-religion-names.test.ts` (new)
- `src/ai/index.ts` — import, re-export, register
- `README_AI.md` — new row near the other bulk `regenerate_*` tools
