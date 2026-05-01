import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import {
  findNamesbaseByIndex,
  findNamesbasesByName,
  type NamesbaseRenameRef,
} from "./rename-namesbase";

interface NameBaseLike {
  name?: unknown;
  b?: unknown;
}

interface NamesModuleLike {
  updateChain?: (index: number) => void;
}

/**
 * Runtime-injection seam. The default implementation reads
 * `window.nameBases` and calls `window.Names.updateChain`. Tests inject a
 * fake to exercise edge cases without the legacy boot.
 */
export interface SetNamesbaseNamesRuntime {
  /**
   * Returns the live `window.nameBases` array. Throws when the global is
   * missing or not an array (so callers get a clear diagnostic).
   */
  getNameBases(): NameBaseLike[];
  /** Sets `nameBases[index].b = b`. Throws if index is invalid. */
  setNamesData(index: number, b: string): void;
  /** Calls `window.Names.updateChain(index)`. Throws if Names module missing. */
  updateChain(index: number): void;
}

function getNameBasesOrThrow(): NameBaseLike[] {
  const bases = getGlobal<unknown>("nameBases");
  if (!Array.isArray(bases)) {
    throw new Error(
      "window.nameBases is unavailable. Generate or load a map first.",
    );
  }
  return bases as NameBaseLike[];
}

export const defaultSetNamesbaseNamesRuntime: SetNamesbaseNamesRuntime = {
  getNameBases(): NameBaseLike[] {
    return getNameBasesOrThrow();
  },
  setNamesData(index: number, b: string): void {
    const bases = getNameBasesOrThrow();
    if (!Number.isInteger(index) || index < 0 || index >= bases.length) {
      throw new Error(`No namesbase found at index ${index}.`);
    }
    const entry = bases[index];
    if (!entry || typeof entry !== "object") {
      throw new Error(`No namesbase found at index ${index}.`);
    }
    (entry as { b: string }).b = b;
  },
  updateChain(index: number): void {
    const names = getGlobal<NamesModuleLike>("Names");
    if (!names || typeof names.updateChain !== "function") {
      throw new Error("Names.updateChain is not available.");
    }
    names.updateChain(index);
  },
};

const SAMPLE_LIMIT = 5;

