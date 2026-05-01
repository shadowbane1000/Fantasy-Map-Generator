import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface NamesbaseRenameRef {
  index: number;
  name: string;
}

interface NameBaseLike {
  name?: unknown;
}

function toRef(entry: NameBaseLike, index: number): NamesbaseRenameRef | null {
  if (!entry || typeof entry !== "object") return null;
  const name = typeof entry.name === "string" ? entry.name : "";
  return { index, name };
}

/**
 * Locate a namesbase by array index. Returns null when the index is
 * out of range, not an integer, or negative, or when the entry is
 * missing.
 */
export function findNamesbaseByIndex(
  bases: unknown[] | undefined,
  index: number,
): NamesbaseRenameRef | null {
  if (!Array.isArray(bases)) return null;
  if (!Number.isInteger(index) || index < 0 || index >= bases.length) {
    return null;
  }
  const entry = bases[index];
  if (!entry || typeof entry !== "object") return null;
  return toRef(entry as NameBaseLike, index);
}

/**
 * Find every namesbase whose name matches `needle` (case-insensitive,
 * trimmed exact match).
 */
export function findNamesbasesByName(
  bases: unknown[] | undefined,
  needle: string,
): NamesbaseRenameRef[] {
  const out: NamesbaseRenameRef[] = [];
  if (!Array.isArray(bases)) return out;
  const normalised = needle.trim().toLowerCase();
  if (!normalised) return out;
  for (let idx = 0; idx < bases.length; idx++) {
    const entry = bases[idx];
    if (!entry || typeof entry !== "object") continue;
    const e = entry as NameBaseLike;
    const name = typeof e.name === "string" ? e.name : "";
    if (name.toLowerCase() === normalised) {
      const ref = toRef(e, idx);
      if (ref) out.push(ref);
    }
  }
  return out;
}

export interface RenameNamesbaseRuntime {
  /**
   * Returns the live `window.nameBases` array. Throws when the global
   * is missing or not an array (so callers get a clear diagnostic).
   */
  getNameBases(): NameBaseLike[];
  /** Sets `nameBases[index].name = newName`. Throws if index is invalid. */
  setName(index: number, newName: string): void;
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

export const defaultRenameNamesbaseRuntime: RenameNamesbaseRuntime = {
  getNameBases(): NameBaseLike[] {
    return getNameBasesOrThrow();
  },
  setName(index: number, newName: string): void {
    const bases = getNameBasesOrThrow();
    if (!Number.isInteger(index) || index < 0 || index >= bases.length) {
      throw new Error(`No namesbase found at index ${index}.`);
    }
    const entry = bases[index];
    if (!entry || typeof entry !== "object") {
      throw new Error(`No namesbase found at index ${index}.`);
    }
    (entry as { name: string }).name = newName;
  },
};

function sanitiseNewName(raw: string): string {
  // Trim first, then strip "/" and "|" — matches the legacy editor's
  // `rawName.replace(/[/|]/g, "")` after a deliberate trim.
  return raw.trim().replace(/[/|]/g, "");
}

export function createRenameNamesbaseTool(
  runtime: RenameNamesbaseRuntime = defaultRenameNamesbaseRuntime,
): Tool {
  return {
    name: "rename_namesbase",
    description:
      "Rename a namesbase entry. Writes nameBases[index].name on the live window.nameBases array (matches the Namesbase Editor's name input). Identify the namesbase by its array index or by current case-insensitive name; if both are supplied they must agree. The new name is trimmed, then '/' and '|' characters are stripped (mirrors the editor's sanitisation), and must be non-empty after sanitisation.",
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
        new_name: {
          type: "string",
          description:
            "The new name. Trimmed, then '/' and '|' characters are stripped. Must be non-empty after sanitisation.",
        },
      },
      required: ["new_name"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        index?: unknown;
        current_name?: unknown;
        new_name?: unknown;
      };

      // Validate new_name first — independent of identification.
      if (typeof input.new_name !== "string" || !input.new_name.trim()) {
        return errorResult("new_name must be a non-empty string.");
      }
      const sanitised = sanitiseNewName(input.new_name);
      if (!sanitised) {
        return errorResult("new_name is empty after removing '/' and '|'.");
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
        // returns. This should be unreachable.
        return errorResult(
          "Provide either index or current_name to identify the namesbase.",
        );
      }

      const oldName = target.name;
      try {
        runtime.setName(target.index, sanitised);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        index: target.index,
        old_name: oldName,
        new_name: sanitised,
      });
    },
  };
}

export const renameNamesbaseTool = createRenameNamesbaseTool();
