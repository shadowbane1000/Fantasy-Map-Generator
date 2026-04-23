import {
  errorResult,
  findEntityByRef,
  getPackCollection,
  okResult,
  parseEntityRef,
  type RawProvince,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface SetProvinceCoaCustomRef {
  i: number;
  name: string;
  hasCoa: boolean;
  previousCustom: boolean;
}

export interface SetProvinceCoaCustomRuntime {
  find(ref: number | string): SetProvinceCoaCustomRef | null;
  apply(i: number, custom: boolean): void;
}

export const defaultSetProvinceCoaCustomRuntime: SetProvinceCoaCustomRuntime = {
  find(ref) {
    const entry = findEntityByRef(
      getPackCollection<RawProvince>("provinces"),
      ref,
    );
    if (!entry) return null;
    if (entry.i <= 0) return null;
    if (entry.removed) return null;
    if (entry.lock) return null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      hasCoa: !!entry.coa,
      previousCustom: !!entry.coa?.custom,
    };
  },
  apply(i, custom) {
    const provinces = getPackCollection<RawProvince>("provinces");
    const province = provinces?.[i];
    if (!province) throw new Error(`Province ${i} not found.`);
    if (!province.coa) {
      throw new Error(`Province ${i} has no coat of arms.`);
    }
    if (custom) {
      province.coa.custom = true;
    } else {
      delete province.coa.custom;
    }
  },
};

export function createSetProvinceCoaCustomTool(
  runtime: SetProvinceCoaCustomRuntime = defaultSetProvinceCoaCustomRuntime,
): Tool {
  return {
    name: "set_province_coa_custom",
    description: `Toggle the "custom" / "locked" flag on a province's coat of arms. When set, \`province.coa.custom\` marks the emblem as hand-crafted (the Emblem Editor sets this when you upload a custom SVG / raster, see \`public/modules/ui/emblems-editor.js\`). Bulk regenerators (\`regenerate_emblems\`) and the single-province regenerator (\`regenerate_province_coa\`) both treat a \`custom\` parent / entry as opaque: the custom emblem is not mixed into child heraldry and is not overwritten by a re-roll that targets it directly. Pass \`custom: true\` to set the flag and protect the emblem; pass \`custom: false\` to remove the flag so it gets regenerated next time. Requires an existing \`province.coa\` (use \`regenerate_province_coa\` first if the province has no emblem). Refuses province 0, removed provinces, and provinces locked via \`set_entity_lock\`. Idempotent. Parallels \`set_burg_coa_custom\`.`,
    input_schema: {
      type: "object",
      properties: {
        province: {
          type: ["integer", "string"],
          description:
            "Numeric province id (> 0) or case-insensitive name / fullName.",
        },
        custom: {
          type: "boolean",
          description:
            "true to mark the emblem as custom (protect from regeneration); false to clear the flag.",
        },
      },
      required: ["province", "custom"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        province?: unknown;
        custom?: unknown;
      };

      const refResult = parseEntityRef(input.province, "province");
      if (!refResult.ok) return errorResult(refResult.error);

      if (typeof input.custom !== "boolean") {
        return errorResult("custom must be a boolean.");
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No province found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }

      if (!current.hasCoa) {
        return errorResult(
          `Province ${current.i} has no coat of arms to lock. Generate one first via regenerate_province_coa.`,
        );
      }

      if (current.previousCustom === input.custom) {
        return okResult({
          i: current.i,
          name: current.name,
          previousCustom: current.previousCustom,
          custom: input.custom,
          noop: true,
        });
      }

      try {
        runtime.apply(current.i, input.custom);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        previousCustom: current.previousCustom,
        custom: input.custom,
        noop: false,
      });
    },
  };
}

export const setProvinceCoaCustomTool = createSetProvinceCoaCustomTool();
