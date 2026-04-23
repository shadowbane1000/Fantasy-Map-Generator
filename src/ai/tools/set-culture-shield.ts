import { shields } from "../../modules/emblem/shields";
import {
  errorResult,
  getPack,
  getPackCollection,
  okResult,
  type RawBurg,
  type RawCulture,
  type RawProvince,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

function isValidCultureRef(value: unknown): value is number | string {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0;
  if (typeof value === "string") return value.trim().length > 0;
  return false;
}

function buildShapeList(): readonly string[] {
  const set = new Set<string>();
  for (const key of Object.keys(shields)) {
    if (key === "types") continue;
    const group = shields[key];
    if (!group) continue;
    for (const shape of Object.keys(group)) set.add(shape);
  }
  return Object.freeze([...set].sort());
}

export const CULTURE_SHIELDS = buildShapeList();

const SHIELD_LOOKUP = new Map<string, string>();
for (const s of CULTURE_SHIELDS) SHIELD_LOOKUP.set(s.toLowerCase(), s);

export function resolveCultureShield(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  if (!key) return null;
  return SHIELD_LOOKUP.get(key) ?? null;
}

export interface CultureShieldRef {
  i: number;
  name: string;
  previousShield: string;
}

export interface CultureShieldCascade {
  states: number;
  provinces: number;
  burgs: number;
}

export interface CultureShieldRuntime {
  find(ref: number | string): CultureShieldRef | null;
  apply(i: number, shape: string): CultureShieldCascade;
}

interface PackWithCellsCulture {
  cultures?: RawCulture[];
  states?: RawState[];
  provinces?: RawProvince[];
  burgs?: RawBurg[];
  cells?: { culture?: ArrayLike<number> };
}

function findCultureAllowZero(ref: number | string): RawCulture | null {
  const cultures = getPackCollection<RawCulture>("cultures");
  if (!cultures) return null;
  if (typeof ref === "number") {
    if (!Number.isInteger(ref) || ref < 0) return null;
    const c = cultures[ref];
    return c && !c.removed ? c : null;
  }
  const needle = ref.trim().toLowerCase();
  if (!needle) return null;
  for (const c of cultures) {
    if (!c || c.removed) continue;
    if ((c.name ?? "").toLowerCase() === needle) return c;
  }
  return null;
}

export const defaultCultureShieldRuntime: CultureShieldRuntime = {
  find(ref) {
    const entry = findCultureAllowZero(ref);
    if (!entry) return null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      previousShield: entry.shield ?? "",
    };
  },
  apply(i, shape) {
    const pack = getPack<PackWithCellsCulture>();
    const cultures = pack?.cultures;
    if (!Array.isArray(cultures)) {
      throw new Error("pack.cultures is not available.");
    }
    const culture = cultures[i];
    if (!culture) throw new Error(`Culture ${i} not found.`);
    culture.shield = shape;

    let states = 0;
    let provinces = 0;
    let burgs = 0;

    for (const state of pack?.states ?? []) {
      if (!state || !state.i || state.removed) continue;
      if (state.culture !== i) continue;
      if (!state.coa || state.coa.custom) continue;
      if (state.coa.shield === shape) continue;
      state.coa.shield = shape;
      states++;
    }

    const cellCulture = pack?.cells?.culture;
    for (const province of pack?.provinces ?? []) {
      if (!province || !province.i || province.removed) continue;
      if (!province.coa || province.coa.custom) continue;
      const center = province.center;
      if (typeof center !== "number" || !cellCulture) continue;
      if (cellCulture[center] !== i) continue;
      if (province.coa.shield === shape) continue;
      province.coa.shield = shape;
      provinces++;
    }

    for (const burg of pack?.burgs ?? []) {
      if (!burg || !burg.i || burg.removed) continue;
      if (burg.culture !== i) continue;
      if (!burg.coa || burg.coa.custom) continue;
      if (burg.coa.shield === shape) continue;
      burg.coa.shield = shape;
      burgs++;
    }

    return { states, provinces, burgs };
  },
};

export function createSetCultureShieldTool(
  runtime: CultureShieldRuntime = defaultCultureShieldRuntime,
): Tool {
  return {
    name: "set_culture_shield",
    description: `Change a culture's emblem shield shape — same side-effect as the shield dropdown in the Cultures Editor. Writes culture.shield and cascades to every non-custom, non-removed state/province/burg coat-of-arms whose culture matches (states and burgs match on their culture field; provinces match via pack.cells.culture[province.center]). Existing COA DOM elements are NOT re-rendered (the AI doesn't drive editor panels; the main map doesn't show per-entity emblems). Response includes cascade counts. Idempotent: noop when culture.shield is already the requested shape AND no cascading was needed.`,
    input_schema: {
      type: "object",
      properties: {
        culture: {
          type: ["integer", "string"],
          description:
            "Numeric culture id (≥ 0; 0 = Wildlands is allowed) or case-insensitive name.",
        },
        shield: {
          type: "string",
          description:
            "Shield shape name (case-insensitive). See `supported` in error responses for the full list of ~40 shapes grouped under basic/regional/historical/specific/banner/simple/fantasy/middleEarth.",
        },
      },
      required: ["culture", "shield"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        culture?: unknown;
        shield?: unknown;
      };

      if (!isValidCultureRef(input.culture)) {
        return errorResult(
          "culture must be a non-negative integer id or a non-empty name string.",
        );
      }

      if (typeof input.shield !== "string" || !input.shield.trim()) {
        return errorResult("shield must be a non-empty string.", {
          supported: [...CULTURE_SHIELDS],
        });
      }

      const shape = resolveCultureShield(input.shield);
      if (!shape) {
        return errorResult(
          `Unknown shield shape: ${JSON.stringify(input.shield)}.`,
          { supported: [...CULTURE_SHIELDS] },
        );
      }

      const cultureRef = input.culture as number | string;
      const current = runtime.find(cultureRef);
      if (!current) {
        return errorResult(
          `No culture found matching ${JSON.stringify(cultureRef)}.`,
        );
      }

      let cascaded: CultureShieldCascade;
      try {
        cascaded = runtime.apply(current.i, shape);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      const noop =
        current.previousShield === shape &&
        cascaded.states === 0 &&
        cascaded.provinces === 0 &&
        cascaded.burgs === 0;

      return okResult({
        i: current.i,
        name: current.name,
        shield: shape,
        previousShield: current.previousShield,
        cascaded,
        noop,
      });
    },
  };
}

export const setCultureShieldTool = createSetCultureShieldTool();
