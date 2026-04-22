import {
  createPaginatedListTool,
  getPack,
  isActive,
  type RawState,
} from "./_shared";
import type { Tool } from "./index";
import { type BurgPackLike, resolveStateRefInPack } from "./list-burgs";
import { resolveRelation } from "./set-diplomacy";

export interface DiplomacyPair {
  state_a: { i: number; name: string };
  state_b: { i: number; name: string };
  relation: string | null;
}

const NEUTRAL_SENTINELS = new Set(["Neutral", "Unknown", "x"]);

export function readDiplomacyFromPack(
  pack: BurgPackLike | undefined,
): DiplomacyPair[] | null {
  const states = pack?.states;
  if (!Array.isArray(states)) return null;
  const actives: RawState[] = [];
  for (const s of states) {
    if (!s || !isActive(s)) continue;
    if (s.i === 0) continue;
    actives.push(s);
  }
  const pairs: DiplomacyPair[] = [];
  for (let ai = 0; ai < actives.length; ai++) {
    const a = actives[ai];
    if (!a) continue;
    for (let bi = ai + 1; bi < actives.length; bi++) {
      const b = actives[bi];
      if (!b) continue;
      const relation = a.diplomacy?.[b.i] ?? null;
      pairs.push({
        state_a: { i: a.i, name: a.name ?? "" },
        state_b: { i: b.i, name: b.name ?? "" },
        relation,
      });
    }
  }
  return pairs;
}

export interface DiplomacyListRuntime {
  readDiplomacy(): DiplomacyPair[] | null;
  resolveStateRef(ref: number | string): number | null;
}

export const defaultDiplomacyListRuntime: DiplomacyListRuntime = {
  readDiplomacy() {
    return readDiplomacyFromPack(getPack<BurgPackLike>());
  },
  resolveStateRef(ref) {
    return resolveStateRefInPack(getPack<BurgPackLike>(), ref);
  },
};

interface DiplomacyFilters {
  stateRef: number | string | null;
  relationFilter: string | null;
  excludeNeutral: boolean;
}

export function createListDiplomacyTool(
  runtime: DiplomacyListRuntime = defaultDiplomacyListRuntime,
): Tool {
  return createPaginatedListTool<DiplomacyPair, DiplomacyFilters>({
    name: "list_diplomacy",
    description:
      "List diplomatic relationships between states — the same matrix the Diplomacy Editor displays. Each entry is a unique pair (state_a, state_b) with the relation from state_a's view (Vassal → Suzerain etc. on the reverse side is implicit). Paginated. Optional filters: state (keeps only pairs touching that state), relation (Ally / Enemy / Vassal / …; aliases like 'at war' accepted), exclude_neutral (default true — drops Neutral / Unknown / x pairs so only meaningful relations show).",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 500,
          description: "Maximum number of pairs to return (default 100).",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Number of pairs to skip (default 0).",
        },
        state: {
          type: ["integer", "string"],
          description:
            "Optional state filter — pairs must touch this state. Id or case-insensitive name.",
        },
        relation: {
          type: "string",
          description:
            "Optional relation filter (Ally / Friendly / Neutral / Suspicion / Enemy / Unknown / Rival / Vassal / Suzerain, or aliases).",
        },
        exclude_neutral: {
          type: "boolean",
          description:
            "If true (default), drops pairs whose relation is Neutral, Unknown, or the 'x' placeholder.",
        },
      },
    },
    collectionKey: "diplomacy",
    notReadyError:
      "Diplomacy data is not available yet; cannot list. Wait for the map to finish generating.",
    read: () => runtime.readDiplomacy(),
    parseFilters: (input) => {
      let stateRef: number | string | null = null;
      let relationFilter: string | null = null;
      let excludeNeutral = true;
      if (input.state !== undefined && input.state !== null) {
        if (typeof input.state === "number" && Number.isInteger(input.state))
          stateRef = input.state;
        else if (typeof input.state === "string" && input.state.trim())
          stateRef = input.state;
        else return "state must be an integer id or a non-empty name string.";
      }
      if (input.relation !== undefined && input.relation !== null) {
        if (typeof input.relation !== "string" || !input.relation.trim())
          return "relation must be a non-empty string.";
        const resolved = resolveRelation(input.relation);
        if (!resolved)
          return `Unknown relation: ${JSON.stringify(input.relation)}.`;
        relationFilter = resolved;
      }
      if (
        input.exclude_neutral !== undefined &&
        input.exclude_neutral !== null
      ) {
        if (typeof input.exclude_neutral !== "boolean")
          return "exclude_neutral must be a boolean.";
        excludeNeutral = input.exclude_neutral;
      }
      return { stateRef, relationFilter, excludeNeutral };
    },
    applyFilters: (items, filters) => {
      let stateId: number | null = null;
      if (filters.stateRef !== null) {
        stateId = runtime.resolveStateRef(filters.stateRef);
        if (stateId === null)
          return `Could not resolve state ${JSON.stringify(filters.stateRef)}.`;
      }
      let filtered = items;
      if (stateId !== null) {
        const target = stateId;
        filtered = filtered.filter(
          (p) => p.state_a.i === target || p.state_b.i === target,
        );
      }
      if (filters.relationFilter !== null) {
        const want = filters.relationFilter;
        filtered = filtered.filter((p) => p.relation === want);
      }
      if (filters.excludeNeutral) {
        filtered = filtered.filter(
          (p) => p.relation !== null && !NEUTRAL_SENTINELS.has(p.relation),
        );
      }
      return {
        items: filtered,
        echo: {
          filters: {
            state: stateId,
            relation: filters.relationFilter,
            exclude_neutral: filters.excludeNeutral,
          },
        },
      };
    },
  });
}

export const listDiplomacyTool = createListDiplomacyTool();
