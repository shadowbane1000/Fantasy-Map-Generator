# Plan 308 — `remove_burg_group` AI tool

## Lint baseline (pre-change)

`npm run lint 2>&1 | tail -40`:

```
src/renderers/draw-heightmap.ts:34:34 lint/performance/noDynamicNamespaceImportAccess
src/renderers/draw-heightmap.ts:64:34 lint/performance/noDynamicNamespaceImportAccess
... (Skipped 2 suggested fixes.)
Checked 716 files in 551ms. No fixes applied.
Found 7 warnings.
Found 1 info.
```

No errors; warnings are pre-existing in unrelated `src/renderers/draw-heightmap.ts`. We must not regress.

## Use case

Implement a new AI chat tool `remove_burg_group` that mirrors the per-row trash icon in the legacy Burg Groups Editor (`public/modules/ui/burg-group-editor.js#removeLine`).

User-visible feature: open Configure → Burg groups → click a row's trash icon → Apply → that group disappears from `options.burgs.groups` and burgs that were in it get reassigned.

The AI already has `list_burg_groups`, `set_burg_group`, `set_burg_group_active`, `set_burg_group_default` (plans 301, 304, 306, 307). It is missing the remover. This tool adds it.

## Where data lives

- `window.options.burgs.groups: Array<{ name: string; active?: boolean; isDefault?: boolean; ... }>`. Each entry has at least `name` (string id, used as `pack.burgs[i].group`), `active` (boolean), and `isDefault` (boolean).
- `window.pack.burgs[i].group: string` — per-burg assignment to a group `name`. If we remove a group without reassigning, those burgs would be orphaned.
- The legacy Apply button re-bins burgs via `Burgs.defineGroup`. For the AI tool, the simplest correct semantics is: **migrate orphaned burgs to a chosen successor group BEFORE removing the group**. Successor = the (possibly newly-promoted) default group.
- Persistence: `localStorage.setItem("burg-groups", JSON.stringify(options.burgs.groups))` after a successful change — same pattern as `set_burg_group_active` / `set_burg_group_default`. Best-effort.

## Tool design

### Inputs

- `name: string` (required) — exact case-sensitive match against the group's `name` field.

### Effect (validate first, mutate after — atomic)

1. Validate input: `name` is a non-empty string.
2. Validate `options.burgs.groups` exists and is an array.
3. Find the target group by `name` (case-sensitive). Error if not found.
4. Reject if the target is the only group in the array (would leave 0 groups).
5. Reject if removing this group would leave 0 `active: true` groups.
6. Auto-promote default if needed: if the target group has `isDefault: true`, the new default = the first remaining group in the array (after splicing out the target). Apply by setting `isDefault: true` on the new default and (defensively) clearing `isDefault` on every other surviving group. Document in `new_default`.
7. Identify burgs to migrate: in `pack.burgs`, all `b` where `b` is not null/undefined, `b.removed !== true`, and `b.group === name`. Reassign each `b.group = new_default.name`. Count.
8. Splice the group out of `options.burgs.groups`.
9. Persist via `localStorage.setItem("burg-groups", JSON.stringify(options.burgs.groups))` (best-effort).

### Returns (okResult)

- `name: string` — the removed group's name (echo of input).
- `removed: object` — full pre-removal config of the removed group (audit / undo).
- `migrated_burg_count: number` — number of burgs reassigned.
- `new_default: string` — the (possibly newly-promoted) default group's `name`. If the removed group was already not the default, this equals the existing default's name.
- `changed: true` — always true when this branch is reached (we got past validation).
- `persisted: boolean` — true on successful localStorage write, false otherwise.
- `note?: string` — present when something soft-failed (persist failure, missing `pack.burgs`, etc.).

### Errors (errorResult)

- `name` missing/non-string/empty/whitespace → `"name must be a non-empty string."`
- `options.burgs.groups` missing or not array → `"options.burgs.groups is missing or not an array."`
- Group not found → `'Burg group "X" not found.'`
- Last group → `"Cannot remove the last group."`
- Last active group → `"Cannot remove the last active group; activate another first."`

### Edge cases

- `pack.burgs` missing or not an array: still proceed (config-only change). Set `migrated_burg_count: 0` and add a `note: "pack.burgs unavailable; orphan reassignment skipped."`.
- Burgs with `removed: true` are skipped during migration.
- localStorage unavailable: return success with `persisted: false` and a `note`.
- The "current default" used for migrating burgs of a non-default removed group is the first group with `isDefault === true` strict-equal among the **remaining** groups. If anomalously zero groups have `isDefault: true`, fall back to the first remaining group and set its `isDefault: true` (self-heal — same defensive style as `set-burg-group-default.ts`).

