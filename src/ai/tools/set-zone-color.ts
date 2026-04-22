import {
  errorResult,
  getGlobal,
  getPack,
  okResult,
  parseEntityRef,
  type RawZone,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import { isValidCssColor } from "./set-state-color";
import { findZoneByRef } from "./set-zone-visibility";

export interface ZoneColorRef {
  i: number;
  name: string;
  previousColor: string | null;
}

export interface ZoneColorRuntime {
  find(ref: number | string): ZoneColorRef | null;
  applyColor(i: number, color: string): void;
}

interface ZonePackLike {
  zones?: RawZone[];
}

export const defaultZoneColorRuntime: ZoneColorRuntime = {
  find(ref) {
    const zone = findZoneByRef(getPack<ZonePackLike>()?.zones, ref);
    if (!zone) return null;
    return {
      i: zone.i,
      name: zone.name ?? "",
      previousColor: zone.color ?? null,
    };
  },
  applyColor(i: number, color: string): void {
    const zone = findZoneByRef(getPack<ZonePackLike>()?.zones, i);
    if (!zone) throw new Error(`Zone ${i} not found.`);
    zone.color = color;
    const draw = getGlobal<() => void>("drawZones");
    if (typeof draw === "function") {
      try {
        draw();
      } catch {
        // Best-effort: data mutation already happened.
      }
    }
  },
};

export function createSetZoneColorTool(
  runtime: ZoneColorRuntime = defaultZoneColorRuntime,
): Tool {
  return {
    name: "set_zone_color",
    description:
      "Change a zone's display color — same side-effect as the swatch in the Zones Overview. Writes pack.zones[k].color and calls drawZones() to repaint the overlay. Accepts hex, rgb()/rgba()/hsl()/hsla(), or named CSS colors. Zones match on zone.i (non-contiguous ids) or case-insensitive name.",
    input_schema: {
      type: "object",
      properties: {
        zone: {
          type: ["integer", "string"],
          description:
            "Numeric zone id (matches zone.i, not array index) or current case-insensitive name.",
        },
        color: {
          type: "string",
          description:
            "CSS color value (hex, rgb()/rgba(), hsl()/hsla(), or a named color).",
        },
      },
      required: ["zone", "color"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        zone?: unknown;
        color?: unknown;
      };

      const refResult = parseEntityRef(input.zone, "zone");
      if (!refResult.ok) return errorResult(refResult.error);
      if (!isValidCssColor(input.color)) {
        return errorResult(
          "color must be a valid CSS color (#hex, rgb(), rgba(), hsl(), hsla(), or a named color).",
        );
      }

      const color = input.color.trim();
      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No zone found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }

      try {
        runtime.applyColor(current.i, color);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        previousColor: current.previousColor,
        color,
      });
    },
  };
}

export const setZoneColorTool = createSetZoneColorTool();
