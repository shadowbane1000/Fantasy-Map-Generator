import {
  errorResult,
  findEntityByRef,
  getGlobal,
  getPack,
  getPackCollection,
  okResult,
  type Pack,
  parseEntityRef,
  type RawBurg,
  type RawCoa,
  type RawProvince,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface RegenerateBurgCoaRef {
  i: number;
  name: string;
  coa: RawCoa | undefined;
}

export interface RegenerateBurgCoaRuntime {
  find(ref: number | string): RegenerateBurgCoaRef | null;
  generate(burgI: number, shield?: string): RawCoa;
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

interface PackWithCellProvince extends Pack {
  cells?: Pack["cells"] & { province?: unknown[] };
}

function resolveParent(
  pack: PackWithCellProvince | undefined,
  burg: RawBurg,
): RawState | RawProvince | undefined {
  if (!pack) return undefined;
  const cellProv = pack.cells?.province;
  const cellI = typeof burg.cell === "number" ? burg.cell : undefined;
  const provinceId =
    cellI !== undefined && Array.isArray(cellProv)
      ? Number(cellProv[cellI]) || 0
      : 0;
  const provinces = pack.provinces;
  if (provinceId > 0 && Array.isArray(provinces)) {
    const province = provinces[provinceId];
    if (province && !province.removed) return province;
  }
  const stateId = typeof burg.state === "number" ? burg.state : 0;
  const states = pack.states;
  if (Array.isArray(states)) {
    const state = states[stateId];
    if (state) return state;
  }
  return undefined;
}

export const defaultRegenerateBurgCoaRuntime: RegenerateBurgCoaRuntime = {
  find(ref) {
    const entry = findEntityByRef(getPackCollection<RawBurg>("burgs"), ref);
    if (!entry) return null;
    if (entry.i <= 0) return null;
    if (entry.lock) return null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      coa: entry.coa,
    };
  },
  generate(burgI, shield) {
    const pack = getPack<PackWithCellProvince>();
    if (!pack) {
      throw new Error(
        "pack is not available yet; the map hasn't finished loading.",
      );
    }
    const burg = pack.burgs?.[burgI];
    if (!burg) throw new Error(`Burg ${burgI} not found.`);
    const coaMod = getGlobal<CoaModule>("COA");
    if (!coaMod || typeof coaMod.generate !== "function") {
      throw new Error(
        "COA.generate is not available yet; the map hasn't finished loading.",
      );
    }
    const parent = resolveParent(pack, burg);
    const parentCoa =
      parent && !parent.coa?.custom ? (parent.coa ?? null) : null;
    const newCoa = coaMod.generate(parentCoa, 0.3, 0.1, null);
    let resolvedShield: string | undefined;
    if (typeof shield === "string" && shield) {
      resolvedShield = shield;
    } else if (typeof burg.coa?.shield === "string" && burg.coa.shield) {
      resolvedShield = burg.coa.shield;
    } else if (typeof coaMod.getShield === "function") {
      const cultureId = typeof burg.culture === "number" ? burg.culture : 0;
      const parentCultureId =
        parent && typeof (parent as RawState).culture === "number"
          ? ((parent as RawState).culture as number)
          : 0;
      const effectiveCulture = cultureId || parentCultureId || 0;
      const stateId = typeof burg.state === "number" ? burg.state : undefined;
      resolvedShield = coaMod.getShield(effectiveCulture, stateId);
    }
    if (resolvedShield) newCoa.shield = resolvedShield;
    return newCoa;
  },
  apply(i, coa) {
    const burgs = getPackCollection<RawBurg>("burgs");
    const burg = burgs?.[i];
    if (!burg) throw new Error(`Burg ${i} not found.`);
    burg.coa = coa;
    try {
      const id = `burgCOA${i}`;
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

export function createRegenerateBurgCoaTool(
  runtime: RegenerateBurgCoaRuntime = defaultRegenerateBurgCoaRuntime,
): Tool {
  return {
    name: "regenerate_burg_coa",
    description: `Re-roll the coat of arms for a single burg — same side-effect as the Regenerate button in the Burg Editor / Emblem Editor for a burg. Calls \`COA.generate(parent, 0.3, 0.1, null)\` with the burg's province (or state if no province) as the heraldic parent, preserves the existing shield shape (or generates one via \`COA.getShield\` when none exists), writes \`burg.coa\`, and best-effort refreshes the \`#burgCOA{i}\` DOM node via \`COArenderer.trigger\`. Optional \`shield\` overrides the shield shape. Refuses removed or locked burgs. Use \`regenerate_emblems\` for the whole-map version.`,
    input_schema: {
      type: "object",
      properties: {
        burg: {
          type: ["integer", "string"],
          description: "Numeric burg id (> 0) or case-insensitive name.",
        },
        shield: {
          type: "string",
          description:
            "Optional shield shape override (e.g. 'heater', 'swiss'). Defaults to the burg's existing shield or a culture-appropriate default.",
        },
      },
      required: ["burg"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        burg?: unknown;
        shield?: unknown;
      };

      const refResult = parseEntityRef(input.burg, "burg");
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
          `No burg found matching ${JSON.stringify(refResult.ref)}.`,
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

export const regenerateBurgCoaTool = createRegenerateBurgCoaTool();
