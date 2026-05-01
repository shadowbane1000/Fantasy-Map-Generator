import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import {
  findNamesbaseByIndex,
  findNamesbasesByName,
  type NamesbaseRenameRef,
} from "./rename-namesbase";

/**
 * Inclusive bounds for both `min` and `max` length values. The legacy
 * slider in `src/index.html` (lines ~4889-4890) declares
 * `#namesbaseMin` with `min=2 max=100` and `#namesbaseMax` with
 * `min=2` (no upper bound). We cap both at `[2, 100]` for symmetry
 * and to reject pathological values; widening later is a one-line
 * change if a real need surfaces.
 */
const MIN_LEN = 2;
const MAX_LEN = 100;

interface NameBaseLike {
  name?: unknown;
  min?: unknown;
  max?: unknown;
}

export interface SetNamesbaseLengthRangeRuntime {
  /**
   * Returns the live `window.nameBases` array. Throws when the global
   * is missing or not an array (so callers get a clear diagnostic).
   */
  getNameBases(): NameBaseLike[];
  /**
   * Apply `{ min?, max? }` patch to `nameBases[index]`. Throws when
   * `index` is out of range or the entry is not an object. Only the
   * keys present in `patch` are written.
   */
  setLengthRange(index: number, patch: { min?: number; max?: number }): void;
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

export const defaultSetNamesbaseLengthRangeRuntime: SetNamesbaseLengthRangeRuntime =
  {
    getNameBases(): NameBaseLike[] {
      return getNameBasesOrThrow();
    },
    setLengthRange(index: number, patch: { min?: number; max?: number }): void {
      const bases = getNameBasesOrThrow();
      if (!Number.isInteger(index) || index < 0 || index >= bases.length) {
        throw new Error(`No namesbase found at index ${index}.`);
      }
      const entry = bases[index];
      if (!entry || typeof entry !== "object") {
        throw new Error(`No namesbase found at index ${index}.`);
      }
      const target = entry as { min?: number; max?: number };
      if (patch.min !== undefined) target.min = patch.min;
      if (patch.max !== undefined) target.max = patch.max;
    },
  };

function isIntegerInRange(value: number): boolean {
  return (
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= MIN_LEN &&
    value <= MAX_LEN
  );
}

function readExistingLen(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

export function createSetNamesbaseLengthRangeTool(
  runtime: SetNamesbaseLengthRangeRuntime = defaultSetNamesbaseLengthRangeRuntime,
): Tool {
  return {
    name: "set_namesbase_length_range",
    description:
      "Update the recommended min and/or max name-length bounds on a single namesbase entry, mirroring the Namesbase Editor's #namesbaseMin and #namesbaseMax inputs (updateBaseMin / updateBaseMax). Writes nameBases[index].min and/or .max on the live window.nameBases array. Identify the namesbase by its array index or by current case-insensitive name; if both are supplied they must agree. At least one of min/max must be provided. Both must be integers in [2, 100]. The editor enforces min <= max — when only one of min/max is supplied the new value is checked against the existing other field; when both are supplied they are checked against each other directly.",
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
        min: {
          type: "integer",
          minimum: MIN_LEN,
          maximum: MAX_LEN,
          description: `New minimum recommended name length. Integer in [${MIN_LEN}, ${MAX_LEN}]. Must be <= the new (or, if unchanged, existing) max.`,
        },
        max: {
          type: "integer",
          minimum: MIN_LEN,
          maximum: MAX_LEN,
          description: `New maximum recommended name length. Integer in [${MIN_LEN}, ${MAX_LEN}]. Must be >= the new (or, if unchanged, existing) min.`,
        },
      },
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        index?: unknown;
        current_name?: unknown;
        min?: unknown;
        max?: unknown;
      };

      const hasMin = input.min !== undefined && input.min !== null;
      const hasMax = input.max !== undefined && input.max !== null;
      if (!hasMin && !hasMax) {
        return errorResult("Provide min or max (or both).");
      }

      let minValue: number | null = null;
      if (hasMin) {
        if (typeof input.min !== "number" || !isIntegerInRange(input.min)) {
          return errorResult(
            `min must be an integer in [${MIN_LEN}, ${MAX_LEN}].`,
          );
        }
        minValue = input.min;
      }

      let maxValue: number | null = null;
      if (hasMax) {
        if (typeof input.max !== "number" || !isIntegerInRange(input.max)) {
          return errorResult(
            `max must be an integer in [${MIN_LEN}, ${MAX_LEN}].`,
          );
        }
        maxValue = input.max;
      }

      if (minValue !== null && maxValue !== null && minValue > maxValue) {
        return errorResult("min must be <= max.");
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

      const entry = bases[target.index] ?? {};
      const oldMin = readExistingLen((entry as NameBaseLike).min);
      const oldMax = readExistingLen((entry as NameBaseLike).max);

      // Cross-field invariant against the existing entry, when only
      // one bound was supplied.
      if (minValue !== null && maxValue === null) {
        if (oldMax !== null && minValue > oldMax) {
          return errorResult(
            `min (${minValue}) cannot be greater than existing max (${oldMax}).`,
          );
        }
      }
      if (maxValue !== null && minValue === null) {
        if (oldMin !== null && maxValue < oldMin) {
          return errorResult(
            `max (${maxValue}) cannot be less than existing min (${oldMin}).`,
          );
        }
      }

      const patch: { min?: number; max?: number } = {};
      if (minValue !== null) patch.min = minValue;
      if (maxValue !== null) patch.max = maxValue;

      try {
        runtime.setLengthRange(target.index, patch);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      const newMin = minValue !== null ? minValue : oldMin;
      const newMax = maxValue !== null ? maxValue : oldMax;

      return okResult({
        index: target.index,
        name: target.name,
        old_min: oldMin,
        old_max: oldMax,
        new_min: newMin,
        new_max: newMax,
      });
    },
  };
}

export const setNamesbaseLengthRangeTool = createSetNamesbaseLengthRangeTool();
