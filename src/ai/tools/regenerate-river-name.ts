import {
  errorResult,
  getGlobal,
  getPack,
  okResult,
  parseEntityRef,
  type RawRiver,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import {
  type RiverNameMode,
  resolveRiverNameMode,
} from "./regenerate-river-names";

export interface RegenerateRiverNameRef {
  i: number;
  name: string;
  mouth: number;
  removed?: boolean;
}

export interface RegenerateRiverNameRuntime {
  find(ref: number | string): RegenerateRiverNameRef | null;
  generateCulture(mouth: number): string;
  generateRandom(): string;
  apply(i: number, name: string): void;
  redraw(): void;
}

interface RiverPackLike {
  rivers?: RawRiver[];
}

interface RiversModuleLike {
  getName?: (cell: number) => string;
}

interface NamesModuleLike {
  getBase?: (idx: number) => string;
}

/**
 * Find a river by id (river.i) or case-insensitive name. Unlike
 * `findRiverByRef` in `rename-river.ts`, this DOES surface removed
 * rivers — the caller checks `removed` so we can emit the dedicated
 * "Cannot regenerate name for removed river" error rather than
 * masking it as "not found".
 */
function findRiverIncludingRemoved(
  rivers: RawRiver[] | undefined,
  ref: number | string,
): RawRiver | null {
  if (!Array.isArray(rivers)) return null;
  if (typeof ref === "number") {
    if (!Number.isInteger(ref)) return null;
    for (const r of rivers) {
      if (r && r.i === ref) return r;
    }
    return null;
  }
  if (typeof ref !== "string") return null;
  const needle = ref.trim().toLowerCase();
  if (!needle) return null;
  for (const r of rivers) {
    if (!r) continue;
    if ((r.name ?? "").toLowerCase() === needle) return r;
  }
  return null;
}

export const defaultRegenerateRiverNameRuntime: RegenerateRiverNameRuntime = {
  find(ref) {
    const river = findRiverIncludingRemoved(
      getPack<RiverPackLike>()?.rivers,
      ref,
    );
    if (!river) return null;
    return {
      i: river.i,
      name: river.name ?? "",
      mouth: typeof river.mouth === "number" ? river.mouth : 0,
      removed: river.removed === true ? true : undefined,
    };
  },
  generateCulture(mouth) {
    const rivers = getGlobal<RiversModuleLike>("Rivers");
    if (!rivers || typeof rivers.getName !== "function") {
      throw new Error(
        "Rivers.getName is not available; the map hasn't finished loading.",
      );
    }
    return rivers.getName(mouth);
  },
  generateRandom() {
    const names = getGlobal<NamesModuleLike>("Names");
    if (!names || typeof names.getBase !== "function") {
      throw new Error(
        "Names.getBase is not available; the map hasn't finished loading.",
      );
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
  apply(i, name) {
    const rivers = getPack<RiverPackLike>()?.rivers;
    if (!Array.isArray(rivers)) {
      throw new Error("pack.rivers is not available.");
    }
    const river = rivers.find((r) => r && r.i === i);
    if (!river) throw new Error(`River ${i} not found.`);
    river.name = name;
  },
  redraw() {
    getGlobal<() => void>("drawRivers")?.();
  },
};

export function createRegenerateRiverNameTool(
  runtime: RegenerateRiverNameRuntime = defaultRegenerateRiverNameRuntime,
): Tool {
  return {
    name: "regenerate_river_name",
    description: `Re-roll a single river's name — same side-effect as the Rivers Editor's per-river "Generate (culture)" / "Generate (random)" buttons. \`mode=culture\` (default) calls \`Rivers.getName(river.mouth)\` (the editor's culture button — currently \`Names.getCulture(pack.cells.culture[mouth])\`, but routed through Rivers.getName so this tool tracks any future divergence). \`mode=random\` picks a random nameBases index and calls \`Names.getBase(idx)\` (the editor's random button). Identifies the river by numeric river.i (non-contiguous because the generator skips removed rivers) or case-insensitive name. Removed rivers are rejected. Writes \`river.name\` and best-effort calls \`drawRivers()\`. Non-idempotent — each call produces a fresh random name.`,
    input_schema: {
      type: "object",
      properties: {
        river: {
          type: ["integer", "string"],
          description:
            "River id (matches river.i, not array index — non-contiguous because the generator skips removed rivers) or case-insensitive current name.",
        },
        mode: {
          type: "string",
          enum: ["culture", "random"],
          description:
            '"culture" (default) calls Rivers.getName(river.mouth); "random" calls Names.getBase with a random nameBases index.',
        },
      },
      required: ["river"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        river?: unknown;
        mode?: unknown;
      };

      const refResult = parseEntityRef(input.river, "river");
      if (!refResult.ok) return errorResult(refResult.error);

      let mode: RiverNameMode = "culture";
      if (input.mode !== undefined && input.mode !== null) {
        const resolved = resolveRiverNameMode(input.mode);
        if (!resolved) {
          return errorResult("mode must be 'culture' or 'random'.");
        }
        mode = resolved;
      }

      const target = runtime.find(refResult.ref);
      if (!target) {
        return errorResult(`River ${JSON.stringify(refResult.ref)} not found.`);
      }

      if (target.removed === true) {
        return errorResult(
          `Cannot regenerate name for removed river ${target.i}.`,
        );
      }

      // IMPORTANT: capture previousName BEFORE mutation.
      const previousName = target.name;

      let newName: string;
      try {
        newName =
          mode === "culture"
            ? runtime.generateCulture(target.mouth)
            : runtime.generateRandom();
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      if (typeof newName !== "string" || !newName.trim()) {
        return errorResult("Name generator returned an empty/invalid name.");
      }
      const finalName = newName.trim();

      try {
        runtime.apply(target.i, finalName);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      try {
        runtime.redraw();
      } catch {
        // Best-effort — the rename has already been applied.
      }

      return okResult({
        river: {
          i: target.i,
          previous_name: previousName,
          name: finalName,
        },
        mode,
      });
    },
  };
}

export const regenerateRiverNameTool = createRegenerateRiverNameTool();
