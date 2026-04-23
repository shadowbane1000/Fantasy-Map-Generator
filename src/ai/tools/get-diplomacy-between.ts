import { errorResult, getPack, isActive, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { type BurgPackLike, resolveStateRefInPack } from "./list-burgs";

export interface DiplomacyBetween {
  state_a: { i: number; name: string };
  state_b: { i: number; name: string };
  relationship: string | null;
}

export type ReadDiplomacyBetweenResult =
  | DiplomacyBetween
  | "not-ready"
  | "not-found"
  | "neutral"
  | "same-state";

function normalizeRelation(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (raw === "x") return null;
  return raw;
}

export function readDiplomacyBetweenFromPack(
  pack: BurgPackLike | undefined,
  aRef: number | string,
  bRef: number | string,
): ReadDiplomacyBetweenResult {
  if (!pack?.states) return "not-ready";

  // Explicit rejection for id 0 (Neutrals) with a clearer signal than "not-found".
  if (typeof aRef === "number" && aRef === 0) return "neutral";
  if (typeof bRef === "number" && bRef === 0) return "neutral";

  const aId = resolveStateRefInPack(pack, aRef);
  const bId = resolveStateRefInPack(pack, bRef);
  if (aId === null || bId === null) return "not-found";
  if (aId === 0 || bId === 0) return "neutral";
  if (aId === bId) return "same-state";

  const stateA = pack.states[aId];
  const stateB = pack.states[bId];
  if (!stateA || !stateB || !isActive(stateA) || !isActive(stateB)) {
    return "not-found";
  }

  const dipA = (stateA as { diplomacy?: string[] }).diplomacy;
  const relationship = normalizeRelation(
    Array.isArray(dipA) ? dipA[bId] : undefined,
  );

  return {
    state_a: { i: aId, name: stateA.name ?? "" },
    state_b: { i: bId, name: stateB.name ?? "" },
    relationship,
  };
}

export interface DiplomacyBetweenRuntime {
  read(
    aRef: number | string,
    bRef: number | string,
  ): ReadDiplomacyBetweenResult;
}

export const defaultDiplomacyBetweenRuntime: DiplomacyBetweenRuntime = {
  read(aRef, bRef) {
    return readDiplomacyBetweenFromPack(getPack<BurgPackLike>(), aRef, bRef);
  },
};

function isValidRef(value: unknown): boolean {
  if (typeof value === "number") return Number.isInteger(value) && value >= 1;
  return typeof value === "string" && value.trim().length > 0;
}

export function createGetDiplomacyBetweenTool(
  runtime: DiplomacyBetweenRuntime = defaultDiplomacyBetweenRuntime,
): Tool {
  return {
    name: "get_diplomacy_between",
    description:
      "Read the current diplomatic relationship between two specific states — a single point lookup into `pack.states[state_a].diplomacy[state_b]`, without paginating the full matrix (`list_diplomacy`) or dumping the whole state dossier (`get_state_info`). Both `state_a` and `state_b` are required and accept a positive integer id or a case-insensitive name / fullName (resolved via `resolveStateRefInPack`, the same helper `set_diplomacy` / `list_diplomacy` use). State 0 (the Neutrals placeholder) is rejected on either side, as are `removed: true` states and refs that match the same state after resolution. Returns `{ ok, state_a: {i, name}, state_b: {i, name}, relationship }` where `relationship` is one of the engine strings — Ally / Friendly / Neutral / Suspicion / Enemy / Unknown / Rival / Vassal / Suzerain — reported from state_a's view (swap the args to get state_b's view, e.g. Vassal ↔ Suzerain). `relationship` is `null` when the diplomacy array is missing or holds the `'x'` self-sentinel. Errors on un-generated map, either state being 0 / removed / unresolvable, or state_a resolving to the same id as state_b. Requires an Anthropic API key (see \"Getting an API key\" below).",
    input_schema: {
      type: "object",
      properties: {
        state_a: {
          type: ["integer", "string"],
          description:
            "First state — positive integer id (> 0) or case-insensitive name / fullName.",
        },
        state_b: {
          type: ["integer", "string"],
          description:
            "Second state — same shape as state_a. Must resolve to a different state than state_a.",
        },
      },
      required: ["state_a", "state_b"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        state_a?: unknown;
        state_b?: unknown;
      };

      if (
        typeof input.state_a === "number" &&
        Number.isInteger(input.state_a) &&
        input.state_a === 0
      ) {
        return errorResult(
          "Cannot read diplomacy for state 0 (the Neutrals placeholder).",
        );
      }
      if (
        typeof input.state_b === "number" &&
        Number.isInteger(input.state_b) &&
        input.state_b === 0
      ) {
        return errorResult(
          "Cannot read diplomacy for state 0 (the Neutrals placeholder).",
        );
      }

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

      const aRef = input.state_a as number | string;
      const bRef = input.state_b as number | string;
      const result = runtime.read(aRef, bRef);

      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }
      if (result === "neutral") {
        return errorResult(
          "Cannot read diplomacy for state 0 (the Neutrals placeholder).",
        );
      }
      if (result === "same-state") {
        return errorResult("state_a and state_b must be different states.");
      }
      if (result === "not-found") {
        return errorResult(
          `Could not resolve states state_a=${JSON.stringify(aRef)}, state_b=${JSON.stringify(bRef)}.`,
        );
      }

      return okResult({ ...result });
    },
  };
}

export const getDiplomacyBetweenTool = createGetDiplomacyBetweenTool();
