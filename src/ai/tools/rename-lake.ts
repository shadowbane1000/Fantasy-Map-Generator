import { errorResult, getPack, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface LakeRenameRef {
  i: number;
  name: string;
  group: string;
}

interface LakePackLike {
  features?: unknown[];
}

interface LakeFeatureLike {
  i?: unknown;
  type?: unknown;
  name?: unknown;
  group?: unknown;
}

function isLakeFeature(entry: unknown): entry is LakeFeatureLike & {
  type: "lake";
} {
  if (!entry || typeof entry !== "object") return false;
  const t = (entry as LakeFeatureLike).type;
  return t === "lake";
}

function toRef(entry: LakeFeatureLike): LakeRenameRef | null {
  const i = entry.i;
  if (typeof i !== "number" || !Number.isInteger(i) || i <= 0) return null;
  const name = typeof entry.name === "string" ? entry.name : "";
  const group = typeof entry.group === "string" ? entry.group : "";
  return { i, name, group };
}

/**
 * Locate a lake feature by `feature.i`. Returns null when the feature
 * is missing, is the index-0 placeholder, or is not type "lake".
 */
export function findLakeById(
  features: unknown[] | undefined,
  id: number,
): LakeRenameRef | null {
  if (!Array.isArray(features)) return null;
  if (!Number.isInteger(id) || id <= 0) return null;
  // pack.features[0] is a placeholder (the generator writes 0). Skip
  // it and any non-object entry.
  for (let idx = 1; idx < features.length; idx++) {
    const entry = features[idx];
    if (!isLakeFeature(entry)) continue;
    if ((entry as LakeFeatureLike).i === id) return toRef(entry);
  }
  return null;
}

/**
 * Find every lake whose name matches `needle` (case-insensitive,
 * trimmed exact match).
 */
export function findLakesByName(
  features: unknown[] | undefined,
  needle: string,
): LakeRenameRef[] {
  const out: LakeRenameRef[] = [];
  if (!Array.isArray(features)) return out;
  const normalised = needle.trim().toLowerCase();
  if (!normalised) return out;
  for (let idx = 1; idx < features.length; idx++) {
    const entry = features[idx];
    if (!isLakeFeature(entry)) continue;
    const e = entry as LakeFeatureLike;
    const name = typeof e.name === "string" ? e.name : "";
    if (name.toLowerCase() === normalised) {
      const ref = toRef(e);
      if (ref) out.push(ref);
    }
  }
  return out;
}

export interface LakeRenameRuntime {
  findById(id: number): LakeRenameRef | null;
  findByName(name: string): { matches: LakeRenameRef[] };
  rename(i: number, newName: string): void;
}

function getPackFeaturesOrThrow(): unknown[] {
  const features = getPack<LakePackLike>()?.features;
  if (!Array.isArray(features)) {
    throw new Error("pack.features is unavailable. Generate a map first.");
  }
  return features;
}

export const defaultRenameLakeRuntime: LakeRenameRuntime = {
  findById(id: number): LakeRenameRef | null {
    return findLakeById(getPackFeaturesOrThrow(), id);
  },
  findByName(name: string): { matches: LakeRenameRef[] } {
    return { matches: findLakesByName(getPackFeaturesOrThrow(), name) };
  },
  rename(i: number, newName: string): void {
    const features = getPackFeaturesOrThrow();
    for (let idx = 1; idx < features.length; idx++) {
      const entry = features[idx];
      if (!isLakeFeature(entry)) continue;
      if ((entry as LakeFeatureLike).i === i) {
        (entry as { name: string }).name = newName;
        return;
      }
    }
    throw new Error(`No lake found with id ${i}.`);
  },
};

export function createRenameLakeTool(
  runtime: LakeRenameRuntime = defaultRenameLakeRuntime,
): Tool {
  return {
    name: "rename_lake",
    description:
      "Rename a lake. Writes feature.name on the matching pack.features entry (lakes are stored as features with type === 'lake'; there is no separate pack.lakes array). Identify the lake by numeric id (feature.i) or by current case-insensitive name; if both are supplied they must agree. Mirrors the lakes-editor's name input (no SVG redraw — lake names aren't drawn by default).",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "integer",
          minimum: 1,
          description: "Lake feature id (matches feature.i, > 0).",
        },
        name: {
          type: "string",
          description:
            "Current lake name (case-insensitive, trimmed exact match). Use id when multiple lakes share a name.",
        },
        new_name: {
          type: "string",
          description:
            "The new name to write. Trimmed before assignment; must be non-empty.",
        },
      },
      required: ["new_name"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        id?: unknown;
        name?: unknown;
        new_name?: unknown;
      };

      // Validate new_name first — independent of identification.
      if (typeof input.new_name !== "string" || !input.new_name.trim()) {
        return errorResult("new_name must be a non-empty string.");
      }
      const newName = input.new_name.trim();

      const hasId = input.id !== undefined && input.id !== null;
      const hasName = input.name !== undefined && input.name !== null;

      if (!hasId && !hasName) {
        return errorResult("Provide either id or name to identify the lake.");
      }

      let idValue: number | null = null;
      if (hasId) {
        if (
          typeof input.id !== "number" ||
          !Number.isInteger(input.id) ||
          input.id <= 0
        ) {
          return errorResult("id must be a positive integer.");
        }
        idValue = input.id;
      }

      let nameValue: string | null = null;
      if (hasName) {
        if (typeof input.name !== "string" || !input.name.trim()) {
          return errorResult("name must be a non-empty string.");
        }
        nameValue = input.name.trim();
      }

      let target: LakeRenameRef | null = null;

      try {
        if (idValue !== null) {
          target = runtime.findById(idValue);
          if (!target) {
            return errorResult(`No lake found with id ${idValue}.`);
          }
        }

        if (nameValue !== null) {
          const { matches } = runtime.findByName(nameValue);
          if (matches.length === 0) {
            return errorResult(`No lake found with name ${nameValue}.`);
          }
          if (matches.length > 1) {
            return errorResult(
              `Multiple lakes match name ${nameValue}. Disambiguate by id.`,
              {
                candidates: matches.map((m) => ({
                  id: m.i,
                  name: m.name,
                  group: m.group,
                })),
              },
            );
          }
          const byName = matches[0]!;
          if (target && target.i !== byName.i) {
            return errorResult("id and name refer to different lakes.");
          }
          if (!target) target = byName;
        }
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      if (!target) {
        // Defensive — every branch above either sets target or
        // returns. This should be unreachable.
        return errorResult("Provide either id or name to identify the lake.");
      }

      const oldName = target.name;
      try {
        runtime.rename(target.i, newName);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        id: target.i,
        old_name: oldName,
        new_name: newName,
      });
    },
  };
}

export const renameLakeTool = createRenameLakeTool();
