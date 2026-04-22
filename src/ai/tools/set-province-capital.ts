import {
  errorResult,
  findEntityByRef,
  getPackCollection,
  okResult,
  parseEntityRef,
  type RawBurg,
  type RawProvince,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface ProvinceCapitalProvince {
  i: number;
  name: string;
  stateId: number;
  previousBurgId: number;
  previousBurgName: string | null;
}

export interface ProvinceCapitalBurg {
  i: number;
  name: string;
  state: number;
  cell: number;
}

export interface ProvinceCapitalRuntime {
  findProvince(ref: number | string): ProvinceCapitalProvince | null;
  findBurg(ref: number | string): ProvinceCapitalBurg | null;
  apply(provinceId: number, burgId: number, cell: number): void;
}

export const defaultProvinceCapitalRuntime: ProvinceCapitalRuntime = {
  findProvince(ref) {
    const provinces = getPackCollection<RawProvince>("provinces");
    const entry = findEntityByRef(provinces, ref);
    if (!entry) return null;
    const burgs = getPackCollection<RawBurg>("burgs");
    const prevId =
      typeof entry.burg === "number" && entry.burg > 0 ? entry.burg : 0;
    const prevName = prevId > 0 ? (burgs?.[prevId]?.name ?? null) : null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      stateId: typeof entry.state === "number" ? entry.state : 0,
      previousBurgId: prevId,
      previousBurgName: prevName,
    };
  },
  findBurg(ref) {
    const entry = findEntityByRef(getPackCollection<RawBurg>("burgs"), ref);
    if (!entry) return null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      state: typeof entry.state === "number" ? entry.state : 0,
      cell: typeof entry.cell === "number" ? entry.cell : 0,
    };
  },
  apply(provinceId: number, burgId: number, cell: number): void {
    const province = getPackCollection<RawProvince>("provinces")?.[provinceId];
    if (!province) throw new Error(`Province ${provinceId} not found.`);
    if (province.removed)
      throw new Error(`Province ${provinceId} has been removed.`);
    const burg = getPackCollection<RawBurg>("burgs")?.[burgId];
    if (!burg) throw new Error(`Burg ${burgId} not found.`);
    if (burg.removed) throw new Error(`Burg ${burgId} has been removed.`);
    province.burg = burgId;
    province.center = cell;
  },
};

export function createSetProvinceCapitalTool(
  runtime: ProvinceCapitalRuntime = defaultProvinceCapitalRuntime,
): Tool {
  return {
    name: "set_province_capital",
    description:
      "Promote a burg to be the capital of a province — same side-effect as the Provinces Editor capital dropdown. Writes pack.provinces[k].burg and pack.provinces[k].center (the burg's cell). The burg must belong to the same state as the province; cross-state pairs are rejected with a clear error. Matches province by id (>0) or case-insensitive name/fullName; burg by id (>0) or case-insensitive current name.",
    input_schema: {
      type: "object",
      properties: {
        province: {
          type: ["integer", "string"],
          description: "Province id (> 0) or case-insensitive name/fullName.",
        },
        burg: {
          type: ["integer", "string"],
          description:
            "Burg id (> 0) or case-insensitive name. Must belong to the province's state.",
        },
      },
      required: ["province", "burg"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        province?: unknown;
        burg?: unknown;
      };

      const provinceRefResult = parseEntityRef(input.province, "province");
      if (!provinceRefResult.ok) return errorResult(provinceRefResult.error);
      const burgRefResult = parseEntityRef(input.burg, "burg");
      if (!burgRefResult.ok) return errorResult(burgRefResult.error);

      const province = runtime.findProvince(provinceRefResult.ref);
      if (!province) {
        return errorResult(
          `No province found matching ${JSON.stringify(provinceRefResult.ref)}.`,
        );
      }
      if (province.i <= 0) {
        return errorResult(
          "Cannot set capital on province 0 (the placeholder entry).",
        );
      }

      const burg = runtime.findBurg(burgRefResult.ref);
      if (!burg) {
        return errorResult(
          `No burg found matching ${JSON.stringify(burgRefResult.ref)}.`,
        );
      }
      if (burg.i <= 0) {
        return errorResult(
          "Cannot use burg 0 (the placeholder entry) as a capital.",
        );
      }

      if (burg.state !== province.stateId) {
        return errorResult(
          `Burg ${burg.i} (${JSON.stringify(burg.name)}) is in state ${burg.state}, not state ${province.stateId} (the province's state). Reassign the burg first or pick another.`,
        );
      }

      try {
        runtime.apply(province.i, burg.i, burg.cell);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        province: { i: province.i, name: province.name },
        previousBurg: {
          id: province.previousBurgId,
          name: province.previousBurgName,
        },
        burg: { i: burg.i, name: burg.name },
      });
    },
  };
}

export const setProvinceCapitalTool = createSetProvinceCapitalTool();
