import { errorResult, getNotes, okResult, type RawNote } from "./_shared";
import {
  WORLD_PREDEFINED_TOPICS,
  WORLD_TOPIC_REGEX,
  worldNoteId,
} from "./_shared/world-notes";
import type { Tool, ToolResult } from "./index";

export interface WorldNoteInfo {
  topic: string;
  rawId: string;
  name: string;
  legend: string;
}

export interface GetWorldNoteRuntime {
  read(rawId: string): WorldNoteInfo | null;
}

export const defaultGetWorldNoteRuntime: GetWorldNoteRuntime = {
  read(rawId: string): WorldNoteInfo | null {
    const notes = getNotes<RawNote>();
    if (!Array.isArray(notes)) return null;
    const entry = notes.find((n) => n?.id === rawId);
    if (!entry) return null;
    const topic = rawId.slice("world:".length);
    return {
      topic,
      rawId,
      name: typeof entry.name === "string" ? entry.name : "",
      legend: typeof entry.legend === "string" ? entry.legend : "",
    };
  },
};

export function createGetWorldNoteTool(
  runtime: GetWorldNoteRuntime = defaultGetWorldNoteRuntime,
): Tool {
  return {
    name: "get_world_note",
    description:
      "Read a single world note (top-level lore: premise / cosmology / pantheon / magic / calendar / history, or any user-defined topic). Pass the topic name only — the 'world:' prefix is added internally. If no note exists for that topic (or window.notes hasn't been initialized yet), returns ok with `exists: false` rather than erroring — world notes are user-authored, so an empty store is the normal pre-write state. Returns the full raw legend (no HTML stripping, no truncation). Read-only.",
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
      const found = runtime.read(rawId);
      if (!found) {
        return okResult({ topic, raw_id: rawId, exists: false });
      }
      return okResult({
        topic,
        raw_id: rawId,
        name: found.name,
        legend: found.legend,
      });
    },
  };
}

export const getWorldNoteTool = createGetWorldNoteTool();
