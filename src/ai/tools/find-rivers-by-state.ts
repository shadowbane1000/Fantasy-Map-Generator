import {
  errorResult,
  findEntityByRef,
  getPack,
  okResult,
  parseEntityRef,
  type RawRiver,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export const DEFAULT_FIND_RIVERS_BY_STATE_LIMIT = 10000;
export const MAX_FIND_RIVERS_BY_STATE_LIMIT = 100000;

export interface FindRiversByStateHit {
  i: number;
  name: string;
  type: string | null;
  source: number;
  mouth: number;
  length: number;
  discharge: number;
}

export interface ResolvedState {
  i: number;
  name: string;
}

export interface FindRiversByStatePayload {
  state: ResolvedState;
  rivers: FindRiversByStateHit[];
  count: number;
}

export type FindRiversByStateResult = FindRiversByStatePayload | "not-ready";

export type ResolveStateResult =
  | ResolvedState
  | "not-ready"
  | "not-found"
  | "neutral";

interface PackLike {
  rivers?: RawRiver[];
  states?: RawState[];
  cells?: {
    state?: Array<number | undefined> | number[];
  };
}

/**
 * Resolve a state ref (numeric id or case-insensitive name / fullName) against
 * `pack.states`, reusing the shared `findEntityByRef` so behaviour matches
 * `get_state_info`, `rename_state`, `find_burgs_by_state`, etc. Returns the
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

function cellStateAt(
  cellsState: Array<number | undefined> | number[] | undefined,
  cell: number | undefined,
): number | null {
  if (!cellsState) return null;
  if (typeof cell !== "number" || !Number.isInteger(cell) || cell < 0) {
    return null;
  }
  if (cell >= (cellsState as { length: number }).length) return null;
  const v = (cellsState as Array<number | undefined>)[cell];
  return typeof v === "number" ? v : null;
}

/**
 * Pure scanner: collects every active river in `pack.rivers` whose source-cell
 * state OR mouth-cell state matches the requested `stateI`. Specifically, a
 * river matches when `pack.cells.state[river.source] === stateI` OR
 * `pack.cells.state[river.mouth] === stateI`.
 *
 * This is an intentional approximation vs a full-path scan: a river that
 * merely passes through a state between its source and mouth without touching
 * either endpoint cell will be missed. `river.cells[]` isn't always populated
 * after load, so source/mouth gives predictable cost and matches the
 * approximation pattern used by `find_nearest_river`.
 *
 * Skips the index-0 placeholder and any `removed: true` entries. `count`
 * reports the full unlimited total even when `rivers` is truncated by `limit`.
 */
export function findRiversByStateInPack(
  pack: PackLike | undefined,
  stateI: number,
  limit: number,
): FindRiversByStateResult {
  if (!pack?.rivers) return "not-ready";
  if (!pack.cells?.state) return "not-ready";

  const cellsState = pack.cells.state;
  const cap = limit > 0 ? limit : 0;
  const rivers: FindRiversByStateHit[] = [];
  let count = 0;

  for (let k = 0; k < pack.rivers.length; k++) {
    const r = pack.rivers[k];
    if (!r) continue;
    if (r.i === 0) continue;
    if (r.removed) continue;

    const mouthState = cellStateAt(cellsState, r.mouth);
    const sourceState = cellStateAt(cellsState, r.source);
    if (mouthState !== stateI && sourceState !== stateI) continue;

    count++;
    if (rivers.length < cap) {
      rivers.push({
        i: r.i,
        name: typeof r.name === "string" ? r.name : "",
        type: typeof r.type === "string" ? r.type : null,
        source: typeof r.source === "number" ? r.source : 0,
        mouth: typeof r.mouth === "number" ? r.mouth : 0,
        length: typeof r.length === "number" ? r.length : 0,
        discharge: typeof r.discharge === "number" ? r.discharge : 0,
      });
    }
  }

  return {
    state: { i: stateI, name: "" },
    rivers,
    count,
  };
}

export interface FindRiversByStateRuntime {
  resolveState(ref: number | string): ResolveStateResult;
  find(stateI: number, limit: number): FindRiversByStateResult;
}

export const defaultFindRiversByStateRuntime: FindRiversByStateRuntime = {
  resolveState(ref) {
    return resolveStateRefInPack(getPack<PackLike>(), ref);
  },
  find(stateI, limit) {
    return findRiversByStateInPack(getPack<PackLike>(), stateI, limit);
  },
};

function parseLimit(value: unknown): number | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_RIVERS_BY_STATE_LIMIT;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_FIND_RIVERS_BY_STATE_LIMIT
  ) {
    return `limit must be an integer in [1, ${MAX_FIND_RIVERS_BY_STATE_LIMIT}].`;
  }
  return value;
}

export function createFindRiversByStateTool(
  runtime: FindRiversByStateRuntime = defaultFindRiversByStateRuntime,
): Tool {
  return {
    name: "find_rivers_by_state",
    description:
      "List every active river flowing through a given state on the current map — the state-filtered, unpaginated companion to `list_rivers` and the river parallel of `find_burgs_by_state` / `find_provinces_by_state` / `find_markers_by_state`. Rivers don't carry a `state` field directly, so state association is derived from the river's endpoint cells: a river matches when `pack.cells.state[river.mouth] === stateI` OR `pack.cells.state[river.source] === stateI`. This is an **intentional approximation** vs a full-path scan — a river that merely passes through a state between its source and mouth without touching either endpoint cell will be missed (matches the source / mouth approximation used by `find_nearest_river`, since `river.cells[]` is not always populated after load). Required `state` identifies the target state by numeric id (> 0) or case-insensitive name / fullName, resolved via the shared `findEntityByRef` (skips the Neutrals placeholder at id 0 and any `removed: true` entries). Optional `limit` (integer in [1, 100000], default 10000) caps the returned `rivers` array; `count` still reports the full unlimited total. Iterates `pack.rivers` linearly, skipping the index-0 placeholder and any `removed: true` rivers, and returns `{ ok, state, rivers, count }` where `state` is `{ i, name }` echoing the resolved state and each river is `{ i, name, type, source, mouth, length, discharge }`. When the state has no matching rivers, `rivers` is `[]` and `count` is `0` — still `ok: true`. Errors on un-generated map (`pack` / `pack.rivers` / `pack.cells.state` missing), state 0 (Neutrals placeholder), an unresolvable state ref, missing / invalid `state`, or out-of-range `limit`. Useful as a first step for bulk river operations inside a state — audit which rivers drain a kingdom, feed river ids into `get_river_info`, or filter candidates for `rename_river` / `set_river_type` / `set_river_width` / `remove_river` / `regenerate_river_names`. Read-only. Requires an Anthropic API key (see 'Getting an API key' below).",
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
          maximum: MAX_FIND_RIVERS_BY_STATE_LIMIT,
          description: `Maximum rivers to return in the response (default ${DEFAULT_FIND_RIVERS_BY_STATE_LIMIT}). \`count\` still reports the full unlimited total.`,
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
          "Cannot list rivers for state 0 (the Neutrals placeholder).",
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
          "Cannot list rivers for state 0 (the Neutrals placeholder).",
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
        rivers: result.rivers,
        count: result.count,
      });
    },
  };
}

export const findRiversByStateTool = createFindRiversByStateTool();
