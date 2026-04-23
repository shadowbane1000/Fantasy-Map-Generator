import {
  errorResult,
  findEntityByRef,
  okResult,
  parseEntityRef,
  type RawBurg,
  type RawCoa,
  type RawCulture,
  type RawProvince,
  type RawReligion,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface NamedRef {
  id: number;
  name: string | null;
}

export interface BurgFeatureFlags {
  citadel: boolean;
  walls: boolean;
  plaza: boolean;
  temple: boolean;
  shanty: boolean;
}

export interface BurgCoaInfo {
  present: boolean;
  custom: boolean;
}

export interface BurgInfo {
  i: number;
  name: string;
  cell: number | null;
  x: number | null;
  y: number | null;
  population: number | null;
  culture: NamedRef;
  religion: NamedRef;
  state: NamedRef;
  province: NamedRef;
  type: string | null;
  group: string | null;
  feature_flags: BurgFeatureFlags;
  port: boolean;
  port_feature: number | null;
  capital: boolean;
  coa: BurgCoaInfo;
  lock: boolean;
}

export type ReadBurgInfoResult = BurgInfo | "not-ready" | "not-found";

interface ArrayLike<T> {
  length: number;
  [index: number]: T;
}

export interface PackLike {
  burgs?: RawBurg[];
  states?: ArrayLike<RawState | undefined>;
  provinces?: ArrayLike<RawProvince | undefined>;
  cultures?: ArrayLike<RawCulture | undefined>;
  religions?: ArrayLike<RawReligion | undefined>;
  cells?: {
    religion?: ArrayLike<number>;
    province?: ArrayLike<number>;
  };
}

function nameOf<T extends { name?: string } | undefined>(
  arr: ArrayLike<T> | undefined,
  id: number | undefined,
): string | null {
  if (arr === undefined || id === undefined) return null;
  if (id < 0 || id >= arr.length) return null;
  const entry = arr[id];
  if (!entry) return null;
  return typeof entry.name === "string" ? entry.name : null;
}

function namedRef<T extends { name?: string } | undefined>(
  arr: ArrayLike<T> | undefined,
  id: number,
): NamedRef {
  return { id, name: nameOf(arr, id) };
}

function readFlag(value: number | undefined): boolean {
  return typeof value === "number" && value > 0;
}

function readCoa(coa: RawCoa | undefined): BurgCoaInfo {
  if (!coa) return { present: false, custom: false };
  return { present: true, custom: !!coa.custom };
}

export function readBurgInfoFromPack(
  pack: PackLike | undefined,
  ref: number | string,
): ReadBurgInfoResult {
  if (!pack || !pack.burgs) return "not-ready";
  const entry = findEntityByRef(pack.burgs, ref);
  if (!entry) return "not-found";
  if (entry.i <= 0) return "not-found";

  const cellId = typeof entry.cell === "number" ? entry.cell : null;
  const religionId =
    cellId !== null &&
    pack.cells?.religion &&
    cellId >= 0 &&
    cellId < pack.cells.religion.length
      ? (pack.cells.religion[cellId] ?? 0)
      : 0;
  const provinceId =
    cellId !== null &&
    pack.cells?.province &&
    cellId >= 0 &&
    cellId < pack.cells.province.length
      ? (pack.cells.province[cellId] ?? 0)
      : 0;
  const stateId = typeof entry.state === "number" ? entry.state : 0;
  const cultureId = typeof entry.culture === "number" ? entry.culture : 0;

  const portRaw = typeof entry.port === "number" ? entry.port : 0;

  return {
    i: entry.i,
    name: typeof entry.name === "string" ? entry.name : "",
    cell: cellId,
    x: typeof entry.x === "number" ? entry.x : null,
    y: typeof entry.y === "number" ? entry.y : null,
    population: typeof entry.population === "number" ? entry.population : null,
    culture: namedRef(pack.cultures, cultureId),
    religion: namedRef(pack.religions, religionId),
    state: namedRef(pack.states, stateId),
    province: namedRef(pack.provinces, provinceId),
    type: typeof entry.type === "string" ? entry.type : null,
    group: typeof entry.group === "string" ? entry.group : null,
    feature_flags: {
      citadel: readFlag(entry.citadel),
      walls: readFlag(entry.walls),
      plaza: readFlag(entry.plaza),
      temple: readFlag(entry.temple),
      shanty: readFlag(entry.shanty),
    },
    port: portRaw > 0,
    port_feature: portRaw > 0 ? portRaw : null,
    capital: entry.capital === 1,
    coa: readCoa(entry.coa),
    lock: !!entry.lock,
  };
}

export interface BurgInfoRuntime {
  readBurgInfo(ref: number | string): ReadBurgInfoResult;
}

export const defaultBurgInfoRuntime: BurgInfoRuntime = {
  readBurgInfo(ref) {
    const globals = globalThis as unknown as { pack?: PackLike };
    return readBurgInfoFromPack(globals.pack, ref);
  },
};

export function createGetBurgInfoTool(
  runtime: BurgInfoRuntime = defaultBurgInfoRuntime,
): Tool {
  return {
    name: "get_burg_info",
    description:
      "Read every meaningful property of a single burg (city/town) — the per-burg parallel of get_cell_info / get_state_info. Required `burg` is a numeric id (> 0) OR case-insensitive name / fullName (resolved via the shared findEntityByRef, which skips the index-0 placeholder and `removed: true` burgs). Returns `i`, `name`, owning `cell` id, SVG coords `x` / `y`, raw `population` (engine units — callers can scale by `populationRate × urbanization` like list_burgs does), resolved `{id, name}` refs for `culture` / `religion` / `state` / `province` (religion and province come from `pack.cells.religion[burg.cell]` / `pack.cells.province[burg.cell]` — burgs don't carry those directly), string `type` (Generic / Capital / City / Port / Nomadic / …) and pin `group` (the SVG group the icon/label renders into), `feature_flags` (booleans for `citadel` / `walls` / `plaza` / `temple` / `shanty` — the raw 0/1 burg fields), `port` (boolean) + `port_feature` (the linked water-feature id or null), `capital` (true only when `burg.capital === 1`), `coa` (`{present, custom}` — mirrors the `coa` object shape used by regenerate_burg_coa / set_burg_coa_custom), and `lock`. Useful before rename_burg / move_burg / set_burg_* / remove_burg. Errors on missing / invalid `burg`, unknown refs, the placeholder slot, removed burgs, and an un-generated map. Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        burg: {
          type: ["integer", "string"],
          description:
            "Numeric burg id (> 0) or the burg's name (case-insensitive). Resolved via the shared findEntityByRef.",
        },
      },
      required: ["burg"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { burg?: unknown };
      const refResult = parseEntityRef(input.burg, "burg");
      if (!refResult.ok) return errorResult(refResult.error);
      const result = runtime.readBurgInfo(refResult.ref);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }
      if (result === "not-found") {
        return errorResult(
          `No burg found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }
      return okResult({ ...result });
    },
  };
}

export const getBurgInfoTool = createGetBurgInfoTool();
