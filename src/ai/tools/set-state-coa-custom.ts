import {
  errorResult,
  findEntityByRef,
  getPackCollection,
  okResult,
  parseEntityRef,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface SetStateCoaCustomRef {
  i: number;
  name: string;
  hasCoa: boolean;
  previousCustom: boolean;
}

export interface SetStateCoaCustomRuntime {
  find(ref: number | string): SetStateCoaCustomRef | null;
  apply(i: number, custom: boolean): void;
}

export const defaultSetStateCoaCustomRuntime: SetStateCoaCustomRuntime = {
  find(ref) {
    const entry = findEntityByRef(getPackCollection<RawState>("states"), ref);
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
    const states = getPackCollection<RawState>("states");
    const state = states?.[i];
    if (!state) throw new Error(`State ${i} not found.`);
    if (!state.coa) {
      throw new Error(`State ${i} has no coat of arms.`);
    }
    if (custom) {
      state.coa.custom = true;
    } else {
      delete state.coa.custom;
    }
  },
};

export function createSetStateCoaCustomTool(
  runtime: SetStateCoaCustomRuntime = defaultSetStateCoaCustomRuntime,
): Tool {
  return {
    name: "set_state_coa_custom",
    description: `Toggle the "custom" / "locked" flag on a state's coat of arms. When set, \`state.coa.custom\` marks the emblem as hand-crafted (the Emblem Editor sets this when you upload a custom SVG / raster, see \`public/modules/ui/emblems-editor.js\`). Bulk regenerators (\`regenerate_emblems\`) and the single-state regenerator (\`regenerate_state_coa\`) skip any emblem where \`coa.custom\` is truthy, and the renderer refuses to redraw it. Pass \`custom: true\` to set the flag and protect the emblem; pass \`custom: false\` to remove the flag so it gets regenerated next time. Requires an existing \`state.coa\` (use \`regenerate_state_coa\` first if the state has no emblem). Refuses state 0 (Neutrals), removed states, and states locked via \`set_entity_lock\`. Idempotent. Parallels \`set_burg_coa_custom\` for burgs.`,
    input_schema: {
      type: "object",
      properties: {
        state: {
          type: ["integer", "string"],
          description:
            "Numeric state id (> 0) or case-insensitive name. State 0 (Neutrals) is refused.",
        },
        custom: {
          type: "boolean",
          description:
            "true to mark the emblem as custom (protect from regeneration); false to clear the flag.",
        },
      },
      required: ["state", "custom"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        state?: unknown;
        custom?: unknown;
      };

      if (
        typeof input.state === "number" &&
        Number.isInteger(input.state) &&
        input.state <= 0
      ) {
        return errorResult(
          "Cannot set coa.custom on state 0 (the Neutrals placeholder).",
        );
      }
      const refResult = parseEntityRef(input.state, "state");
      if (!refResult.ok) return errorResult(refResult.error);

      if (typeof input.custom !== "boolean") {
        return errorResult("custom must be a boolean.");
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No state found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }

      if (!current.hasCoa) {
        return errorResult(
          `State ${current.i} has no coat of arms to lock. Generate one first via regenerate_state_coa.`,
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

export const setStateCoaCustomTool = createSetStateCoaCustomTool();
