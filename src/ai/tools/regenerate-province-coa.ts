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
  type RawProvince,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface RegenerateProvinceCoaRef {
  i: number;
  name: string;
  coa: RawCoa | undefined;
}

export interface RegenerateProvinceCoaRuntime {
  find(ref: number | string): RegenerateProvinceCoaRef | null;
  generate(provinceI: number, shield?: string): RawCoa;
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

function resolveParentState(
  pack: Pack | undefined,
  province: RawProvince,
): RawState | undefined {
  if (!pack) return undefined;
  const stateId = typeof province.state === "number" ? province.state : 0;
  const states = pack.states;
  if (Array.isArray(states)) {
    const state = states[stateId];
    if (state) return state;
  }
  return undefined;
}

export const defaultRegenerateProvinceCoaRuntime: RegenerateProvinceCoaRuntime =
  {
    find(ref) {
      const entry = findEntityByRef(
        getPackCollection<RawProvince>("provinces"),
        ref,
      );
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
    generate(provinceI, shield) {
      const pack = getPack<Pack>();
      if (!pack) {
        throw new Error(
          "pack is not available yet; the map hasn't finished loading.",
        );
      }
      const province = pack.provinces?.[provinceI];
      if (!province) throw new Error(`Province ${provinceI} not found.`);
      const coaMod = getGlobal<CoaModule>("COA");
      if (!coaMod || typeof coaMod.generate !== "function") {
        throw new Error(
          "COA.generate is not available yet; the map hasn't finished loading.",
        );
      }
      const parent = resolveParentState(pack, province);
      const parentCoa =
        parent && !parent.coa?.custom ? (parent.coa ?? null) : null;
      const newCoa = coaMod.generate(parentCoa, 0.3, 0.1, null);
      let resolvedShield: string | undefined;
      if (typeof shield === "string" && shield) {
        resolvedShield = shield;
      } else if (
        typeof province.coa?.shield === "string" &&
        province.coa.shield
      ) {
        resolvedShield = province.coa.shield;
      } else if (typeof coaMod.getShield === "function") {
        const parentCultureId =
          parent && typeof parent.culture === "number" ? parent.culture : 0;
        const stateId =
          typeof province.state === "number" ? province.state : undefined;
        resolvedShield = coaMod.getShield(parentCultureId, stateId);
      }
      if (resolvedShield) newCoa.shield = resolvedShield;
      return newCoa;
    },
    apply(i, coa) {
      const provinces = getPackCollection<RawProvince>("provinces");
      const province = provinces?.[i];
      if (!province) throw new Error(`Province ${i} not found.`);
      province.coa = coa;
      try {
        const id = `provinceCOA${i}`;
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

export function createRegenerateProvinceCoaTool(
  runtime: RegenerateProvinceCoaRuntime = defaultRegenerateProvinceCoaRuntime,
): Tool {
  return {
    name: "regenerate_province_coa",
    description: `Re-roll the coat of arms for a single province — same side-effect as the Regenerate button in the Emblem Editor when a province is selected. Provinces sit in the middle of the heraldic hierarchy: their parent is the owning state, so \`COA.generate(parent, 0.3, 0.1, null)\` is called with the state's coa as the heraldic parent (or \`null\` when the state has no coa or the coa is marked \`custom\`). The shield shape is preserved when the province already has one; otherwise a culture-appropriate default is pulled from \`COA.getShield(parentState.culture, province.state)\`. Writes \`province.coa\` and best-effort refreshes the \`#provinceCOA{i}\` DOM node via \`COArenderer.trigger\`. Optional \`shield\` overrides the shield shape. Refuses province 0, removed provinces, and locked provinces. Use \`regenerate_emblems\` for the whole-map version, \`regenerate_state_coa\` for the state-level parallel, and \`regenerate_burg_coa\` for the burg-level parallel.`,
    input_schema: {
      type: "object",
      properties: {
        province: {
          type: ["integer", "string"],
          description:
            "Numeric province id (> 0) or case-insensitive name. Province 0 (the placeholder entry) is refused.",
        },
        shield: {
          type: "string",
          description:
            "Optional shield shape override (e.g. 'heater', 'swiss'). Defaults to the province's existing shield or a culture-appropriate default.",
        },
      },
      required: ["province"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        province?: unknown;
        shield?: unknown;
      };

      const refResult = parseEntityRef(input.province, "province");
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
          `No province found matching ${JSON.stringify(refResult.ref)}.`,
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

export const regenerateProvinceCoaTool = createRegenerateProvinceCoaTool();
