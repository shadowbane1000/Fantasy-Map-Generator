import {
  errorResult,
  findEntityByRef,
  getPackCollection,
  okResult,
  parseEntityRef,
  type RawBurg,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface SetBurgCoaCustomRef {
  i: number;
  name: string;
  hasCoa: boolean;
  previousCustom: boolean;
}

export interface SetBurgCoaCustomRuntime {
  find(ref: number | string): SetBurgCoaCustomRef | null;
  apply(i: number, custom: boolean): void;
}

export const defaultSetBurgCoaCustomRuntime: SetBurgCoaCustomRuntime = {
  find(ref) {
    const entry = findEntityByRef(getPackCollection<RawBurg>("burgs"), ref);
    if (!entry) return null;
    if (entry.i <= 0) return null;
    if (entry.removed) return null;
    if (entry.lock) return null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      hasCoa: !!entry.coa,
      previousCustom: !!entry.coa?.custom,
    };
  },
  apply(i, custom) {
    const burgs = getPackCollection<RawBurg>("burgs");
    const burg = burgs?.[i];
    if (!burg) throw new Error(`Burg ${i} not found.`);
    if (!burg.coa) {
      throw new Error(`Burg ${i} has no coat of arms.`);
    }
    if (custom) {
      burg.coa.custom = true;
    } else {
      delete burg.coa.custom;
    }
  },
};

export function createSetBurgCoaCustomTool(
  runtime: SetBurgCoaCustomRuntime = defaultSetBurgCoaCustomRuntime,
): Tool {
  return {
    name: "set_burg_coa_custom",
    description: `Toggle the "custom" / "locked" flag on a burg's coat of arms. When set, \`burg.coa.custom\` marks the emblem as hand-crafted (the Emblem Editor sets this when you upload a custom SVG / raster, see \`public/modules/ui/emblems-editor.js\`). Bulk regenerators (\`regenerate_emblems\`), single-burg regenerators (\`regenerate_burg_coa\`), and culture-wide shield changes (\`set_culture_shield\`) all skip any emblem where \`coa.custom\` is truthy. Pass \`custom: true\` to set the flag and protect the emblem; pass \`custom: false\` to remove the flag so it gets regenerated next time. Requires an existing \`burg.coa\` (use \`regenerate_burg_coa\` first if the burg has no emblem). Refuses burg 0, removed burgs, and burgs locked via \`set_entity_lock\`. Idempotent.`,
    input_schema: {
      type: "object",
      properties: {
        burg: {
          type: ["integer", "string"],
          description: "Numeric burg id (> 0) or case-insensitive name.",
        },
        custom: {
          type: "boolean",
          description:
            "true to mark the emblem as custom (protect from regeneration); false to clear the flag.",
        },
      },
      required: ["burg", "custom"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        burg?: unknown;
        custom?: unknown;
      };

      const refResult = parseEntityRef(input.burg, "burg");
      if (!refResult.ok) return errorResult(refResult.error);

      if (typeof input.custom !== "boolean") {
        return errorResult("custom must be a boolean.");
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No burg found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }

      if (!current.hasCoa) {
        return errorResult(
          `Burg ${current.i} has no coat of arms to lock. Generate one first via regenerate_burg_coa.`,
        );
      }

      if (current.previousCustom === input.custom) {
        return okResult({
          i: current.i,
          name: current.name,
          previousCustom: current.previousCustom,
          custom: input.custom,
          noop: true,
        });
      }

      try {
        runtime.apply(current.i, input.custom);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        previousCustom: current.previousCustom,
        custom: input.custom,
        noop: false,
      });
    },
  };
}

export const setBurgCoaCustomTool = createSetBurgCoaCustomTool();
