import {
  errorResult,
  getGlobal,
  getPack,
  okResult,
  type RawBurg,
  type RawCulture,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface NameBaseRef {
  id: number;
  name: string | null;
}

export interface CenterRef {
  cell: number;
  x: number | null;
  y: number | null;
}

export interface CultureInfo {
  i: number;
  name: string;
  color: string | null;
  type: string | null;
  expansionism: number | null;
  base: NameBaseRef | null;
  center: CenterRef | null;
  origins: number[];
  cells_count: number;
  area: number;
  population_total: number;
  urban_population: number;
  rural_population: number;
  burgs_count: number;
  states_count: number;
  shield: string | null;
  lock: boolean;
}

export type ReadCultureResult = CultureInfo | "not-ready" | "not-found";

export interface NameBaseEntry {
  name?: string;
}

export interface CultureInfoPackLike {
  cultures?: RawCulture[];
  burgs?: RawBurg[];
  states?: RawState[];
  cells?: {
    p?: Array<[number, number] | number[] | undefined>;
    culture?: ArrayLike<number> | number[];
  };
}

export interface PopulationRates {
  populationRate: number;
  urbanization: number;
}

function safeMultiplier(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function readPoint(
  pack: CultureInfoPackLike | undefined,
  cell: number | undefined,
): { x: number | null; y: number | null } {
  if (typeof cell !== "number") return { x: null, y: null };
  const p = pack?.cells?.p?.[cell];
  if (!Array.isArray(p)) return { x: null, y: null };
  const x = typeof p[0] === "number" ? p[0] : null;
  const y = typeof p[1] === "number" ? p[1] : null;
  return { x, y };
}

function findCultureByRef(
  cultures: RawCulture[] | undefined,
  ref: number | string,
): RawCulture | null {
  if (!cultures) return null;
  if (typeof ref === "number") {
    if (!Number.isInteger(ref) || ref < 0 || ref >= cultures.length) {
      return null;
    }
    const entry = cultures[ref];
    return entry && !entry.removed ? entry : null;
  }
  if (typeof ref !== "string") return null;
  const needle = ref.trim().toLowerCase();
  if (!needle) return null;
  for (const c of cultures) {
    if (!c || c.removed) continue;
    if ((c.name ?? "").toLowerCase() === needle) return c;
  }
  return null;
}

export function readCultureInfoFromPack(
  pack: CultureInfoPackLike | undefined,
  rates: PopulationRates,
  nameBases: NameBaseEntry[] | undefined,
  ref: number | string,
): ReadCultureResult {
  if (!pack?.cultures) return "not-ready";

  const entry = findCultureByRef(pack.cultures, ref);
  if (!entry) return "not-found";

  const rate = safeMultiplier(rates.populationRate);
  const urban = safeMultiplier(rates.urbanization);

  const rural = typeof entry.rural === "number" ? entry.rural : 0;
  const urb = typeof entry.urban === "number" ? entry.urban : 0;

  let base: NameBaseRef | null = null;
  if (typeof entry.base === "number") {
    const name =
      Array.isArray(nameBases) &&
      entry.base >= 0 &&
      entry.base < nameBases.length
        ? (nameBases[entry.base]?.name ?? null)
        : null;
    base = { id: entry.base, name };
  }

  let center: CenterRef | null = null;
  if (typeof entry.center === "number") {
    const { x, y } = readPoint(pack, entry.center);
    center = { cell: entry.center, x, y };
  }

  const cultureI = entry.i;

  let burgsCount = 0;
  if (pack.burgs) {
    const cellCulture = pack.cells?.culture;
    for (const b of pack.burgs) {
      if (!b || b.removed) continue;
      if (b.i === 0) continue;
      let bc: number | undefined;
      if (
        cellCulture &&
        typeof b.cell === "number" &&
        b.cell >= 0 &&
        b.cell < cellCulture.length
      ) {
        bc = cellCulture[b.cell];
      } else if (typeof b.culture === "number") {
        bc = b.culture;
      }
      if (bc === cultureI) burgsCount += 1;
    }
  }

  let statesCount = 0;
  if (pack.states) {
    for (const s of pack.states) {
      if (!s || s.removed) continue;
      if (s.i === 0) continue;
      if (s.culture === cultureI) statesCount += 1;
    }
  }

  const origins: number[] = Array.isArray(entry.origins)
    ? entry.origins.filter((n): n is number => typeof n === "number")
    : [];

  return {
    i: cultureI,
    name: entry.name ?? "",
    color: entry.color ?? null,
    type: entry.type ?? null,
    expansionism:
      typeof entry.expansionism === "number" ? entry.expansionism : null,
    base,
    center,
    origins,
    cells_count: typeof entry.cells === "number" ? entry.cells : 0,
    area: typeof entry.area === "number" ? entry.area : 0,
    population_total: Math.max(0, Math.round((rural + urb) * rate)),
    urban_population: Math.max(0, Math.round(urb * rate * urban)),
    rural_population: Math.max(0, Math.round(rural * rate)),
    burgs_count: burgsCount,
    states_count: statesCount,
    shield: entry.shield ?? null,
    lock: !!entry.lock,
  };
}

export interface CultureInfoRuntime {
  readCulture(ref: number | string): ReadCultureResult;
}

export const defaultCultureInfoRuntime: CultureInfoRuntime = {
  readCulture(ref: number | string): ReadCultureResult {
    const pack = getPack<CultureInfoPackLike>();
    const populationRate = getGlobal<number>("populationRate");
    const urbanization = getGlobal<number>("urbanization");
    const nameBases = getGlobal<NameBaseEntry[]>("nameBases");
    return readCultureInfoFromPack(
      pack,
      {
        populationRate: typeof populationRate === "number" ? populationRate : 1,
        urbanization: typeof urbanization === "number" ? urbanization : 1,
      },
      Array.isArray(nameBases) ? nameBases : undefined,
      ref,
    );
  },
};

function parseCultureRef(
  value: unknown,
): { ok: true; ref: number | string } | { ok: false; error: string } {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return { ok: true, ref: value };
  }
  if (typeof value === "string" && value.trim()) {
    return { ok: true, ref: value };
  }
  return {
    ok: false,
    error:
      "culture must be a non-negative integer id or a non-empty name string.",
  };
}

export function createGetCultureInfoTool(
  runtime: CultureInfoRuntime = defaultCultureInfoRuntime,
): Tool {
  return {
    name: "get_culture_info",
    description:
      "Read detailed info for a single culture — the per-culture parallel of get_state_info / get_burg_info. Required `culture` identifies the culture by numeric id (>= 0; id 0 is the Wildlands placeholder and IS readable, unlike states / burgs) or case-insensitive name. Returns `i`, `name`, `color`, `type`, `expansionism`, a resolved `base` ({id, name} from window.nameBases[culture.base] — same language-family lookup set_culture_base uses; null when base or nameBases is missing), `center` ({cell, x, y} from pack.cells.p — null when culture.center is absent), `origins` (plain-array copy of culture.origins — parent culture ids; [] when unset), `cells_count` (culture.cells), `area` (culture.area), `population_total` / `urban_population` / `rural_population` (rounded, using populationRate × urbanization exactly like list_cultures scales), `burgs_count` (live count of non-removed burgs where pack.cells.culture[burg.cell] === i, falling back to burg.culture when the cell slot is unavailable), `states_count` (non-removed states where state.culture === i, skipping state 0), `shield` (culture.shield), and `lock`. Useful before taking any culture-targeted action (rename_culture, set_culture_color, set_culture_type, set_culture_base, set_culture_center, set_culture_origins, set_culture_shield, regenerate_all_culture_names, remove_culture, …). Errors on un-generated map or an unresolvable ref (removed / unknown). Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        culture: {
          type: ["integer", "string"],
          description:
            "Numeric culture id (>= 0; 0 = Wildlands is allowed) or the culture's current name (case-insensitive).",
        },
      },
      required: ["culture"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { culture?: unknown };

      const parsed = parseCultureRef(input.culture);
      if (!parsed.ok) return errorResult(parsed.error);

      const result = runtime.readCulture(parsed.ref);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }
      if (result === "not-found") {
        return errorResult(
          `No culture found matching ${JSON.stringify(parsed.ref)}.`,
        );
      }
      return okResult({ ...result });
    },
  };
}

export const getCultureInfoTool = createGetCultureInfoTool();
