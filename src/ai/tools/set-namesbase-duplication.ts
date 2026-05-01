import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import {
  findNamesbaseByIndex,
  findNamesbasesByName,
  type NamesbaseRenameRef,
} from "./rename-namesbase";

interface NameBaseLike {
  name?: unknown;
  d?: unknown;
}

export interface SetNamesbaseDuplicationRuntime {
  /**
   * Returns the live `window.nameBases` array. Throws when the global
   * is missing or not an array (so callers get a clear diagnostic).
   */
  getNameBases(): NameBaseLike[];
  /**
   * Set `nameBases[index].d = value`. Throws when `index` is out of
   * range or the entry is not an object.
   */
  setDuplication(index: number, value: string): void;
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

export const defaultSetNamesbaseDuplicationRuntime: SetNamesbaseDuplicationRuntime =
  {
    getNameBases(): NameBaseLike[] {
      return getNameBasesOrThrow();
    },
    setDuplication(index: number, value: string): void {
      const bases = getNameBasesOrThrow();
      if (!Number.isInteger(index) || index < 0 || index >= bases.length) {
        throw new Error(`No namesbase found at index ${index}.`);
      }
      const entry = bases[index];
      if (!entry || typeof entry !== "object") {
        throw new Error(`No namesbase found at index ${index}.`);
      }
      (entry as { d: string }).d = value;
    },
  };

function readExistingDuplication(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function createSetNamesbaseDuplicationTool(
  runtime: SetNamesbaseDuplicationRuntime = defaultSetNamesbaseDuplicationRuntime,
): Tool {
  return {
    name: "set_namesbase_duplication",
    description:
      "Update the duplicate-chars-to-avoid string (.d) on a single namesbase entry, mirroring the Namesbase Editor's #namesbaseDouble input (updateBaseDublication). Writes nameBases[index].d on the live window.nameBases array. Each character in the string is one the name generator will avoid doubling (e.g. 'aeiou' prevents repeated vowels). Identify the namesbase by its array index or by current case-insensitive name; if both are supplied they must agree. Empty string is allowed and means 'no doubling restrictions'. The value is stored verbatim — it is NOT trimmed (a literal space is a valid char to avoid doubling) and '/' or '|' characters are NOT stripped (the legacy editor passes them through). The chain is not rebuilt; .d is consulted at name-generation time, not chain-build time.",
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
        duplicate_chars: {
          type: "string",
          description:
            "New value for the namesbase's duplication-avoid string (.d). Each character is one the name generator will avoid doubling. Empty string clears all restrictions. Stored verbatim — no trim, no '/'/'|' stripping.",
        },
      },
      required: ["duplicate_chars"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        index?: unknown;
        current_name?: unknown;
        duplicate_chars?: unknown;
      };

      // Validate duplicate_chars first — independent of identification.
      if (typeof input.duplicate_chars !== "string") {
        return errorResult("duplicate_chars must be a string.");
      }
      const newValue = input.duplicate_chars;

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

      const entry = bases[target.index] ?? {};
      const oldValue = readExistingDuplication((entry as NameBaseLike).d);

      try {
        runtime.setDuplication(target.index, newValue);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        index: target.index,
        name: target.name,
        old_duplicate_chars: oldValue,
        new_duplicate_chars: newValue,
      });
    },
  };
}

export const setNamesbaseDuplicationTool = createSetNamesbaseDuplicationTool();
