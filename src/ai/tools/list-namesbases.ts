import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Wire-format record for a single namesbase. Mirrors the fields the
 * Namesbase Editor (`public/modules/ui/namesbase-editor.js`) reads for
 * each entry of `window.nameBases`, but compacted: the full corpus
 * string `b` is summarized via `name_count` + `sample_names` instead of
 * being dumped verbatim (real corpora can be hundreds of comma-separated
 * names long).
 */
export interface NamesbaseEntry {
  /** Array index — same value the editor uses as the dropdown option's value. */
  index: number;
  /** Human-readable name (e.g. "German", "Elvish"). */
  name: string;
  /** Target minimum generated-name length. */
  min: number;
  /** Target maximum generated-name length. */
  max: number;
  /** Characters whose duplication is allowed/handled (legacy `d` field). May be "". */
  duplicate_chars: string;
  /** Multi-word rate, 0..1 (legacy `m` field). 0 when missing. */
  multiword_rate: number;
  /**
   * Number of comma-separated names in the corpus. Computed as
   * `b.split(",").length` when `b` is a non-empty string (matches the
   * legacy editor's `analyzeNamesbase` count); `0` otherwise.
   */
  name_count: number;
  /**
   * Up to 5 example names from the corpus, in original order, trimmed,
   * with empty entries excluded. Helps describe a namesbase without
   * dumping the entire corpus.
   */
  sample_names: string[];
}

/**
 * Runtime-injection seam. The default implementation reads
 * `window.nameBases`. Tests inject a fake to exercise edge cases.
 */
export interface ListNamesbasesRuntime {
  /**
   * Return the current `nameBases` array, or `null` when it isn't
   * available (missing global, not an array). Tools surface `null`
   * as a structured error.
   */
  getNameBases(): unknown[] | null;
}

export const defaultListNamesbasesRuntime: ListNamesbasesRuntime = {
  getNameBases(): unknown[] | null {
    const value = getGlobal<unknown>("nameBases");
    return Array.isArray(value) ? value : null;
  },
};

interface RawNamesbaseLike {
  name?: unknown;
  min?: unknown;
  max?: unknown;
  d?: unknown;
  m?: unknown;
  b?: unknown;
}

const SAMPLE_LIMIT = 5;

function coerceString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function coerceNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length > 0) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function summarizeEntry(entry: unknown, index: number): NamesbaseEntry | null {
  if (!entry || typeof entry !== "object") return null;
  const raw = entry as RawNamesbaseLike;

  const b = coerceString(raw.b, "");
  let nameCount = 0;
  let sampleNames: string[] = [];
  if (b.length > 0) {
    const parts = b.split(",");
    nameCount = parts.length;
    sampleNames = [];
    for (const part of parts) {
      if (sampleNames.length >= SAMPLE_LIMIT) break;
      const trimmed = part.trim();
      if (trimmed.length === 0) continue;
      sampleNames.push(trimmed);
    }
  }

  return {
    index,
    name: coerceString(raw.name, ""),
    min: coerceNumber(raw.min, 0),
    max: coerceNumber(raw.max, 0),
    duplicate_chars: coerceString(raw.d, ""),
    multiword_rate: coerceNumber(raw.m, 0),
    name_count: nameCount,
    sample_names: sampleNames,
  };
}

export function createListNamesbasesTool(
  runtime: ListNamesbasesRuntime = defaultListNamesbasesRuntime,
): Tool {
  return {
    name: "list_namesbases",
    description: `List the existing namesbases on the current map — same source the Namesbase Editor's dropdown reads (namesbase-editor.js → createBasesList): the global \`nameBases\` array (populated by \`Names.getNameBases()\`). Each entry is a per-culture name corpus + Markov-chain config used to generate place / burg / state / lake names. Returns one item per nameBases element, in original array order, with: index (the array position — same value the legacy editor stores in the dropdown's \`option.value\`), name (human-readable label, e.g. "German", "Elvish"), min / max (target generated-name length bounds), duplicate_chars (the legacy \`d\` field — characters whose duplication is allowed/handled; may be ""), multiword_rate (the legacy \`m\` field, 0..1; 0 when missing), name_count (\`b.split(",").length\` when the corpus is a non-empty string, mirroring the editor's \`analyzeNamesbase\` count; 0 when \`b\` is empty/missing), and sample_names (up to 5 example names from the corpus, trimmed, with empty splits excluded — preview without dumping the whole corpus). The full corpus string \`b\` is intentionally omitted (it can be very long). Returns { count, items }. Read-only; takes no parameters. Errors when \`window.nameBases\` is missing or isn't an array (i.e. before the legacy boot finishes).`,
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      const bases = runtime.getNameBases();
      if (bases === null) {
        return errorResult(
          "Namesbases are unavailable; cannot list namesbases. Wait for the map to finish loading.",
        );
      }
      const items: NamesbaseEntry[] = [];
      for (let i = 0; i < bases.length; i += 1) {
        const summary = summarizeEntry(bases[i], i);
        if (summary !== null) items.push(summary);
      }
      return okResult({ count: items.length, items });
    },
  };
}

export const listNamesbasesTool = createListNamesbasesTool();
