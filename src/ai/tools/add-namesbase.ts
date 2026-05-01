import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

interface NameBaseLike {
  name: string;
  b: string;
  min: number;
  max: number;
  d: string;
  m: number;
}

/**
 * Default placeholder corpus, copied verbatim from `namesbaseAdd` in
 * `public/modules/ui/namesbase-editor.js`. Intentionally short — the
 * editor's hint message ("Please provide names data") encourages the
 * user to swap it immediately. The AI tool surfaces the same default so
 * follow-up `set_namesbase_names` calls remain consistent with the
 * editor's "click Add → fill in real names" flow.
 */
export const DEFAULT_NAMESBASE_CORPUS =
  "This,is,an,example,of,name,base,showing,correct,format,It,should,have,at,least,one,hundred,names,separated,with,comma";

/**
 * Runtime-injection seam. The default implementation reads
 * `window.nameBases` and appends to it. Tests inject a fake to exercise
 * edge cases (missing global, push throws, etc.) without the legacy
 * boot.
 *
 * Note: unlike `set_namesbase_names`, the legacy `namesbaseAdd()` does
 * NOT call `Names.updateChain` — the chain is computed lazily on first
 * `Names.getBase(index, ...)` call. We mirror this exactly.
 */
export interface AddNamesbaseRuntime {
  /**
   * Returns the live `window.nameBases` array. Throws when the global
   * is missing or not an array (so callers get a clear diagnostic).
   */
  getNameBases(): NameBaseLike[];
  /** Pushes the entry onto `window.nameBases`. Throws if global missing. */
  appendNamesbase(entry: NameBaseLike): void;
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

export const defaultAddNamesbaseRuntime: AddNamesbaseRuntime = {
  getNameBases(): NameBaseLike[] {
    return getNameBasesOrThrow();
  },
  appendNamesbase(entry: NameBaseLike): void {
    const bases = getNameBasesOrThrow();
    bases.push(entry);
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

/**
 * Build a sanitised corpus from either a string or an array of strings.
 * Array form: trim each entry, drop empties, join with `,`. String form:
 * passed through. Both then strip `/` and `|` (mirrors the editor's
 * sanitisation in `updateNamesData`).
 */
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

/** Trim then strip `/` and `|` — matches `rename_namesbase`'s rule. */
function sanitiseName(raw: string): string {
  return raw.trim().replace(/[/|]/g, "");
}

function isInteger(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

interface AddNamesbaseInput {
  name?: unknown;
  min?: unknown;
  max?: unknown;
  duplicate_chars?: unknown;
  multiword_rate?: unknown;
  names?: unknown;
}

export function createAddNamesbaseTool(
  runtime: AddNamesbaseRuntime = defaultAddNamesbaseRuntime,
): Tool {
  return {
    name: "add_namesbase",
    description:
      "Append a new namesbase to `window.nameBases`, mirroring the Namesbase Editor's `namesbaseAdd` (clicking the Add button in `public/modules/ui/namesbase-editor.js`). All inputs are optional; defaults match the editor's placeholder values exactly: `name = \"Base\" + nameBases.length`, `min = 5`, `max = 12`, `duplicate_chars = \"\"` (`.d`), `multiword_rate = 0` (`.m`), and `names` defaults to the editor's 22-word placeholder corpus. The `name` is trimmed then '/' and '|' are stripped (matches `rename_namesbase`'s rule); if empty after sanitisation, falls back to the default `\"Base\" + N` (NOT an error — mirrors the editor's behaviour where Add never errors on bad name input). The `names` input may be either a comma-separated string (used as-is) or an array of strings (each entry trimmed, empty entries dropped, joined with ','). After build, '/' and '|' are stripped and the result must contain at least 3 comma-separated entries (matches `set_namesbase_names`'s gate). Returns the new entry's array index. Note: this tool does NOT call `Names.updateChain` — the editor's `namesbaseAdd` doesn't either, since the chain is computed lazily on first `Names.getBase(index, ...)` call.",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Desired name. Trimmed, then '/' and '|' are stripped. If empty after sanitisation, falls back to the default 'Base' + nameBases.length (NOT an error — mirrors the editor).",
        },
        min: {
          type: "integer",
          minimum: 2,
          maximum: 100,
          description:
            "Minimum generated-name length, integer in [2, 100]. Defaults to 5.",
        },
        max: {
          type: "integer",
          minimum: 2,
          maximum: 100,
          description:
            "Maximum generated-name length, integer in [2, 100]. Defaults to 12. Must be >= min when both supplied.",
        },
        duplicate_chars: {
          type: "string",
          description:
            "Characters allowed to be duplicated when generating names (stored as `.d`). Defaults to ''.",
        },
        multiword_rate: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description:
            "Multi-word generation rate (stored as `.m`), finite number in [0, 1]. Defaults to 0.",
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
            "Initial corpus. After sanitisation must contain at least 3 comma-separated entries. Defaults to the editor's placeholder corpus.",
        },
      },
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as AddNamesbaseInput;

      // --- Validate `name` (optional, but if supplied must be string) ---
      let nameRaw: string | undefined;
      if (input.name !== undefined && input.name !== null) {
        if (typeof input.name !== "string") {
          return errorResult("name must be a string.");
        }
        nameRaw = input.name;
      }

      // --- Validate `min` (optional integer in [2, 100]) ---
      let min = 5;
      if (input.min !== undefined && input.min !== null) {
        if (!isInteger(input.min) || input.min < 2 || input.min > 100) {
          return errorResult("min must be an integer in [2, 100].");
        }
        min = input.min;
      }

      // --- Validate `max` (optional integer in [2, 100]) ---
      let max = 12;
      if (input.max !== undefined && input.max !== null) {
        if (!isInteger(input.max) || input.max < 2 || input.max > 100) {
          return errorResult("max must be an integer in [2, 100].");
        }
        max = input.max;
      }

      if (min > max) {
        return errorResult("min must be <= max.");
      }

      // --- Validate `duplicate_chars` (optional string) ---
      let duplicateChars = "";
      if (
        input.duplicate_chars !== undefined &&
        input.duplicate_chars !== null
      ) {
        if (typeof input.duplicate_chars !== "string") {
          return errorResult("duplicate_chars must be a string.");
        }
        duplicateChars = input.duplicate_chars;
      }

      // --- Validate `multiword_rate` (optional finite number in [0, 1]) ---
      let multiwordRate = 0;
      if (input.multiword_rate !== undefined && input.multiword_rate !== null) {
        if (
          !isFiniteNumber(input.multiword_rate) ||
          input.multiword_rate < 0 ||
          input.multiword_rate > 1
        ) {
          return errorResult(
            "multiword_rate must be a finite number in [0, 1].",
          );
        }
        multiwordRate = input.multiword_rate;
      }

      // --- Validate `names` (optional string or string-array) ---
      let rawNames: string[] | string;
      if (input.names === undefined || input.names === null) {
        rawNames = DEFAULT_NAMESBASE_CORPUS;
      } else if (typeof input.names === "string") {
        rawNames = input.names;
      } else if (isStringArray(input.names)) {
        rawNames = input.names;
      } else {
        return errorResult("names must be a string or an array of strings.");
      }

      const corpus = buildCorpus(rawNames);
      if (!corpus.trim()) {
        return errorResult("names must be a non-empty string.");
      }
      if (corpus.split(",").length < 3) {
        return errorResult("Names corpus must have at least 3 names");
      }

      // --- Read the live `nameBases` array (catches missing global) ---
      let bases: NameBaseLike[];
      try {
        bases = runtime.getNameBases();
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      // --- Compute final name. Empty after sanitisation falls back to default. ---
      const defaultName = `Base${bases.length}`;
      let finalName = defaultName;
      if (nameRaw !== undefined) {
        const sanitised = sanitiseName(nameRaw);
        finalName = sanitised || defaultName;
      }

      // --- Build the new entry, mirror legacy field shape exactly. ---
      const newEntry: NameBaseLike = {
        name: finalName,
        min,
        max,
        d: duplicateChars,
        m: multiwordRate,
        b: corpus,
      };

      const newIndex = bases.length;
      try {
        runtime.appendNamesbase(newEntry);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      const samples = sampleNames(corpus);

      return okResult({
        index: newIndex,
        name: finalName,
        min,
        max,
        duplicate_chars: duplicateChars,
        multiword_rate: multiwordRate,
        name_count: corpus.split(",").length,
        sample_names: samples,
      });
    },
  };
}

export const addNamesbaseTool = createAddNamesbaseTool();
