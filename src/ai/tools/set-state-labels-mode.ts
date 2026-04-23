import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export const STATE_LABELS_MODES = ["auto", "short", "full"] as const;

export type StateLabelsMode = (typeof STATE_LABELS_MODES)[number];

const LOOKUP = new Map<string, StateLabelsMode>();
for (const m of STATE_LABELS_MODES) LOOKUP.set(m.toLowerCase(), m);

export function resolveStateLabelsMode(value: unknown): StateLabelsMode | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  if (!key) return null;
  return LOOKUP.get(key) ?? null;
}

interface OptionsShape {
  stateLabelsMode?: string;
}

export interface StateLabelsModeRuntime {
  read(): StateLabelsMode | null;
  apply(mode: StateLabelsMode): void;
}

export const defaultStateLabelsModeRuntime: StateLabelsModeRuntime = {
  read() {
    const options = getGlobal<OptionsShape>("options");
    return resolveStateLabelsMode(options?.stateLabelsMode);
  },
  apply(mode) {
    const options = getGlobal<OptionsShape>("options");
    if (options) options.stateLabelsMode = mode;
    if (typeof document !== "undefined") {
      const el = document.getElementById(
        "stateLabelsModeInput",
      ) as HTMLSelectElement | null;
      if (el) el.value = mode;
    }
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("stateLabelsMode", mode);
    }
    try {
      getGlobal<() => void>("drawStateLabels")?.();
    } catch {
      // Best-effort.
    }
  },
};

export function createSetStateLabelsModeTool(
  runtime: StateLabelsModeRuntime = defaultStateLabelsModeRuntime,
): Tool {
  return {
    name: "set_state_labels_mode",
    description: `Pick how state labels are rendered — the State Labels selector in the Options dialog. One of: ${STATE_LABELS_MODES.join(", ")}. \`auto\` lets the generator pick short vs full per state by length; \`short\` forces state.name; \`full\` forces state.fullName. Writes window.options.stateLabelsMode, the select DOM, and localStorage, then best-effort calls drawStateLabels() to refresh labels. Idempotent.`,
    input_schema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: [...STATE_LABELS_MODES],
          description: `One of: ${STATE_LABELS_MODES.join(", ")} (case-insensitive).`,
        },
      },
      required: ["mode"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { mode?: unknown };

      if (typeof input.mode !== "string" || !input.mode.trim()) {
        return errorResult("mode must be a non-empty string.", {
          supported: [...STATE_LABELS_MODES],
        });
      }
      const canonical = resolveStateLabelsMode(input.mode);
      if (!canonical) {
        return errorResult(
          `Unknown state labels mode: ${JSON.stringify(input.mode)}.`,
          { supported: [...STATE_LABELS_MODES] },
        );
      }

      const previous = runtime.read();
      if (previous === canonical) {
        return okResult({ mode: canonical, previous, noop: true });
      }

      try {
        runtime.apply(canonical);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({ mode: canonical, previous, noop: false });
    },
  };
}

export const setStateLabelsModeTool = createSetStateLabelsModeTool();
