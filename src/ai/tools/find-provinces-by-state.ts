import {
  errorResult,
  findEntityByRef,
  getPack,
  okResult,
  parseEntityRef,
  type RawProvince,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export const DEFAULT_FIND_PROVINCES_BY_STATE_LIMIT = 10000;
export const MAX_FIND_PROVINCES_BY_STATE_LIMIT = 100000;

export interface FindProvincesByStateHit {
  i: number;
  name: string;
  fullName: string | null;
  formName: string | null;
  color: string | null;
  center: [number, number] | null;
}

export interface FindProvincesByStatePayload {
  provinces: FindProvincesByStateHit[];
  count: number;
}

export type FindProvincesByStateResult =
  | FindProvincesByStatePayload
  | "not-ready";

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
  provinces?: RawProvince[];
  states?: RawState[];
}

/**
 * Resolve a state ref (numeric id or case-insensitive name / fullName)
 * against `pack.states`, reusing the shared `findEntityByRef` so behaviour
 * matches `get_state_info`, `find_burgs_by_state`, etc. Returns the
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
 * Pure scanner: collects every active province in `pack.provinces` whose
 * `province.state` matches the requested `stateI`. Skips the index-0
 * placeholder and `removed: true` entries. `count` reports the full
 * unlimited total even when `provinces` is truncated by `limit`.
 */
export function findProvincesByStateInPack(
  pack: PackLike | undefined,
  stateI: number,
  limit: number,
): FindProvincesByStateResult {
  if (!pack?.provinces) return "not-ready";

  const cap = limit > 0 ? limit : 0;
  const provinces: FindProvincesByStateHit[] = [];
  let count = 0;

  for (let k = 0; k < pack.provinces.length; k++) {
    const p = pack.provinces[k];
    if (!p) continue;
    if (p.i === 0) continue;
    if (p.removed) continue;
    if (p.state !== stateI) continue;

    count++;
    if (provinces.length < cap) {
      const pole =
        Array.isArray(p.pole) &&
        typeof p.pole[0] === "number" &&
        typeof p.pole[1] === "number"
          ? ([p.pole[0], p.pole[1]] as [number, number])
          : null;
      provinces.push({
        i: p.i,
        name: typeof p.name === "string" ? p.name : "",
        fullName: typeof p.fullName === "string" ? p.fullName : null,
        formName: typeof p.formName === "string" ? p.formName : null,
        color: typeof p.color === "string" ? p.color : null,
        center: pole,
      });
    }
  }

  return { provinces, count };
}

export interface FindProvincesByStateRuntime {
  resolveState(ref: number | string): ResolveStateResult;
  find(stateI: number, limit: number): FindProvincesByStateResult;
}

export const defaultFindProvincesByStateRuntime: FindProvincesByStateRuntime = {
  resolveState(ref) {
    return resolveStateRefInPack(getPack<PackLike>(), ref);
  },
  find(stateI, limit) {
    return findProvincesByStateInPack(getPack<PackLike>(), stateI, limit);
  },
};

function parseLimit(value: unknown): number | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_PROVINCES_BY_STATE_LIMIT;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_FIND_PROVINCES_BY_STATE_LIMIT
  ) {
    return `limit must be an integer in [1, ${MAX_FIND_PROVINCES_BY_STATE_LIMIT}].`;
  }
  return value;
}

export function createFindProvincesByStateTool(
  runtime: FindProvincesByStateRuntime = defaultFindProvincesByStateRuntime,
): Tool {
  return {
    name: "find_provinces_by_state",
    description:
      "List every active province belonging to a given state — the state-filtered parallel of `list_provinces` and the detail counterpart to `get_state_info` (which returns a `provinces` list of `{id, name}` but omits `fullName`, `formName`, `color`, and center coordinates). Required `state` identifies the parent state by numeric id (> 0) or case-insensitive name / fullName, resolved via the shared `findEntityByRef` (skips the Neutrals placeholder at id 0 and any `removed: true` entries). Optional `limit` (integer in [1, 100000], default 10000) caps the returned `provinces` array; `count` still reports the full unlimited total. Iterates `pack.provinces` linearly, skipping the index-0 placeholder and any `removed: true` provinces, and returns `{ ok, state, provinces, count }` where `state` is `{ i, name }` echoing the resolved state and each province is `{ i, name, fullName, formName, color, center }`. `fullName` / `formName` / `color` fall back to `null` when the raw province omits them. `center` is a two-number `[x, y]` tuple taken from `province.pole` (same field `list_provinces` exposes as `pole`), or `null` when the province has no pole. When the state has no provinces, `provinces` is `[]` and `count` is `0` — still `ok: true`. Errors on un-generated map, state 0 (Neutrals placeholder), an unresolvable state ref, missing / invalid `state`, or out-of-range `limit`. Useful as a first step for bulk province operations inside a state — rename every province, feed province ids into `get_province_info`, render province lists with color swatches and geographic centers, or filter candidates for `rename_province` / `move_province` / `set_province_color`. Requires an Anthropic API key (see 'Getting an API key' below).",
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
          maximum: MAX_FIND_PROVINCES_BY_STATE_LIMIT,
          description: `Maximum provinces to return in the response (default ${DEFAULT_FIND_PROVINCES_BY_STATE_LIMIT}). \`count\` still reports the full unlimited total.`,
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
          "Cannot list provinces for state 0 (the Neutrals placeholder).",
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
          "Cannot list provinces for state 0 (the Neutrals placeholder).",
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
        provinces: result.provinces,
        count: result.count,
      });
    },
  };
}

export const findProvincesByStateTool = createFindProvincesByStateTool();
