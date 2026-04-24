import {
  errorResult,
  getPack,
  okResult,
  type RawRegiment,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export const DEFAULT_FIND_REGIMENTS_BY_TYPE_LIMIT = 10000;
export const MAX_FIND_REGIMENTS_BY_TYPE_LIMIT = 100000;

export interface FindRegimentsByTypeStateRef {
  i: number;
  name: string;
}

export interface FindRegimentsByTypeHit {
  state: FindRegimentsByTypeStateRef;
  i: number;
  name: string;
  icon: string | null;
  x: number;
  y: number;
  cell: number;
  n: number;
  naval: boolean;
}

export interface FindRegimentsByTypePayload {
  type: string;
  regiments: FindRegimentsByTypeHit[];
  count: number;
}

export type FindRegimentsByTypeResult =
  | FindRegimentsByTypePayload
  | "not-ready";

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
 * Pure scanner: collects every regiment across `pack.states[*].military`
 * whose `regiment.type` matches `type` (case-insensitive string
 * compare). Skips the index-0 Neutrals state, any `removed: true`
 * states, and malformed regiments (null / missing `i`). Regiments
 * without a string `type` field never match. `count` reports the full
 * unlimited total even when `regiments` is truncated by `limit`.
 */
export function findRegimentsByTypeInPack(
  pack: PackLike | undefined,
  type: string,
  limit: number,
): FindRegimentsByTypeResult {
  if (!pack?.states) return "not-ready";

  const cap = limit > 0 ? limit : 0;
  const needle = type.toLowerCase();
  const regiments: FindRegimentsByTypeHit[] = [];
  let count = 0;

  for (let s = 0; s < pack.states.length; s++) {
    const state = pack.states[s];
    if (!state) continue;
    if (state.i === 0) continue;
    if (state.removed) continue;

    const military = state.military;
    if (!Array.isArray(military)) continue;

    const stateRef: FindRegimentsByTypeStateRef = {
      i: state.i,
      name: typeof state.name === "string" ? state.name : "",
    };

    for (let k = 0; k < military.length; k++) {
      const r = military[k] as RawRegiment | undefined;
      if (!r) continue;
      if (typeof r.i !== "number") continue;
      if (typeof r.type !== "string") continue;
      if (r.type.toLowerCase() !== needle) continue;

      count++;
      if (regiments.length < cap) {
        regiments.push({
          state: stateRef,
          i: r.i,
          name: typeof r.name === "string" ? r.name : "",
          icon: strOrNull(r.icon),
          x: numOrZero(r.x),
          y: numOrZero(r.y),
          cell: numOrZero(r.cell),
          n: numOrZero(r.t),
          naval: r.n === 1,
        });
      }
    }
  }

  return { type, regiments, count };
}

export interface FindRegimentsByTypeRuntime {
  find(type: string, limit: number): FindRegimentsByTypeResult;
}

export const defaultFindRegimentsByTypeRuntime: FindRegimentsByTypeRuntime = {
  find(type, limit) {
    return findRegimentsByTypeInPack(getPack<PackLike>(), type, limit);
  },
};

function parseLimit(value: unknown): number | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_REGIMENTS_BY_TYPE_LIMIT;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_FIND_REGIMENTS_BY_TYPE_LIMIT
  ) {
    return `limit must be an integer in [1, ${MAX_FIND_REGIMENTS_BY_TYPE_LIMIT}].`;
  }
  return value;
}

