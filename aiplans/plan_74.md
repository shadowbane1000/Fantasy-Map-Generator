# Plan 74 — set_religion_type AI tool

## Use case

The Religions Editor (`religionChangeType` at
`public/modules/dynamic/editors/religions-editor.js:366`) has a
per-religion type dropdown with four options: Folk, Organized,
Cult, Heresy. The Overview's footer tallies state which type a
religion is assigned. Users retype religions narratively — a Folk
faith becomes an Organized church, a schism turns an established
religion into a Heresy.

The chat has `rename_religion` / `set_religion_color` / `list_religions`
but no type knob.

## Scope

Add one tool: `set_religion_type(religion, type)`.

- `religion` required — id or case-insensitive name via
  `findEntityByRef`.
- `type` — one of `Folk`, `Organized`, `Cult`, `Heresy`
  (case-insensitive via `createAliasResolver`).
- Writes `religion.type = canonical`.
- Rejects religion 0 (the "No religion" placeholder).

No redraw needed — the type only affects overview filtering / sort
and downstream logic (e.g. expansion rules on regenerate).

## Implementation

1. **New file `src/ai/tools/set-religion-type.ts`**:
   - Imports: `createAliasResolver`, `errorResult`,
     `findEntityByRef`, `getPackCollection`, `okResult`,
     `parseEntityRef`, type `RawReligion`.
   - `RELIGION_TYPES = ["Folk","Organized","Cult","Heresy"] as const`.
   - `resolveReligionType`.
   - `ReligionTypeRef { i, name, previousType }`.
   - `ReligionTypeRuntime { find, apply }`.
   - `defaultReligionTypeRuntime.find`: findEntityByRef.
   - `defaultReligionTypeRuntime.apply`: write `religion.type`,
     throw on missing/removed.
   - Tool schema: `religion` (int|string required), `type`
     (string required).

2. **Register** in `src/ai/index.ts`.

3. **Tests `src/ai/tools/set-religion-type.test.ts`**:
   - Runtime-injected: set by id, by name, case-insensitive type,
     reject unknown type, reject religion 0, invalid ref, surface
     failures.
   - Default-runtime integration: stub pack; apply type → data
     updated; reject removed religion.

4. **README_AI.md** — row near `set_religion_color`.

## Verification

- `npm test -- --run src/ai/tools/set-religion-type` green.
- `npm test -- --run` — 907 before.
- `npm run lint` — 7/1.
- `npm run build` succeeds.

## Success criteria

- Tool registered and callable.
- AI can change religion type (Folk / Organized / Cult / Heresy)
  consistent with the UI dropdown.
- "No religion" (id 0) protected.
