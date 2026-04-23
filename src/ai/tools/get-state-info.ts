import {
  errorResult,
  findEntityByRef,
  getGlobal,
  getPack,
  okResult,
  parseEntityRef,
  type RawBurg,
  type RawCulture,
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

export interface StateInfo {
  i: number;
  name: string;
  fullName: string | null;
  form: string | null;
  formName: string | null;
  type: string | null;
  color: string | null;
  expansionism: number | null;
  culture: NamedRef | null;
  capital: CapitalRef | null;
  center: CenterRef | null;
  cells_count: number;
  area: number;
  population_total: number;
  urban_population: number;
  rural_population: number;
  burgs_count: number;
  provinces: NamedRef[];
  diplomacy: string[];
  lock: boolean;
}

export type ReadStateResult = StateInfo | "not-ready" | "not-found" | "neutral";

export interface StateInfoPackLike {
  states?: RawState[];
  burgs?: RawBurg[];
  cultures?: RawCulture[];
  provinces?: RawProvince[];
  cells?: {
    p?: Array<[number, number] | number[] | undefined>;
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
  pack: StateInfoPackLike | undefined,
  cell: number | undefined,
): { x: number | null; y: number | null } {
  if (typeof cell !== "number") return { x: null, y: null };
  const p = pack?.cells?.p?.[cell];
  if (!Array.isArray(p)) return { x: null, y: null };
  const x = typeof p[0] === "number" ? p[0] : null;
  const y = typeof p[1] === "number" ? p[1] : null;
  return { x, y };
}

export function readStateInfoFromPack(
  pack: StateInfoPackLike | undefined,
  rates: PopulationRates,
  ref: number | string,
): ReadStateResult {
  if (!pack?.states) return "not-ready";
  // Explicit handling for id 0 (Neutrals) so we can surface a clearer error
  // than "not-found" when the caller asks for it numerically.
  if (typeof ref === "number" && ref === 0) return "neutral";

  const entry = findEntityByRef(pack.states, ref);
  if (!entry) return "not-found";
  if (entry.i === 0) return "neutral";

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

  let capital: CapitalRef | null = null;
  if (typeof entry.capital === "number" && entry.capital > 0) {
    const b = pack.burgs?.[entry.capital];
    if (b && !b.removed) {
      capital = {
        id: entry.capital,
        name: b.name ?? null,
        x: typeof b.x === "number" ? b.x : null,
        y: typeof b.y === "number" ? b.y : null,
      };
    } else {
      // Reference exists but the burg isn't present — still echo the id.
      capital = {
        id: entry.capital,
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

  const stateI = entry.i;
  let burgsCount = 0;
  if (pack.burgs) {
    for (const b of pack.burgs) {
      if (!b || b.removed) continue;
      if (b.i === 0) continue;
      if (b.state === stateI) burgsCount += 1;
    }
  }

  const provinces: NamedRef[] = [];
  if (pack.provinces) {
    for (const p of pack.provinces) {
      if (!p || p.removed) continue;
      if (p.i === 0) continue;
      if (p.state === stateI) {
        provinces.push({ id: p.i, name: p.name ?? null });
      }
    }
  }

  const diplomacy: string[] = Array.isArray(entry.diplomacy)
    ? [...entry.diplomacy]
    : [];

  return {
    i: stateI,
    name: entry.name ?? "",
    fullName: entry.fullName ?? null,
    form: entry.form ?? null,
    formName: entry.formName ?? null,
    type: entry.type ?? null,
    color: entry.color ?? null,
    expansionism:
      typeof entry.expansionism === "number" ? entry.expansionism : null,
    culture,
    capital,
    center,
    cells_count: typeof entry.cells === "number" ? entry.cells : 0,
    area: typeof entry.area === "number" ? entry.area : 0,
    population_total: Math.max(0, Math.round((rural + urb) * rate)),
    urban_population: Math.max(0, Math.round(urb * rate * urban)),
    rural_population: Math.max(0, Math.round(rural * rate)),
    burgs_count: burgsCount,
    provinces,
    diplomacy,
    lock: !!entry.lock,
  };
}

export interface StateInfoRuntime {
  readState(ref: number | string): ReadStateResult;
}

export const defaultStateInfoRuntime: StateInfoRuntime = {
  readState(ref: number | string): ReadStateResult {
    const pack = getPack<StateInfoPackLike>();
    const populationRate = getGlobal<number>("populationRate");
    const urbanization = getGlobal<number>("urbanization");
    return readStateInfoFromPack(
      pack,
      {
        populationRate: typeof populationRate === "number" ? populationRate : 1,
        urbanization: typeof urbanization === "number" ? urbanization : 1,
      },
      ref,
    );
  },
};

export function createGetStateInfoTool(
  runtime: StateInfoRuntime = defaultStateInfoRuntime,
): Tool {
  return {
    name: "get_state_info",
    description:
      "Read detailed info for a single state — the per-state parallel of get_map_info / get_cell_info. Required `state` identifies the state by numeric id (> 0) or case-insensitive name / fullName (resolved via findEntityByRef; skips the Neutrals placeholder at id 0 and removed entries). Returns `i`, `name`, `fullName`, `form`, `formName`, `type`, `color`, `expansionism`, a resolved `culture` ({id, name} from pack.cultures), `capital` ({id, name, x, y} from pack.burgs — null when state.capital is 0 / missing), `center` ({cell, x, y} from pack.cells.p — null when state.center is absent), `cells_count` (state.cells), `area` (state.area), `population_total` / `urban_population` / `rural_population` (rounded, using populationRate × urbanization exactly like list_states / list_burgs), `burgs_count` (live count of non-removed burgs where burg.state === i), a `provinces` list ({id, name}) of non-removed provinces assigned to this state, the raw `diplomacy` row (string[] indexed by other-state id), and `lock`. Useful before taking any state-targeted action (rename_state, set_state_capital, set_state_color, set_diplomacy, merge_states, regenerate_state_name, regenerate_state_coa, …). Errors on un-generated map, state 0 (Neutrals), or an unresolvable ref. Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        state: {
          type: ["integer", "string"],
          description:
            "Numeric state id (> 0) or the state's current name / fullName (case-insensitive).",
        },
      },
      required: ["state"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { state?: unknown };

      if (
        typeof input.state === "number" &&
        Number.isInteger(input.state) &&
        input.state === 0
      ) {
        return errorResult(
          "Cannot read info for state 0 (the Neutrals placeholder).",
        );
      }

      const parsed = parseEntityRef(input.state, "state");
      if (!parsed.ok) return errorResult(parsed.error);

      const result = runtime.readState(parsed.ref);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }
      if (result === "neutral") {
        return errorResult(
          "Cannot read info for state 0 (the Neutrals placeholder).",
        );
      }
      if (result === "not-found") {
        return errorResult(
          `No state found matching ${JSON.stringify(parsed.ref)}.`,
        );
      }
      return okResult({ ...result });
    },
  };
}

export const getStateInfoTool = createGetStateInfoTool();
