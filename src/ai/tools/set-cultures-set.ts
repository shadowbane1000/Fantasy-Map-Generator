import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export const CULTURES_SETS = [
  "world",
  "european",
  "oriental",
  "english",
  "antique",
  "highFantasy",
  "darkFantasy",
  "random",
] as const;

export type CulturesSet = (typeof CULTURES_SETS)[number];

const LOOKUP = new Map<string, CulturesSet>();
for (const s of CULTURES_SETS) LOOKUP.set(s.toLowerCase(), s);
// Aliases
LOOKUP.set("all-world", "world");
LOOKUP.set("all", "world");
LOOKUP.set("high fantasy", "highFantasy");
LOOKUP.set("high-fantasy", "highFantasy");
LOOKUP.set("highfantasy", "highFantasy");
LOOKUP.set("dark fantasy", "darkFantasy");
LOOKUP.set("dark-fantasy", "darkFantasy");
LOOKUP.set("darkfantasy", "darkFantasy");

export function resolveCulturesSet(value: unknown): CulturesSet | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  if (!key) return null;
  return LOOKUP.get(key) ?? null;
}

export interface CulturesSetRuntime {
  read(): CulturesSet | null;
  apply(value: CulturesSet): void;
}

export const defaultCulturesSetRuntime: CulturesSetRuntime = {
  read() {
    if (typeof document === "undefined") return null;
    const el = document.getElementById(
      "culturesSet",
    ) as HTMLSelectElement | null;
    if (!el) return null;
    return resolveCulturesSet(el.value);
  },
  apply(value) {
    if (typeof document !== "undefined") {
      const el = document.getElementById(
        "culturesSet",
      ) as HTMLSelectElement | null;
      if (el) el.value = value;
    }
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("culturesSet", value);
    }
    try {
      getGlobal<() => void>("changeCultureSet")?.();
    } catch {
      // Best-effort: the UI recomputes the cap on next interaction.
    }
  },
};

export function createSetCulturesSetTool(
  runtime: CulturesSetRuntime = defaultCulturesSetRuntime,
): Tool {
  return {
    name: "set_cultures_set",
    description: `Switch the Cultures Set — the Options dialog's selector that chooses which culture / name-base pool the generator draws from. One of: ${CULTURES_SETS.join(", ")} (case-insensitive; accepts aliases like "all-world", "high fantasy", "dark fantasy"). Writes the select's value and localStorage, then best-effort calls window.changeCultureSet() so the Cultures number cap is reapplied. Passive — the switch affects the next regenerate_map. Idempotent.`,
    input_schema: {
      type: "object",
      properties: {
        cultures_set: {
          type: "string",
          enum: [...CULTURES_SETS],
          description: `One of: ${CULTURES_SETS.join(", ")} (case-insensitive; aliases accepted).`,
        },
      },
      required: ["cultures_set"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { cultures_set?: unknown };

      if (
        typeof input.cultures_set !== "string" ||
        !input.cultures_set.trim()
      ) {
        return errorResult("cultures_set must be a non-empty string.", {
          supported: [...CULTURES_SETS],
        });
      }
      const canonical = resolveCulturesSet(input.cultures_set);
      if (!canonical) {
        return errorResult(
          `Unknown cultures set: ${JSON.stringify(input.cultures_set)}.`,
          { supported: [...CULTURES_SETS] },
        );
      }

      const previous = runtime.read();
      if (previous === canonical) {
        return okResult({
          cultures_set: canonical,
          previous,
          noop: true,
        });
      }

      try {
        runtime.apply(canonical);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        cultures_set: canonical,
        previous,
        noop: false,
      });
    },
  };
}

export const setCulturesSetTool = createSetCulturesSetTool();
