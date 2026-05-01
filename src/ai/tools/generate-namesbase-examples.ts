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

export interface GenerateNamesbaseExamplesResult {
  index: number;
  name: string;
  requested_count: number;
  examples: string[];
  examples_truncated: boolean;
}

/**
 * Runtime-injection seam. The default implementation reads
 * `window.nameBases` and `window.Names`. Tests inject a fake to
 * exercise edge cases without the legacy boot.
 */
export interface GenerateNamesbaseExamplesRuntime {
  /**
   * Returns the live `window.nameBases` array. Throws when the global
   * is missing or not an array (so callers get a clear diagnostic).
   */
  getNameBases(): NameBaseLike[];
  /**
   * Calls `Names.getBase(index)` once. Returns the generated name
   * (string), or `undefined` to signal the generator failed for this
   * iteration (matches the legacy editor's truncation trigger).
   * Throws if `Names` / `Names.getBase` is unavailable; the tool
   * catches and surfaces this as a clean error.
   */
  generateOne(index: number): string | undefined;
}

interface NamesModuleLike {
  getBase?: (index: number) => unknown;
}

const DEFAULT_COUNT = 7;
const MAX_COUNT = 50;
const COUNT_ERROR = "count must be an integer in [1, 50].";

function getNameBasesOrThrow(): NameBaseLike[] {
  const bases = getGlobal<unknown>("nameBases");
  if (!Array.isArray(bases)) {
    throw new Error(
      "window.nameBases is unavailable. Generate or load a map first.",
    );
  }
  return bases as NameBaseLike[];
}

export const defaultGenerateNamesbaseExamplesRuntime: GenerateNamesbaseExamplesRuntime =
  {
    getNameBases(): NameBaseLike[] {
      return getNameBasesOrThrow();
    },
    generateOne(index: number): string | undefined {
      const names = getGlobal<NamesModuleLike>("Names");
      if (!names || typeof names.getBase !== "function") {
        throw new Error(
          "Names.getBase is not available; the map hasn't finished loading.",
        );
      }
      const value = names.getBase(index);
      // Defensive: anything non-string is treated as undefined to
      // trigger the truncation path. Legacy `Names.getBase` always
      // returns a string today, but this keeps the tool robust.
      return typeof value === "string" ? value : undefined;
    },
  };

export function createGenerateNamesbaseExamplesTool(
  runtime: GenerateNamesbaseExamplesRuntime = defaultGenerateNamesbaseExamplesRuntime,
): Tool {
  return {
    name: "generate_namesbase_examples",
    description:
      "Generate N example names from a single namesbase by calling Names.getBase(i) repeatedly (mirrors the 'Examples' button in the Namesbase Editor → updateExamples). Identify the namesbase by its array index or by current case-insensitive name; if both are supplied they must agree. count defaults to 7 (matches the legacy editor) and is capped at 50. If Names.getBase returns undefined for any iteration the loop stops early and the result has examples_truncated=true with whatever names were produced so far. Pure read — does not mutate nameBases or any other state.",
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
        count: {
          type: "integer",
          minimum: 1,
          maximum: MAX_COUNT,
          default: DEFAULT_COUNT,
          description: `Number of example names to generate (1-${MAX_COUNT}, default ${DEFAULT_COUNT}).`,
        },
      },
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        index?: unknown;
        current_name?: unknown;
        count?: unknown;
      };

      // Validate count first — independent of identification, and so
      // that a bogus count is surfaced even when no namesbase is
      // specified.
      let effectiveCount: number;
      if (input.count === undefined || input.count === null) {
        effectiveCount = DEFAULT_COUNT;
      } else {
        if (
          typeof input.count !== "number" ||
          !Number.isFinite(input.count) ||
          !Number.isInteger(input.count) ||
          input.count < 1 ||
          input.count > MAX_COUNT
        ) {
          return errorResult(COUNT_ERROR);
        }
        effectiveCount = input.count;
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
        // Defensive — every branch above either sets target or
        // returns. Should be unreachable.
        return errorResult(
          "Provide either index or current_name to identify the namesbase.",
        );
      }

      const examples: string[] = [];
      let truncated = false;
      for (let i = 0; i < effectiveCount; i++) {
        let value: string | undefined;
        try {
          value = runtime.generateOne(target.index);
        } catch (err) {
          return errorResult(err instanceof Error ? err.message : String(err));
        }
        if (value === undefined) {
          truncated = true;
          break;
        }
        examples.push(value);
      }

      return okResult({
        index: target.index,
        name: target.name,
        requested_count: effectiveCount,
        examples,
        examples_truncated: truncated,
      });
    },
  };
}

export const generateNamesbaseExamplesTool =
  createGenerateNamesbaseExamplesTool();
