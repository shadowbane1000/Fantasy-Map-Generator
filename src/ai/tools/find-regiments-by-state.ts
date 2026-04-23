import {
  errorResult,
  findEntityByRef,
  getPack,
  okResult,
  parseEntityRef,
  type RawRegiment,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export const DEFAULT_FIND_REGIMENTS_BY_STATE_LIMIT = 10000;
export const MAX_FIND_REGIMENTS_BY_STATE_LIMIT = 100000;

export interface FindRegimentsByStateHit {
  i: number;
  name: string;
  icon: string | null;
  x: number;
  y: number;
  cell: number;
  n: number;
  type: string | null;
  naval: boolean;
}

export interface FindRegimentsByStatePayload {
  regiments: FindRegimentsByStateHit[];
  count: number;
}

export type FindRegimentsByStateResult =
  | FindRegimentsByStatePayload
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
  states?: RawState[];
}

function numOrZero(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Resolve a state ref (numeric id or case-insensitive name / fullName)
 * against `pack.states`, reusing the shared `findEntityByRef` so behaviour
 * matches `get_state_info`, `find_burgs_by_state`,
 * `find_provinces_by_state`, etc. Returns the resolved `{ i, name }` or a
 * tagged failure string.
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
 * Pure scanner: collects every regiment on
 * `pack.states[stateI].military`. Emits
 * `{ i, name, icon, x, y, cell, n, type, naval }` per regiment, with
 * defensive fallbacks matching `list_regiments` / `get_regiment_info`.
 * `count` reports the full unlimited total even when `regiments` is
 * truncated by `limit`. Returns `"not-ready"` when the pack / its
 * `states` array is missing, or when the target state slot is absent or
 * has no `military` array.
 */
export function findRegimentsByStateInPack(
  pack: PackLike | undefined,
  stateI: number,
  limit: number,
): FindRegimentsByStateResult {
  if (!pack?.states) return "not-ready";

  const state = pack.states[stateI];
  if (!state) return "not-ready";

  const military = state.military;
  if (!Array.isArray(military)) return "not-ready";

  const cap = limit > 0 ? limit : 0;
  const regiments: FindRegimentsByStateHit[] = [];
  let count = 0;

  for (let k = 0; k < military.length; k++) {
    const r = military[k] as RawRegiment | undefined;
    if (!r) continue;
    if (typeof r.i !== "number") continue;

    count++;
    if (regiments.length < cap) {
      regiments.push({
        i: r.i,
        name: typeof r.name === "string" ? r.name : "",
        icon: strOrNull(r.icon),
        x: numOrZero(r.x),
        y: numOrZero(r.y),
        cell: numOrZero(r.cell),
        n: numOrZero(r.t),
        type: strOrNull(r.type),
        naval: r.n === 1,
      });
    }
  }

  return { regiments, count };
}

export interface FindRegimentsByStateRuntime {
  resolveState(ref: number | string): ResolveStateResult;
  find(stateI: number, limit: number): FindRegimentsByStateResult;
}

export const defaultFindRegimentsByStateRuntime: FindRegimentsByStateRuntime = {
  resolveState(ref) {
    return resolveStateRefInPack(getPack<PackLike>(), ref);
  },
  find(stateI, limit) {
    return findRegimentsByStateInPack(getPack<PackLike>(), stateI, limit);
  },
};

function parseLimit(value: unknown): number | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_REGIMENTS_BY_STATE_LIMIT;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_FIND_REGIMENTS_BY_STATE_LIMIT
  ) {
    return `limit must be an integer in [1, ${MAX_FIND_REGIMENTS_BY_STATE_LIMIT}].`;
  }
  return value;
}

export function createFindRegimentsByStateTool(
  runtime: FindRegimentsByStateRuntime = defaultFindRegimentsByStateRuntime,
): Tool {
  return {
    name: "find_regiments_by_state",
    description:
      "List every regiment belonging to a given state — the state-filtered parallel of `list_regiments` and the bulk military-roster counterpart to `get_state_info` (which does not expose the military list). Required `state` identifies the owning state by numeric id (> 0) or case-insensitive name / fullName, resolved via the shared `findEntityByRef` (skips the Neutrals placeholder at id 0 and any `removed: true` entries). Optional `limit` (integer in [1, 100000], default 10000) caps the returned `regiments` array; `count` still reports the full unlimited total. Iterates `pack.states[stateI].military` linearly (regiments live nested under their parent state — state id is carried by the parent, not the regiment) and returns `{ ok, state, regiments, count }` where `state` is `{ i, name }` echoing the resolved state and each regiment is `{ i, name, icon, x, y, cell, n, type, naval }`. Regiment `i` is per-state (matches `regiment.i`) — not globally unique across states, same caveat as `get_regiment_info`. `icon` / `type` pass through as strings when present and fall back to `null`. `x` / `y` / `cell` default to 0 when the raw field is missing / non-finite (matches `list_regiments` defensive fallback). `n` is total soldiers — raw `regiment.t`, same as `get_regiment_info.n` and `list_regiments.total`. `naval` is `true` only when `regiment.n === 1`. When the state has no regiments, `regiments` is `[]` and `count` is `0` — still `ok: true`. Errors on un-generated map, state 0 (Neutrals placeholder), an unresolvable state ref, missing / invalid `state`, or out-of-range `limit`. Useful as a first step for bulk regiment operations inside a state — rename every regiment, feed regiment ids into `get_regiment_info`, post-filter on `naval` to isolate fleets, or enumerate candidates for `rename_regiment` / `move_regiment` / `set_regiment_icon` / `set_regiment_naval` / `set_regiment_unit` / `split_regiment`. Requires an Anthropic API key (see 'Getting an API key' below).",
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
          maximum: MAX_FIND_REGIMENTS_BY_STATE_LIMIT,
          description: `Maximum regiments to return in the response (default ${DEFAULT_FIND_REGIMENTS_BY_STATE_LIMIT}). \`count\` still reports the full unlimited total.`,
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
          "Cannot list regiments for state 0 (the Neutrals placeholder).",
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
          "Cannot list regiments for state 0 (the Neutrals placeholder).",
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
        regiments: result.regiments,
        count: result.count,
      });
    },
  };
}

export const findRegimentsByStateTool = createFindRegimentsByStateTool();
