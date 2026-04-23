# Plan 139 — `regenerate_regiment_names` AI tool

## Use case
Bulk-regenerate military regiment `name` fields across all states — or within a single state when a `state` param is supplied. Same side-effect as clicking the Regiment Editor's "Restore Name" button for every regiment, applied at scale.

## Naming algorithm (confirmed)

From `src/modules/military-generator.ts:555` —

```ts
getName(r: MilitaryRegiment, regiments: MilitaryRegiment[]) {
  const cells = pack.cells;
  const proper = r.n
    ? null
    : cells.province[r.cell] && pack.provinces[cells.province[r.cell]]
      ? pack.provinces[cells.province[r.cell]].name
      : cells.burg[r.cell] && pack.burgs[cells.burg[r.cell]]
        ? pack.burgs[cells.burg[r.cell]].name
        : null;
  const number = nth(
    regiments.filter((reg) => reg.n === r.n && reg.i < r.i).length + 1,
  );
  const form = r.n ? "Fleet" : "Regiment";
  return `${number}${proper ? ` (${proper}) ` : ` `}${form}`;
}
```

Outputs things like `1st Regiment`, `2nd (Rookhold) Regiment`, `1st Fleet`. The generator is **positional** — it counts same-naval-flag siblings with smaller `i` — so it is deterministic and does not need a mode param. The Regiment Editor's "Restore Name" at `public/modules/ui/regiment-editor.js:149` and the "Add Unit" path at `public/modules/ui/regiments-overview.js:189` both call `Military.getName(reg, military)` with exactly this signature.

There is no `lock` field on regiments — `MilitaryRegiment` in `src/modules/military-generator.ts:18` has no such property, and nothing in the editor short-circuits rename on a lock. Skipping logic therefore only needs: unresolved `state`, missing `Military.getName`, empty generator output, or `apply` failure.

## Tool contract

Inputs:
- `state` (optional) — numeric state id (0 = Neutrals is valid) or case-insensitive state name / fullName. If absent: every active state is processed.

Outputs:
```
{
  ok: true,
  state: number | null,               // resolved state id or null for "all"
  renamed: [{ stateI, regimentI, previousName, name }],
  skipped: [{ stateI, regimentI, name, reason }]
}
```

Non-idempotent: the algorithm is positional and deterministic for a given regiment array, but re-running still counts as "regenerate" and always writes `regiment.name` afresh. If the caller passes a bogus state reference, we error out *before* mutating anything.

## Runtime-seam split (pattern match for `regenerate-river-names`)

```ts
interface RegenerateRegimentNamesRuntime {
  list(stateRef: number | string | null):
    | { stateId: number; regiments: RegimentRef[] }[]   // [per-state]
    | null;                                             // unresolved stateRef
  generate(reg: RegimentRef, siblings: RegimentRef[]): string;
  apply(stateId: number, regimentI: number, name: string): void;
  redraw(): void;
}
```

- `list(null)` returns one bucket per active state.
- `list(stateRef)` returns exactly one bucket if the state resolves, else `null`.
- `generate` takes the regiment plus its sibling list (needed for the positional numbering).
- `apply` writes `regiment.name` and, when `document` is available, sets `#regiment{stateId}-{i}` `data-name` (matches `rename-regiment`).
- `redraw` calls `drawMilitary()` once at the end, best-effort.

## Edge cases

- Empty `state.military` → that state's bucket is simply empty (no skipped entries).
- `Military` / `Military.getName` missing → per-regiment skipped with "generate failed: …" (never a fatal throw).
- `generate` returning empty / whitespace → skipped with "generator returned empty string".
- `apply` throwing → skipped with "apply failed: …"; loop continues.
- `state` resolves but regiment array is empty → `{ renamed: [], skipped: [] }` and `redraw()` still fires once.
- If `state` is provided and does not resolve → `errorResult(...)`, no mutation, no redraw.

## Integration test (globalThis seam)

Mimic `regenerate-all-state-names.test.ts`'s integration block:
- Install `globalThis.pack` with a `states[]` containing `military` arrays.
- Install `globalThis.Military.getName` as a `vi.fn` producing predictable names from `reg.i`.
- Install `globalThis.drawMilitary` as a `vi.fn`.
- Verify: default (all states) renames every regiment across every state; `state=2` limits to that state; missing `Military.getName` routes per-regiment into `skipped`; invalid `state` ref returns an error without calling `drawMilitary`.

Use `as unknown as { ... }` casts when reassigning `globalThis` slots.

## Files touched

- `src/ai/tools/regenerate-regiment-names.ts` (new)
- `src/ai/tools/regenerate-regiment-names.test.ts` (new)
- `src/ai/index.ts` — import, export, register
- `README_AI.md` — new row near the other bulk name-regeneration tools
