import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import {
  findNamesbaseByIndex,
  findNamesbasesByName,
  type NamesbaseRenameRef,
} from "./rename-namesbase";

interface NameBaseLike {
  name?: unknown;
  m?: unknown;
}

export interface SetNamesbaseMultiwordRateRuntime {
  /**
   * Returns the live `window.nameBases` array. Throws when the global
   * is missing or not an array (so callers get a clear diagnostic).
   */
  getNameBases(): NameBaseLike[];
  /**
   * Set `nameBases[index].m = value`. Throws when `index` is out of
   * range or the entry is not an object.
   */
  setMultiwordRate(index: number, value: number): void;
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

export const defaultSetNamesbaseMultiwordRateRuntime: SetNamesbaseMultiwordRateRuntime =
  {
    getNameBases(): NameBaseLike[] {
      return getNameBasesOrThrow();
    },
    setMultiwordRate(index: number, value: number): void {
      const bases = getNameBasesOrThrow();
      if (!Number.isInteger(index) || index < 0 || index >= bases.length) {
        throw new Error(`No namesbase found at index ${index}.`);
      }
      const entry = bases[index];
      if (!entry || typeof entry !== "object") {
        throw new Error(`No namesbase found at index ${index}.`);
      }
      (entry as { m: number }).m = value;
    },
  };

function readExistingMultiwordRate(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function createSetNamesbaseMultiwordRateTool(
  runtime: SetNamesbaseMultiwordRateRuntime = defaultSetNamesbaseMultiwordRateRuntime,
): Tool {
  return {
    name: "set_namesbase_multiword_rate",
    description:
      "Update the multiword-rate (.m) on a single namesbase entry. .m is a probability in [0, 1] that a generated name from this base is multiword (e.g. 'New York' vs 'London'). The legacy Namesbase Editor does NOT expose a UI for this field — it is normally derived from the corpus by analyzeNamesbase and consulted at name-generation time — but it is part of the data model (initialized to 0 by namesbaseAdd) and overriding it explicitly lets the AI/user bias the generator. Writes nameBases[index].m on the live window.nameBases array. Identify the namesbase by its array index or by current case-insensitive name; if both are supplied they must agree. Values outside [0, 1] are rejected (no silent clamping). The chain is not rebuilt — .m is consulted at name-generation time.",
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
        multiword_rate: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description:
            "New value for the namesbase's multiword-rate (.m). Probability in [0, 1] that a generated name is multiword. 0 disables multiword names; 1 forces them.",
        },
      },
      required: ["multiword_rate"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        index?: unknown;
        current_name?: unknown;
        multiword_rate?: unknown;
      };

      // Validate multiword_rate first — independent of identification.
      if (
        typeof input.multiword_rate !== "number" ||
        !Number.isFinite(input.multiword_rate)
      ) {
        return errorResult("multiword_rate must be a finite number.");
      }
      if (input.multiword_rate < 0 || input.multiword_rate > 1) {
        return errorResult("multiword_rate must be in [0, 1].");
      }
      const newValue = input.multiword_rate;

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
      const oldValue = readExistingMultiwordRate((entry as NameBaseLike).m);

      try {
        runtime.setMultiwordRate(target.index, newValue);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        index: target.index,
        name: target.name,
        old_multiword_rate: oldValue,
        new_multiword_rate: newValue,
      });
    },
  };
}

export const setNamesbaseMultiwordRateTool =
  createSetNamesbaseMultiwordRateTool();
