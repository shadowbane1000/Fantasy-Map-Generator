import {
  errorResult,
  getGlobal,
  getPack,
  okResult,
  type RawProvince,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import {
  composeProvinceFullName,
  PROVINCE_NAME_MODES,
  type ProvinceNameMode,
  resolveProvinceNameMode,
} from "./regenerate-province-name";

interface PackWithCultureCells {
  cells?: { culture?: ArrayLike<number> };
  provinces?: RawProvince[];
}

export interface RegenerateAllProvinceNamesProvinceRef {
  i: number;
  name: string;
  fullName: string;
  center: number;
  formName: string;
  lock?: boolean;
  removed?: boolean;
}

export interface RegenerateAllProvinceNamesRuntime {
  list(): RegenerateAllProvinceNamesProvinceRef[];
  generate(mode: ProvinceNameMode, center: number): string;
  compose(short: string, form: string): string;
  apply(i: number, name: string, fullName: string): void;
}

interface NamesModule {
  getState?: (base: string, culture?: number, baseIndex?: number) => string;
  getCultureShort?: (culture: number) => string;
  getBase?: (base: number) => string;
}

export const defaultRegenerateAllProvinceNamesRuntime: RegenerateAllProvinceNamesRuntime =
  {
    list() {
      const pack = getPack<PackWithCultureCells>();
      const provinces = pack?.provinces;
      if (!Array.isArray(provinces)) {
        throw new Error("pack.provinces is not available.");
      }
      const refs: RegenerateAllProvinceNamesProvinceRef[] = [];
      for (const province of provinces) {
        if (!province) continue;
        refs.push({
          i: province.i,
          name: province.name ?? "",
          fullName: province.fullName ?? "",
          center: typeof province.center === "number" ? province.center : 0,
          formName: province.formName ?? "",
          lock: province.lock,
          removed: province.removed,
        });
      }
      return refs;
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
    compose(short, form) {
      return composeProvinceFullName(short, form);
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

export function createRegenerateAllProvinceNamesTool(
  runtime: RegenerateAllProvinceNamesRuntime = defaultRegenerateAllProvinceNamesRuntime,
): Tool {
  return {
    name: "regenerate_all_province_names",
    description: `Bulk-regenerate short names for every non-locked, non-removed province (skips province 0) — parallels the Provinces Editor's bulk rename. \`mode=culture\` (default) reads each province's cell culture (via \`pack.cells.culture[center]\`) and calls \`Names.getState(Names.getCultureShort(culture), culture)\` per province; \`mode=random\` picks a random name-base per province and calls \`Names.getState(Names.getBase(base), undefined, base)\`. Writes \`province.name\` AND \`province.fullName\` (recomposed as \`"{name} {formName}"\` / \`"The {formName}"\` matching the UI's getFullName). Best-effort updates every \`#provinceLabel{i}\` SVG text. Locked provinces are preserved (\`province.lock=true\` — set via \`set_entity_lock\`). Non-idempotent — each call produces fresh random names.`,
    input_schema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: [...PROVINCE_NAME_MODES],
          description: `"culture" (default, matches UI) or "random".`,
        },
      },
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { mode?: unknown };

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

      let provinces: RegenerateAllProvinceNamesProvinceRef[];
      try {
        provinces = runtime.list();
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      const renamed: Array<{
        i: number;
        previousName: string;
        previousFullName: string;
        name: string;
        fullName: string;
      }> = [];
      const skipped: Array<{ i: number; name: string; reason: string }> = [];

      for (const province of provinces) {
        if (province.i <= 0) {
          skipped.push({
            i: province.i,
            name: province.name,
            reason: "province 0",
          });
          continue;
        }
        if (province.removed) {
          skipped.push({
            i: province.i,
            name: province.name,
            reason: "removed",
          });
          continue;
        }
        if (province.lock) {
          skipped.push({
            i: province.i,
            name: province.name,
            reason: "locked",
          });
          continue;
        }

        let newName: string;
        try {
          newName = runtime.generate(mode, province.center);
        } catch (err) {
          skipped.push({
            i: province.i,
            name: province.name,
            reason: `generate failed: ${err instanceof Error ? err.message : String(err)}`,
          });
          continue;
        }
        if (typeof newName !== "string" || !newName.trim()) {
          skipped.push({
            i: province.i,
            name: province.name,
            reason: "generator returned empty string",
          });
          continue;
        }

        const newFullName = runtime.compose(newName, province.formName);

        try {
          runtime.apply(province.i, newName, newFullName);
        } catch (err) {
          skipped.push({
            i: province.i,
            name: province.name,
            reason: `apply failed: ${err instanceof Error ? err.message : String(err)}`,
          });
          continue;
        }

        renamed.push({
          i: province.i,
          previousName: province.name,
          previousFullName: province.fullName,
          name: newName,
          fullName: newFullName,
        });
      }

      return okResult({ mode, renamed, skipped });
    },
  };
}

export const regenerateAllProvinceNamesTool =
  createRegenerateAllProvinceNamesTool();
