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
  calculateChain?: (corpus: string) => unknown;
}

/**
 * Runtime-injection seam. The default implementation reads
 * `window.nameBases` and `window.Names`. Tests inject a fake to
 * exercise edge cases without the legacy boot.
 */
export interface AnalyzeNamesbaseRuntime {
  /**
   * Returns the live `window.nameBases` array. Throws when the global
   * is missing or not an array.
   */
  getNameBases(): NameBaseLike[];
  /**
   * Returns the values of `Names.calculateChain(corpus)` as a 2D
   * array (only the value-arrays — keys are not needed for the
   * variety statistic). Returns `null` when `window.Names` or
   * `Names.calculateChain` is unavailable.
   */
  calculateChain(corpus: string): unknown[][] | null;
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

export const defaultAnalyzeNamesbaseRuntime: AnalyzeNamesbaseRuntime = {
  getNameBases(): NameBaseLike[] {
    return getNameBasesOrThrow();
  },
  calculateChain(corpus: string): unknown[][] | null {
    const names = getGlobal<NamesModuleLike>("Names");
    if (!names || typeof names.calculateChain !== "function") return null;
    const chain = names.calculateChain(corpus);
    if (!chain || typeof chain !== "object") return null;
    return Object.values(chain as Record<string, unknown>).filter(
      Array.isArray,
    ) as unknown[][];
  },
};

function meanNum(arr: number[]): number {
  return arr.reduce((s, n) => s + n, 0) / arr.length;
}

function medianNum(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const n = sorted.length;
  if (n % 2 === 1) return sorted[(n - 1) / 2]!;
  return (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
}

function rn1(v: number): number {
  return Math.round(v * 10) / 10;
}

function rn0(v: number): number {
  return Math.round(v);
}

function uniqueInOrder<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

interface AnalyzeStats {
  length: number;
  min_length: number;
  max_length: number;
  mean_length: number;
  median_length: number;
  non_basic_chars: string;
  doubled_chars: string;
  duplicates_count: number;
  duplicates_sample: string[];
  multiword_rate: number;
  length_quality: "not_enough" | "low" | "good" | "overmuch";
  variety?: number;
  variety_quality?: "low" | "mean" | "good";
}

const DUPLICATES_SAMPLE_LIMIT = 20;

function analyzeCorpus(
  corpus: string,
  chainValues: unknown[][] | null,
): AnalyzeStats {
  const lower = corpus.toLowerCase();
  const namesArray = lower.split(",");
  const length = namesArray.length;
  const wordsLength = namesArray.map((n) => n.length);

  const min_length = Math.min(...wordsLength);
  const max_length = Math.max(...wordsLength);
  const mean_length = rn1(meanNum(wordsLength));
  const median_length = medianNum(wordsLength);

  const nonLatinMatches = corpus.match(/[^\p{ASCII}]/gu);
  const non_basic_chars = nonLatinMatches
    ? uniqueInOrder(nonLatinMatches.join("").toLowerCase().split("")).join("")
    : "";

  const geminate: string[] = namesArray.flatMap(
    (name) => name.match(/[^\w\s]|(.)(?=\1)/g) ?? [],
  );
  const counts = new Map<string, number>();
  for (const c of geminate) counts.set(c, (counts.get(c) ?? 0) + 1);
  const doubled = uniqueInOrder(geminate).filter(
    (c) => (counts.get(c) ?? 0) > 3,
  );
  const doubled_chars = doubled.join("");

  const counts2 = new Map<string, number>();
  for (const n of namesArray) counts2.set(n, (counts2.get(n) ?? 0) + 1);
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const n of namesArray) {
    if ((counts2.get(n) ?? 0) > 1 && !seen.has(n)) {
      seen.add(n);
      duplicates.push(n);
    }
  }

  const multiword_rate = meanNum(
    namesArray.map((n) => (n.includes(" ") ? 1 : 0)),
  );

  let length_quality: AnalyzeStats["length_quality"];
  if (length < 30) length_quality = "not_enough";
  else if (length < 100) length_quality = "low";
  else if (length <= 400) length_quality = "good";
  else length_quality = "overmuch";

  const stats: AnalyzeStats = {
    length,
    min_length,
    max_length,
    mean_length,
    median_length,
    non_basic_chars,
    doubled_chars,
    duplicates_count: duplicates.length,
    duplicates_sample: duplicates.slice(0, DUPLICATES_SAMPLE_LIMIT),
    multiword_rate,
    length_quality,
  };

  if (chainValues !== null) {
    const arrayLengths = chainValues.map((v) => v.length);
    const meanVariety = arrayLengths.length === 0 ? 0 : meanNum(arrayLengths);
    const variety = rn0(meanVariety);
    stats.variety = variety;
    if (variety < 15) stats.variety_quality = "low";
    else if (variety < 30) stats.variety_quality = "mean";
    else stats.variety_quality = "good";
  }

  return stats;
}

export function createAnalyzeNamesbaseTool(
  runtime: AnalyzeNamesbaseRuntime = defaultAnalyzeNamesbaseRuntime,
): Tool {
  return {
    name: "analyze_namesbase",
    description:
      "Return diagnostic statistics for a single namesbase corpus (mirrors the 'Analyze' button in the Namesbase Editor → analyzeNamesbase). Reads nameBases[i].b on the live window.nameBases array and computes: length (number of comma-split names), variety (mean per-key chain-array length from Names.calculateChain — omitted when Names is unavailable), min/max/mean/median name character length, non_basic_chars (unique non-Basic-Latin chars, lowercased), doubled_chars (chars appearing >3 times as geminate or non-word/non-space matches), duplicates_count + duplicates_sample (up to 20 distinct names appearing more than once), multiword_rate (0..1 fraction of names containing a space), and qualitative length_quality / variety_quality buckets matching the editor's color-coded labels. Identify the namesbase by its array index or by current case-insensitive name; if both are supplied they must agree. Pure read — does not mutate nameBases or any other state. Errors when the corpus is empty or window.nameBases is missing.",
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
      },
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        index?: unknown;
        current_name?: unknown;
      };

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
        return errorResult(
          "Provide either index or current_name to identify the namesbase.",
        );
      }

      const entry = bases[target.index] as NameBaseLike;
      const rawB = entry?.b;
      if (typeof rawB !== "string" || !rawB.trim()) {
        return errorResult("Namesbase corpus is empty.");
      }

      let chainValues: unknown[][] | null = null;
      try {
        chainValues = runtime.calculateChain(rawB);
      } catch {
        chainValues = null;
      }

      const stats = analyzeCorpus(rawB, chainValues);

      return okResult({
        index: target.index,
        name: target.name,
        ...stats,
      });
    },
  };
}

export const analyzeNamesbaseTool = createAnalyzeNamesbaseTool();
