import {
  createPaginatedListTool,
  getNotes,
  getPack,
  type RawMarker,
  type RawNote,
} from "./_shared";
import type { Tool } from "./index";

export interface MarkerSummary {
  i: number;
  type: string | null;
  icon: string | null;
  name: string | null;
  legend: string | null;
  x: number;
  y: number;
  cell: number;
  pinned: boolean;
  lock: boolean;
}

export interface MarkerPackLike {
  markers?: RawMarker[];
}

export function readMarkersFromPack(
  pack: MarkerPackLike | undefined,
  notes: RawNote[] | undefined,
): MarkerSummary[] | null {
  if (!pack?.markers) return null;
  const noteById = new Map<string, RawNote>();
  for (const n of notes ?? []) {
    if (n && typeof n.id === "string") noteById.set(n.id, n);
  }
  return pack.markers
    .filter((m): m is RawMarker => !!m && !m.removed)
    .map((m): MarkerSummary => {
      const note = noteById.get(`marker${m.i}`);
      return {
        i: m.i,
        type: m.type ?? null,
        icon: m.icon ?? null,
        name: note?.name ?? null,
        legend: note?.legend ?? null,
        x: typeof m.x === "number" ? m.x : 0,
        y: typeof m.y === "number" ? m.y : 0,
        cell: typeof m.cell === "number" ? m.cell : 0,
        pinned: !!m.pinned,
        lock: !!m.lock,
      };
    });
}

export interface MarkersRuntime {
  readMarkers(): MarkerSummary[] | null;
}

export const defaultMarkersRuntime: MarkersRuntime = {
  readMarkers(): MarkerSummary[] | null {
    return readMarkersFromPack(getPack<MarkerPackLike>(), getNotes<RawNote>());
  },
};

interface MarkerFilters {
  typeFilter: string | null;
  pinnedOnly: boolean;
}

export function createListMarkersTool(
  runtime: MarkersRuntime = defaultMarkersRuntime,
): Tool {
  return createPaginatedListTool<MarkerSummary, MarkerFilters>({
    name: "list_markers",
    description:
      "List markers (points of interest — castles, battle sites, mines, etc.) on the current map. Each marker reports its id, type, icon, name and legend (from the Notes list), coordinates, cell, pinned and lock flags. Paginated (limit 1-500, default 100; offset >=0). Optional filters: type (exact match, case-insensitive) and pinned_only.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 500,
          description: "Maximum number of markers to return (default 100).",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Number of markers to skip (default 0).",
        },
        type: {
          type: "string",
          description:
            "Optional marker type filter (e.g. 'castle', 'battlefield'). Case-insensitive exact match.",
        },
        pinned_only: {
          type: "boolean",
          description: "If true, only include pinned markers.",
        },
      },
    },
    collectionKey: "markers",
    notReadyError:
      "Map is not ready yet; cannot list markers. Wait for the 'map:generated' event on window.",
    read: () => runtime.readMarkers(),
    parseFilters: (input) => {
      let typeFilter: string | null = null;
      let pinnedOnly = false;
      if (input.type !== undefined && input.type !== null) {
        if (typeof input.type !== "string" || !input.type.trim()) {
          return "type must be a non-empty string.";
        }
        typeFilter = input.type.trim().toLowerCase();
      }
      if (input.pinned_only !== undefined && input.pinned_only !== null) {
        if (typeof input.pinned_only !== "boolean") {
          return "pinned_only must be a boolean.";
        }
        pinnedOnly = input.pinned_only;
      }
      return { typeFilter, pinnedOnly };
    },
    applyFilters: (items, filters) => {
      let filtered = items;
      if (filters.typeFilter !== null) {
        filtered = filtered.filter(
          (m) => (m.type ?? "").toLowerCase() === filters.typeFilter,
        );
      }
      if (filters.pinnedOnly) {
        filtered = filtered.filter((m) => m.pinned);
      }
      return {
        items: filtered,
        echo: {
          filters: {
            type: filters.typeFilter,
            pinned_only: filters.pinnedOnly,
          },
        },
      };
    },
  });
}

export const listMarkersTool = createListMarkersTool();
