import {
  errorResult,
  findEntityByRef,
  getGlobal,
  getPack,
  okResult,
  parseEntityRef,
  type RawBurg,
  type RawCoa,
  type RawProvince,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import { composeProvinceFullName } from "./regenerate-province-name";

interface PackWithProvinces {
  cells?: {
    h?: ArrayLike<number>;
    state?: number[];
    province?: number[];
  };
  burgs?: RawBurg[];
  states?: RawState[];
  provinces?: RawProvince[];
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
    type: string | undefined,
  ) => RawCoa;
  getShield?: (culture: number, parent: number | null) => string;
}

interface D3Module {
  interpolate?: (a: string, b: string) => (t: number) => string;
  color?: (value: string) => { hex?: () => string } | null;
}

export interface AddProvinceBurgInfo {
  i: number;
  cell: number;
  culture: number;
  name: string;
  coa?: RawCoa;
  removed: boolean;
}

export interface AddProvinceStateInfo {
  i: number;
  name: string;
  color: string;
  form: string;
  coa?: RawCoa;
}

export interface NewProvinceInput {
  name: string;
  formName: string;
  fullName: string;
  color: string;
  state: number;
  center: number;
  burg: number;
  coa?: RawCoa;
}

export interface AddProvinceResult {
  i: number;
  name: string;
  fullName: string;
  formName: string;
  color: string;
  state: number;
  capital: number;
  center: number;
}

export interface AddProvinceRuntime {
  findBurg(ref: number | string): AddProvinceBurgInfo | null;
  findState(ref: number | string): AddProvinceStateInfo | null;
  stateFor(stateId: number): AddProvinceStateInfo | null;
  cellLand(cellId: number): boolean;
  cellState(cellId: number): number;
  cellProvince(cellId: number): number;
  provinceCenter(provinceI: number): number | null;
  randomColor(): string;
  mixColor(stateColor: string | undefined): string;
  generateName(cultureId: number, burgName: string): string;
  generateCoa(
    parentCoa: RawCoa | undefined,
    stateForm: string,
    cultureId: number,
    stateId: number,
  ): RawCoa | undefined;
  apply(input: NewProvinceInput): AddProvinceResult;
  redraw(newProvinceI: number): void;
}

const FALLBACK_COLOR = "#888888";
const DEFAULT_FORM_NAME = "Province";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function toStateInfo(state: RawState | undefined): AddProvinceStateInfo | null {
  if (!state) return null;
  return {
    i: state.i,
    name: state.name ?? "",
    color: state.color ?? "",
    form: state.form ?? "",
    coa: state.coa,
  };
}

