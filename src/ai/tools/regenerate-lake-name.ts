import { errorResult, getGlobal, getPack, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { findLakeById, findLakesByName } from "./rename-lake";

export const LAKE_NAME_MODES = ["culture", "random"] as const;

export type LakeNameMode = (typeof LAKE_NAME_MODES)[number];

export interface RegenerateLakeNameRef {
  i: number;
  name: string;
  group: string;
}

export interface RegenerateLakeNameRuntime {
  findById(id: number): RegenerateLakeNameRef | null;
  findByName(name: string): { matches: RegenerateLakeNameRef[] };
  generateCultureName(ref: RegenerateLakeNameRef): string;
  generateRandomName(): string;
  apply(i: number, name: string): void;
}

interface LakePackLike {
  features?: unknown[];
}

interface LakesModuleLike {
  getName?: (feature: unknown) => string;
}

interface NamesModuleLike {
  getBase?: (idx: number) => string;
}

function getPackFeaturesOrThrow(): unknown[] {
  const features = getPack<LakePackLike>()?.features;
  if (!Array.isArray(features)) {
    throw new Error("pack.features is unavailable. Generate a map first.");
  }
  return features;
}

function findFeatureObjectById(features: unknown[], id: number): unknown {
  for (let idx = 1; idx < features.length; idx++) {
    const entry = features[idx];
    if (entry && typeof entry === "object") {
      const e = entry as { i?: unknown; type?: unknown };
      if (e.type === "lake" && e.i === id) return entry;
    }
  }
  return null;
}

export const defaultRegenerateLakeNameRuntime: RegenerateLakeNameRuntime = {
  findById(id: number): RegenerateLakeNameRef | null {
    return findLakeById(getPackFeaturesOrThrow(), id);
  },
  findByName(name: string): { matches: RegenerateLakeNameRef[] } {
    return { matches: findLakesByName(getPackFeaturesOrThrow(), name) };
  },
  generateCultureName(ref: RegenerateLakeNameRef): string {
    const lakes = getGlobal<LakesModuleLike>("Lakes");
    if (!lakes) {
      throw new Error(
        "Lakes is not available; the map hasn't finished loading.",
      );
    }
    if (typeof lakes.getName !== "function") {
      throw new Error("Lakes.getName is not available.");
    }
    const features = getPackFeaturesOrThrow();
    const feature = findFeatureObjectById(features, ref.i);
    if (!feature) {
      throw new Error(`No lake found with id ${ref.i}.`);
    }
    return lakes.getName(feature);
  },
  generateRandomName(): string {
    const names = getGlobal<NamesModuleLike>("Names");
    if (!names) {
      throw new Error(
        "Names is not available; the map hasn't finished loading.",
      );
    }
    if (typeof names.getBase !== "function") {
      throw new Error("Names.getBase is not available.");
    }
    const nameBases = getGlobal<unknown[]>("nameBases");
    if (!Array.isArray(nameBases) || nameBases.length === 0) {
      throw new Error("nameBases is not available or empty.");
    }
    const rand = getGlobal<(max: number) => number>("rand");
    const idx =
      typeof rand === "function"
        ? rand(nameBases.length - 1)
        : Math.floor(Math.random() * nameBases.length);
    return names.getBase(idx);
  },
  apply(i: number, name: string): void {
    const features = getPackFeaturesOrThrow();
    for (let idx = 1; idx < features.length; idx++) {
      const entry = features[idx];
      if (entry && typeof entry === "object") {
        const e = entry as { i?: unknown; type?: unknown; name?: unknown };
        if (e.type === "lake" && e.i === i) {
          (entry as { name: string }).name = name;
          return;
        }
      }
    }
    throw new Error(`No lake found with id ${i}.`);
  },
};

function isLakeNameMode(value: unknown): value is LakeNameMode {
  return value === "culture" || value === "random";
}

export function createRegenerateLakeNameTool(
  runtime: RegenerateLakeNameRuntime = defaultRegenerateLakeNameRuntime,
): Tool {
  return {
    name: "regenerate_lake_name",
    description:
      'Re-roll a lake\'s name using either the cultural-name generator (mode="culture", calls Lakes.getName(feature) — same as the lake editor\'s "Name (culture)" button) or a random base-name (mode="random", calls Names.getBase with a random index from nameBases — same as "Name (random)"). Identify the lake by numeric id (feature.i) or current case-insensitive name; if both are supplied they must agree. Writes feature.name on the matching pack.features entry. No SVG redraw — lake names aren\'t drawn by default.',
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
        mode: {
          type: "string",
          enum: [...LAKE_NAME_MODES],
          description:
            'Generator to use. "culture" calls Lakes.getName; "random" picks a random base name via Names.getBase.',
        },
      },
      required: ["mode"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        id?: unknown;
        name?: unknown;
        mode?: unknown;
      };

      // Validate mode first — must be the literal "culture" or "random".
      if (!isLakeNameMode(input.mode)) {
        return errorResult('mode must be "culture" or "random".');
      }
      const mode: LakeNameMode = input.mode;

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

      let target: RegenerateLakeNameRef | null = null;

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
        // Defensive — every branch above either sets target or returns.
        return errorResult("Provide either id or name to identify the lake.");
      }

      let generated: string;
      try {
        generated =
          mode === "culture"
            ? runtime.generateCultureName(target)
            : runtime.generateRandomName();
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      if (typeof generated !== "string" || !generated.trim()) {
        return errorResult("Name generator returned an empty/invalid name.");
      }
      const newName = generated.trim();
      const oldName = target.name;

      try {
        runtime.apply(target.i, newName);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        id: target.i,
        mode,
        old_name: oldName,
        new_name: newName,
      });
    },
  };
}

export const regenerateLakeNameTool = createRegenerateLakeNameTool();
