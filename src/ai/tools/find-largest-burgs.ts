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

export const DEFAULT_FIND_LARGEST_BURGS_N = 10;
export const MAX_FIND_LARGEST_BURGS_N = 500;

export interface FindLargestBurgsHit {
  i: number;
  name: string;
  x: number;
  y: number;
  population: number;
  capital: boolean;
  state_id: number;
}

export interface FindLargestBurgsPayload {
  burgs: FindLargestBurgsHit[];
}

export type FindLargestBurgsResult = FindLargestBurgsPayload | "not-ready";

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
 * matches `find_burgs_by_state`, `get_state_info`, etc. Returns the
 * resolved `{ i, name }` or a tagged failure string.
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
 * Pure ranker: given the world state (`pack`), rank every active burg by
 * raw `burg.population` descending and return the top `n` entries. Skips
 * the index-0 placeholder, `removed: true` entries, and burgs without a
 * numeric `population` field. When `stateI` is a positive integer,
 * restricts ranking to burgs where `burg.state === stateI`.
 *
 * Returns `"not-ready"` when `pack` / `pack.burgs` is missing.
 *
 * `burg.population` is the **raw engine value** — the UI multiplies
 * by `populationRate × urbanization` to obtain an inhabitant count.
 */
export function findLargestBurgsInPack(
  pack: PackLike | undefined,
  n: number,
  stateI: number | null,
): FindLargestBurgsResult {
  if (!pack?.burgs) return "not-ready";

  const cap = n > 0 ? n : 0;
  const candidates: FindLargestBurgsHit[] = [];

  for (let k = 0; k < pack.burgs.length; k++) {
    const b = pack.burgs[k];
    if (!b) continue;
    if (b.i === 0) continue;
    if (b.removed) continue;
    if (typeof b.population !== "number") continue;
    const stateId = typeof b.state === "number" ? b.state : 0;
    if (stateI !== null && stateId !== stateI) continue;

    candidates.push({
      i: b.i,
      name: typeof b.name === "string" ? b.name : "",
      x: typeof b.x === "number" ? b.x : 0,
      y: typeof b.y === "number" ? b.y : 0,
      population: b.population,
      capital: b.capital === 1,
      state_id: stateId,
    });
  }

  candidates.sort((a, b) => b.population - a.population);

  return { burgs: candidates.slice(0, cap) };
}

export interface FindLargestBurgsRuntime {
  resolveState(ref: number | string): ResolveStateResult;
  find(n: number, stateI: number | null): FindLargestBurgsResult;
}

export const defaultFindLargestBurgsRuntime: FindLargestBurgsRuntime = {
  resolveState(ref) {
    return resolveStateRefInPack(getPack<PackLike>(), ref);
  },
  find(n, stateI) {
    return findLargestBurgsInPack(getPack<PackLike>(), n, stateI);
  },
};

function parseN(value: unknown): number | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_LARGEST_BURGS_N;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_FIND_LARGEST_BURGS_N
  ) {
    return `n must be an integer in [1, ${MAX_FIND_LARGEST_BURGS_N}].`;
  }
  return value;
}

export function createFindLargestBurgsTool(
  runtime: FindLargestBurgsRuntime = defaultFindLargestBurgsRuntime,
): Tool {
  return {
    name: "find_largest_burgs",
    description:
      "Return the top N burgs (cities and towns) ranked by raw `burg.population` descending — the ranking counterpart to the filter-style `find_burgs_by_population_range` (which returns every burg in an inclusive `[min, max]` range). Answers prompts like \"show me the 10 biggest cities\" without forcing the model to pick numeric bounds. Optional `n` (integer in [1, 500], default 10) caps the returned list. Optional `state` narrows the ranking to a single state (numeric id > 0 or case-insensitive name / fullName, resolved via the shared `findEntityByRef`; id 0 — the Neutrals placeholder — is rejected, matching `find_burgs_by_state`). `burg.population` is the **raw engine value** — the UI multiplies by `populationRate × urbanization` to get inhabitant counts, so a raw `population` of `8.5` might correspond to thousands of actual inhabitants depending on the map's rates. Iterates `pack.burgs` linearly, skipping the index-0 placeholder, any `removed: true` burgs, and burgs without a numeric `population` field; when a state filter is active, also skips burgs whose `burg.state` doesn't match. Sorts the survivors by `population` desc and slices the top `n`. Returns `{ ok, burgs, count, requested_n, state }` where each burg is `{ i, name, x, y, population, capital, state_id }` (`state_id` echoes `burg.state` so callers can cross-reference without an extra lookup). `capital` is `true` only when `burg.capital === 1`. `count` is the length of the returned `burgs` array (0 ≤ count ≤ n) — unlike `find_burgs_by_population_range` this tool does NOT report a pre-slice total, because the full sorted ranking would require returning every burg. `state` is `{ i, name }` echoing the resolved state filter, or `null` when no filter is active. When the map has no matching burgs (or the filtered state has none), `burgs` is `[]` and `count` is `0` — still `ok: true`. Errors on un-generated map (pack or `pack.burgs` missing), out-of-range `n`, state 0 (Neutrals placeholder), or an unresolvable `state` ref. Useful as a first step for top-city audits, picking capital candidates, feeding burg ids into `get_burg_info`, or prioritising `rename_burg` / `set_burg_population` / `move_burg` on the largest settlements. Read-only; requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        n: {
          type: "integer",
          minimum: 1,
          maximum: MAX_FIND_LARGEST_BURGS_N,
          description: `How many top burgs to return (default ${DEFAULT_FIND_LARGEST_BURGS_N}, max ${MAX_FIND_LARGEST_BURGS_N}).`,
        },
        state: {
          type: ["integer", "string"],
          description:
            "Optional state filter. Numeric state id (> 0) or the state's current name / fullName (case-insensitive). Id 0 (Neutrals placeholder) is rejected.",
        },
      },
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { n?: unknown; state?: unknown };

      const parsedN = parseN(input.n);
      if (typeof parsedN === "string") return errorResult(parsedN);
      const n = parsedN;

      let resolvedState: ResolvedState | null = null;
      if (input.state !== undefined && input.state !== null) {
        if (
          typeof input.state === "number" &&
          Number.isInteger(input.state) &&
          input.state === 0
        ) {
          return errorResult(
            "Cannot rank burgs for state 0 (the Neutrals placeholder).",
          );
        }

        const parsedRef = parseEntityRef(input.state, "state");
        if (!parsedRef.ok) return errorResult(parsedRef.error);

        const resolved = runtime.resolveState(parsedRef.ref);
        if (resolved === "not-ready") {
          return errorResult(
            "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
          );
        }
        if (resolved === "neutral") {
          return errorResult(
            "Cannot rank burgs for state 0 (the Neutrals placeholder).",
          );
        }
        if (resolved === "not-found") {
          return errorResult(
            `No state found matching ${JSON.stringify(parsedRef.ref)}.`,
          );
        }
        resolvedState = resolved;
      }

      const stateI = resolvedState ? resolvedState.i : null;
      const result = runtime.find(n, stateI);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }

      return okResult({
        burgs: result.burgs,
        count: result.burgs.length,
        requested_n: n,
        state: resolvedState
          ? { i: resolvedState.i, name: resolvedState.name }
          : null,
      });
    },
  };
}

export const findLargestBurgsTool = createFindLargestBurgsTool();
