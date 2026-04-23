import {
  errorResult,
  findEntityByRef,
  getPack,
  okResult,
  parseEntityRef,
  type RawMarker,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export const DEFAULT_FIND_MARKERS_BY_STATE_LIMIT = 10000;
export const MAX_FIND_MARKERS_BY_STATE_LIMIT = 100000;

export interface FindMarkersByStateHit {
  i: number;
  type: string | null;
  icon: string | null;
  x: number | null;
  y: number | null;
  cell: number;
}

export interface FindMarkersByStatePayload {
  markers: FindMarkersByStateHit[];
  count: number;
}

export type FindMarkersByStateResult = FindMarkersByStatePayload | "not-ready";

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
  markers?: RawMarker[];
  states?: RawState[];
  cells?: {
    state?: Array<number | undefined> | number[];
  };
}

/**
 * Resolve a state ref (numeric id or case-insensitive name / fullName)
 * against `pack.states`, reusing the shared `findEntityByRef` so behaviour
 * matches `get_state_info`, `find_burgs_by_state`, etc. Returns the resolved
 * `{ i, name }` or a tagged failure string. Numeric 0 (Neutrals placeholder)
 * maps to `"neutral"` so callers can surface a dedicated error.
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
 * Pure scanner: collects every active marker in `pack.markers` whose
 * home cell's state slot (`pack.cells.state[marker.cell]`) matches the
 * requested `stateI`. Markers don't carry `state` directly — the state
 * is derived from the underlying cell. Skips the index-0 placeholder,
 * `removed: true` entries, null slots, markers without an integer
 * `cell`, and markers whose cell is out-of-bounds in `pack.cells.state`.
 * `count` reports the full unlimited total even when `markers` is
 * truncated by `limit`.
 */
export function findMarkersByStateInPack(
  pack: PackLike | undefined,
  stateI: number,
  limit: number,
): FindMarkersByStateResult {
  if (!pack?.markers) return "not-ready";
  const cellState = pack.cells?.state;
  if (!cellState) return "not-ready";

  const cap = limit > 0 ? limit : 0;
  const markers: FindMarkersByStateHit[] = [];
  let count = 0;

  for (let k = 0; k < pack.markers.length; k++) {
    const m = pack.markers[k];
    if (!m) continue;
    if (m.i === 0) continue;
    if (m.removed) continue;
    if (typeof m.cell !== "number" || !Number.isInteger(m.cell)) continue;

    const cs = (cellState as Array<number | undefined>)[m.cell];
    if (cs !== stateI) continue;

    count++;
    if (markers.length < cap) {
      const mx = m.x;
      const my = m.y;
      markers.push({
        i: m.i,
        type: typeof m.type === "string" ? m.type : null,
        icon: typeof m.icon === "string" ? m.icon : null,
        x: typeof mx === "number" && Number.isFinite(mx) ? mx : null,
        y: typeof my === "number" && Number.isFinite(my) ? my : null,
        cell: m.cell,
      });
    }
  }

  return { markers, count };
}

export interface FindMarkersByStateRuntime {
  resolveState(ref: number | string): ResolveStateResult;
  find(stateI: number, limit: number): FindMarkersByStateResult;
}

export const defaultFindMarkersByStateRuntime: FindMarkersByStateRuntime = {
  resolveState(ref) {
    return resolveStateRefInPack(getPack<PackLike>(), ref);
  },
  find(stateI, limit) {
    return findMarkersByStateInPack(getPack<PackLike>(), stateI, limit);
  },
};

function parseLimit(value: unknown): number | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_MARKERS_BY_STATE_LIMIT;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_FIND_MARKERS_BY_STATE_LIMIT
  ) {
    return `limit must be an integer in [1, ${MAX_FIND_MARKERS_BY_STATE_LIMIT}].`;
  }
  return value;
}

export function createFindMarkersByStateTool(
  runtime: FindMarkersByStateRuntime = defaultFindMarkersByStateRuntime,
): Tool {
  return {
    name: "find_markers_by_state",
    description:
      "List every active marker (point of interest — castle, battle site, mine, volcano, shipwreck, etc.) whose underlying cell belongs to a given state — the state-filtered parallel of `list_markers` and the state-side companion to `find_markers_by_type` / `find_markers_in_area`. Required `state` identifies the target state by numeric id (> 0) or case-insensitive name / fullName, resolved via the shared `findEntityByRef` (skips the Neutrals placeholder at id 0 and any `removed: true` entries). Optional `limit` (integer in [1, 100000], default 10000) caps the returned `markers` array; `count` still reports the full unlimited total. Markers don't carry `state` directly — state is derived by the same cell-indirection `find_burgs_by_religion` uses for religions: for each active marker, compare `pack.cells.state[marker.cell] === stateI`. Iterates `pack.markers` linearly, skipping the index-0 placeholder, any `removed: true` markers, null slots, markers without an integer `cell`, and markers whose cell is out-of-bounds in `pack.cells.state`. Returns `{ ok, state, markers, count }` where `state` is `{ i, name }` echoing the resolved state and each marker is `{ i, type, icon, x, y, cell }` — `type` / `icon` are echoed when strings else `null`, `x` / `y` are echoed when finite numbers else `null`, and `cell` is the marker's integer cell id. When the state has no markers, `markers` is `[]` and `count` is `0` — still `ok: true`. Errors on un-generated map (pack / pack.markers / pack.cells.state missing), state 0 (Neutrals placeholder), an unresolvable state ref, missing / invalid `state`, or out-of-range `limit`. Useful as a first step for bulk marker operations inside a state — audit every castle in a kingdom, feed marker ids into `get_marker_info`, or filter candidates for `set_marker_type` / `set_marker_icon` / `move_marker` / `remove_marker`. Read-only; requires an Anthropic API key (see 'Getting an API key' below).",
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
          maximum: MAX_FIND_MARKERS_BY_STATE_LIMIT,
          description: `Maximum markers to return in the response (default ${DEFAULT_FIND_MARKERS_BY_STATE_LIMIT}). \`count\` still reports the full unlimited total.`,
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
          "Cannot list markers for state 0 (the Neutrals placeholder).",
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
          "Cannot list markers for state 0 (the Neutrals placeholder).",
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
        markers: result.markers,
        count: result.count,
      });
    },
  };
}

export const findMarkersByStateTool = createFindMarkersByStateTool();
