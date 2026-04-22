import { createPaginatedListTool, getNotes, type RawNote } from "./_shared";
import type { Tool } from "./index";

export type NoteType =
  | "burg"
  | "state"
  | "province"
  | "culture"
  | "religion"
  | "marker"
  | "regiment"
  | "river"
  | "route"
  | "lake"
  | "battle"
  | "label"
  | "zone"
  | "other";

export interface NoteSummary {
  id: string;
  type: NoteType;
  name: string;
  legend: string;
  legend_truncated: boolean;
  legend_length: number;
}

// Ordered longest-first so "religion12" doesn't match "region" etc.
const KNOWN_PREFIXES: NoteType[] = [
  "regiment",
  "religion",
  "province",
  "culture",
  "battle",
  "marker",
  "label",
  "route",
  "state",
  "river",
  "lake",
  "burg",
  "zone",
];

export function classifyNoteId(id: unknown): NoteType {
  if (typeof id !== "string" || id.length === 0) return "other";
  for (const prefix of KNOWN_PREFIXES) {
    if (id.startsWith(prefix)) return prefix;
  }
  return "other";
}

export function stripHtml(s: unknown): string {
  if (typeof s !== "string") return "";
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface NotesRuntime {
  readNotes(): RawNote[] | null;
}

export const defaultNotesRuntime: NotesRuntime = {
  readNotes(): RawNote[] | null {
    return getNotes<RawNote>() ?? null;
  },
};

const DEFAULT_PREVIEW = 300;
const MAX_PREVIEW = 5000;

interface NoteFilters {
  typeFilter: string | null;
  searchNeedle: string | null;
  fullLegend: boolean;
  maxLegendLength: number;
}

function renderSummary(
  raw: RawNote,
  options: { fullLegend: boolean; maxLegendLength: number },
): NoteSummary {
  const id = raw.id ?? "";
  const name = raw.name ?? "";
  const rawLegend = typeof raw.legend === "string" ? raw.legend : "";
  const legendLength = rawLegend.length;
  let legend: string;
  let truncated = false;
  if (options.fullLegend) {
    legend = rawLegend;
  } else {
    const stripped = stripHtml(rawLegend);
    if (stripped.length > options.maxLegendLength) {
      legend = `${stripped.slice(0, options.maxLegendLength)}…`;
      truncated = true;
    } else {
      legend = stripped;
    }
  }
  return {
    id,
    type: classifyNoteId(id),
    name,
    legend,
    legend_truncated: truncated,
    legend_length: legendLength,
  };
}

export function createListNotesTool(
  runtime: NotesRuntime = defaultNotesRuntime,
): Tool {
  return createPaginatedListTool<RawNote, NoteFilters>({
    name: "list_notes",
    description:
      "List every note attached to any entity in window.notes (burgs, states, provinces, cultures, religions, markers, regiments, rivers, routes, lakes, battles, labels, zones). Each entry reports id, derived `type` (from the id prefix), name, and a legend preview. By default the legend is HTML-stripped and truncated to 300 characters; pass full_legend:true to receive the raw legend HTML. Paginated. Optional filters: type (case-insensitive prefix match), search (substring match, case-insensitive, against name + legend), max_legend_length (override the default preview length, 1-5000).",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 500,
          description: "Maximum number of notes to return (default 100).",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Number of notes to skip (default 0).",
        },
        type: {
          type: "string",
          description:
            "Optional type filter — matches the id prefix: burg, state, province, culture, religion, marker, regiment, river, route, lake, battle, label, zone, or other.",
        },
        search: {
          type: "string",
          description:
            "Optional case-insensitive substring search against the note's name and legend (after HTML strip).",
        },
        full_legend: {
          type: "boolean",
          description:
            "If true, return the raw legend HTML instead of the truncated plain-text preview.",
        },
        max_legend_length: {
          type: "integer",
          minimum: 1,
          maximum: 5000,
          description:
            "Override the preview length (default 300, ignored when full_legend is true).",
        },
      },
    },
    collectionKey: "notes",
    notReadyError:
      "Notes are not available yet; cannot list notes. Wait for window.notes to be initialized.",
    read: () => runtime.readNotes(),
    parseFilters: (input) => {
      let typeFilter: string | null = null;
      let searchNeedle: string | null = null;
      let fullLegend = false;
      let maxLegendLength = DEFAULT_PREVIEW;
      if (input.type !== undefined && input.type !== null) {
        if (typeof input.type !== "string" || !input.type.trim())
          return "type must be a non-empty string.";
        typeFilter = input.type.trim().toLowerCase();
      }
      if (input.search !== undefined && input.search !== null) {
        if (typeof input.search !== "string" || !input.search.trim())
          return "search must be a non-empty string.";
        searchNeedle = input.search.trim().toLowerCase();
      }
      if (input.full_legend !== undefined && input.full_legend !== null) {
        if (typeof input.full_legend !== "boolean")
          return "full_legend must be a boolean.";
        fullLegend = input.full_legend;
      }
      if (
        input.max_legend_length !== undefined &&
        input.max_legend_length !== null
      ) {
        if (
          typeof input.max_legend_length !== "number" ||
          !Number.isInteger(input.max_legend_length) ||
          input.max_legend_length < 1 ||
          input.max_legend_length > MAX_PREVIEW
        ) {
          return `max_legend_length must be an integer in [1, ${MAX_PREVIEW}].`;
        }
        maxLegendLength = input.max_legend_length;
      }
      return { typeFilter, searchNeedle, fullLegend, maxLegendLength };
    },
    applyFilters: (items, filters) => {
      let filtered = items;
      if (filters.typeFilter !== null) {
        const want = filters.typeFilter;
        filtered = filtered.filter((n) => classifyNoteId(n.id) === want);
      }
      if (filters.searchNeedle !== null) {
        const needle = filters.searchNeedle;
        filtered = filtered.filter((n) => {
          const name = (n.name ?? "").toLowerCase();
          const legendPlain = stripHtml(n.legend).toLowerCase();
          return name.includes(needle) || legendPlain.includes(needle);
        });
      }
      const rendered: NoteSummary[] = filtered.map((n) =>
        renderSummary(n, {
          fullLegend: filters.fullLegend,
          maxLegendLength: filters.maxLegendLength,
        }),
      );
      return {
        items: rendered as unknown as RawNote[],
        echo: {
          filters: {
            type: filters.typeFilter,
            search: filters.searchNeedle,
            full_legend: filters.fullLegend,
            max_legend_length: filters.maxLegendLength,
          },
        },
      };
    },
  });
}

export const listNotesTool = createListNotesTool();
