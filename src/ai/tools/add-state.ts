import {
  errorResult,
  findEntityByRef,
  getGlobal,
  getPack,
  okResult,
  parseEntityRef,
  type RawBurg,
  type RawCoa,
  type RawCulture,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

interface PackWithStates {
  cells?: { h?: ArrayLike<number>; state?: number[] };
  burgs?: RawBurg[];
  cultures?: RawCulture[];
  states?: RawState[];
}

interface NamesModule {
  getState?: (base: string, culture: number) => string;
  getCultureShort?: (culture: number) => string;
}

interface CoaModule {
  generate?: (
    parent: RawCoa | undefined | null,
    kinship: number,
    diversity: number | null,
    cultureType: string | undefined,
  ) => RawCoa;
  getShield?: (culture: number, parent: number | null) => string;
}

export interface AddStateBurgInfo {
  i: number;
  cell: number;
  culture: number;
  name: string;
  coa?: RawCoa;
  isCapital: boolean;
  removed: boolean;
}

export interface AddStateCultureInfo {
  i: number;
  name: string;
  type: string;
}

export interface NewStateInput {
  name: string;
  form: string;
  formName: string;
  fullName: string;
  type: string;
  color: string;
  culture: number;
  capital: number;
  center: number;
  expansionism: number;
  coa?: RawCoa;
}

export interface AddStateResult {
  i: number;
  name: string;
  fullName: string;
  color: string;
  type: string;
  form: string;
  formName: string;
  capital: number;
  center: number;
  culture: number;
}

export interface AddStateRuntime {
  findBurg(ref: number | string): AddStateBurgInfo | null;
  findCulture(ref: number | string): AddStateCultureInfo | null;
  cellLand(cellId: number): boolean;
  cultureFor(cultureId: number): AddStateCultureInfo | null;
  randomColor(): string;
  generateName(cultureId: number, burgName: string): string;
  generateCoa(
    parentCoa: RawCoa | undefined,
    cultureType: string,
    cultureId: number,
  ): RawCoa | undefined;
  apply(state: NewStateInput, capitalBurgI: number): AddStateResult;
  redraw(newStateI: number): void;
}

const FALLBACK_COLOR = "#888888";
const DEFAULT_FORM = "Monarchy";
const DEFAULT_TYPE = "Generic";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export const defaultAddStateRuntime: AddStateRuntime = {
  findBurg(ref) {
    const entry = findEntityByRef(getPack<PackWithStates>()?.burgs, ref);
    if (!entry) return null;
    if (entry.i <= 0) return null;
    return {
      i: entry.i,
      cell: typeof entry.cell === "number" ? entry.cell : 0,
      culture: typeof entry.culture === "number" ? entry.culture : 0,
      name: entry.name ?? "",
      coa: entry.coa,
      isCapital: entry.capital === 1,
      removed: !!entry.removed,
    };
  },
  findCulture(ref) {
    const entry = findEntityByRef(getPack<PackWithStates>()?.cultures, ref);
    if (!entry) return null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      type: entry.type ?? "Generic",
    };
  },
  cellLand(cellId) {
    const h = getPack<PackWithStates>()?.cells?.h;
    if (!h) return false;
    const value = h[cellId];
    return typeof value === "number" && value >= 20;
  },
  cultureFor(cultureId) {
    const cultures = getPack<PackWithStates>()?.cultures;
    if (!cultures) return null;
    const entry = cultures[cultureId];
    if (!entry) return null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      type: entry.type ?? "Generic",
    };
  },
  randomColor() {
    const fn = getGlobal<() => string>("getRandomColor");
    if (typeof fn === "function") {
      try {
        const c = fn();
        if (typeof c === "string" && c.length > 0) return c;
      } catch {
        // Fall through to fallback.
      }
    }
    return FALLBACK_COLOR;
  },
  generateName(cultureId, burgName) {
    const names = getGlobal<NamesModule>("Names");
    try {
      if (
        names &&
        typeof names.getState === "function" &&
        typeof names.getCultureShort === "function"
      ) {
        const base = names.getCultureShort(cultureId);
        const generated = names.getState(base, cultureId);
        if (typeof generated === "string" && generated.length > 0) {
          return generated;
        }
      }
    } catch {
      // Fall through to burg name.
    }
    return burgName || "New State";
  },
  generateCoa(parentCoa, cultureType, cultureId) {
    const coa = getGlobal<CoaModule>("COA");
    if (!coa || typeof coa.generate !== "function") return undefined;
    try {
      const generated = coa.generate(parentCoa, 0.4, null, cultureType);
      if (generated && typeof coa.getShield === "function") {
        try {
          generated.shield = coa.getShield(cultureId, null);
        } catch {
          // Shield optional; keep whatever generate produced.
        }
      }
      return generated;
    } catch {
      return undefined;
    }
  },
  apply(input, capitalBurgI) {
    const pack = getPack<PackWithStates>();
    const states = pack?.states;
    if (!Array.isArray(states)) {
      throw new Error("pack.states is not available.");
    }
    const burgs = pack?.burgs;
    const burg = burgs?.[capitalBurgI];
    if (!burg) {
      throw new Error(`Burg ${capitalBurgI} not found.`);
    }

    const newI = states.length;
    const diplomacy: string[] = new Array(states.length + 1).fill("Neutral");
    diplomacy[0] = "x";
    diplomacy[newI] = "x";

    const state: RawState = {
      i: newI,
      name: input.name,
      fullName: input.fullName,
      form: input.form,
      formName: input.formName,
      type: input.type,
      color: input.color,
      culture: input.culture,
      capital: input.capital,
      center: input.center,
      expansionism: input.expansionism,
      burgs: 1,
      cells: 1,
      area: 0,
      rural: 0,
      urban: 0,
      provinces: [],
      neighbors: [],
      military: [],
      diplomacy,
      alert: 1,
    } as RawState;
    if (input.coa) state.coa = input.coa;

    states.push(state);

    burg.capital = 1;
    burg.state = newI;

    const cellState = pack?.cells?.state;
    if (Array.isArray(cellState)) {
      cellState[input.center] = newI;
    }

    return {
      i: newI,
      name: input.name,
      fullName: input.fullName,
      color: input.color,
      type: input.type,
      form: input.form,
      formName: input.formName,
      capital: input.capital,
      center: input.center,
      culture: input.culture,
    };
  },
  redraw(newStateI) {
    const drawStates = getGlobal<() => void>("drawStates");
    if (typeof drawStates === "function") {
      try {
        drawStates();
      } catch {
        // Best-effort.
      }
    }
    const drawStateLabels =
      getGlobal<(list?: number[]) => void>("drawStateLabels");
    if (typeof drawStateLabels === "function") {
      try {
        drawStateLabels([newStateI]);
      } catch {
        // Best-effort.
      }
    }
    const drawBorders = getGlobal<() => void>("drawBorders");
    if (typeof drawBorders === "function") {
      try {
        drawBorders();
      } catch {
        // Best-effort.
      }
    }
  },
};

