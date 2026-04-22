import {
  errorResult,
  getGlobal,
  getPack,
  okResult,
  parseEntityRef,
  type RawZone,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface ZoneVisibilityRef {
  i: number;
  name: string;
  previousHidden: boolean;
}

export interface ZoneVisibilityRuntime {
  find(ref: number | string): ZoneVisibilityRef | null;
  setHidden(i: number, hidden: boolean): void;
}

export function findZoneByRef(
  zones: RawZone[] | undefined,
  ref: number | string,
): RawZone | null {
  if (!Array.isArray(zones)) return null;
  if (typeof ref === "number") {
    if (!Number.isInteger(ref)) return null;
    for (const z of zones) {
      if (z && z.i === ref) return z;
    }
    return null;
  }
  if (typeof ref !== "string") return null;
  const needle = ref.trim().toLowerCase();
  if (!needle) return null;
  for (const z of zones) {
    if (!z) continue;
    if ((z.name ?? "").toLowerCase() === needle) return z;
  }
  return null;
}

interface ZonePackLike {
  zones?: RawZone[];
}

export const defaultZoneVisibilityRuntime: ZoneVisibilityRuntime = {
  find(ref) {
    const zone = findZoneByRef(getPack<ZonePackLike>()?.zones, ref);
    if (!zone) return null;
    return {
      i: zone.i,
      name: zone.name ?? "",
      previousHidden: !!zone.hidden,
    };
  },
  setHidden(i: number, hidden: boolean): void {
    const zone = findZoneByRef(getPack<ZonePackLike>()?.zones, i);
    if (!zone) throw new Error(`Zone ${i} not found.`);
    if (hidden) zone.hidden = true;
    else delete zone.hidden;
    const draw = getGlobal<() => void>("drawZones");
    if (typeof draw === "function") {
      try {
        draw();
      } catch {
        // Best-effort: the data mutation already happened.
      }
    }
  },
};

export function createSetZoneVisibilityTool(
  runtime: ZoneVisibilityRuntime = defaultZoneVisibilityRuntime,
): Tool {
  return {
    name: "set_zone_visibility",
    description:
      "Hide or show a single zone (invasion, disease, crusade, etc.) on the map — same side-effect as the eye-toggle button in the Zones Overview. Writes pack.zones[k].hidden and calls drawZones() to redraw the overlay. Idempotent: asking to hide an already-hidden zone (or show an already-visible one) returns noop: true. Zones are matched by numeric i (they have non-contiguous ids) or case-insensitive name. Hidden zones are also excluded from list_zones by default.",
    input_schema: {
      type: "object",
      properties: {
        zone: {
          type: ["integer", "string"],
          description:
            "Numeric zone id (matches zone.i, not array index) or the zone's current case-insensitive name.",
        },
        visible: {
          type: "boolean",
          description: "true to show the zone, false to hide it.",
        },
      },
      required: ["zone", "visible"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        zone?: unknown;
        visible?: unknown;
      };

      const refResult = parseEntityRef(input.zone, "zone");
      if (!refResult.ok) return errorResult(refResult.error);
      if (typeof input.visible !== "boolean") {
        return errorResult("visible must be a boolean.");
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No zone found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }

      const desiredHidden = !input.visible;
      if (current.previousHidden === desiredHidden) {
        return okResult({
          i: current.i,
          name: current.name,
          visible: input.visible,
          previousVisible: !current.previousHidden,
          noop: true,
        });
      }

      try {
        runtime.setHidden(current.i, desiredHidden);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        visible: input.visible,
        previousVisible: !current.previousHidden,
        noop: false,
      });
    },
  };
}

export const setZoneVisibilityTool = createSetZoneVisibilityTool();
