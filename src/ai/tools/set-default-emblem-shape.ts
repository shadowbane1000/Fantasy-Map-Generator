import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { CULTURE_SHIELDS } from "./set-culture-shield";

export const DIVERSIFORM_SHAPES = ["culture", "state", "random"] as const;

export const DEFAULT_EMBLEM_SHAPES: readonly string[] = Object.freeze([
  ...DIVERSIFORM_SHAPES,
  ...CULTURE_SHIELDS,
]);

const LOOKUP = new Map<string, string>();
for (const s of DEFAULT_EMBLEM_SHAPES) LOOKUP.set(s.toLowerCase(), s);

export function resolveEmblemShape(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  if (!key) return null;
  return LOOKUP.get(key) ?? null;
}

interface OptionsShape {
  emblemShape?: string;
}

export interface DefaultEmblemShapeRuntime {
  read(): string | null;
  apply(shape: string): void;
}

export const defaultDefaultEmblemShapeRuntime: DefaultEmblemShapeRuntime = {
  read() {
    const options = getGlobal<OptionsShape>("options");
    return resolveEmblemShape(options?.emblemShape);
  },
  apply(shape) {
    const options = getGlobal<OptionsShape>("options");
    if (options) options.emblemShape = shape;
    if (typeof document !== "undefined") {
      const el = document.getElementById(
        "emblemShape",
      ) as HTMLSelectElement | null;
      if (el) el.value = shape;
    }
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("emblemShape", shape);
    }
    try {
      getGlobal<(shape: string) => void>("changeEmblemShape")?.(shape);
    } catch {
      // Best-effort.
    }
  },
};

export function createSetDefaultEmblemShapeTool(
  runtime: DefaultEmblemShapeRuntime = defaultDefaultEmblemShapeRuntime,
): Tool {
  return {
    name: "set_default_emblem_shape",
    description: `Set the default emblem shape used by the map — the Options dialog's Emblem Shape selector. One of three diversiform modes — \`culture\` (default; each culture's shield is picked by culture), \`state\` (picked by state), \`random\` (random per culture) — or any specific shield shape (${CULTURE_SHIELDS.slice(0, 8).join(", ")}, … ~${CULTURE_SHIELDS.length} total). Delegates to window.changeEmblemShape(value) which cascades the new shape across every non-custom state / province / burg coa and re-renders the preview. Writes window.options.emblemShape + select DOM + localStorage. Idempotent. Complements \`set_culture_shield\` (per-culture) and \`regenerate_emblems\` (full rebuild).`,
    input_schema: {
      type: "object",
      properties: {
        shape: {
          type: "string",
          description: `One of: culture, state, random, or a specific shield (case-insensitive). Full list: ${DIVERSIFORM_SHAPES.join(", ")} + ${CULTURE_SHIELDS.length} specific shapes.`,
        },
      },
      required: ["shape"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { shape?: unknown };

      if (typeof input.shape !== "string" || !input.shape.trim()) {
        return errorResult("shape must be a non-empty string.", {
          supported: [...DEFAULT_EMBLEM_SHAPES],
        });
      }
      const canonical = resolveEmblemShape(input.shape);
      if (!canonical) {
        return errorResult(
          `Unknown emblem shape: ${JSON.stringify(input.shape)}.`,
          { supported: [...DEFAULT_EMBLEM_SHAPES] },
        );
      }

      const previous = runtime.read();
      if (previous === canonical) {
        return okResult({ shape: canonical, previous, noop: true });
      }

      try {
        runtime.apply(canonical);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({ shape: canonical, previous, noop: false });
    },
  };
}

export const setDefaultEmblemShapeTool = createSetDefaultEmblemShapeTool();
