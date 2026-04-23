import {
  errorResult,
  findEntityByRef,
  getGlobal,
  getPack,
  okResult,
  parseEntityRef,
  type RawBurg,
  type RawProvince,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface NamedRef {
  id: number;
  name: string | null;
}

export interface CapitalRef {
  id: number;
  name: string | null;
  x: number | null;
  y: number | null;
}

export interface CenterRef {
  cell: number;
  x: number | null;
  y: number | null;
}

export interface CoaInfo {
  present: boolean;
  custom: boolean;
}

export interface ProvinceInfo {
  i: number;
  name: string;
  fullName: string | null;
  formName: string | null;
  color: string | null;
  state: NamedRef | null;
  capital: CapitalRef | null;
  center: CenterRef | null;
  cells_count: number;
  area: number;
  population_total: number;
  urban_population: number;
  rural_population: number;
  burgs: NamedRef[];
  coa: CoaInfo;
  lock: boolean;
}

export type ReadProvinceResult =
  | ProvinceInfo
  | "not-ready"
  | "not-found"
  | "placeholder";

export interface ProvinceInfoPackLike {
  provinces?: RawProvince[];
  states?: RawState[];
  burgs?: RawBurg[];
  cells?: {
    p?: Array<[number, number] | number[] | undefined>;
    province?: ArrayLike<number> | number[];
    pop?: ArrayLike<number> | number[];
    area?: ArrayLike<number> | number[];
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
  pack: ProvinceInfoPackLike | undefined,
  cell: number | undefined,
): { x: number | null; y: number | null } {
  if (typeof cell !== "number") return { x: null, y: null };
  const p = pack?.cells?.p?.[cell];
  if (!Array.isArray(p)) return { x: null, y: null };
  const x = typeof p[0] === "number" ? p[0] : null;
  const y = typeof p[1] === "number" ? p[1] : null;
  return { x, y };
}

function readScalar(
  arr: ArrayLike<number> | number[] | undefined,
  idx: number,
): number {
  if (!arr) return 0;
  if (idx < 0 || idx >= arr.length) return 0;
  const v = (arr as ArrayLike<number>)[idx];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function readProvinceInfoFromPack(
  pack: ProvinceInfoPackLike | undefined,
  rates: PopulationRates,
  ref: number | string,
): ReadProvinceResult {
  if (!pack?.provinces) return "not-ready";
  // Explicit handling for id 0 (placeholder) so we can surface a clearer
  // error than "not-found" when the caller asks for it numerically.
  if (typeof ref === "number" && ref === 0) return "placeholder";

  const entry = findEntityByRef(pack.provinces, ref);
  if (!entry) return "not-found";
  if (entry.i === 0) return "placeholder";

  const rate = safeMultiplier(rates.populationRate);
  const urban = safeMultiplier(rates.urbanization);

  const state: NamedRef | null =
    typeof entry.state === "number"
      ? {
          id: entry.state,
          name: pack.states?.[entry.state]?.name ?? null,
        }
      : null;

  let capital: CapitalRef | null = null;
  if (typeof entry.burg === "number" && entry.burg > 0) {
    const b = pack.burgs?.[entry.burg];
    if (b && !b.removed) {
      capital = {
        id: entry.burg,
        name: b.name ?? null,
        x: typeof b.x === "number" ? b.x : null,
        y: typeof b.y === "number" ? b.y : null,
      };
    } else {
      // Reference exists but the burg isn't present — still echo the id.
      capital = {
        id: entry.burg,
        name: null,
        x: null,
        y: null,
      };
    }
  }

  let center: CenterRef | null = null;
  if (typeof entry.center === "number") {
    const { x, y } = readPoint(pack, entry.center);
    center = { cell: entry.center, x, y };
  }

  const provinceI = entry.i;

  // Walk cells.province to count matching cells + sum area + sum rural pop.
  let cellsCount = 0;
  let areaTotal = 0;
  let ruralRaw = 0;
  const cellProvince = pack.cells?.province;
  if (cellProvince) {
    const len = cellProvince.length;
    const arr = cellProvince as ArrayLike<number>;
    for (let c = 0; c < len; c++) {
      if (arr[c] === provinceI) {
        cellsCount += 1;
        areaTotal += readScalar(pack.cells?.area, c);
        ruralRaw += readScalar(pack.cells?.pop, c);
      }
    }
  }

  // Collect burgs in this province + compute urban pop.
  const burgs: NamedRef[] = [];
  let urbanRaw = 0;
  if (pack.burgs) {
    for (const b of pack.burgs) {
      if (!b || b.removed) continue;
      if (b.i === 0) continue;
      let bp: number | undefined;
      if (
        cellProvince &&
        typeof b.cell === "number" &&
        b.cell >= 0 &&
        b.cell < cellProvince.length
      ) {
        bp = (cellProvince as ArrayLike<number>)[b.cell];
      }
      if (bp === provinceI) {
        burgs.push({ id: b.i, name: b.name ?? null });
        urbanRaw += typeof b.population === "number" ? b.population : 0;
      }
    }
    burgs.sort((a, b) => a.id - b.id);
  }

  const coa: CoaInfo = {
    present: !!entry.coa,
    custom: !!entry.coa?.custom,
  };

  return {
    i: provinceI,
    name: entry.name ?? "",
    fullName: entry.fullName ?? null,
    formName: entry.formName ?? null,
    color: entry.color ?? null,
    state,
    capital,
    center,
    cells_count: cellsCount,
    area: Math.max(0, Math.round(areaTotal)),
    population_total: Math.max(
      0,
      Math.round(ruralRaw * rate + urbanRaw * rate * urban),
    ),
    urban_population: Math.max(0, Math.round(urbanRaw * rate * urban)),
    rural_population: Math.max(0, Math.round(ruralRaw * rate)),
    burgs,
    coa,
    lock: !!entry.lock,
  };
}

export interface ProvinceInfoRuntime {
  readProvince(ref: number | string): ReadProvinceResult;
}

export const defaultProvinceInfoRuntime: ProvinceInfoRuntime = {
  readProvince(ref: number | string): ReadProvinceResult {
    const pack = getPack<ProvinceInfoPackLike>();
    const populationRate = getGlobal<number>("populationRate");
    const urbanization = getGlobal<number>("urbanization");
    return readProvinceInfoFromPack(
      pack,
      {
        populationRate: typeof populationRate === "number" ? populationRate : 1,
        urbanization: typeof urbanization === "number" ? urbanization : 1,
      },
      ref,
    );
  },
};

export function createGetProvinceInfoTool(
  runtime: ProvinceInfoRuntime = defaultProvinceInfoRuntime,
): Tool {
  return {
    name: "get_province_info",
    description:
      "Read detailed info for a single province — the per-province parallel of get_state_info / get_culture_info / get_religion_info. Required `province` identifies the province by numeric id (> 0) or case-insensitive name / fullName (resolved via findEntityByRef; skips the index-0 placeholder and removed entries). Returns `i`, `name`, `fullName`, `formName`, `color`, a resolved `state` ({id, name} from pack.states — null when province.state is unset), `capital` ({id, name, x, y} from pack.burgs[province.burg] — null when province.burg is 0 / missing; id echoed with nulls when the capital burg is removed), `center` ({cell, x, y} from pack.cells.p — null when province.center is absent), `cells_count` (derived count of pack.cells.province === i), `area` (rounded sum of pack.cells.area over matching cells), `population_total` / `urban_population` / `rural_population` (rounded, summing per-cell pack.cells.pop for rural and burg.population over member burgs for urban, scaled by populationRate × urbanization exactly like list_states / list_burgs), a `burgs` list ({id, name}) of non-removed burgs inside the province (sorted by id), `coa` ({present, custom} — mirrors the object used by regenerate_province_coa / set_province_coa_custom), and `lock`. Useful before taking any province-targeted action (rename_province, set_province_capital, set_province_color, set_province_form, set_province_coa_custom, regenerate_province_coa, regenerate_province_name, regenerate_all_province_names, remove_province, …). Errors on un-generated map, province 0 (placeholder), or an unresolvable ref. Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        province: {
          type: ["integer", "string"],
          description:
            "Numeric province id (> 0) or the province's current name / fullName (case-insensitive).",
        },
      },
      required: ["province"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { province?: unknown };

      if (
        typeof input.province === "number" &&
        Number.isInteger(input.province) &&
        input.province === 0
      ) {
        return errorResult(
          "Cannot read info for province 0 (the placeholder entry).",
        );
      }

      const parsed = parseEntityRef(input.province, "province");
      if (!parsed.ok) return errorResult(parsed.error);

      const result = runtime.readProvince(parsed.ref);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }
      if (result === "placeholder") {
        return errorResult(
          "Cannot read info for province 0 (the placeholder entry).",
        );
      }
      if (result === "not-found") {
        return errorResult(
          `No province found matching ${JSON.stringify(parsed.ref)}.`,
        );
      }
      return okResult({ ...result });
    },
  };
}

export const getProvinceInfoTool = createGetProvinceInfoTool();
