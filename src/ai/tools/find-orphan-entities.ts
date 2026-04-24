import {
  errorResult,
  getPack,
  okResult,
  type RawBurg,
  type RawCulture,
  type RawProvince,
  type RawReligion,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export type OrphanEntityType = "state" | "province" | "burg" | "religion";

export interface OrphanEntity {
  entity_type: OrphanEntityType;
  i: number;
  name: string | null;
  issue: string;
}

export interface FindOrphanEntitiesHit {
  orphans: OrphanEntity[];
  count: number;
}

export type FindOrphanEntitiesResult = FindOrphanEntitiesHit | "not-ready";

export interface FindOrphanEntitiesPackLike {
  states?: Array<RawState | undefined>;
  provinces?: Array<RawProvince | undefined>;
  burgs?: Array<RawBurg | undefined>;
  religions?: Array<RawReligion | undefined>;
  cultures?: Array<RawCulture | undefined>;
}

const ENTITY_TYPE_ORDER: Record<OrphanEntityType, number> = {
  burg: 0,
  province: 1,
  religion: 2,
  state: 3,
};

function nameOrNull(s: string | undefined): string | null {
  return typeof s === "string" && s.length > 0 ? s : null;
}

function cultureExists(
  cultures: Array<RawCulture | undefined> | undefined,
  id: number,
): boolean {
  if (!cultures) return false;
  if (id < 0 || id >= cultures.length) return false;
  const entry = cultures[id];
  if (!entry) return false;
  if (entry.removed) return false;
  return true;
}

function stateExistsActive(
  states: Array<RawState | undefined> | undefined,
  id: number,
): boolean {
  if (!states) return false;
  if (id < 0 || id >= states.length) return false;
  const entry = states[id];
  if (!entry) return false;
  if (entry.removed) return false;
  if (entry.i === 0) return false;
  return true;
}

function burgExistsActive(
  burgs: Array<RawBurg | undefined> | undefined,
  id: number,
): boolean {
  if (!burgs) return false;
  if (id < 0 || id >= burgs.length) return false;
  const entry = burgs[id];
  if (!entry) return false;
  if (entry.removed) return false;
  if (entry.i === 0) return false;
  return true;
}

/**
 * Pure collector: scan `pack` for entities whose parent references point
 * at missing / removed / placeholder entries. Returns every flagged
 * orphan in a deterministic order: first by entity_type
 * (burg → province → religion → state), then by `i` ascending.
 *
 * Returns `"not-ready"` when `pack` or any of the scanned collections
 * (`states`, `provinces`, `burgs`, `religions`) are missing — all four
 * are required for a consistency check.
 */
export function findOrphanEntitiesInPack(
  pack: FindOrphanEntitiesPackLike | undefined,
): FindOrphanEntitiesResult {
  if (!pack) return "not-ready";
  const { states, provinces, burgs, religions, cultures } = pack;
  if (!states || !provinces || !burgs || !religions) return "not-ready";

  const orphans: OrphanEntity[] = [];

  // States: check capital burg
  for (const s of states) {
    if (!s) continue;
    if (s.removed) continue;
    if (s.i === 0) continue;
    if (typeof s.capital === "number" && s.capital > 0) {
      if (!burgExistsActive(burgs, s.capital)) {
        orphans.push({
          entity_type: "state",
          i: s.i,
          name: nameOrNull(s.name),
          issue: `state.capital=${s.capital} does not reference an active burg`,
        });
      }
    }
  }

  // Provinces: check state and burg
  for (const p of provinces) {
    if (!p) continue;
    if (p.removed) continue;
    if (p.i === 0) continue;
    if (typeof p.state !== "number") {
      orphans.push({
        entity_type: "province",
        i: p.i,
        name: nameOrNull(p.name),
        issue: "province.state is not a number",
      });
    } else if (p.state === 0) {
      orphans.push({
        entity_type: "province",
        i: p.i,
        name: nameOrNull(p.name),
        issue: "province.state=0 (assigned to Neutrals, no owning state)",
      });
    } else if (!stateExistsActive(states, p.state)) {
      orphans.push({
        entity_type: "province",
        i: p.i,
        name: nameOrNull(p.name),
        issue: `province.state=${p.state} does not reference an active state`,
      });
    }
    if (typeof p.burg === "number" && p.burg > 0) {
      if (!burgExistsActive(burgs, p.burg)) {
        orphans.push({
          entity_type: "province",
          i: p.i,
          name: nameOrNull(p.name),
          issue: `province.burg=${p.burg} does not reference an active burg`,
        });
      }
    }
  }

  // Burgs: check state and culture
  for (const b of burgs) {
    if (!b) continue;
    if (b.removed) continue;
    if (b.i === 0) continue;
    if (typeof b.state === "number") {
      // burg.state === 0 is valid (Neutrals) for burgs, don't flag it
      if (b.state > 0 && !stateExistsActive(states, b.state)) {
        orphans.push({
          entity_type: "burg",
          i: b.i,
          name: nameOrNull(b.name),
          issue: `burg.state=${b.state} does not reference an active state`,
        });
      }
    } else {
      orphans.push({
        entity_type: "burg",
        i: b.i,
        name: nameOrNull(b.name),
        issue: "burg.state is not a number",
      });
    }
    if (typeof b.culture === "number") {
      // burg.culture === 0 is Wildlands — a real culture, allow it
      if (!cultureExists(cultures, b.culture)) {
        orphans.push({
          entity_type: "burg",
          i: b.i,
          name: nameOrNull(b.name),
          issue: `burg.culture=${b.culture} does not reference an active culture`,
        });
      }
    }
  }

  // Religions: check culture (optional)
  for (const r of religions) {
    if (!r) continue;
    if (r.removed) continue;
    if (r.i === 0) continue;
    if (typeof r.culture === "number") {
      if (!cultureExists(cultures, r.culture)) {
        orphans.push({
          entity_type: "religion",
          i: r.i,
          name: nameOrNull(r.name),
          issue: `religion.culture=${r.culture} does not reference an active culture`,
        });
      }
    }
  }

  orphans.sort((a, b) => {
    const typeDiff =
      ENTITY_TYPE_ORDER[a.entity_type] - ENTITY_TYPE_ORDER[b.entity_type];
    if (typeDiff !== 0) return typeDiff;
    return a.i - b.i;
  });

  return { orphans, count: orphans.length };
}

export interface FindOrphanEntitiesRuntime {
  scan(): FindOrphanEntitiesResult;
}

export const defaultFindOrphanEntitiesRuntime: FindOrphanEntitiesRuntime = {
  scan() {
    return findOrphanEntitiesInPack(getPack<FindOrphanEntitiesPackLike>());
  },
};

export function createFindOrphanEntitiesTool(
  runtime: FindOrphanEntitiesRuntime = defaultFindOrphanEntitiesRuntime,
): Tool {
  return {
    name: "find_orphan_entities",
    description:
      "Scan the current pack for entities whose parent references point at missing / removed / placeholder entries — the entity-level parallel of `find_orphan_cells` (which hunts unassigned cells). A consistency-check tool for auditing after bulk edits (`remove_state`, `remove_culture`, `merge_states`, `remove_burg`, …) where a dangling id can otherwise crash downstream editors / renderers. Walks every active entity (index > 0, not `removed: true`) across `pack.states`, `pack.provinces`, `pack.burgs`, and `pack.religions` and flags these broken references: `state.capital` (when set to a positive number, must resolve to an active burg in `pack.burgs`), `province.state` (must resolve to an active state with `i > 0`; `0` is flagged as 'assigned to Neutrals' since provinces aren't valid without an owning state), `province.burg` (when set to a positive number, must resolve to an active burg — `0` / unset is NOT orphan because provinces routinely have no capital), `burg.state` (must be either `0` for Neutrals — a valid 'unassigned' marker for burgs — or resolve to an active state), `burg.culture` (must resolve to an existing non-removed culture — `0` is Wildlands and allowed), and `religion.culture` (when set, must resolve to an existing non-removed culture; missing is NOT orphan). Each issue is recorded as `{entity_type, i, name, issue}` where `entity_type` is one of `burg` / `province` / `religion` / `state`, `name` is the entity's current name (or null when blank), and `issue` is a short human-readable diagnostic. The returned `orphans` array is sorted deterministically: first by `entity_type` (alphabetical), then by `i` ascending. Returns `{ok, orphans: [...], count}` where `count` is `orphans.length`. A clean map returns `orphans: []` and `count: 0` — still `ok: true`. No input args. Useful for debugging after heavy editor sessions, validating imported `.map` files, or before a batch operation that would amplify a bad ref. Read-only — never mutates pack. Errors only on an un-generated map (pack, `pack.states`, `pack.provinces`, `pack.burgs`, or `pack.religions` missing). Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      const result = runtime.scan();
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }
      return okResult({
        orphans: result.orphans,
        count: result.count,
      });
    },
  };
}

export const findOrphanEntitiesTool = createFindOrphanEntitiesTool();