export function createFindRegimentsByTypeTool(
  runtime: FindRegimentsByTypeRuntime = defaultFindRegimentsByTypeRuntime,
): Tool {
  return {
    name: "find_regiments_by_type",
    description: `List every regiment whose \`regiment.type\` matches a caller-supplied type label across ALL states — the type-filtered parallel of \`list_regiments\` (which paginates 1-500 and returns richer rows) and the type-axis companion to \`find_regiments_by_state\` (which keys on the owning state instead). Regiments live nested under \`pack.states[stateI].military[]\` — there is no flat \`pack.regiments\` array — so this tool iterates every active state and every regiment inside each one. Required \`type\` (string) is matched case-insensitively against the raw \`regiment.type\` string after trimming the caller's input; typical values come from \`options.military[*].type\` ("melee", "ranged", "mounted", "machinery", "naval", "armored", "aviation", "magical", …) plus the naval-split \`"fleet"\` override, plus any custom unit types the user configured — since regiment types are arbitrary strings (like cultures — unlike states / burgs / religions which gate on a canonical set), ANY non-empty trimmed string is accepted and the caller's type (trimmed) is echoed back. Optional \`limit\` (integer in [1, ${MAX_FIND_REGIMENTS_BY_TYPE_LIMIT}], default ${DEFAULT_FIND_REGIMENTS_BY_TYPE_LIMIT}) caps the returned \`regiments\` array; \`count\` still reports the full unlimited total. Skips the index-0 Neutrals state placeholder, any \`removed: true\` states, and malformed regiment entries (null / missing \`i\` / non-string \`type\`). Returns \`{ ok, type, regiments, count }\` where each regiment is \`{ state: { i, name }, i, name, icon, x, y, cell, n, naval }\`. \`state\` tags each hit with the owning state so callers can group / post-filter without a second lookup — regiment \`i\` is per-state (matches \`regiment.i\`) and NOT globally unique across states, same caveat as \`get_regiment_info\`. \`icon\` passes through as a string when present and falls back to \`null\`. \`x\` / \`y\` / \`cell\` default to 0 when the raw field is missing / non-finite (matches \`list_regiments\` / \`find_regiments_by_state\` defensive fallback). \`n\` is total soldiers — raw \`regiment.t\`, same as \`get_regiment_info.n\` and \`list_regiments.total\`. \`naval\` is \`true\` only when \`regiment.n === 1\`. When no regiment matches, \`regiments\` is \`[]\` and \`count\` is \`0\` — still \`ok: true\`. Errors on un-generated map (\`pack\` or \`pack.states\` missing), missing / non-string / empty / whitespace-only \`type\`, or out-of-range \`limit\`. Useful as a first step for bulk regiment operations keyed purely by type across every state — audit every fleet on the map, feed regiment ids (with their owning state) into \`get_regiment_info\`, or filter candidates for \`rename_regiment\` / \`move_regiment\` / \`set_regiment_icon\` / \`set_regiment_naval\` / \`set_regiment_unit\` / \`split_regiment\` without any state filter. Read-only; requires an Anthropic API key (see "Getting an API key" below).`,
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description:
            "Regiment type. Case-insensitive string compare against `regiment.type` (after trimming caller input). Typical values: 'melee', 'ranged', 'cavalry', 'artillery', 'fleet', 'naval', 'mounted', 'machinery', 'magical', 'aviation', 'armored' — but any non-empty trimmed string is accepted since regiment types are arbitrary.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_FIND_REGIMENTS_BY_TYPE_LIMIT,
          description: `Maximum regiments to return in the response (default ${DEFAULT_FIND_REGIMENTS_BY_TYPE_LIMIT}). \`count\` still reports the full unlimited total.`,
        },
      },
      required: ["type"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { type?: unknown; limit?: unknown };

      if (input.type === undefined || input.type === null) {
        return errorResult("type is required.");
      }
      if (typeof input.type !== "string") {
        return errorResult("type must be a string.");
      }
      const trimmed = input.type.trim();
      if (!trimmed) {
        return errorResult("type must be a non-empty string.");
      }

      const limit = parseLimit(input.limit);
      if (typeof limit === "string") return errorResult(limit);

      const result = runtime.find(trimmed, limit);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }

      return okResult({
        type: result.type,
        regiments: result.regiments,
        count: result.count,
      });
    },
  };
}

export const findRegimentsByTypeTool = createFindRegimentsByTypeTool();