export function createAddStateTool(
  runtime: AddStateRuntime = defaultAddStateRuntime,
): Tool {
  return {
    name: "add_state",
    description:
      'Create a new state by promoting an existing burg to be its capital — mirrors the "Add state" button in the States Editor. Required: `capital` (burg id or name). Optional: `name` (auto-generated via Names.getState if omitted), `color` (random via getRandomColor), `type` (default "Generic"), `culture` (default = capital burg\'s culture), `form` (default "Monarchy"). Mutates: pushes the new state onto `pack.states`, sets `burg.capital = 1` + `burg.state = newI` on the capital burg, writes `pack.cells.state[burg.cell] = newI` (taking the single cell from its previous owner). **Scope**: creates a single-cell state — NO territory expansion (no neighbours, no BFS). Best-effort redraws drawStates / drawStateLabels / drawBorders. For full territory re-grow, follow up with `regenerate_domain(domain="states")`. Refuses: removed burgs, already-a-capital burgs, burgs on water, and unknown culture refs.',
    input_schema: {
      type: "object",
      properties: {
        capital: {
          type: ["integer", "string"],
          description:
            "Burg to promote to capital — numeric id (> 0) or case-insensitive burg name. Must not already be a capital.",
        },
        name: {
          type: "string",
          description:
            "Short state name. Optional; defaults to an auto-generated name via Names.getState for the capital's culture.",
        },
        color: {
          type: "string",
          description:
            "CSS color (hex / rgb / hsl / named). Optional; defaults to a random color via getRandomColor.",
        },
        type: {
          type: "string",
          description:
            'State type (Generic / Nomadic / Highland / Lake / Naval / Hunting — free-form). Optional; defaults to "Generic".',
        },
        culture: {
          type: ["integer", "string"],
          description:
            "Dominant culture — numeric culture id or case-insensitive name. Optional; defaults to the capital burg's culture.",
        },
        form: {
          type: "string",
          description:
            'Government form (Monarchy / Republic / Union / Anarchy — free-form). Optional; defaults to "Monarchy". `fullName` is recomposed as "{form} of {name}".',
        },
      },
      required: ["capital"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        capital?: unknown;
        name?: unknown;
        color?: unknown;
        type?: unknown;
        culture?: unknown;
        form?: unknown;
      };

      const capitalRef = parseEntityRef(input.capital, "capital");
      if (!capitalRef.ok) return errorResult(capitalRef.error);

      if (input.name !== undefined && input.name !== null) {
        if (!isNonEmptyString(input.name)) {
          return errorResult("name, if provided, must be a non-empty string.");
        }
      }
      if (input.color !== undefined && input.color !== null) {
        if (!isNonEmptyString(input.color)) {
          return errorResult("color, if provided, must be a non-empty string.");
        }
      }
      if (input.type !== undefined && input.type !== null) {
        if (!isNonEmptyString(input.type)) {
          return errorResult("type, if provided, must be a non-empty string.");
        }
      }
      if (input.form !== undefined && input.form !== null) {
        if (!isNonEmptyString(input.form)) {
          return errorResult("form, if provided, must be a non-empty string.");
        }
      }

      let cultureRef: number | string | null = null;
      if (input.culture !== undefined && input.culture !== null) {
        const parsed = parseEntityRef(input.culture, "culture");
        if (!parsed.ok) return errorResult(parsed.error);
        cultureRef = parsed.ref;
      }

      const burg = runtime.findBurg(capitalRef.ref);
      if (!burg) {
        return errorResult(
          `No burg found matching ${JSON.stringify(capitalRef.ref)}.`,
        );
      }
      if (burg.removed) {
        return errorResult(
          `Burg ${burg.i} is removed; cannot be used as a state capital.`,
        );
      }
      if (burg.isCapital) {
        return errorResult(
          `Burg ${burg.i} (${burg.name}) is already a capital of another state. Demote it first via set_state_capital.`,
        );
      }
      if (!runtime.cellLand(burg.cell)) {
        return errorResult(
          `Capital burg's cell ${burg.cell} is not land (height < 20).`,
        );
      }

      let culture: AddStateCultureInfo | null;
      if (cultureRef !== null) {
        culture = runtime.findCulture(cultureRef);
        if (!culture) {
          return errorResult(
            `No culture found matching ${JSON.stringify(cultureRef)}.`,
          );
        }
      } else {
        culture = runtime.cultureFor(burg.culture);
        if (!culture) {
          culture = { i: burg.culture, name: "", type: "Generic" };
        }
      }

      const form = isNonEmptyString(input.form)
        ? input.form.trim()
        : DEFAULT_FORM;
      const type = isNonEmptyString(input.type)
        ? input.type.trim()
        : DEFAULT_TYPE;
      const name = isNonEmptyString(input.name)
        ? input.name.trim()
        : runtime.generateName(culture.i, burg.name);
      const color = isNonEmptyString(input.color)
        ? input.color.trim()
        : runtime.randomColor();
      const fullName = `${form} of ${name}`;
      const coa = runtime.generateCoa(burg.coa, culture.type, culture.i);

      const newStateInput: NewStateInput = {
        name,
        form,
        formName: form,
        fullName,
        type,
        color,
        culture: culture.i,
        capital: burg.i,
        center: burg.cell,
        expansionism: 0.5,
        coa,
      };

      let result: AddStateResult;
      try {
        result = runtime.apply(newStateInput, burg.i);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      runtime.redraw(result.i);

      return okResult({
        i: result.i,
        name: result.name,
        fullName: result.fullName,
        color: result.color,
        type: result.type,
        form: result.form,
        formName: result.formName,
        capital: result.capital,
        center: result.center,
        culture: result.culture,
      });
    },
  };
}

export const addStateTool = createAddStateTool();
