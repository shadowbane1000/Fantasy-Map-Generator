import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface BiomeRenameRef {
  i: number;
  name: string;
}

export interface BiomeRenameRuntime {
  find(ref: number | string): BiomeRenameRef | null;
  rename(i: number, name: string): void;
}

interface BiomesDataLike {
  i?: number[];
  name?: string[];
}

interface BiomeResolution {
  k: number;
  id: number;
  name: string;
}

export function findBiomeByRef(
  biomesData: BiomesDataLike | undefined,
  ref: number | string,
): BiomeResolution | null {
  if (
    !biomesData ||
    !Array.isArray(biomesData.i) ||
    !Array.isArray(biomesData.name)
  )
    return null;
  const { i: ids, name: names } = biomesData;
  if (typeof ref === "number") {
    if (!Number.isInteger(ref) || ref < 0) return null;
    for (let k = 0; k < ids.length; k++) {
      if (ids[k] !== ref) continue;
      const n = names[k];
      if (n === "removed") continue;
      return { k, id: ref, name: typeof n === "string" ? n : "" };
    }
    return null;
  }
  if (typeof ref !== "string") return null;
  const needle = ref.trim().toLowerCase();
  if (!needle) return null;
  for (let k = 0; k < names.length; k++) {
    const n = names[k];
    if (typeof n !== "string" || n === "removed") continue;
    if (n.toLowerCase() !== needle) continue;
    const id = ids[k];
    if (typeof id !== "number") continue;
    return { k, id, name: n };
  }
  return null;
}

export const defaultBiomeRenameRuntime: BiomeRenameRuntime = {
  find(ref) {
    const res = findBiomeByRef(getGlobal<BiomesDataLike>("biomesData"), ref);
    if (!res) return null;
    return { i: res.id, name: res.name };
  },
  rename(id: number, name: string): void {
    const biomesData = getGlobal<BiomesDataLike>("biomesData");
    const res = findBiomeByRef(biomesData, id);
    if (!res || !biomesData?.name) {
      throw new Error(`Biome ${id} not found.`);
    }
    biomesData.name[res.k] = name;
  },
};

function isValidRef(value: unknown): boolean {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0;
  return typeof value === "string" && value.trim().length > 0;
}

export function createRenameBiomeTool(
  runtime: BiomeRenameRuntime = defaultBiomeRenameRuntime,
): Tool {
  return {
    name: "rename_biome",
    description:
      "Rename a biome (writes biomesData.name[k] — same side-effect as the Biomes Editor name field). Matches by numeric biome id (0 = Marine is valid) or case-insensitive current name. Biomes whose name slot is the sentinel 'removed' (the Biomes Editor's deletion marker) are hidden from lookups and cannot be renamed. Rename-to 'removed' is rejected — use a dedicated remove flow if you actually want to delete.",
    input_schema: {
      type: "object",
      properties: {
        biome: {
          type: ["integer", "string"],
          description:
            "Non-negative integer biome id (0 = Marine) or case-insensitive current biome name.",
        },
        name: {
          type: "string",
          description: "New biome name.",
        },
      },
      required: ["biome", "name"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { biome?: unknown; name?: unknown };

      if (!isValidRef(input.biome)) {
        return errorResult(
          "biome must be a non-negative integer id or a non-empty name string.",
        );
      }
      if (typeof input.name !== "string" || !input.name.trim()) {
        return errorResult("name must be a non-empty string.");
      }
      const newName = input.name.trim();
      if (newName === "removed") {
        return errorResult(
          "'removed' is a reserved sentinel for biome deletion; pick another name.",
        );
      }

      const ref = input.biome as number | string;
      const current = runtime.find(ref);
      if (!current) {
        return errorResult(`No biome found matching ${JSON.stringify(ref)}.`);
      }

      try {
        runtime.rename(current.i, newName);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        previousName: current.name,
        name: newName,
      });
    },
  };
}

export const renameBiomeTool = createRenameBiomeTool();
