# Plan 203 — list_regiment_units AI tool

## Goal
Add a read-only `list_regiment_units` tool that reports the configured
military unit types — the same catalogue `set_regiment_unit` writes
keys from when it mutates `regiment.u[unit]`. It is the discovery
companion of `set_regiment_unit`: the agent can ask "what unit names
and stats are in play?" before committing to a value.

## Why
`set_regiment_unit` accepts an arbitrary string `unit` and writes it
to `regiment.u`. But the canonical set of unit names (`Swordsmen`,
`Archers`, `Cavalry`, `Artillery`, `Sailors`, …) comes from
`window.options.military` — an array of unit descriptors authored by
the user in Military Options, or auto-seeded by
`MilitaryModule.getDefaultOptions()` in `src/modules/military-generator.ts`.
There is no tool today that exposes this array; the agent has to
guess unit names or probe via `get_regiment_info`.

This mirrors the `list_style_presets` ↔ `set_style_preset` (plan 200)
and `list_cultures_sets` ↔ `set_cultures_set` (plan 201) pattern.

## Data sources
- `window.options.military` (typed as `any` in `src/types/global.ts`)
  — array of `{ icon, name, rural, urban, crew, power, type,
  separate, biomes?, states?, cultures?, religions? }`. Initialized
  lazily via `MilitaryModule.getDefaultOptions()`
  (`src/modules/military-generator.ts` ~L500) and persisted via
  `public/modules/ui/military-overview.js:438` /
  `public/modules/ui/options.js:561`. Default seed has 5 entries:
  `infantry` (melee), `archers` (ranged), `cavalry` (mounted),
  `artillery` (machinery), `fleet` (naval).
- `set_regiment_unit` — writes `regiment.u[unit]` using a unit key.
  This tool's consumer.

No `pack`/DOM writes. Read-only. Needs a runtime seam because
`options.military` is a legacy global — follows the same pattern
`list-style-presets.ts` uses for `localStorage`.

## Tool shape
- Name: `list_regiment_units`.
- Description: identifies the list as the catalogue
  `set_regiment_unit` draws from. Mentions source
  (`window.options.military`) and the fact that unit names are case-
  sensitive when used as `regiment.u` keys.
- Input schema: no properties; no required fields (empty object
  acceptable).
- Output:
  ```
  {
    ok: true,
    units: [
      {id: "Infantry" | "infantry",  // raw name
       name: "infantry",              // same as id
       type: "melee" | "ranged" | "mounted" | "machinery" | "naval" |
             "armored" | "aviation" | "magical" | ...,
       rural: number, urban: number,
       crew: number, power: number,
       icon: string | null,           // emoji or URL
       separate: 0 | 1},
      ...
    ],
    count: N,
  }
  ```
  `id` is a string — whatever `options.military[i].name` is (keys in
  `regiment.u` are exactly that string). Order mirrors
  `options.military` (unchanged from the array).

## Runtime seam
A `RegimentUnitsRuntime` with a single method
`readUnits(): RegimentUnit[] | null` (null when
`options.military` is absent / not yet initialized). Default
implementation pulls from `getGlobal<{military?: RegimentUnit[]}>("options")`.
Tests inject synthetic arrays via the factory.

## Validation
Input is ignored. Missing / non-array `options.military` → returns
`{ok: true, units: [], count: 0}` (not an error — the agent can
infer the catalogue is not yet configured). Non-object entries are
skipped silently. Entries with non-string `name` or empty `name` are
skipped. `icon` is passed through as-is when a non-empty string;
otherwise `null`. Numeric fields (`rural`, `urban`, `crew`, `power`,
`separate`) default to `0` when missing / non-finite.

## Response shape
```
{
  ok: true,
  units: [
    {id: "infantry",  name: "infantry",  type: "melee",     rural: 0.25, urban: 0.2,   crew: 1,   power: 1,  icon: "⚔️",  separate: 0},
    {id: "archers",   name: "archers",   type: "ranged",    rural: 0.12, urban: 0.2,   crew: 1,   power: 1,  icon: "🏹",  separate: 0},
    {id: "cavalry",   name: "cavalry",   type: "mounted",   rural: 0.12, urban: 0.03,  crew: 2,   power: 2,  icon: "🐴",  separate: 0},
    {id: "artillery", name: "artillery", type: "machinery", rural: 0,    urban: 0.03,  crew: 8,   power: 12, icon: "💣",  separate: 0},
    {id: "fleet",     name: "fleet",     type: "naval",     rural: 0,    urban: 0.015, crew: 100, power: 50, icon: "🌊",  separate: 1},
  ],
  count: 5,
}
```

## Testing
Mirror `list-style-presets.test.ts`:
- Unit (factory with injected runtime):
  - Returns all seeded entries in array order.
  - Each entry has string id/name, string type, numeric
    rural/urban/crew/power/separate, icon string | null.
  - Returns `{units: [], count: 0}` when runtime returns null.
  - Returns `{units: [], count: 0}` when runtime returns `[]`.
  - Skips entries with missing / non-string / empty `name`.
  - Coerces missing numeric fields to `0`.
  - Coerces missing `icon` / empty / non-string icon to `null`.
  - Tolerates no-input (`execute(undefined)`), empty object, unknown
    keys — output identical.
- Integration (`defaultRegimentUnitsRuntime` block via
  `as unknown as { options: unknown }` cast):
  - Seeds `globalThis.options = { military: [...] }` with the
    default 5-unit config, confirms payload matches.
  - Absent `options` → `{units: [], count: 0}`.
  - `options.military` missing / non-array → `{units: [], count: 0}`.

## Wiring
- Register in `src/ai/index.ts` near `setRegimentUnitTool`
  registration.
- Barrel re-export `createListRegimentUnitsTool`,
  `defaultRegimentUnitsRuntime`, `type RegimentUnit`,
  `type RegimentUnitsRuntime`, and `listRegimentUnitsTool`.
- README_AI.md row immediately before `set_regiment_unit` in the
  pipe table — single-line row with description + examples + API-key
  note.

## Out of scope
- No changes to `set_regiment_unit` or validation behaviour there.
- No new runtime seam on `set_regiment_unit`.
- No MilitaryModule API calls — this is a pure read of
  `options.military`.

## Verify
- `npm run build` — `tsc && vite build` both clean.
- `npm test` — baseline 2986 → 2986 + N new cases pass.
- `npm run lint` — baseline 7 warnings / 1 info / 0 errors preserved.