export const defaultAddProvinceRuntime: AddProvinceRuntime = {
  findBurg(ref) {
    const entry = findEntityByRef(getPack<PackWithProvinces>()?.burgs, ref);
    if (!entry) return null;
    if (entry.i <= 0) return null;
    return {
      i: entry.i,
      cell: typeof entry.cell === "number" ? entry.cell : 0,
      culture: typeof entry.culture === "number" ? entry.culture : 0,
      name: entry.name ?? "",
      coa: entry.coa,
      removed: !!entry.removed,
    };
  },
  findState(ref) {
    const entry = findEntityByRef(getPack<PackWithProvinces>()?.states, ref);
    return toStateInfo(entry ?? undefined);
  },
  stateFor(stateId) {
    const states = getPack<PackWithProvinces>()?.states;
    if (!Array.isArray(states)) return null;
    return toStateInfo(states[stateId]);
  },
  cellLand(cellId) {
    const h = getPack<PackWithProvinces>()?.cells?.h;
    if (!h) return false;
    const value = h[cellId];
    return typeof value === "number" && value >= 20;
  },
  cellState(cellId) {
    const state = getPack<PackWithProvinces>()?.cells?.state;
    if (!Array.isArray(state)) return 0;
    const v = state[cellId];
    return typeof v === "number" ? v : 0;
  },
  cellProvince(cellId) {
    const province = getPack<PackWithProvinces>()?.cells?.province;
    if (!Array.isArray(province)) return 0;
    const v = province[cellId];
    return typeof v === "number" ? v : 0;
  },
  provinceCenter(provinceI) {
    if (!provinceI) return null;
    const provinces = getPack<PackWithProvinces>()?.provinces;
    if (!Array.isArray(provinces)) return null;
    const p = provinces[provinceI];
    if (!p || typeof p !== "object") return null;
    if (p.removed) return null;
    return typeof p.center === "number" ? p.center : null;
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
  mixColor(stateColor) {
    const random = this.randomColor();
    if (!isNonEmptyString(stateColor) || stateColor[0] !== "#") return random;
    const d3 = getGlobal<D3Module>("d3");
    if (
      !d3 ||
      typeof d3.interpolate !== "function" ||
      typeof d3.color !== "function"
    ) {
      return random;
    }
    try {
      const mixed = d3.interpolate(stateColor, random)(0.2);
      const color = d3.color(mixed);
      if (color && typeof color.hex === "function") {
        const hex = color.hex();
        if (isNonEmptyString(hex)) return hex;
      }
    } catch {
      // Fall through.
    }
    return random;
  },
  generateName(cultureId, burgName) {
    if (isNonEmptyString(burgName)) return burgName;
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
      // Fall through.
    }
    return "New Province";
  },
  generateCoa(parentCoa, stateForm, cultureId, stateId) {
    const coa = getGlobal<CoaModule>("COA");
    if (!coa || typeof coa.generate !== "function") return undefined;
    try {
      const generated = coa.generate(parentCoa, 0.8, null, stateForm);
      if (generated && typeof coa.getShield === "function") {
        try {
          generated.shield = coa.getShield(cultureId, stateId);
        } catch {
          // Shield optional.
        }
      }
      return generated;
    } catch {
      return undefined;
    }
  },
  apply(input) {
    const pack = getPack<PackWithProvinces>();
    const provinces = pack?.provinces;
    if (!Array.isArray(provinces)) {
      throw new Error("pack.provinces is not available.");
    }
    const burgs = pack?.burgs;
    const burg = burgs?.[input.burg];
    if (!burg) {
      throw new Error(`Burg ${input.burg} not found.`);
    }

    const newI = provinces.length;
    const province: RawProvince = {
      i: newI,
      name: input.name,
      fullName: input.fullName,
      formName: input.formName,
      color: input.color,
      state: input.state,
      center: input.center,
      burg: input.burg,
    };
    if (input.coa) province.coa = input.coa;

    provinces.push(province);

    const state = pack?.states?.[input.state];
    if (state && Array.isArray(state.provinces)) {
      state.provinces.push(newI);
    }

    const cellProvince = pack?.cells?.province;
    if (Array.isArray(cellProvince)) {
      cellProvince[input.center] = newI;
    }

    return {
      i: newI,
      name: input.name,
      fullName: input.fullName,
      formName: input.formName,
      color: input.color,
      state: input.state,
      capital: input.burg,
      center: input.center,
    };
  },
  redraw(_newProvinceI) {
    const drawProvinces = getGlobal<() => void>("drawProvinces");
    if (typeof drawProvinces === "function") {
      try {
        drawProvinces();
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

export function createAddProvinceTool(
  runtime: AddProvinceRuntime = defaultAddProvinceRuntime,
): Tool {
  return {
    name: "add_province",
    description:
      'Create a new province by promoting an existing burg to be its capital — mirrors the "Add province" button in the Provinces Editor. Required: `capital` (burg id or name). Optional: `state` (defaults to the capital cell\'s state), `name` (defaults to the burg\'s name, or auto-generated via Names.getState), `color` (defaults to a 20%-mix of the state color toward a random color via d3.interpolate, matching the editor), `form` (default "Province"; `fullName` is composed as "{name} {formName}"). Mutates: pushes onto `pack.provinces`, pushes onto `pack.states[state].provinces`, writes `pack.cells.province[burg.cell] = newI`. **Scope**: creates a **single-cell** province — NO territory expansion (does not absorb neighbouring same-state cells like the editor does). Does **NOT** touch `burg.capital` — that flag is for state capitals only; province capitals are tracked by `province.burg`. Best-effort calls `drawProvinces` / `drawBorders`. Refuses: removed burgs, burgs on water, burgs in neutral land (cellState === 0), cells already a province center, and state refs that don\'t match the capital cell\'s state.',
    input_schema: {
      type: "object",
      properties: {
        capital: {
          type: ["integer", "string"],
          description:
            "Burg to promote to province capital — numeric id (> 0) or case-insensitive burg name.",
        },
        state: {
          type: ["integer", "string"],
          description:
            "Parent state — numeric id or case-insensitive name. Optional; defaults to the capital cell's state. If provided, must match the capital cell's state (this tool does not transfer cells across states).",
        },
        name: {
          type: "string",
          description:
            "Short province name. Optional; defaults to the capital burg's name.",
        },
        color: {
          type: "string",
          description:
            "CSS color (hex / rgb / hsl / named). Optional; defaults to a 20%-mix of the state color toward a random color.",
        },
        form: {
          type: "string",
          description:
            'Province form (e.g. "Duchy", "County", "Province", "Barony"). Optional; defaults to "Province". `fullName` is recomposed as "{name} {formName}".',
        },
      },
      required: ["capital"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        capital?: unknown;
        state?: unknown;
        name?: unknown;
        color?: unknown;
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
      if (input.form !== undefined && input.form !== null) {
        if (!isNonEmptyString(input.form)) {
          return errorResult("form, if provided, must be a non-empty string.");
        }
      }

      let stateRef: number | string | null = null;
      if (input.state !== undefined && input.state !== null) {
        const parsed = parseEntityRef(input.state, "state");
        if (!parsed.ok) return errorResult(parsed.error);
        stateRef = parsed.ref;
      }

      const burg = runtime.findBurg(capitalRef.ref);
      if (!burg) {
        return errorResult(
          `No burg found matching ${JSON.stringify(capitalRef.ref)}.`,
        );
      }
      if (burg.removed) {
        return errorResult(
          `Burg ${burg.i} is removed; cannot be used as a province capital.`,
        );
      }
      if (!runtime.cellLand(burg.cell)) {
        return errorResult(
          `Capital burg's cell ${burg.cell} is not land (height < 20).`,
        );
      }

      const cellStateId = runtime.cellState(burg.cell);
      if (cellStateId === 0) {
        return errorResult(
          `Capital burg's cell ${burg.cell} is in neutral lands. Assign the land to a state first via set_burg_state or state-level tools.`,
        );
      }

      if (stateRef !== null) {
        const explicit = runtime.findState(stateRef);
        if (!explicit) {
          return errorResult(
            `No state found matching ${JSON.stringify(stateRef)}.`,
          );
        }
        if (explicit.i !== cellStateId) {
          return errorResult(
            `State ${explicit.i} (${explicit.name}) does not own the capital burg's cell (cell ${burg.cell} belongs to state ${cellStateId}). This tool does not transfer cells across states.`,
          );
        }
      }

      const existingProvinceId = runtime.cellProvince(burg.cell);
      if (existingProvinceId) {
        const existingCenter = runtime.provinceCenter(existingProvinceId);
        if (existingCenter === burg.cell) {
          return errorResult(
            `Cell ${burg.cell} is already the center of province ${existingProvinceId}.`,
          );
        }
      }

      const stateInfo = runtime.stateFor(cellStateId) ?? {
        i: cellStateId,
        name: "",
        color: "",
        form: "",
      };

      const formName = isNonEmptyString(input.form)
        ? input.form.trim()
        : DEFAULT_FORM_NAME;
      const name = isNonEmptyString(input.name)
        ? input.name.trim()
        : runtime.generateName(burg.culture, burg.name);
      const color = isNonEmptyString(input.color)
        ? input.color.trim()
        : runtime.mixColor(stateInfo.color);
      const fullName = composeProvinceFullName(name, formName);
      const coa = runtime.generateCoa(
        burg.coa,
        stateInfo.form,
        burg.culture,
        stateInfo.i,
      );

      const newProvinceInput: NewProvinceInput = {
        name,
        formName,
        fullName,
        color,
        state: stateInfo.i,
        center: burg.cell,
        burg: burg.i,
        coa,
      };

      let result: AddProvinceResult;
      try {
        result = runtime.apply(newProvinceInput);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      runtime.redraw(result.i);

      return okResult({
        i: result.i,
        name: result.name,
        fullName: result.fullName,
        formName: result.formName,
        color: result.color,
        state: result.state,
        capital: result.capital,
        center: result.center,
      });
    },
  };
}

export const addProvinceTool = createAddProvinceTool();
