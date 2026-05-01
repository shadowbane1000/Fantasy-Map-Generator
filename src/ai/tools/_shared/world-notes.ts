/**
 * Shared helpers for the world-note tool family (plan 370).
 *
 * World notes are entries in `window.notes` whose id follows the
 * reserved convention `world:<topic>`. They store top-level lore
 * about the world overall (premise, cosmology, pantheon, magic,
 * calendar, history) rather than per-entity legends. The set of
 * known canonical topics is the `WORLD_PREDEFINED_TOPICS` tuple
 * below; any other topic matching `WORLD_TOPIC_REGEX` is also
 * accepted as a user-defined world note.
 */

/**
 * Canonical predefined world-note topics, in the order they should
 * appear in `list_world_notes` results (predefined-first, then
 * user-defined alphabetical).
 */
export const WORLD_PREDEFINED_TOPICS = [
  "premise",
  "cosmology",
  "pantheon",
  "magic",
  "calendar",
  "history",
] as const;

export type WorldPredefinedTopic = (typeof WORLD_PREDEFINED_TOPICS)[number];

/**
 * A topic must:
 * - start with a lowercase letter (no leading digits, hyphens, or
 *   underscores),
 * - contain only lowercase alphanumerics, hyphens, or underscores
 *   thereafter,
 * - be 1–32 characters long.
 *
 * Rejects: empty, uppercase, leading digit, > 32 chars, whitespace,
 * colons (would collide with the `world:` prefix), other punctuation.
 */
export const WORLD_TOPIC_REGEX = /^[a-z][a-z0-9_-]{0,31}$/;

const WORLD_NOTE_PREFIX = "world:";

/** Build the raw note id for a given topic. */
export function worldNoteId(topic: string): string {
  return `${WORLD_NOTE_PREFIX}${topic}`;
}

/**
 * Default display name for a world note: `"World — <Topic>"` where
 * only the first character of the topic is upper-cased and the
 * remainder is left as-is (so e.g. `time-travel` →
 * `"World — Time-travel"`).
 */
export function defaultWorldNoteName(topic: string): string {
  if (topic.length === 0) return "World — ";
  return `World — ${topic[0]?.toUpperCase() ?? ""}${topic.slice(1)}`;
}

/**
 * If `rawId` is a well-formed world-note id, return the topic part;
 * otherwise return `null`. The topic must satisfy
 * `WORLD_TOPIC_REGEX` (so e.g. `world:` alone or `world:Bad` are
 * rejected).
 */
export function parseWorldNoteId(rawId: unknown): string | null {
  if (typeof rawId !== "string") return null;
  if (!rawId.startsWith(WORLD_NOTE_PREFIX)) return null;
  const topic = rawId.slice(WORLD_NOTE_PREFIX.length);
  return WORLD_TOPIC_REGEX.test(topic) ? topic : null;
}

/** Convenience: true iff `rawId` is a well-formed world-note id. */
export function isWorldNoteId(rawId: unknown): boolean {
  return parseWorldNoteId(rawId) !== null;
}

/** True iff `topic` is one of the canonical predefined topics. */
export function isPredefinedTopic(
  topic: string,
): topic is WorldPredefinedTopic {
  return (WORLD_PREDEFINED_TOPICS as readonly string[]).includes(topic);
}
