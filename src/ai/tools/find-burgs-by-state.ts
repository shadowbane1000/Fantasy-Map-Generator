import {
  errorResult,
  findEntityByRef,
  getPack,
  okResult,
  parseEntityRef,
  type RawBurg,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export const DEFAULT_FIND_BURGS_BY_STATE_LIMIT = 10000;
export const MAX_FIND_BURGS_BY_STATE_LIMIT = 100000;

export interface FindBurgsByStateHit {
  i: number;
  name: string;
  x: number;
  y: number;
  population: number;
  capital: boolean;
}

export interface FindBurgsByStatePayload {
  burgs: FindBurgsByStateHit[];
  count: number;
}

export type FindBurgsByStateResult = FindBurgsByStatePayload | "not-ready";

export interface ResolvedState {
  i: number;
  name: string;
}

export type ResolveStateResult =
  | ResolvedState
  | "not-ready"
  | "not-found"
  | "neutral";

interface PackLike {
  burgs?: RawBurg[];
  states?: RawState[];
}

/**
 * Resolve a state ref (numeric id or case-insensitive name / fullName)
 * against `pack.states`, reusing the shared `findEntityByRef` so behaviour
 * matches `get_state_info`, `rename_state`, etc. Returns the resolved
 * `{ i, name }` or a tagged failure string.
 */
export function resolveStateRefInPack(
  pack: PackLike | undefined,
  ref: number | string,
): ResolveStateResult {
  if (!pack?.states) return "not-ready";
  if (typeof ref === "number" && ref === 0) return "neutral";
  const entry = findEntityByRef(pack.states, ref);
  if (!entry) return "not-found";
  if (entry.i === 0) return "neutral";
  return { i: entry.i, name: entry.name ?? "" };
}

/**
 * Pure scanner: collects every active burg in `pack.burgs` whose
 * `burg.state` matches the requested `stateI`. Skips the index-0
 * placeholder and `removed: true` entries. `count` reports the full
 * unlimited total even when `burgs` is truncated by `limit`.
 */
export function findBurgsByStateInPack(
  pack: PackLike | undefined,
  stateI: number,
  limit: number,
): FindBurgsByStateResult {
  if (!pack?.burgs) return "not-ready";

  const cap = limit > 0 ? limit : 0;
  const burgs: FindBurgsByStateHit[] = [];
  let count = 0;

  for (let k = 0; k < pack.burgs.length; k++) {
    const b = pack.burgs[k];
    if (!b) continue;
    if (b.i === 0) continue;
    if (b.removed) continue;
    if (b.state !== stateI) continue;

    count++;
    if (burgs.length < cap) {
      burgs.push({
        i: b.i,
        name: typeof b.name === "string" ? b.name : "",
        x: typeof b.x === "number" ? b.x : 0,
        y: typeof b.y === "number" ? b.y : 0,
        population: typeof b.population === "number" ? b.population : 0,
        capital: b.capital === 1,
      });
    }
  }

  return { burgs, count };
}

export interface FindBurgsByStateRuntime {
  resolveState(ref: number | string): ResolveStateResult;
  find(stateI: number, limit: number): FindBurgsByStateResult;
}

export const defaultFindBurgsByStateRuntime: FindBurgsByStateRuntime = {
  resolveState(ref) {
    return resolveStateRefInPack(getPack<PackLike>(), ref);
  },
  find(stateI, limit) {
    return findBurgsByStateInPack(getPack<PackLike>(), stateI, limit);
  },
};

function parseLimit(value: unknown): number | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_BURGS_BY_STATE_LIMIT;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_FIND_BURGS_BY_STATE_LIMIT
  ) {
    return `limit must be an integer in [1, ${MAX_FIND_BURGS_BY_STATE_LIMIT}].`;
  }
  return value;
}

export function createFindBurgsByStateTool(
  runtime: FindBurgsByStateRuntime = defaultFindBurgsByStateRuntime,
): Tool {
  return {
    name: "find_burgs_by_state",
    description:
      "List every active burg (city or town) belonging to a given state — the state-filtered parallel of `list_burgs` and the bulk counterpart to `get_state_info` (which only reports `burgs_count`, not the list). Required `state` identifies the target state by numeric id (> 0) or case-insensitive name / fullName, resolved via the shared `findEntityByRef` (skips the Neutrals placeholder at id 0 and any `removed: true` entries). Optional `limit` (integer in [1, 100000], default 10000) caps the returned `burgs` array; `count` still reports the full unlimited total. Iterates `pack.burgs` linearly, skipping the index-0 placeholder and any `removed: true` burgs, and returns `{ ok, state, burgs, count }` where `state` is `{ i, name }` echoing the resolved state and each burg is `{ i, name, x, y, population, capital }`. `population` is the raw engine value (`burg.population`) — scale by `populationRate × urbanization` like `list_burgs` for display. `capital` is `true` only when `burg.capital === 1`. When the state has no burgs, `burgs` is `[]` and `count` is `0` — still `ok: true`. Errors on un-generated map, state 0 (Neutrals placeholder), an unresolvable state ref, missing / invalid `state`, or out-of-range `limit`. Useful as a first step for bulk burg operations inside a state — rename every burg, audit capitals / ports (post-filter on `capital`), feed burg ids into `get_burg_info`, or filter candidates for `rename_burg` / `move_burg` / `set_burg_population`. Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        state: {
          type: ["integer", "string"],
          description:
            "Numeric state id (> 0) or the state's current name / fullName (case-insensitive).",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_FIND_BURGS_BY_STATE_LIMIT,
          description: `Maximum burgs to return in the response (default ${DEFAULT_FIND_BURGS_BY_STATE_LIMIT}). \`count\` still reports the full unlimited total.`,
        },
      },
      required: ["state"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { state?: unknown; limit?: unknown };

      if (
        typeof input.state === "number" &&
        Number.isInteger(input.state) &&
        input.state === 0
      ) {
        return errorResult(
          "Cannot list burgs for state 0 (the Neutrals placeholder).",
        );
      }

      const parsed = parseEntityRef(input.state, "state");
      if (!parsed.ok) return errorResult(parsed.error);

      const limit = parseLimit(input.limit);
      if (typeof limit === "string") return errorResult(limit);

      const resolved = runtime.resolveState(parsed.ref);
      if (resolved === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }
      if (resolved === "neutral") {
        return errorResult(
          "Cannot list burgs for state 0 (the Neutrals placeholder).",
        );
      }
      if (resolved === "not-found") {
        return errorResult(
          `No state found matching ${JSON.stringify(parsed.ref)}.`,
        );
      }

      const result = runtime.find(resolved.i, limit);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }

      return okResult({
        state: { i: resolved.i, name: resolved.name },
        burgs: result.burgs,
        count: result.count,
      });
    },
  };
}

export const findBurgsByStateTool = createFindBurgsByStateTool();
