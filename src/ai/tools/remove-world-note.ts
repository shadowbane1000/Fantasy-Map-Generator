import { errorResult, getNotes, okResult, type RawNote } from "./_shared";
import {
  WORLD_PREDEFINED_TOPICS,
  WORLD_TOPIC_REGEX,
  worldNoteId,
} from "./_shared/world-notes";
import type { Tool, ToolResult } from "./index";

export interface RemoveWorldNoteRuntime {
  remove(rawId: string): boolean;
}

export const defaultRemoveWorldNoteRuntime: RemoveWorldNoteRuntime = {
  remove(rawId: string): boolean {
    const notes = getNotes<RawNote>();
    if (!Array.isArray(notes)) return false;
    const idx = notes.findIndex((n) => n?.id === rawId);
    if (idx < 0) return false;
    notes.splice(idx, 1);
    return true;
  },
};

export function createRemoveWorldNoteTool(
  runtime: RemoveWorldNoteRuntime = defaultRemoveWorldNoteRuntime,
): Tool {
  return {
    name: "remove_world_note",
    description:
      "Delete a world note (top-level lore document) by topic. Pass the topic name only — the 'world:' prefix is added internally. Idempotent: returns ok with `removed: false` when no note exists for the topic (or when window.notes is missing). The returned `removed` flag tells you whether anything was actually spliced out.",
    input_schema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: `World-note topic. Must match ^[a-z][a-z0-9_-]{0,31}$. Predefined topics: ${WORLD_PREDEFINED_TOPICS.join(", ")}.`,
        },
      },
      required: ["topic"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { topic?: unknown };
      if (typeof input.topic !== "string" || input.topic.length === 0) {
        return errorResult("topic must be a non-empty string.");
      }
      const topic = input.topic;
      if (!WORLD_TOPIC_REGEX.test(topic)) {
        return errorResult("topic must match ^[a-z][a-z0-9_-]{0,31}$.");
      }

      const rawId = worldNoteId(topic);
      let removed: boolean;
      try {
        removed = runtime.remove(rawId);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
      return okResult({ topic, raw_id: rawId, removed });
    },
  };
}

export const removeWorldNoteTool = createRemoveWorldNoteTool();
