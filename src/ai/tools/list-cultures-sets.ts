import { okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { CULTURES_SETS, type CulturesSet } from "./set-cultures-set";

export interface CulturesSetEntry {
  id: CulturesSet;
  name: string;
}

export function cultureSetDisplayName(id: CulturesSet): string {
  if (id === "highFantasy") return "High Fantasy";
  if (id === "darkFantasy") return "Dark Fantasy";
  return id.charAt(0).toUpperCase() + id.slice(1);
}

export function listCulturesSetsEntries(): CulturesSetEntry[] {
  return CULTURES_SETS.map((id) => ({ id, name: cultureSetDisplayName(id) }));
}

export function createListCulturesSetsTool(): Tool {
  return {
    name: "list_cultures_sets",
    description: `List every valid Cultures Set identifier accepted by \`set_cultures_set\` — the Options dialog's selector that chooses which culture / name-base pool the generator draws from. Returns the 8 canonical keys (${CULTURES_SETS.join(", ")}) as \`{id, name}\` entries; \`name\` is the human-friendly label (e.g. \`highFantasy\` → "High Fantasy", \`darkFantasy\` → "Dark Fantasy"). Order matches the Options dialog's Cultures Set selector. Aliases ("all-world", "high fantasy", "dark-fantasy", …) are accepted by \`set_cultures_set\` but only canonical ids are listed here. Read-only — the discovery companion to \`set_cultures_set\`. Requires an Anthropic API key (see "Getting an API key" below).`,
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      const sets = listCulturesSetsEntries();
      return okResult({ sets, count: sets.length });
    },
  };
}

export const listCulturesSetsTool = createListCulturesSetsTool();
