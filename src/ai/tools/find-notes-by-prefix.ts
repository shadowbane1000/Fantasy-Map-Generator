import { errorResult, getNotes, okResult, type RawNote } from "./_shared";
import type { Tool, ToolResult } from "./index";

export const DEFAULT_FIND_NOTES_BY_PREFIX_LIMIT = 1000;
export const MAX_FIND_NOTES_BY_PREFIX_LIMIT = 10000;
export const NOTE_LEGEND_PREVIEW_MAX = 200;

export interface NoteMatch {
  id: string;
  name: string;
  legend: string;
  legend_truncated: boolean;
}

export interface FindNotesByPrefixPayload {
  notes: NoteMatch[];
  count: number;
}

export interface FindNotesByPrefixRuntime {
  readNotes(): RawNote[] | null;
}

export const defaultFindNotesByPrefixRuntime: FindNotesByPrefixRuntime = {
  readNotes(): RawNote[] | null {
    return getNotes<RawNote>() ?? null;
  },
};

function previewLegend(raw: unknown): {
  legend: string;
  legend_truncated: boolean;
} {
  if (typeof raw !== "string") return { legend: "", legend_truncated: false };
  if (raw.length <= NOTE_LEGEND_PREVIEW_MAX) {
    return { legend: raw, legend_truncated: false };
  }
  return {
    legend: `${raw.slice(0, NOTE_LEGEND_PREVIEW_MAX)}…`,
    legend_truncated: true,
  };
}

/**
 * Pure collector — iterates `notes`, returning every entry whose `id` starts
 * (case-insensitively) with `prefix`. `limit` caps the returned array but
 * `count` reports the full unlimited total of matches.
 */
export function findNotesByPrefixInNotes(
  notes: RawNote[],
  prefix: string,
  limit: number,
): FindNotesByPrefixPayload {
  const needle = prefix.toLowerCase();
  const matched: NoteMatch[] = [];
  let count = 0;
  for (const raw of notes) {
    const id = raw?.id;
    if (typeof id !== "string") continue;
    if (!id.toLowerCase().startsWith(needle)) continue;
    count += 1;
    if (matched.length >= limit) continue;
    const name = typeof raw.name === "string" ? raw.name : "";
    const { legend, legend_truncated } = previewLegend(raw.legend);
    matched.push({ id, name, legend, legend_truncated });
  }
  return { notes: matched, count };
}

function parseLimit(value: unknown): number | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_NOTES_BY_PREFIX_LIMIT;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_FIND_NOTES_BY_PREFIX_LIMIT
  ) {
    return `limit must be an integer in [1, ${MAX_FIND_NOTES_BY_PREFIX_LIMIT}].`;
  }
  return value;
}

export function createFindNotesByPrefixTool(
  runtime: FindNotesByPrefixRuntime = defaultFindNotesByPrefixRuntime,
): Tool {
  return {
    name: "find_notes_by_prefix",
    description:
      "List every note in window.notes whose id starts with a given prefix (case-insensitive). Notes have stringly-typed ids like 'burg5', 'state3', 'marker12', 'province7', 'regiment1-2', 'river4', 'zone2' — a prefix filter lets you enumerate 'every state note' (prefix: 'state') or 'every marker note' (prefix: 'marker') efficiently. This is the prefix-scoped companion to `list_notes` (which enumerates ALL notes, paginated, with coarse type-bucket filtering) and to `get_note_info` (which reads a single note by exact id). Required `prefix` is a non-empty string; matching is case-insensitive. Optional `limit` caps the returned `notes` array (default 1000, max 10000) — `count` still reports the full unlimited total. Each entry is `{id, name, legend, legend_truncated}`: `legend` is the raw stored legend truncated to 200 chars with trailing '…' when longer (no HTML stripping — contrasts with `list_notes`'s stripped preview); `legend_truncated` is the boolean flag. `name`/`legend` default to '' when the stored field is missing. Errors when `prefix` is missing / empty / non-string, when `window.notes` is not initialized yet (wait for 'map:generated' and the notes bootstrap), or when `limit` is out of range. Read-only. Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        prefix: {
          type: "string",
          description:
            "Required prefix to match against each note id (case-insensitive, trimmed). Examples: 'burg', 'state', 'marker', 'province', 'regiment', 'river', 'route', 'lake', 'battle', 'label', 'zone', 'religion', 'culture'.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_FIND_NOTES_BY_PREFIX_LIMIT,
          description: `Maximum number of notes to return (default ${DEFAULT_FIND_NOTES_BY_PREFIX_LIMIT}, max ${MAX_FIND_NOTES_BY_PREFIX_LIMIT}). The 'count' field reports the full unlimited total.`,
        },
      },
      required: ["prefix"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        prefix?: unknown;
        limit?: unknown;
      };

      if (typeof input.prefix !== "string" || !input.prefix.trim()) {
        return errorResult("prefix must be a non-empty string.");
      }
      const prefix = input.prefix.trim().toLowerCase();

      const limitOrError = parseLimit(input.limit);
      if (typeof limitOrError === "string") {
        return errorResult(limitOrError);
      }
      const limit = limitOrError;

      const notes = runtime.readNotes();
      if (notes === null) {
        return errorResult(
          "Notes are not available yet; cannot find notes. Wait for window.notes to be initialized.",
        );
      }

      const { notes: matched, count } = findNotesByPrefixInNotes(
        notes,
        prefix,
        limit,
      );
      return okResult({ prefix, notes: matched, count });
    },
  };
}

export const findNotesByPrefixTool = createFindNotesByPrefixTool();
