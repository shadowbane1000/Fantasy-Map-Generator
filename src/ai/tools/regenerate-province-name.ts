import {
  errorResult,
  findEntityByRef,
  getGlobal,
  getPack,
  okResult,
  parseEntityRef,
  type RawProvince,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

interface PackWithCultureCells {
  cells?: { culture?: ArrayLike<number> };
  provinces?: RawProvince[];
}

export const PROVINCE_NAME_MODES = ["culture", "random"] as const;

export type ProvinceNameMode = (typeof PROVINCE_NAME_MODES)[number];

const LOOKUP = new Map<string, ProvinceNameMode>();
for (const m of PROVINCE_NAME_MODES) LOOKUP.set(m.toLowerCase(), m);

export function resolveProvinceNameMode(
  value: unknown,
): ProvinceNameMode | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  if (!key) return null;
  return LOOKUP.get(key) ?? null;
}

export function composeProvinceFullName(short: string, form: string): string {
  if (!form) return short;
  if (!short) return `The ${form}`;
  return `${short} ${form}`;
}

export interface RegenerateProvinceNameRef {
  i: number;
  name: string;
  fullName: string;
  center: number;
  formName: string;
}

export interface RegenerateProvinceNameRuntime {
  find(ref: number | string): RegenerateProvinceNameRef | null;
  generate(mode: ProvinceNameMode, center: number): string;
  apply(i: number, name: string, fullName: string): void;
}

interface NamesModule {
  getState?: (base: string, culture?: number, baseIndex?: number) => string;
  getCultureShort?: (culture: number) => string;
  getBase?: (base: number) => string;
}

export const defaultRegenerateProvinceNameRuntime: RegenerateProvinceNameRuntime =
  {
    find(ref) {
      const pack = getPack<PackWithCultureCells>();
      const entry = findEntityByRef(pack?.provinces, ref);
      if (!entry) return null;
      return {
        i: entry.i,
        name: entry.name ?? "",
        fullName: entry.fullName ?? "",
        center: typeof entry.center === "number" ? entry.center : 0,
        formName: entry.formName ?? "",
      };
    },
    generate(mode, center) {
      const pack = getPack<PackWithCultureCells>();
      const cultureCells = pack?.cells?.culture;
      if (!cultureCells) {
        throw new Error("pack.cells.culture is not available.");
      }
      const culture = cultureCells[center];
      if (typeof culture !== "number") {
        throw new Error(`pack.cells.culture[${center}] is not available.`);
      }
      const names = getGlobal<NamesModule>("Names");
      if (!names || typeof names.getState !== "function") {
        throw new Error(
          "Names.getState is not available yet; the map hasn't finished loading.",
        );
      }
      if (mode === "culture") {
        if (typeof names.getCultureShort !== "function") {
          throw new Error("Names.getCultureShort is not available.");
        }
        return names.getState(names.getCultureShort(culture), culture);
      }
      if (typeof names.getBase !== "function") {
        throw new Error("Names.getBase is not available.");
      }
      const nameBases = getGlobal<unknown[]>("nameBases");
      if (!Array.isArray(nameBases) || nameBases.length === 0) {
        throw new Error("nameBases is not available or empty.");
      }
      const baseIndex = Math.floor(Math.random() * nameBases.length);
      return names.getState(names.getBase(baseIndex), undefined, baseIndex);
    },
    apply(i, name, fullName) {
      const provinces = getPack<PackWithCultureCells>()?.provinces;
      const province = provinces?.[i];
      if (!province) throw new Error(`Province ${i} not found.`);
      province.name = name;
      province.fullName = fullName;
      if (typeof document !== "undefined") {
        const label = document.getElementById(`provinceLabel${i}`);
        if (label) label.textContent = name;
      }
    },
  };

export function createRegenerateProvinceNameTool(
  runtime: RegenerateProvinceNameRuntime = defaultRegenerateProvinceNameRuntime,
): Tool {
  return {
    name: "regenerate_province_name",
    description: `Roll a fresh short name for a province — same side-effect as the province-name dialog's regenerate buttons. \`mode=culture\` (default) uses the cell's culture via Names.getState(Names.getCultureShort(culture), culture); \`mode=random\` picks a random name-base. Writes province.name AND province.fullName (recomputed as "{name} {formName}" matching the UI). Best-effort updates the #provinceLabel{i} SVG. Non-idempotent.`,
    input_schema: {
      type: "object",
      properties: {
        province: {
          type: ["integer", "string"],
          description:
            "Numeric province id (> 0) or case-insensitive name / fullName.",
        },
        mode: {
          type: "string",
          enum: [...PROVINCE_NAME_MODES],
          description: `"culture" (default) or "random".`,
        },
      },
      required: ["province"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        province?: unknown;
        mode?: unknown;
      };

      const refResult = parseEntityRef(input.province, "province");
      if (!refResult.ok) return errorResult(refResult.error);

      let mode: ProvinceNameMode = "culture";
      if (input.mode !== undefined && input.mode !== null) {
        const resolved = resolveProvinceNameMode(input.mode);
        if (!resolved) {
          return errorResult(`Unknown mode: ${JSON.stringify(input.mode)}.`, {
            supported: [...PROVINCE_NAME_MODES],
          });
        }
        mode = resolved;
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No province found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }

      let newName: string;
      try {
        newName = runtime.generate(mode, current.center);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
      if (typeof newName !== "string" || !newName.trim()) {
        return errorResult("Name generator returned an empty string.");
      }

      const newFullName = composeProvinceFullName(newName, current.formName);
      try {
        runtime.apply(current.i, newName, newFullName);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        previousName: current.name,
        previousFullName: current.fullName,
        name: newName,
        fullName: newFullName,
        mode,
      });
    },
  };
}

export const regenerateProvinceNameTool = createRegenerateProvinceNameTool();
