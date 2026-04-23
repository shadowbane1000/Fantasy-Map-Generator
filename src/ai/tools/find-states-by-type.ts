import {
  errorResult,
  getPack,
  okResult,
  type RawBurg,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import {
  resolveStateType,
  STATE_TYPES,
  type StateType,
} from "./set-state-type";

export const DEFAULT_FIND_STATES_BY_TYPE_LIMIT = 10000;
export const MAX_FIND_STATES_BY_TYPE_LIMIT = 100000;

export interface FindStatesByTypeHit {
  i: number;
  name: string;
  fullName: string | null;
  form: string | null;
  color: string | null;
  capital: string | null;
}

export interface FindStatesByTypePayload {
  type: StateType;
  states: FindStatesByTypeHit[];
  count: number;
}

export type FindStatesByTypeResult = FindStatesByTypePayload | "not-ready";

interface PackLike {
  states?: RawState[];
  burgs?: RawBurg[];
}

/**
 * Pure scanner: collects every active state in `pack.states` whose
 * `state.type` matches the requested canonical `StateType` (compared
 * case-insensitively against the raw `state.type` string). Skips the
 * index-0 Neutrals placeholder and `removed: true` entries. `count`
 * reports the full unlimited total even when `states` is truncated by
 * `limit`. The per-state `capital` field is the capital burg's name
 * (looked up via `pack.burgs[state.capital]`), or `null` when the
 * state has no capital or the burg is missing.
 */
export function findStatesByTypeInPack(
  pack: PackLike | undefined,
  type: StateType,
  limit: number,
): FindStatesByTypeResult {
  if (!pack?.states) return "not-ready";

  const cap = limit > 0 ? limit : 0;
  const needle = type.toLowerCase();
  const burgs = pack.burgs ?? [];
  const states: FindStatesByTypeHit[] = [];
  let count = 0;

  for (let k = 0; k < pack.states.length; k++) {
    const s = pack.states[k];
    if (!s) continue;
    if (s.i === 0) continue;
    if (s.removed) continue;
    if (typeof s.type !== "string") continue;
    if (s.type.toLowerCase() !== needle) continue;

    count++;
    if (states.length < cap) {
      let capitalName: string | null = null;
      if (typeof s.capital === "number" && s.capital > 0) {
        const burg = burgs[s.capital];
        capitalName = burg && typeof burg.name === "string" ? burg.name : null;
      }
      states.push({
        i: s.i,
        name: typeof s.name === "string" ? s.name : "",
        fullName: typeof s.fullName === "string" ? s.fullName : null,
        form: typeof s.form === "string" ? s.form : null,
        color: typeof s.color === "string" ? s.color : null,
        capital: capitalName,
      });
    }
  }

  return { type, states, count };
}

export interface FindStatesByTypeRuntime {
  find(type: StateType, limit: number): FindStatesByTypeResult;
}

export const defaultFindStatesByTypeRuntime: FindStatesByTypeRuntime = {
  find(type, limit) {
    return findStatesByTypeInPack(getPack<PackLike>(), type, limit);
  },
};

function parseLimit(value: unknown): number | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_STATES_BY_TYPE_LIMIT;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_FIND_STATES_BY_TYPE_LIMIT
  ) {
    return `limit must be an integer in [1, ${MAX_FIND_STATES_BY_TYPE_LIMIT}].`;
  }
  return value;
}

export function createFindStatesByTypeTool(
  runtime: FindStatesByTypeRuntime = defaultFindStatesByTypeRuntime,
): Tool {
  return {
    name: "find_states_by_type",
    description: `List every active state whose \`state.type\` matches a caller-supplied type label — the type-filtered parallel of \`list_states\` and the bulk counterpart to \`get_state_info\` / \`set_state_type\` when you want every state that shares a type. Required \`type\` (string) is matched case-insensitively against the canonical state types (${STATE_TYPES.join(", ")}) and echoed back in the response in its canonical casing; unknown types are rejected with the supported list. Optional \`limit\` (integer in [1, ${MAX_FIND_STATES_BY_TYPE_LIMIT}], default ${DEFAULT_FIND_STATES_BY_TYPE_LIMIT}) caps the returned \`states\` array; \`count\` still reports the full unlimited total. Iterates \`pack.states\` linearly, skipping the index-0 Neutrals placeholder and any \`removed: true\` states, and returns \`{ ok, type, states, count }\` where each state is \`{ i, name, fullName, form, color, capital }\`. \`fullName\` / \`form\` / \`color\` fall back to \`null\` when the raw state omits them. \`capital\` is the capital burg's name (string, via \`pack.burgs[state.capital]\`) or \`null\` when \`state.capital === 0\` or the burg is unavailable — the same shape \`list_states\` exposes. When no state matches, \`states\` is \`[]\` and \`count\` is \`0\` — still \`ok: true\`. Errors on un-generated map, missing / non-string / empty \`type\`, unknown \`type\`, or out-of-range \`limit\`. Useful as a first step for bulk state operations keyed purely by type — audit every Naval state on the map, feed state ids into \`get_state_info\`, or filter candidates for \`rename_state\` / \`set_state_color\` / \`set_state_type\` without any culture / religion filter. Requires an Anthropic API key (see "Getting an API key" below).`,
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: `State type. Case-insensitive match against one of: ${STATE_TYPES.join(", ")}.`,
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_FIND_STATES_BY_TYPE_LIMIT,
          description: `Maximum states to return in the response (default ${DEFAULT_FIND_STATES_BY_TYPE_LIMIT}). \`count\` still reports the full unlimited total.`,
        },
      },
      required: ["type"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { type?: unknown; limit?: unknown };

      if (input.type === undefined || input.type === null) {
        return errorResult("type is required.", {
          supported: [...STATE_TYPES],
        });
      }
      if (typeof input.type !== "string") {
        return errorResult("type must be a string.", {
          supported: [...STATE_TYPES],
        });
      }
      if (!input.type.trim()) {
        return errorResult("type must be a non-empty string.", {
          supported: [...STATE_TYPES],
        });
      }

      const resolved = resolveStateType(input.type);
      if (!resolved) {
        return errorResult(
          `Unknown state type: ${JSON.stringify(input.type)}.`,
          { supported: [...STATE_TYPES] },
        );
      }

      const limit = parseLimit(input.limit);
      if (typeof limit === "string") return errorResult(limit);

      const result = runtime.find(resolved, limit);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }

      return okResult({
        type: result.type,
        states: result.states,
        count: result.count,
      });
    },
  };
}

export const findStatesByTypeTool = createFindStatesByTypeTool();
