import {
  errorResult,
  findEntityByRef,
  getGlobal,
  getPack,
  getPackCollection,
  okResult,
  type Pack,
  parseEntityRef,
  type RawCoa,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface RegenerateStateCoaRef {
  i: number;
  name: string;
  coa: RawCoa | undefined;
}

export interface RegenerateStateCoaRuntime {
  find(ref: number | string): RegenerateStateCoaRef | null;
  generate(stateI: number, shield?: string): RawCoa;
  apply(i: number, coa: RawCoa): void;
}

interface CoaModule {
  generate?: (
    parent: RawCoa | null,
    kinship: number | null,
    dominion: number | null,
    type?: string | null,
  ) => RawCoa;
  getShield?: (culture: number, state?: number) => string;
}

interface CoaRendererModule {
  trigger?: (id: string, coa: RawCoa) => unknown;
}

export const defaultRegenerateStateCoaRuntime: RegenerateStateCoaRuntime = {
  find(ref) {
    const entry = findEntityByRef(getPackCollection<RawState>("states"), ref);
    if (!entry) return null;
    if (entry.i <= 0) return null;
    if (entry.removed) return null;
    if (entry.lock) return null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      coa: entry.coa,
    };
  },
  generate(stateI, shield) {
    const pack = getPack<Pack>();
    if (!pack) {
      throw new Error(
        "pack is not available yet; the map hasn't finished loading.",
      );
    }
    const state = pack.states?.[stateI];
    if (!state) throw new Error(`State ${stateI} not found.`);
    const coaMod = getGlobal<CoaModule>("COA");
    if (!coaMod || typeof coaMod.generate !== "function") {
      throw new Error(
        "COA.generate is not available yet; the map hasn't finished loading.",
      );
    }
    // States are top-level in the heraldry hierarchy — no parent coa.
    const newCoa = coaMod.generate(null, 0.3, 0.1, null);
    let resolvedShield: string | undefined;
    if (typeof shield === "string" && shield) {
      resolvedShield = shield;
    } else if (typeof state.coa?.shield === "string" && state.coa.shield) {
      resolvedShield = state.coa.shield;
    } else if (typeof coaMod.getShield === "function") {
      const cultureId = typeof state.culture === "number" ? state.culture : 0;
      resolvedShield = coaMod.getShield(cultureId, state.i);
    }
    if (resolvedShield) newCoa.shield = resolvedShield;
    return newCoa;
  },
  apply(i, coa) {
    const states = getPackCollection<RawState>("states");
    const state = states?.[i];
    if (!state) throw new Error(`State ${i} not found.`);
    state.coa = coa;
    try {
      const id = `stateCOA${i}`;
      if (typeof document !== "undefined") {
        const existing = document.getElementById(id);
        if (existing && typeof existing.remove === "function") {
          existing.remove();
        }
      }
      const renderer = getGlobal<CoaRendererModule>("COArenderer");
      if (renderer && typeof renderer.trigger === "function") {
        renderer.trigger(id, coa);
      }
    } catch {
      // best-effort — DOM work must never block the mutation
    }
  },
};

export function createRegenerateStateCoaTool(
  runtime: RegenerateStateCoaRuntime = defaultRegenerateStateCoaRuntime,
): Tool {
  return {
    name: "regenerate_state_coa",
    description: `Re-roll the coat of arms for a single state — same side-effect as the Regenerate button in the Emblem Editor when a state is selected. States are top-level in the heraldry hierarchy, so \`COA.generate(null, 0.3, 0.1, null)\` is called with no parent coa. The shield shape is preserved when the state already has one; otherwise a culture-appropriate default is pulled from \`COA.getShield(state.culture, state.i)\`. Writes \`state.coa\` and best-effort refreshes the \`#stateCOA{i}\` DOM node via \`COArenderer.trigger\`. Optional \`shield\` overrides the shield shape. Refuses state 0 (Neutrals), removed states, and locked states. Use \`regenerate_emblems\` for the whole-map version and \`regenerate_burg_coa\` for the burg-level parallel.`,
    input_schema: {
      type: "object",
      properties: {
        state: {
          type: ["integer", "string"],
          description:
            "Numeric state id (> 0) or case-insensitive name. State 0 (Neutrals) is refused.",
        },
        shield: {
          type: "string",
          description:
            "Optional shield shape override (e.g. 'heater', 'swiss'). Defaults to the state's existing shield or a culture-appropriate default.",
        },
      },
      required: ["state"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        state?: unknown;
        shield?: unknown;
      };

      if (
        typeof input.state === "number" &&
        Number.isInteger(input.state) &&
        input.state <= 0
      ) {
        return errorResult(
          "Cannot regenerate coa for state 0 (the Neutrals placeholder).",
        );
      }
      const refResult = parseEntityRef(input.state, "state");
      if (!refResult.ok) return errorResult(refResult.error);

      let shieldOverride: string | undefined;
      if (input.shield !== undefined && input.shield !== null) {
        if (typeof input.shield !== "string" || !input.shield.trim()) {
          return errorResult(
            "shield must be a non-empty string when provided.",
          );
        }
        shieldOverride = input.shield.trim();
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No state found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }
      if (current.i === 0) {
        return errorResult(
          "Cannot regenerate coa for state 0 (the Neutrals placeholder).",
        );
      }

      let newCoa: RawCoa;
      try {
        newCoa = runtime.generate(current.i, shieldOverride);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
      if (!newCoa || typeof newCoa !== "object") {
        return errorResult("COA.generate returned no emblem.");
      }

      try {
        runtime.apply(current.i, newCoa);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        previousCoa: current.coa ?? null,
        coa: newCoa,
      });
    },
  };
}

export const regenerateStateCoaTool = createRegenerateStateCoaTool();
