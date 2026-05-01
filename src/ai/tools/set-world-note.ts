import { errorResult, getNotes, okResult, type RawNote } from "./_shared";
import {
  defaultWorldNoteName,
  WORLD_PREDEFINED_TOPICS,
  WORLD_TOPIC_REGEX,
  worldNoteId,
} from "./_shared/world-notes";
import type { Tool, ToolResult } from "./index";

export interface WorldNoteRef {
  topic: string;
  rawId: string;
  name: string;
  legend: string;
  existed: boolean;
}

export interface SetWorldNoteRuntime {
  find(rawId: string): WorldNoteRef | null;
  write(rawId: string, name: string, legend: string): void;
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

export const defaultSetWorldNoteRuntime: SetWorldNoteRuntime = {
  find(rawId: string): WorldNoteRef | null {
    const notes = getNotes<RawNote>();
    const entry = notes?.find((n) => n?.id === rawId);
    if (!entry) return null;
    const topic = rawId.slice("world:".length);
    return {
      topic,
      rawId,
      name: entry.name ?? "",
      legend: entry.legend ?? "",
      existed: true,
    };
  },
  write(rawId: string, name: string, legend: string): void {
    const notes = ensureNotesArray();
    const existing = notes.find((n) => n?.id === rawId);
    if (existing) {
      existing.name = name;
      existing.legend = legend;
      return;
    }
    notes.push({ id: rawId, name, legend });
  },
};

function isWhitespaceOnly(s: string): boolean {
  return s.length > 0 && s.trim().length === 0;
}

export function createSetWorldNoteTool(
  runtime: SetWorldNoteRuntime = defaultSetWorldNoteRuntime,
): Tool {
  return {
    name: "set_world_note",
    description:
      "Create or update a 'world note' — a top-level lore document describing the world overall (premise, cosmology, pantheon, magic, calendar, history, or any user-defined topic). World notes are stored in window.notes under the reserved id 'world:<topic>', so they survive save/load like any other note. The AI passes the topic name only — the 'world:' prefix is added internally. Required `topic` must match ^[a-z][a-z0-9_-]{0,31}$ (lowercase, starts with a letter, 1–32 chars). Required `legend` is the note body (plain text or HTML); '' clears it; whitespace-only is rejected. Optional `name` overrides the auto-derived display name 'World — <Topic>'. Returns the raw_id, previous_legend (null if newly created), and final name + legend.",
    input_schema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: `World-note topic. Must match ^[a-z][a-z0-9_-]{0,31}$. Predefined topics: ${WORLD_PREDEFINED_TOPICS.join(", ")}. Arbitrary topics (e.g. 'factions', 'languages') are also accepted.`,
        },
        legend: {
          type: "string",
          description:
            "Note body / lore. Plain text or HTML. Pass '' to clear. Whitespace-only values are rejected.",
        },
        name: {
          type: "string",
          description:
            "Optional display name. Defaults to 'World — <Topic>' (first letter capitalized).",
        },
      },
      required: ["topic", "legend"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        topic?: unknown;
        legend?: unknown;
        name?: unknown;
      };

      if (typeof input.topic !== "string" || input.topic.length === 0) {
        return errorResult("topic must be a non-empty string.");
      }
      const topic = input.topic;
      if (!WORLD_TOPIC_REGEX.test(topic)) {
        return errorResult("topic must match ^[a-z][a-z0-9_-]{0,31}$.");
      }

      if (typeof input.legend !== "string") {
        return errorResult("legend must be a string.");
      }
      if (isWhitespaceOnly(input.legend)) {
        return errorResult(
          "legend must be empty ('') or contain non-whitespace characters.",
        );
      }
      const legend = input.legend;

      let name: string;
      if (input.name === undefined || input.name === null) {
        name = defaultWorldNoteName(topic);
      } else if (typeof input.name !== "string" || !input.name.trim()) {
        return errorResult("name, if provided, must be a non-empty string.");
      } else {
        name = input.name.trim();
      }

      const rawId = worldNoteId(topic);
      const current = runtime.find(rawId);

      try {
        runtime.write(rawId, name, legend);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        topic,
        raw_id: rawId,
        previous_legend: current?.legend ?? null,
        legend,
        name,
      });
    },
  };
}

export const setWorldNoteTool = createSetWorldNoteTool();
