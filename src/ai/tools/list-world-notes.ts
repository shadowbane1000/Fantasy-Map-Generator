import { getNotes, okResult, type RawNote } from "./_shared";
import {
  isPredefinedTopic,
  parseWorldNoteId,
  WORLD_PREDEFINED_TOPICS,
} from "./_shared/world-notes";
import type { Tool, ToolResult } from "./index";

export interface WorldNoteSummary {
  topic: string;
  raw_id: string;
  name: string;
  legend_length: number;
  predefined: boolean;
}

export interface ListWorldNotesRuntime {
  readNotes(): RawNote[] | null;
}

export const defaultListWorldNotesRuntime: ListWorldNotesRuntime = {
  readNotes(): RawNote[] | null {
    return getNotes<RawNote>() ?? null;
  },
};

const PREDEFINED_INDEX: Map<string, number> = new Map(
  WORLD_PREDEFINED_TOPICS.map((t, i) => [t, i] as const),
);

export function collectWorldNotes(notes: RawNote[]): WorldNoteSummary[] {
  const summaries: WorldNoteSummary[] = [];
  for (const raw of notes) {
    const topic = parseWorldNoteId(raw?.id);
    if (topic === null) continue;
    const name = typeof raw.name === "string" ? raw.name : "";
    const legend = typeof raw.legend === "string" ? raw.legend : "";
    summaries.push({
      topic,
      raw_id: raw.id as string,
      name,
      legend_length: legend.length,
      predefined: isPredefinedTopic(topic),
    });
  }
  summaries.sort((a, b) => {
    if (a.predefined && b.predefined) {
      return (
        (PREDEFINED_INDEX.get(a.topic) ?? 0) -
        (PREDEFINED_INDEX.get(b.topic) ?? 0)
      );
    }
    if (a.predefined) return -1;
    if (b.predefined) return 1;
    return a.topic.localeCompare(b.topic);
  });
  return summaries;
}

export function createListWorldNotesTool(
  runtime: ListWorldNotesRuntime = defaultListWorldNotesRuntime,
): Tool {
  return {
    name: "list_world_notes",
    description:
      "List every world note currently stored in window.notes (id prefix 'world:'). Each entry reports the topic, raw_id, display name, legend_length (raw character count), and a `predefined` flag (true for premise / cosmology / pantheon / magic / calendar / history). Sort order: predefined topics in canonical order first, then user-defined topics alphabetically by topic. Returns count: 0 with no error when no world notes exist or window.notes is missing.",
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(): ToolResult {
      const notes = runtime.readNotes();
      if (!Array.isArray(notes)) {
        return okResult({ count: 0, notes: [] });
      }
      const summaries = collectWorldNotes(notes);
      return okResult({ count: summaries.length, notes: summaries });
    },
  };
}

export const listWorldNotesTool = createListWorldNotesTool();
