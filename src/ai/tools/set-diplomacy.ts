import {
  createAliasResolver,
  errorResult,
  getPack,
  isActive,
  okResult,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import { type BurgPackLike, resolveStateRefInPack } from "./list-burgs";

export type DiplomacyRelation =
  | "Ally"
  | "Friendly"
  | "Neutral"
  | "Suspicion"
  | "Enemy"
  | "Unknown"
  | "Rival"
  | "Vassal"
  | "Suzerain";

export const DIPLOMACY_RELATIONS: readonly DiplomacyRelation[] = [
  "Ally",
  "Friendly",
  "Neutral",
  "Suspicion",
  "Enemy",
  "Unknown",
  "Rival",
  "Vassal",
  "Suzerain",
];

const resolveRelationAlias = createAliasResolver<DiplomacyRelation>(
  DIPLOMACY_RELATIONS,
  {
    "at war": "Enemy",
    war: "Enemy",
    allied: "Ally",
    friend: "Friendly",
  },
);

export function resolveRelation(value: unknown): DiplomacyRelation | null {
  return resolveRelationAlias(value);
}

export function reverseRelation(rel: DiplomacyRelation): DiplomacyRelation {
  if (rel === "Vassal") return "Suzerain";
  if (rel === "Suzerain") return "Vassal";
  return rel;
}

export interface DiplomacyRef {
  aId: number;
  aName: string;
  bId: number;
  bName: string;
  previousRelation: string | null;
}

export interface DiplomacyRuntime {
  find(aRef: number | string, bRef: number | string): DiplomacyRef | null;
  apply(aId: number, bId: number, relation: DiplomacyRelation): void;
}

function isValidRef(value: unknown): boolean {
  if (typeof value === "number") return Number.isInteger(value) && value >= 1;
  return typeof value === "string" && value.trim().length > 0;
}

export const defaultDiplomacyRuntime: DiplomacyRuntime = {
  find(aRef, bRef) {
    const pack = getPack<BurgPackLike>();
    const aId = resolveStateRefInPack(pack, aRef);
    const bId = resolveStateRefInPack(pack, bRef);
    if (aId === null || bId === null) return null;
    if (aId === 0 || bId === 0) return null;
    const stateA = pack?.states?.[aId];
    const stateB = pack?.states?.[bId];
    if (!stateA || !stateB || !isActive(stateA) || !isActive(stateB))
      return null;
    const prev = (stateA as { diplomacy?: string[] }).diplomacy?.[bId] ?? null;
    return {
      aId,
      aName: stateA.name ?? "",
      bId,
      bName: stateB.name ?? "",
      previousRelation: prev,
    };
  },
  apply(aId, bId, relation) {
    const pack = getPack<BurgPackLike>();
    const stateA = pack?.states?.[aId];
    const stateB = pack?.states?.[bId];
    if (!stateA || !stateB || !isActive(stateA) || !isActive(stateB)) {
      throw new Error("State not found.");
    }
    const dipA = (stateA as { diplomacy?: string[] }).diplomacy;
    const dipB = (stateB as { diplomacy?: string[] }).diplomacy;
    if (!Array.isArray(dipA) || !Array.isArray(dipB)) {
      throw new Error(
        "State diplomacy array missing; ensure the map is fully generated.",
      );
    }
    dipA[bId] = relation;
    dipB[aId] = reverseRelation(relation);
  },
};

export function createSetDiplomacyTool(
  runtime: DiplomacyRuntime = defaultDiplomacyRuntime,
): Tool {
  return {
    name: "set_diplomacy",
    description: `Set the diplomatic relation between two states — same as the Diplomacy Editor. Writes pack.states[a].diplomacy[b] and its symmetric counterpart (Vassal ↔ Suzerain, otherwise mirrored). Relations: ${DIPLOMACY_RELATIONS.join(", ")}. Common aliases ("at war" → Enemy, "allied" → Ally, "friend" → Friendly). Neutrals (state 0) is excluded as either party.`,
    input_schema: {
      type: "object",
      properties: {
        state_a: {
          type: ["integer", "string"],
          description:
            "First state — positive integer id or case-insensitive name/fullName.",
        },
        state_b: {
          type: ["integer", "string"],
          description: "Second state — same shape as state_a.",
        },
        relation: {
          type: "string",
          description: `One of: ${DIPLOMACY_RELATIONS.join(", ")}. Prose aliases accepted.`,
        },
      },
      required: ["state_a", "state_b", "relation"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        state_a?: unknown;
        state_b?: unknown;
        relation?: unknown;
      };

      if (!isValidRef(input.state_a)) {
        return errorResult(
          "state_a must be a positive integer id or a non-empty name string.",
        );
      }
      if (!isValidRef(input.state_b)) {
        return errorResult(
          "state_b must be a positive integer id or a non-empty name string.",
        );
      }
      if (typeof input.relation !== "string" || !input.relation.trim()) {
        return errorResult("relation must be a non-empty string.", {
          supported: [...DIPLOMACY_RELATIONS],
        });
      }
      const resolved = resolveRelation(input.relation);
      if (!resolved) {
        return errorResult(
          `Unknown relation: ${JSON.stringify(input.relation)}.`,
          { supported: [...DIPLOMACY_RELATIONS] },
        );
      }

      const aRef = input.state_a as number | string;
      const bRef = input.state_b as number | string;
      const current = runtime.find(aRef, bRef);
      if (!current) {
        return errorResult(
          `Could not resolve states state_a=${JSON.stringify(aRef)}, state_b=${JSON.stringify(bRef)}.`,
        );
      }
      if (current.aId === current.bId) {
        return errorResult("state_a and state_b must be different states.");
      }

      try {
        runtime.apply(current.aId, current.bId, resolved);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        state_a: { i: current.aId, name: current.aName },
        state_b: { i: current.bId, name: current.bName },
        previousRelation: current.previousRelation,
        relation: resolved,
        reverseRelation: reverseRelation(resolved),
      });
    },
  };
}

export const setDiplomacyTool = createSetDiplomacyTool();
