import {
  errorResult,
  getGlobal,
  getPackCollection,
  okResult,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import {
  resolveStateNameMode,
  STATE_NAME_MODES,
  type StateNameMode,
} from "./regenerate-state-name";

export interface RegenerateAllStateNamesStateRef {
  i: number;
  name: string;
  culture: number;
  lock?: boolean;
  removed?: boolean;
}

export interface RegenerateAllStateNamesRuntime {
  list(): RegenerateAllStateNamesStateRef[];
  generate(mode: StateNameMode, culture: number): string;
  apply(i: number, name: string): void;
  redraw(): void;
}

interface NamesModule {
  getState?: (base: string, culture?: number, baseIndex?: number) => string;
  getCultureShort?: (culture: number) => string;
  getBase?: (base: number) => string;
}

export const defaultRegenerateAllStateNamesRuntime: RegenerateAllStateNamesRuntime =
  {
    list() {
      const states = getPackCollection<RawState>("states");
      if (!Array.isArray(states)) {
        throw new Error("pack.states is not available.");
      }
      const refs: RegenerateAllStateNamesStateRef[] = [];
      for (const state of states) {
        if (!state) continue;
        refs.push({
          i: state.i,
          name: state.name ?? "",
          culture: typeof state.culture === "number" ? state.culture : 0,
          lock: state.lock,
          removed: state.removed,
        });
      }
      return refs;
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
    },
    redraw() {
      getGlobal<() => void>("drawStateLabels")?.();
    },
  };

export function createRegenerateAllStateNamesTool(
  runtime: RegenerateAllStateNamesRuntime = defaultRegenerateAllStateNamesRuntime,
): Tool {
  return {
    name: "regenerate_all_state_names",
    description: `Bulk-regenerate short names for every non-locked, non-removed state (skips Neutrals, state 0) — same side-effect as the States Editor's "Regenerate Names" button. \`mode=culture\` (default) calls Names.getState(Names.getCultureShort(state.culture), state.culture) per state; \`mode=random\` picks a random name-base per state and calls Names.getState(Names.getBase(base), undefined, base). Writes state.name and calls drawStateLabels() once at the end to refresh all labels. Locked states are preserved (state.lock=true — set via set_entity_lock). Non-idempotent — each call produces fresh random names.`,
    input_schema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: [...STATE_NAME_MODES],
          description: `"culture" (default, matches UI) or "random".`,
        },
      },
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { mode?: unknown };

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

      let states: RegenerateAllStateNamesStateRef[];
      try {
        states = runtime.list();
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      const renamed: Array<{ i: number; previousName: string; name: string }> =
        [];
      const skipped: Array<{ i: number; name: string; reason: string }> = [];

      for (const state of states) {
        if (state.i <= 0) {
          skipped.push({ i: state.i, name: state.name, reason: "neutrals" });
          continue;
        }
        if (state.removed) {
          skipped.push({ i: state.i, name: state.name, reason: "removed" });
          continue;
        }
        if (state.lock) {
          skipped.push({ i: state.i, name: state.name, reason: "locked" });
          continue;
        }

        let newName: string;
        try {
          newName = runtime.generate(mode, state.culture);
        } catch (err) {
          skipped.push({
            i: state.i,
            name: state.name,
            reason: `generate failed: ${err instanceof Error ? err.message : String(err)}`,
          });
          continue;
        }
        if (typeof newName !== "string" || !newName.trim()) {
          skipped.push({
            i: state.i,
            name: state.name,
            reason: "generator returned empty string",
          });
          continue;
        }

        try {
          runtime.apply(state.i, newName);
        } catch (err) {
          skipped.push({
            i: state.i,
            name: state.name,
            reason: `apply failed: ${err instanceof Error ? err.message : String(err)}`,
          });
          continue;
        }

        renamed.push({
          i: state.i,
          previousName: state.name,
          name: newName,
        });
      }

      try {
        runtime.redraw();
      } catch {
        // Best-effort — partial progress is preserved either way.
      }

      return okResult({ mode, renamed, skipped });
    },
  };
}

export const regenerateAllStateNamesTool = createRegenerateAllStateNamesTool();
