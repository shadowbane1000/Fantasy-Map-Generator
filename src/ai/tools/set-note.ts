import { errorResult, getNotes, okResult, type RawNote } from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface NoteRef {
  id: string;
  name: string;
  legend: string;
  existed: boolean;
}

export interface NoteRuntime {
  find(id: string): NoteRef | null;
  write(id: string, name: string, legend: string): void;
}

function ensureNotesArray(): RawNote[] {
  let notes = getNotes<RawNote>();
  if (!Array.isArray(notes)) {
    const win = globalThis as { notes?: RawNote[] };
    win.notes = [];
    notes = win.notes;
  }
  return notes;
}

export const defaultNoteRuntime: NoteRuntime = {
  find(id: string): NoteRef | null {
    const notes = getNotes<RawNote>();
    const entry = notes?.find((n) => n?.id === id);
    if (!entry) return null;
    return {
      id,
      name: entry.name ?? "",
      legend: entry.legend ?? "",
      existed: true,
    };
  },
  write(id: string, name: string, legend: string): void {
    const notes = ensureNotesArray();
    const existing = notes.find((n) => n?.id === id);
    if (existing) {
      existing.name = name;
      existing.legend = legend;
      return;
    }
    notes.push({ id, name, legend });
  },
};

function isWhitespaceOnly(s: string): boolean {
  return s.length > 0 && s.trim().length === 0;
}

export function createSetNoteTool(
  runtime: NoteRuntime = defaultNoteRuntime,
): Tool {
  return {
    name: "set_note",
    description:
      "Create or update a note in window.notes — the same field the Notes Editor writes for ANY annotated entity (burgs, states, provinces, cultures, religions, markers, regiments, rivers, routes, lakes, battles, labels, zones). Upsert: if no note with the given id exists, one is created (requires name). Supply at least one of name / legend. Legend '' clears the text; whitespace-only is rejected.",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description:
            "The note id string (e.g. 'burg12', 'regiment1-2', 'state3'). Use list_notes to discover existing ids.",
        },
        name: {
          type: "string",
          description:
            "Display name. Required if the note doesn't exist yet; non-empty.",
        },
        legend: {
          type: "string",
          description:
            "Note body / lore. May contain plain text or HTML. Pass '' to clear. Whitespace-only values are rejected.",
        },
      },
      required: ["id"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        id?: unknown;
        name?: unknown;
        legend?: unknown;
      };

      if (typeof input.id !== "string" || !input.id.trim()) {
        return errorResult("id must be a non-empty string.");
      }
      const id = input.id.trim();

      const hasName = input.name !== undefined && input.name !== null;
      const hasLegend = input.legend !== undefined && input.legend !== null;

      if (!hasName && !hasLegend) {
        return errorResult(
          "At least one of 'name' or 'legend' must be provided.",
        );
      }

      let parsedName: string | null = null;
      if (hasName) {
        if (typeof input.name !== "string" || !input.name.trim()) {
          return errorResult("name, if provided, must be a non-empty string.");
        }
        parsedName = input.name.trim();
      }

      let parsedLegend: string | null = null;
      if (hasLegend) {
        if (typeof input.legend !== "string") {
          return errorResult("legend, if provided, must be a string.");
        }
        if (isWhitespaceOnly(input.legend)) {
          return errorResult(
            "legend must be empty ('') or contain non-whitespace characters.",
          );
        }
        parsedLegend = input.legend;
      }

      const current = runtime.find(id);
      if (!current && parsedName === null) {
        return errorResult(
          `Note ${JSON.stringify(id)} does not exist; provide 'name' to create it.`,
        );
      }

      const effectiveName = parsedName ?? current?.name ?? "";
      const effectiveLegend = parsedLegend ?? current?.legend ?? "";

      try {
        runtime.write(id, effectiveName, effectiveLegend);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        id,
        created: !current,
        previousName: current?.name ?? null,
        previousLegend: current?.legend ?? null,
        name: effectiveName,
        legend: effectiveLegend,
      });
    },
  };
}

export const setNoteTool = createSetNoteTool();
