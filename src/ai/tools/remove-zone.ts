import {
  errorResult,
  getGlobal,
  getPack,
  okResult,
  parseEntityRef,
  type RawZone,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import { findZoneByRef } from "./set-zone-visibility";

export interface RemoveZoneRef {
  i: number;
  name: string;
}

export interface ZoneRemovalRuntime {
  find(ref: number | string): RemoveZoneRef | null;
  remove(i: number): void;
}

interface ZonePackLike {
  zones?: RawZone[];
}

export const defaultZoneRemovalRuntime: ZoneRemovalRuntime = {
  find(ref) {
    const zone = findZoneByRef(getPack<ZonePackLike>()?.zones, ref);
    if (!zone) return null;
    return { i: zone.i, name: zone.name ?? "" };
  },
  remove(i: number): void {
    const zones = getPack<ZonePackLike>()?.zones;
    if (!Array.isArray(zones)) {
      throw new Error("pack.zones is not available.");
    }
    const idx = zones.findIndex((z) => z && z.i === i);
    if (idx < 0) {
      throw new Error(`Zone ${i} not found.`);
    }
    zones.splice(idx, 1);
    if (typeof document !== "undefined") {
      document.getElementById(`zone${i}`)?.remove();
    }
    const unfog = getGlobal<(key: string) => void>("unfog");
    if (typeof unfog === "function") {
      try {
        unfog(`focusZone${i}`);
      } catch {
        // Best-effort: the zone data is already gone.
      }
    }
  },
};

export function createRemoveZoneTool(
  runtime: ZoneRemovalRuntime = defaultZoneRemovalRuntime,
): Tool {
  return {
    name: "remove_zone",
    description:
      "Delete a zone from the map — same side-effect as the trash icon in the Zones Overview. The interactive confirm dialog is skipped (tools run non-interactively). Drops the entry from pack.zones, removes the #zone{i} SVG element, and unfogs any focus overlay on the zone. Zones match on zone.i (non-contiguous ids) or case-insensitive name.",
    input_schema: {
      type: "object",
      properties: {
        zone: {
          type: ["integer", "string"],
          description:
            "Numeric zone id (matches zone.i, not array index) or current case-insensitive name.",
        },
      },
      required: ["zone"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { zone?: unknown };

      const refResult = parseEntityRef(input.zone, "zone");
      if (!refResult.ok) return errorResult(refResult.error);

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No zone found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }

      try {
        runtime.remove(current.i);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({ i: current.i, name: current.name });
    },
  };
}

export const removeZoneTool = createRemoveZoneTool();
