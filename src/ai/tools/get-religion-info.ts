import {
  errorResult,
  findEntityByRef,
  getGlobal,
  getPack,
  okResult,
  parseEntityRef,
  type RawBurg,
  type RawCulture,
  type RawReligion,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface NamedRef {
  id: number;
  name: string | null;
}

export interface CenterRef {
  cell: number;
  x: number | null;
  y: number | null;
}

export interface ReligionInfo {
  i: number;
  name: string;
  color: string | null;
  type: string | null;
  form: string | null;
  deity: string | null;
  code: string | null;
  expansion: string | null;
  expansionism: number | null;
  culture: NamedRef | null;
  center: CenterRef | null;
  origins: number[];
  cells_count: number;
  area: number;
  population_total: number;
  urban_population: number;
  rural_population: number;
  burgs_count: number;
  states_count: number;
  lock: boolean;
}

export type ReadReligionResult =
  | ReligionInfo
  | "not-ready"
  | "not-found"
  | "placeholder";

export interface ReligionInfoPackLike {
  religions?: RawReligion[];
  burgs?: RawBurg[];
  cultures?: RawCulture[];
  states?: RawState[];
  cells?: {
    p?: Array<[number, number] | number[] | undefined>;
    religion?: Array<number | undefined> | number[];
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
  pack: ReligionInfoPackLike | undefined,
  cell: number | undefined,
): { x: number | null; y: number | null } {
  if (typeof cell !== "number") return { x: null, y: null };
  const p = pack?.cells?.p?.[cell];
  if (!Array.isArray(p)) return { x: null, y: null };
  const x = typeof p[0] === "number" ? p[0] : null;
  const y = typeof p[1] === "number" ? p[1] : null;
  return { x, y };
}

function readCellReligion(
  pack: ReligionInfoPackLike | undefined,
  cell: number | undefined,
): number | null {
  if (typeof cell !== "number") return null;
  const arr = pack?.cells?.religion;
  if (!arr) return null;
  const v = (arr as Array<number | undefined>)[cell];
  return typeof v === "number" ? v : null;
}

export function readReligionInfoFromPack(
  pack: ReligionInfoPackLike | undefined,
  rates: PopulationRates,
  ref: number | string,
): ReadReligionResult {
  if (!pack?.religions) return "not-ready";
  // Explicit handling for id 0 ("No religion") so we can surface a
  // clearer error than "not-found" when the caller asks for it
  // numerically.
  if (typeof ref === "number" && ref === 0) return "placeholder";

  const entry = findEntityByRef(pack.religions, ref);
  if (!entry) return "not-found";
  if (entry.i === 0) return "placeholder";

  const rate = safeMultiplier(rates.populationRate);
  const urban = safeMultiplier(rates.urbanization);

  const rural = typeof entry.rural === "number" ? entry.rural : 0;
  const urb = typeof entry.urban === "number" ? entry.urban : 0;

  const culture: NamedRef | null =
    typeof entry.culture === "number"
      ? {
          id: entry.culture,
          name: pack.cultures?.[entry.culture]?.name ?? null,
        }
      : null;

  let center: CenterRef | null = null;
  if (typeof entry.center === "number") {
    const { x, y } = readPoint(pack, entry.center);
    center = { cell: entry.center, x, y };
  }

  const religionI = entry.i;

  // Count burgs whose cell's `religion` slot matches this religion.
  let burgsCount = 0;
  if (pack.burgs) {
    for (const b of pack.burgs) {
      if (!b || b.removed) continue;
      if (b.i === 0) continue;
      const cellReligion = readCellReligion(pack, b.cell);
      if (cellReligion === religionI) burgsCount += 1;
    }
  }

  // Best-effort: count non-removed states whose capital-burg sits on a
  // cell carrying this religion. RawReligion doesn't record a
  // state-affiliation list, so this mirrors how the Religions Editor
  // surfaces state-level affiliation (each state has an effective
  // religion via its capital).
  let statesCount = 0;
  if (pack.states) {
    for (const s of pack.states) {
      if (!s || s.removed) continue;
      if (s.i === 0) continue;
      if (typeof s.capital !== "number" || s.capital <= 0) continue;
      const b = pack.burgs?.[s.capital];
      if (!b || b.removed) continue;
      const cellReligion = readCellReligion(pack, b.cell);
      if (cellReligion === religionI) statesCount += 1;
    }
  }

  const origins: number[] = Array.isArray(entry.origins)
    ? entry.origins.filter((v): v is number => typeof v === "number")
    : [];

  return {
    i: religionI,
    name: entry.name ?? "",
    color: entry.color ?? null,
    type: entry.type ?? null,
    form: entry.form ?? null,
    deity: typeof entry.deity === "string" ? entry.deity : null,
    code: entry.code ?? null,
    expansion: entry.expansion ?? null,
    expansionism:
      typeof entry.expansionism === "number" ? entry.expansionism : null,
    culture,
    center,
    origins,
    cells_count: typeof entry.cells === "number" ? entry.cells : 0,
    area: typeof entry.area === "number" ? entry.area : 0,
    population_total: Math.max(0, Math.round((rural + urb) * rate)),
    urban_population: Math.max(0, Math.round(urb * rate * urban)),
    rural_population: Math.max(0, Math.round(rural * rate)),
    burgs_count: burgsCount,
    states_count: statesCount,
    lock: !!entry.lock,
  };
}

export interface ReligionInfoRuntime {
  readReligion(ref: number | string): ReadReligionResult;
}

export const defaultReligionInfoRuntime: ReligionInfoRuntime = {
  readReligion(ref: number | string): ReadReligionResult {
    const pack = getPack<ReligionInfoPackLike>();
    const populationRate = getGlobal<number>("populationRate");
    const urbanization = getGlobal<number>("urbanization");
    return readReligionInfoFromPack(
      pack,
      {
        populationRate: typeof populationRate === "number" ? populationRate : 1,
        urbanization: typeof urbanization === "number" ? urbanization : 1,
      },
      ref,
    );
  },
};

export function createGetReligionInfoTool(
  runtime: ReligionInfoRuntime = defaultReligionInfoRuntime,
): Tool {
  return {
    name: "get_religion_info",
    description:
      "Read detailed info for a single religion — the per-religion parallel of get_state_info / get_culture_info. Required `religion` identifies the religion by numeric id (> 0) or case-insensitive name (resolved via findEntityByRef; skips the 'No religion' placeholder at id 0 and removed entries). Returns `i`, `name`, `color`, `type` (Folk / Organized / Cult / Heresy / …), `form`, `deity`, `code`, `expansion` (global / state / culture mode), `expansionism`, a resolved `culture` ({id, name} from pack.cultures, null when religion.culture is unset), `center` ({cell, x, y} from pack.cells.p — null when religion.center is absent), `origins` (raw parent-religion id array from religion.origins), `cells_count` (religion.cells), `area` (religion.area), `population_total` / `urban_population` / `rural_population` (rounded, using populationRate × urbanization exactly like list_religions / list_burgs / list_states scale), `burgs_count` (live count of non-removed burgs whose cell's religion slot matches this religion — religions aren't stored on burgs directly), `states_count` (best-effort count of non-removed states whose capital-burg sits on a cell carrying this religion), and `lock`. Useful before taking any religion-targeted action (rename_religion, set_religion_color, set_religion_type, set_religion_form, set_religion_deity, set_religion_expansion, set_religion_culture, set_religion_center, set_religion_origins, regenerate_religion_names, remove_religion, …). Errors on un-generated map, religion 0 ('No religion'), or an unresolvable ref. Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        religion: {
          type: ["integer", "string"],
          description:
            "Numeric religion id (> 0) or the religion's current name (case-insensitive).",
        },
      },
      required: ["religion"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { religion?: unknown };

      if (
        typeof input.religion === "number" &&
        Number.isInteger(input.religion) &&
        input.religion === 0
      ) {
        return errorResult(
          "Cannot read info for religion 0 (the 'No religion' placeholder).",
        );
      }

      const parsed = parseEntityRef(input.religion, "religion");
      if (!parsed.ok) return errorResult(parsed.error);

      const result = runtime.readReligion(parsed.ref);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }
      if (result === "placeholder") {
        return errorResult(
          "Cannot read info for religion 0 (the 'No religion' placeholder).",
        );
      }
      if (result === "not-found") {
        return errorResult(
          `No religion found matching ${JSON.stringify(parsed.ref)}.`,
        );
      }
      return okResult({ ...result });
    },
  };
}

export const getReligionInfoTool = createGetReligionInfoTool();
