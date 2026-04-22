import { errorResult, getNotes, okResult, type RawNote } from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface RemoveNoteRef {
  id: string;
  name: string;
  legend: string;
}

export interface NoteRemovalRuntime {
  find(id: string): RemoveNoteRef | null;
  remove(id: string): void;
}

export const defaultNoteRemovalRuntime: NoteRemovalRuntime = {
  find(id: string): RemoveNoteRef | null {
    const notes = getNotes<RawNote>();
    const entry = notes?.find((n) => n?.id === id);
    if (!entry) return null;
    return {
      id,
      name: entry.name ?? "",
      legend: entry.legend ?? "",
    };
  },
  remove(id: string): void {
    const notes = getNotes<RawNote>();
    if (!Array.isArray(notes)) {
      throw new Error("window.notes is not available.");
    }
    const idx = notes.findIndex((n) => n?.id === id);
    if (idx < 0) {
      throw new Error(`Note ${JSON.stringify(id)} not found.`);
    }
    notes.splice(idx, 1);
  },
};

export function createRemoveNoteTool(
  runtime: NoteRemovalRuntime = defaultNoteRemovalRuntime,
): Tool {
  return {
    name: "remove_note",
    description:
      "Delete a note from window.notes — same side-effect as the Notes Editor's Remove button. The interactive confirm dialog is skipped (tools run non-interactively). Pass the note's id string (discover via list_notes); the entry is spliced out of the notes array in-place. Returns an error when the id doesn't exist, so callers know whether the removal actually happened.",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description:
            "The note id to remove (e.g. 'burg12', 'regiment1-2', 'state3').",
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

      const current = runtime.find(id);
      if (!current) {
        return errorResult(`No note found matching ${JSON.stringify(id)}.`);
      }

      try {
        runtime.remove(id);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        id: current.id,
        name: current.name,
        legend: current.legend,
      });
    },
  };
}

export const removeNoteTool = createRemoveNoteTool();
