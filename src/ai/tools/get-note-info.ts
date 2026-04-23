import { errorResult, getNotes, okResult, type RawNote } from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface NoteInfo {
  id: string;
  name: string;
  legend: string;
}

export type ReadNoteInfoResult = NoteInfo | "not-ready" | "not-found";

export interface NoteInfoRuntime {
  readNote(id: string): ReadNoteInfoResult;
}

export const defaultNoteInfoRuntime: NoteInfoRuntime = {
  readNote(id: string): ReadNoteInfoResult {
    const notes = getNotes<RawNote>();
    if (!Array.isArray(notes)) return "not-ready";
    const entry = notes.find((n) => n?.id === id);
    if (!entry) return "not-found";
    return {
      id,
      name: typeof entry.name === "string" ? entry.name : "",
      legend: typeof entry.legend === "string" ? entry.legend : "",
    };
  },
};

export function createGetNoteInfoTool(
  runtime: NoteInfoRuntime = defaultNoteInfoRuntime,
): Tool {
  return {
    name: "get_note_info",
    description:
      "Read a single note from window.notes by its id string — the per-note parallel of list_notes / set_note / remove_note. Required `id` is the stringly-typed note id (e.g. 'burg12', 'state3', 'marker5', 'regiment1-2', 'province7', 'river4', 'zone2'). Returns `{ id, name, legend }` with the FULL raw legend — no HTML stripping, no truncation — which is the key difference vs. list_notes (HTML-stripped, default 300-char preview) and get_marker_info (marker-scoped, 2000-char cap with `legend_truncated: true` flag). `name` and `legend` fall back to the empty string when the stored fields are missing. Useful when you already know the id (from list_notes or from any get_*_info tool that reports a note id) and need the full verbatim HTML legend for display or further analysis. Errors when `id` is missing / empty / non-string, when window.notes is not initialized yet (wait for 'map:generated' and the notes bootstrap), or when no note matches the id. Read-only. Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description:
            "The note id to read (e.g. 'burg12', 'regiment1-2', 'state3'). Discover ids via list_notes.",
        },
      },
      required: ["id"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { id?: unknown };
      if (typeof input.id !== "string" || !input.id.trim()) {
        return errorResult("id must be a non-empty string.");
      }
      const id = input.id.trim();

      const result = runtime.readNote(id);
      if (result === "not-ready") {
        return errorResult(
          "Notes are not available yet; cannot read note. Wait for window.notes to be initialized.",
        );
      }
      if (result === "not-found") {
        return errorResult(`No note found matching ${JSON.stringify(id)}.`);
      }
      return okResult({ ...result });
    },
  };
}

export const getNoteInfoTool = createGetNoteInfoTool();
