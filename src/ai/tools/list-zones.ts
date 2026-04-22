import { createPaginatedListTool, getPack, type RawZone } from "./_shared";
import type { Tool } from "./index";

export interface ZoneSummary {
  i: number;
  name: string;
  type: string | null;
  color: string | null;
  cells: number;
  hidden: boolean;
}

export interface ZonePackLike {
  zones?: RawZone[];
}

export function readZonesFromPack(
  pack: ZonePackLike | undefined,
): ZoneSummary[] | null {
  if (!pack?.zones) return null;
  return pack.zones
    .filter((z): z is RawZone => !!z)
    .map(
      (z): ZoneSummary => ({
        i: z.i,
        name: z.name ?? "",
        type: z.type ?? null,
        color: z.color ?? null,
        cells: Array.isArray(z.cells) ? z.cells.length : 0,
        hidden: !!z.hidden,
      }),
    );
}

export interface ZonesRuntime {
  readZones(): ZoneSummary[] | null;
}

export const defaultZonesRuntime: ZonesRuntime = {
  readZones(): ZoneSummary[] | null {
    return readZonesFromPack(getPack<ZonePackLike>());
  },
};

interface ZoneFilters {
  typeFilter: string | null;
  includeHidden: boolean;
}

export function createListZonesTool(
  runtime: ZonesRuntime = defaultZonesRuntime,
): Tool {
  return createPaginatedListTool<ZoneSummary, ZoneFilters>({
    name: "list_zones",
    description:
      "List zones on the current map — the overlay regions drawn by the Zones Editor for things like Invasion, Rebels, Proselytism, Crusade, Disease, Disaster, Eruption, Avalanche, etc. Each entry reports id, name, type, color, cell count (the cell array itself is summarized), and whether the zone is hidden. Paginated (limit 1-500, default 100; offset >=0). Optional filters: type (exact, case-insensitive) and include_hidden (default false — hidden zones are excluded unless requested).",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 500,
          description: "Maximum number of zones to return (default 100).",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Number of zones to skip (default 0).",
        },
        type: {
          type: "string",
          description:
            "Optional type filter (e.g. 'Invasion', 'Disease'). Case-insensitive exact match.",
        },
        include_hidden: {
          type: "boolean",
          description:
            "If true, include zones the user has hidden via the Zones Editor. Default false.",
        },
      },
    },
    collectionKey: "zones",
    notReadyError:
      "Map is not ready yet; cannot list zones. Wait for the 'map:generated' event on window.",
    read: () => runtime.readZones(),
    parseFilters: (input) => {
      let typeFilter: string | null = null;
      let includeHidden = false;
      if (input.type !== undefined && input.type !== null) {
        if (typeof input.type !== "string" || !input.type.trim()) {
          return "type must be a non-empty string.";
        }
        typeFilter = input.type.trim().toLowerCase();
      }
      if (input.include_hidden !== undefined && input.include_hidden !== null) {
        if (typeof input.include_hidden !== "boolean") {
          return "include_hidden must be a boolean.";
        }
        includeHidden = input.include_hidden;
      }
      return { typeFilter, includeHidden };
    },
    applyFilters: (items, filters) => {
      let filtered = items;
      if (!filters.includeHidden) {
        filtered = filtered.filter((z) => !z.hidden);
      }
      if (filters.typeFilter !== null) {
        filtered = filtered.filter(
          (z) => (z.type ?? "").toLowerCase() === filters.typeFilter,
        );
      }
      return {
        items: filtered,
        echo: {
          filters: {
            type: filters.typeFilter,
            include_hidden: filters.includeHidden,
          },
        },
      };
    },
  });
}

export const listZonesTool = createListZonesTool();
