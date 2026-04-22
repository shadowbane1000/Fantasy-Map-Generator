import {
  errorResult,
  getPack,
  okResult,
  parseEntityRef,
  type RawZone,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import { findZoneByRef } from "./set-zone-visibility";

export interface ZoneRenameRef {
  i: number;
  name: string;
}

export interface ZoneRenameRuntime {
  find(ref: number | string): ZoneRenameRef | null;
  rename(i: number, name: string): void;
}

interface ZonePackLike {
  zones?: RawZone[];
}

export const defaultZoneRenameRuntime: ZoneRenameRuntime = {
  find(ref) {
    const zone = findZoneByRef(getPack<ZonePackLike>()?.zones, ref);
    if (!zone) return null;
    return { i: zone.i, name: zone.name ?? "" };
  },
  rename(i: number, name: string): void {
    const zone = findZoneByRef(getPack<ZonePackLike>()?.zones, i);
    if (!zone) throw new Error(`Zone ${i} not found.`);
    zone.name = name;
    if (typeof document === "undefined") return;
    document.getElementById(`zone${i}`)?.setAttribute("data-description", name);
  },
};

export function createRenameZoneTool(
  runtime: ZoneRenameRuntime = defaultZoneRenameRuntime,
): Tool {
  return {
    name: "rename_zone",
    description:
      "Rename a zone (invasion, disease, crusade, etc.). The Zones Overview calls this the 'Description' field, but it writes to pack.zones[k].name and mirrors the value to the #zone{i} SVG element's data-description attribute (the map tooltip). Zones are matched by numeric i (non-contiguous ids) or case-insensitive current name.",
    input_schema: {
      type: "object",
      properties: {
        zone: {
          type: ["integer", "string"],
          description:
            "Numeric zone id (matches zone.i, not array index) or current case-insensitive name.",
        },
        name: {
          type: "string",
          description: "The new name / description for the zone.",
        },
      },
      required: ["zone", "name"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { zone?: unknown; name?: unknown };

      const refResult = parseEntityRef(input.zone, "zone");
      if (!refResult.ok) return errorResult(refResult.error);
      if (typeof input.name !== "string" || !input.name.trim()) {
        return errorResult("name must be a non-empty string.");
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No zone found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }

      const newName = input.name.trim();
      try {
        runtime.rename(current.i, newName);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        previousName: current.name,
        name: newName,
      });
    },
  };
}

export const renameZoneTool = createRenameZoneTool();
