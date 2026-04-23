import { errorResult, getPack, okResult, type RawZone } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { findZoneByRef } from "./set-zone-visibility";

export const DEFAULT_ZONE_CELLS_LIMIT = 10000;
export const MAX_ZONE_CELLS_LIMIT = 10000;

export interface ZoneInfo {
  i: number;
  name: string;
  type: string | null;
  color: string | null;
  cells: number[];
  cells_count: number;
  hidden: boolean;
}

export type ReadZoneResult = ZoneInfo | "not-ready" | "not-found";

export interface ZoneInfoPackLike {
  zones?: RawZone[];
}

export function readZoneInfoFromPack(
  pack: ZoneInfoPackLike | undefined,
  ref: number | string,
  limit: number = DEFAULT_ZONE_CELLS_LIMIT,
): ReadZoneResult {
  if (!pack?.zones) return "not-ready";

  const zone = findZoneByRef(pack.zones, ref);
  if (!zone || zone.removed) return "not-found";

  const allCells = Array.isArray(zone.cells) ? zone.cells : [];
  const cappedLimit = Math.max(0, Math.min(limit, MAX_ZONE_CELLS_LIMIT));
  const cells =
    cappedLimit >= allCells.length
      ? allCells.slice()
      : allCells.slice(0, cappedLimit);

  return {
    i: zone.i,
    name: zone.name ?? "",
    type: zone.type ?? null,
    color: zone.color ?? null,
    cells,
    cells_count: allCells.length,
    hidden: !!zone.hidden,
  };
}

export interface ZoneInfoRuntime {
  readZone(ref: number | string, limit: number): ReadZoneResult;
}

export const defaultZoneInfoRuntime: ZoneInfoRuntime = {
  readZone(ref: number | string, limit: number): ReadZoneResult {
    return readZoneInfoFromPack(getPack<ZoneInfoPackLike>(), ref, limit);
  },
};

function parseZoneRef(
  value: unknown,
): { ok: true; ref: number | string } | { ok: false; error: string } {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return { ok: true, ref: value };
  }
  if (typeof value === "string" && value.trim()) {
    return { ok: true, ref: value };
  }
  return {
    ok: false,
    error: "zone must be a non-negative integer id or a non-empty name string.",
  };
}

export function createGetZoneInfoTool(
  runtime: ZoneInfoRuntime = defaultZoneInfoRuntime,
): Tool {
  return {
    name: "get_zone_info",
    description:
      "Read detailed info for a single zone — the per-zone parallel of get_map_info / list_zones. Required `zone` identifies the zone by numeric id (zones have non-contiguous ids starting at 0, so id 0 is a real zone — not a placeholder like state 0) or case-insensitive current name (resolved via findZoneByRef; removed zones are skipped). Optional `limit` (integer 0-10000, default 10000) truncates the returned `cells` array for very large zones — `cells_count` still reports the true total regardless of truncation. Returns `i`, `name` (zone.name / description), `type` (Invasion / Rebels / Crusade / Disease / Disaster / Eruption / Avalanche / Flood / custom — null when unset), `color` (CSS color or `url(#...)` pattern — null when unset), `cells` (number[] of cell indices, truncated to `limit`), `cells_count` (length of the full cells array before truncation), and `hidden` (boolean, mirrors pack.zones[k].hidden). Useful before taking any zone-targeted action (rename_zone, set_zone_color, set_zone_type, set_zone_visibility, remove_zone). Errors on un-generated map or an unresolvable / removed ref. Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        zone: {
          type: ["integer", "string"],
          description:
            "Numeric zone id (matches zone.i, non-contiguous ids starting at 0) or the zone's current case-insensitive name.",
        },
        limit: {
          type: "integer",
          minimum: 0,
          maximum: MAX_ZONE_CELLS_LIMIT,
          description: `Maximum number of cell indices to return in the cells array (default ${DEFAULT_ZONE_CELLS_LIMIT}). The full length is always reported via cells_count regardless of truncation.`,
        },
      },
      required: ["zone"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { zone?: unknown; limit?: unknown };

      const parsed = parseZoneRef(input.zone);
      if (!parsed.ok) return errorResult(parsed.error);

      let limit = DEFAULT_ZONE_CELLS_LIMIT;
      if (input.limit !== undefined && input.limit !== null) {
        if (
          typeof input.limit !== "number" ||
          !Number.isInteger(input.limit) ||
          input.limit < 0 ||
          input.limit > MAX_ZONE_CELLS_LIMIT
        ) {
          return errorResult(
            `limit must be an integer in [0, ${MAX_ZONE_CELLS_LIMIT}].`,
          );
        }
        limit = input.limit;
      }

      const result = runtime.readZone(parsed.ref, limit);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }
      if (result === "not-found") {
        return errorResult(
          `No zone found matching ${JSON.stringify(parsed.ref)}.`,
        );
      }
      return okResult({ ...result });
    },
  };
}

export const getZoneInfoTool = createGetZoneInfoTool();
