import {
  errorResult,
  findEntityByRef,
  getPackCollection,
  okResult,
  parseEntityRef,
  type RawReligion,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface ReligionOriginsRef {
  i: number;
  name: string;
  previousOrigins: number[];
  locked: boolean;
}

export interface ReligionCandidateRef {
  i: number;
  name: string;
  removed: boolean;
}

export interface ReligionOriginsRuntime {
  find(ref: number | string): ReligionOriginsRef | null;
  findCandidate(i: number): ReligionCandidateRef | null;
  getReligionCount(): number;
  apply(i: number, origins: number[]): void;
}

function normalisePreviousOrigins(value: unknown): number[] {
  if (!Array.isArray(value)) return [0];
  const cleaned: number[] = [];
  for (const entry of value) {
    if (typeof entry === "number" && Number.isInteger(entry) && entry >= 0) {
      cleaned.push(entry);
    }
  }
  return cleaned.length ? cleaned : [0];
}

export const defaultReligionOriginsRuntime: ReligionOriginsRuntime = {
  find(ref) {
    const entry = findEntityByRef(
      getPackCollection<RawReligion>("religions"),
      ref,
    );
    if (!entry) return null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      previousOrigins: normalisePreviousOrigins(entry.origins),
      locked: !!entry.lock,
    };
  },
  findCandidate(i) {
    const religions = getPackCollection<RawReligion>("religions");
    const slot = religions?.[i];
    if (!slot) return null;
    return {
      i: slot.i,
      name: slot.name ?? "",
      removed: !!slot.removed,
    };
  },
  getReligionCount() {
    const religions = getPackCollection<RawReligion>("religions");
    return Array.isArray(religions) ? religions.length : 0;
  },
  apply(i, origins) {
    const religions = getPackCollection<RawReligion>("religions");
    const religion = religions?.[i];
    if (!religion) throw new Error(`Religion ${i} not found.`);
    if (religion.removed) throw new Error(`Religion ${i} has been removed.`);
    religion.origins = [...origins];
  },
};

function dedupePreserveOrder(values: number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const v of values) {
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export function createSetReligionOriginsTool(
  runtime: ReligionOriginsRuntime = defaultReligionOriginsRuntime,
): Tool {
  return {
    name: "set_religion_origins",
    description:
      "Set a religion's `origins` array — the list of parent religion indices representing religious lineage (e.g. Christianity → Judaism). Equivalent to the hierarchy-tree origin picker in the Religions Editor: `origins[0]` is the PRIMARY origin (0 = 'Top level' / root), and `origins[1..]` are SECONDARY origins. Full-array replace: supply the complete desired array (to add an origin, fetch the current array, push, and re-submit). Writes `pack.religions[i].origins = [...cleaned]`. Duplicates are collapsed preserving first-occurrence order. Empty array is accepted and normalised to `[0]` (top level), matching the editor convention. Rejects: religion 0 ('No religion' placeholder), removed religions, locked religions; origin entries that are the religion itself, removed religions, out-of-range ids, non-integers, negatives, or `0` anywhere except the primary slot. No visual redraw — the hierarchy tree is rebuilt lazily next time the user opens it.",
    input_schema: {
      type: "object",
      properties: {
        religion: {
          type: ["integer", "string"],
          description:
            "Numeric religion id (> 0) or case-insensitive current name.",
        },
        origins: {
          type: "array",
          description:
            "Parent religion indices. Empty array allowed (normalised to [0] = top level). First entry is the primary origin; the rest are secondary. `0` is only valid as the first entry.",
          items: { type: "integer" },
        },
      },
      required: ["religion", "origins"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        religion?: unknown;
        origins?: unknown;
      };

      const refResult = parseEntityRef(input.religion, "religion");
      if (!refResult.ok) return errorResult(refResult.error);

      if (!Array.isArray(input.origins)) {
        return errorResult("origins must be an array of integers.");
      }

      for (const entry of input.origins) {
        if (
          typeof entry !== "number" ||
          !Number.isFinite(entry) ||
          !Number.isInteger(entry) ||
          entry < 0
        ) {
          return errorResult(
            "origins must contain only non-negative integers.",
          );
        }
      }
      const rawOrigins = input.origins as number[];
      const cleaned = dedupePreserveOrder(rawOrigins);

      // `0` only allowed as the first slot (primary / "top level").
      for (let k = 1; k < cleaned.length; k++) {
        if (cleaned[k] === 0) {
          return errorResult(
            "origins may only contain 0 (top level) in the primary (first) slot.",
          );
        }
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No religion found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }
      if (current.i <= 0) {
        return errorResult(
          "Cannot set origins on religion 0 (the 'No religion' placeholder).",
        );
      }
      if (current.locked) {
        return errorResult(
          `Religion ${current.i} (${JSON.stringify(current.name)}) is locked. Unlock it first via set_entity_lock.`,
        );
      }

      const religionCount = runtime.getReligionCount();
      if (religionCount <= 0) {
        return errorResult(
          "pack.religions is not available yet; wait for the map to finish loading.",
        );
      }

      // Validate each non-zero candidate origin.
      for (const originId of cleaned) {
        if (originId === 0) continue; // top-level sentinel, already constrained to slot 0
        if (originId === current.i) {
          return errorResult(
            `origins must not reference the religion itself (i=${current.i}).`,
          );
        }
        if (originId >= religionCount) {
          return errorResult(
            `origin ${originId} is out of range (0 <= i < ${religionCount}).`,
          );
        }
        const candidate = runtime.findCandidate(originId);
        if (!candidate) {
          return errorResult(
            `origin ${originId} does not exist in pack.religions.`,
          );
        }
        if (candidate.removed) {
          return errorResult(
            `origin ${originId} (${JSON.stringify(candidate.name)}) has been removed.`,
          );
        }
      }

      const finalOrigins = cleaned.length ? cleaned : [0];

      try {
        runtime.apply(current.i, finalOrigins);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        previousOrigins: current.previousOrigins,
        origins: finalOrigins,
      });
    },
  };
}

export const setReligionOriginsTool = createSetReligionOriginsTool();
