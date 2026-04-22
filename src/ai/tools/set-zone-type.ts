import {
  errorResult,
  getPack,
  okResult,
  parseEntityRef,
  type RawZone,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import { findZoneByRef } from "./set-zone-visibility";

export interface ZoneTypeRef {
  i: number;
  name: string;
  previousType: string | null;
}

export interface ZoneTypeRuntime {
  find(ref: number | string): ZoneTypeRef | null;
  apply(id: number, type: string): void;
}

interface ZonePackLike {
  zones?: RawZone[];
}

export const defaultZoneTypeRuntime: ZoneTypeRuntime = {
  find(ref) {
    const zone = findZoneByRef(getPack<ZonePackLike>()?.zones, ref);
    if (!zone) return null;
    return {
      i: zone.i,
      name: zone.name ?? "",
      previousType: zone.type ?? null,
    };
  },
  apply(id: number, type: string): void {
    const zone = findZoneByRef(getPack<ZonePackLike>()?.zones, id);
    if (!zone) throw new Error(`Zone ${id} not found.`);
    zone.type = type;
    if (typeof document !== "undefined") {
      document.getElementById(`zone${id}`)?.setAttribute("data-type", type);
    }
  },
};

export function createSetZoneTypeTool(
  runtime: ZoneTypeRuntime = defaultZoneTypeRuntime,
): Tool {
  return {
    name: "set_zone_type",
    description:
      "Reclassify a zone — writes pack.zones[k].type and mirrors to the #zone{i} SVG data-type attribute (same side-effect as the Zones Editor type field). Free-form text: the generator emits Invasion, Rebels, Proselytism, Crusade, Disease, Disaster, Eruption, Avalanche, Flood, but any non-empty string is accepted. Matches by numeric zone.i (non-contiguous ids) or case-insensitive current name.",
    input_schema: {
      type: "object",
      properties: {
        zone: {
          type: ["integer", "string"],
          description:
            "Numeric zone id (matches zone.i, not array index) or current case-insensitive name.",
        },
        type: {
          type: "string",
          description:
            "New zone type. Free-form; common generator values: Invasion, Rebels, Proselytism, Crusade, Disease, Disaster, Eruption, Avalanche, Flood.",
        },
      },
      required: ["zone", "type"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        zone?: unknown;
        type?: unknown;
      };

      const refResult = parseEntityRef(input.zone, "zone");
      if (!refResult.ok) return errorResult(refResult.error);
      if (typeof input.type !== "string" || !input.type.trim()) {
        return errorResult("type must be a non-empty string.");
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No zone found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }

      const type = input.type.trim();
      try {
        runtime.apply(current.i, type);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        previousType: current.previousType,
        type,
      });
    },
  };
}

export const setZoneTypeTool = createSetZoneTypeTool();