## Files

### New

- `src/ai/tools/remove-burg-group.ts` — the tool.
- `src/ai/tools/remove-burg-group.test.ts` — vitest suite.

### Modified

- `src/ai/index.ts` — add import, export, registration line. One import block, one export block, one register line — sandwiched next to `setBurgGroupDefaultTool` and other `remove*` tools.

## Wiring

```ts
// imports section
import { removeBurgGroupTool } from "./tools/remove-burg-group";

// exports section
export {
  createRemoveBurgGroupTool,
  removeBurgGroupTool,
} from "./tools/remove-burg-group";

// registry section (near setBurgGroupDefaultTool)
registry.register(removeBurgGroupTool);
```

## Runtime-injection seam

```ts
export interface RemoveBurgGroupRuntime {
  /** Live array reference; we splice it in place. undefined when missing/not-array. */
  getGroups(): RemoveBurgGroupGroup[] | undefined;
  /** Live burgs array; undefined when missing/not-array. */
  getBurgs(): RemoveBurgGroupBurg[] | undefined;
  /** Persists the array. May throw — caller catches. */
  persist(groups: RemoveBurgGroupGroup[]): void;
}
```

`defaultRemoveBurgGroupRuntime` reads `window.options.burgs.groups`, `window.pack.burgs`, and writes `localStorage["burg-groups"]`. `createRemoveBurgGroupTool(runtime?)` factory; `removeBurgGroupTool` is the default-runtime instance.

## Test plan

1. **Happy path — non-default group with burgs**: removes a 3-group array's 2nd group; burgs in that group migrate to current default; result reports `migrated_burg_count`, `new_default = currentDefault.name`, `persisted: true`.
2. **Removing the default group**: auto-promotes the first remaining group as default; burgs migrate to the new default; result `new_default = firstRemaining.name`.
3. **Removing a group with no burgs in it**: `migrated_burg_count: 0`; success.
4. **Last group**: error `"Cannot remove the last group."`.
5. **Last active group**: array has multiple groups but only one with `active: true`; removing it errors.
6. **Group not found**: error `'Burg group "X" not found.'`; case-sensitive.
7. **`options.burgs.groups` missing**: error.
8. **`options.burgs.groups` non-array**: error.
9. **`pack.burgs` missing**: success, `migrated_burg_count: 0`, `note` mentions pack.burgs.
10. **Burgs with `removed: true` are not migrated**: those burgs' `group` strings are untouched, count excludes them.
11. **localStorage unavailable**: success with `persisted: false`, in-memory mutation still applied.
12. **Persist throws**: success with `persisted: false`, note includes the error message.
13. **Tool name**: `removeBurgGroupTool.name === "remove_burg_group"`.
14. **Registry round-trip**: registering and calling via `registry.run("remove_burg_group", { name })` works end-to-end against globalThis.options/pack/localStorage.
15. **Default-runtime smoke**: reads from `globalThis.options.burgs.groups` and `globalThis.pack.burgs`; persists to `globalThis.localStorage`.
16. **Input validation**: name missing, name non-string, name empty, name whitespace, null input — each errors with the right message.
17. **No active rejection vs no default rejection ordering**: the "last active" check fires before the "auto-promote default" branch so we don't half-mutate.

## Self-review (mandatory)

Reviewed plan + tasks pre-implementation:

- Validation order: input → groups-array → find-target → last-group → last-active → auto-promote → migrate → splice → persist. **Atomic**: no mutation until all checks pass. Confirmed.
- "Last active" check reads `target.active === true`; if target is not currently active, removing it cannot reduce the active count below 1 (count of other active groups stays the same, and the target wasn't active). So we should special-case: only reject when **target is currently active AND no other group is active**. Adjusted in tasks.
- The default-promotion logic must run BEFORE the burg migration, since the migration target IS the new default. Confirmed in tasks step 6 (auto-promote) → 7 (migrate) → 8 (splice).
- `new_default` is the post-promotion default, even when target wasn't the default. Confirmed by reading the field after step 6.
- Handle the (impossible-but-defensive) case where there's no default at all in the surviving groups: fall back to first surviving group as default. Mirrors existing self-heal in `set-burg-group-default.ts`.
- Don't touch `pack.burgs` if the array is missing — skip migration with a note. Don't error.
- Persist API mirrors `set-burg-group-default.ts` (throws → caller catches). The `set-burg-group-active.ts` API returns boolean instead — either is fine, but matching `default` is closer for the throw-message pathway.
- Test for "Burgs with removed: true are not migrated" must check that those burgs' `b.group` strings are still equal to the removed group's name (untouched).

All addressed.