function sampleNames(corpus: string): string[] {
  const out: string[] = [];
  for (const part of corpus.split(",")) {
    if (out.length >= SAMPLE_LIMIT) break;
    const trimmed = part.trim();
    if (trimmed.length === 0) continue;
    out.push(trimmed);
  }
  return out;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

function buildCorpus(rawNames: string[] | string): string {
  let joined: string;
  if (Array.isArray(rawNames)) {
    joined = rawNames
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .join(",");
  } else {
    joined = rawNames;
  }
  return joined.replace(/[/|]/g, "");
}

export function createSetNamesbaseNamesTool(
  runtime: SetNamesbaseNamesRuntime = defaultSetNamesbaseNamesRuntime,
): Tool {
  return {
    name: "set_namesbase_names",
    description:
      "Replace the name corpus on a single namesbase, mirroring the Namesbase Editor's textarea-change handler (`updateNamesData` in namesbase-editor.js): writes `nameBases[index].b` on the live `window.nameBases`, then calls `Names.updateChain(index)` so the next `Names.getBase(index, ...)` uses the new corpus. Identify the namesbase by its array index or by current case-insensitive name; if both are supplied they must agree. The `names` input may be either a comma-separated string (used as-is) or an array of strings (each entry trimmed, empty entries dropped, joined with ','). After build, '/' and '|' characters are stripped (mirrors the editor's sanitisation). The result must contain at least 3 comma-separated entries (matches the editor's 'too short or incorrect' gate). Note: matches the editor's write order — `b` is mutated FIRST, then `updateChain` is called. If `updateChain` throws, the corpus has already been updated but the chain is stale.",
    input_schema: {
      type: "object",
      properties: {
        index: {
          type: "integer",
          minimum: 0,
          description:
            "Namesbase array index (matches the position in window.nameBases, where 0 is valid).",
        },
        current_name: {
          type: "string",
          description:
            "Current namesbase name (case-insensitive, trimmed exact match). Use index when multiple bases share a name.",
        },
        names: {
          oneOf: [
            {
              type: "string",
              description:
                "Comma-separated names string (used as-is, then '/' and '|' are stripped).",
            },
            {
              type: "array",
              items: { type: "string" },
              description:
                "Array of names. Each entry trimmed, empty entries dropped, then joined with ','.",
            },
          ],
          description:
            "New corpus. Either a comma-separated string or an array of strings. Must yield at least 3 comma-separated entries after sanitisation.",
        },
      },
      required: ["names"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        index?: unknown;
        current_name?: unknown;
        names?: unknown;
      };

      // Validate names shape first — independent of identification.
      let rawNames: string[] | string;
      if (typeof input.names === "string") {
        rawNames = input.names;
      } else if (isStringArray(input.names)) {
        rawNames = input.names;
      } else {
        return errorResult("names must be a string or an array of strings.");
      }

      const sanitised = buildCorpus(rawNames);
      if (!sanitised.trim()) {
        return errorResult("names must be a non-empty string.");
      }
      if (sanitised.split(",").length < 3) {
        return errorResult("Names corpus must have at least 3 names");
      }

      const hasIndex = input.index !== undefined && input.index !== null;
      const hasName =
        input.current_name !== undefined && input.current_name !== null;

      if (!hasIndex && !hasName) {
        return errorResult(
          "Provide either index or current_name to identify the namesbase.",
        );
      }

      let indexValue: number | null = null;
      if (hasIndex) {
        if (
          typeof input.index !== "number" ||
          !Number.isFinite(input.index) ||
          !Number.isInteger(input.index) ||
          input.index < 0
        ) {
          return errorResult("index must be a non-negative integer.");
        }
        indexValue = input.index;
      }

      let nameValue: string | null = null;
      if (hasName) {
        if (
          typeof input.current_name !== "string" ||
          !input.current_name.trim()
        ) {
          return errorResult("current_name must be a non-empty string.");
        }
        nameValue = input.current_name.trim();
      }

      let bases: NameBaseLike[];
      try {
        bases = runtime.getNameBases();
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      let target: NamesbaseRenameRef | null = null;

      if (indexValue !== null) {
        target = findNamesbaseByIndex(bases, indexValue);
        if (!target) {
          return errorResult(`No namesbase found at index ${indexValue}.`);
        }
      }

      if (nameValue !== null) {
        const matches = findNamesbasesByName(bases, nameValue);
        if (matches.length === 0) {
          return errorResult(`No namesbase found with name ${nameValue}.`);
        }
        if (matches.length > 1) {
          return errorResult(
            `Multiple namesbases match name ${nameValue}. Disambiguate by index.`,
            {
              candidates: matches.map((m) => ({
                index: m.index,
                name: m.name,
              })),
            },
          );
        }
        const byName = matches[0]!;
        if (target && target.index !== byName.index) {
          return errorResult("index and current_name disagree.");
        }
        if (!target) target = byName;
      }

      if (!target) {
        // Defensive — every branch above either sets target or returns.
        return errorResult(
          "Provide either index or current_name to identify the namesbase.",
        );
      }

      // Mirror the legacy editor's write order: set `b` first, then
      // updateChain. If updateChain throws, `b` has already been mutated.
      try {
        runtime.setNamesData(target.index, sanitised);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      try {
        runtime.updateChain(target.index);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      const samples = sampleNames(sanitised);

      return okResult({
        index: target.index,
        name: target.name,
        name_count: sanitised.split(",").length,
        sample_names: samples,
      });
    },
  };
}

export const setNamesbaseNamesTool = createSetNamesbaseNamesTool();
