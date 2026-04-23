import {
  errorResult,
  findEntityByRef,
  getGlobal,
  getPackCollection,
  okResult,
  parseEntityRef,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export const STATE_NAME_MODES = ["culture", "random"] as const;

export type StateNameMode = (typeof STATE_NAME_MODES)[number];

const LOOKUP = new Map<string, StateNameMode>();
for (const m of STATE_NAME_MODES) LOOKUP.set(m.toLowerCase(), m);

export function resolveStateNameMode(value: unknown): StateNameMode | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  if (!key) return null;
  return LOOKUP.get(key) ?? null;
}

export interface RegenerateStateNameRef {
  i: number;
  name: string;
  culture: number;
}

export interface RegenerateStateNameRuntime {
  find(ref: number | string): RegenerateStateNameRef | null;
  generate(mode: StateNameMode, culture: number): string;
  apply(i: number, name: string): void;
}

interface NamesModule {
  getState?: (base: string, culture?: number, baseIndex?: number) => string;
  getCultureShort?: (culture: number) => string;
  getBase?: (base: number) => string;
}

export const defaultRegenerateStateNameRuntime: RegenerateStateNameRuntime = {
  find(ref) {
    const entry = findEntityByRef(getPackCollection<RawState>("states"), ref);
    if (!entry) return null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      culture: typeof entry.culture === "number" ? entry.culture : 0,
    };
  },
  generate(mode, culture) {
    const names = getGlobal<NamesModule>("Names");
    if (!names || typeof names.getState !== "function") {
      throw new Error(
        "Names.getState is not available yet; the map hasn't finished loading.",
      );
    }
    if (mode === "culture") {
      if (typeof names.getCultureShort !== "function") {
        throw new Error("Names.getCultureShort is not available.");
      }
      return names.getState(names.getCultureShort(culture), culture);
    }
    if (typeof names.getBase !== "function") {
      throw new Error("Names.getBase is not available.");
    }
    const nameBases = getGlobal<unknown[]>("nameBases");
    if (!Array.isArray(nameBases) || nameBases.length === 0) {
      throw new Error("nameBases is not available or empty.");
    }
    const baseIndex = Math.floor(Math.random() * nameBases.length);
    return names.getState(names.getBase(baseIndex), undefined, baseIndex);
  },
  apply(i, name) {
    const states = getPackCollection<RawState>("states");
    const state = states?.[i];
    if (!state) throw new Error(`State ${i} not found.`);
    state.name = name;
    try {
      getGlobal<(ids: number[]) => void>("drawStateLabels")?.([i]);
    } catch {
      // Best-effort.
    }
  },
};

export function createRegenerateStateNameTool(
  runtime: RegenerateStateNameRuntime = defaultRegenerateStateNameRuntime,
): Tool {
  return {
    name: "regenerate_state_name",
    description: `Roll a fresh short name for a state — same side-effect as the States Editor's name regenerate buttons. \`mode=culture\` (default) calls Names.getState(Names.getCultureShort(state.culture), state.culture); \`mode=random\` picks a random name-base and calls Names.getState(Names.getBase(base), undefined, base). Writes state.name and best-effort calls drawStateLabels([i]) to refresh the label. Rejects Neutrals (state 0). Matches by id or case-insensitive name / fullName.`,
    input_schema: {
      type: "object",
      properties: {
        state: {
          type: ["integer", "string"],
          description:
            "Numeric state id (> 0) or case-insensitive name / fullName. Rejects Neutrals (0).",
        },
        mode: {
          type: "string",
          enum: [...STATE_NAME_MODES],
          description: `"culture" (default) or "random".`,
        },
      },
      required: ["state"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        state?: unknown;
        mode?: unknown;
      };

      const refResult = parseEntityRef(input.state, "state");
      if (!refResult.ok) return errorResult(refResult.error);

      let mode: StateNameMode = "culture";
      if (input.mode !== undefined && input.mode !== null) {
        const resolved = resolveStateNameMode(input.mode);
        if (!resolved) {
          return errorResult(`Unknown mode: ${JSON.stringify(input.mode)}.`, {
            supported: [...STATE_NAME_MODES],
          });
        }
        mode = resolved;
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No state found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }
      if (current.i <= 0) {
        return errorResult("Cannot rename state 0 (Neutrals).");
      }

      let newName: string;
      try {
        newName = runtime.generate(mode, current.culture);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
      if (typeof newName !== "string" || !newName.trim()) {
        return errorResult("Name generator returned an empty string.");
      }

      try {
        runtime.apply(current.i, newName);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        previousName: current.name,
        name: newName,
        mode,
      });
    },
  };
}

export const regenerateStateNameTool = createRegenerateStateNameTool();
