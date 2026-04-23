import { errorResult, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export const ONLOAD_BEHAVIORS = ["random", "lastSaved"] as const;
export type OnloadBehavior = (typeof ONLOAD_BEHAVIORS)[number];

const ALIASES: Record<string, OnloadBehavior> = {
  random: "random",
  "random-map": "random",
  new: "random",
  "new-map": "random",
  generate: "random",
  "generate-random": "random",
  "generate-random-map": "random",
  lastsaved: "lastSaved",
  "last-saved": "lastSaved",
  last: "lastSaved",
  saved: "lastSaved",
  restore: "lastSaved",
  "restore-last": "lastSaved",
  "restore-last-map": "lastSaved",
  "open-last-saved-map": "lastSaved",
};

export function resolveOnloadBehavior(value: unknown): OnloadBehavior | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  if (!key) return null;
  return ALIASES[key] ?? null;
}

export interface SetOnloadBehaviorRuntime {
  readCurrent: () => string | null;
  apply: (value: string) => void;
}

export const defaultSetOnloadBehaviorRuntime: SetOnloadBehaviorRuntime = {
  readCurrent() {
    if (typeof document !== "undefined") {
      const el = document.getElementById(
        "onloadBehavior",
      ) as HTMLSelectElement | null;
      if (el?.value) return el.value;
    }
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem("onloadBehavior");
      if (stored) return stored;
    }
    return null;
  },
  apply(value) {
    try {
      if (typeof document !== "undefined") {
        const el = document.getElementById(
          "onloadBehavior",
        ) as HTMLSelectElement | null;
        if (el) el.value = value;
      }
    } catch {
      // Best-effort DOM update — keep going so localStorage still lands.
    }
    if (typeof localStorage === "undefined") {
      throw new Error("localStorage is not available.");
    }
    localStorage.setItem("onloadBehavior", value);
  },
};

export function createSetOnloadBehaviorTool(
  runtime: SetOnloadBehaviorRuntime = defaultSetOnloadBehaviorRuntime,
): Tool {
  return {
    name: "set_onload_behavior",
    description: `Control what the Generator does when the page is reloaded — the Options dialog's "Onload behavior" selector. One of: ${ONLOAD_BEHAVIORS.join(", ")}. \`random\` generates a fresh random map on every reload; \`lastSaved\` restores the last map saved to IndexedDB (falls back to generating one if none is stored). Aliases accepted: "new" / "generate" → random; "saved" / "last" / "restore" → lastSaved. Writes the #onloadBehavior select value (best-effort) and localStorage["onloadBehavior"] — the exact pair the UI persists via its data-stored handler. Idempotent.`,
    input_schema: {
      type: "object",
      properties: {
        behavior: {
          type: "string",
          enum: [...ONLOAD_BEHAVIORS],
          description: `One of: ${ONLOAD_BEHAVIORS.join(", ")} (case-insensitive; aliases like "new", "saved", "restore" accepted).`,
        },
      },
      required: ["behavior"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { behavior?: unknown };

      if (typeof input.behavior !== "string" || !input.behavior.trim()) {
        return errorResult("behavior must be a non-empty string.", {
          supported: [...ONLOAD_BEHAVIORS],
        });
      }
      const canonical = resolveOnloadBehavior(input.behavior);
      if (!canonical) {
        return errorResult(
          `Unknown onload behavior: ${JSON.stringify(input.behavior)}.`,
          { supported: [...ONLOAD_BEHAVIORS] },
        );
      }

      const previousBehavior = runtime.readCurrent();
      if (previousBehavior === canonical) {
        return okResult({
          behavior: canonical,
          previousBehavior,
          noop: true,
        });
      }

      try {
        runtime.apply(canonical);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        behavior: canonical,
        previousBehavior,
        noop: false,
      });
    },
  };
}

export const setOnloadBehaviorTool = createSetOnloadBehaviorTool();
