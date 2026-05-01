import { errorResult, getPack, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Minimal pack.features entry shape this tool reads.
 */
export interface RawLakeFeature {
  i: number;
  type?: string;
  name?: string;
  group?: string;
}

interface FeaturesPackLike {
  features?: ReadonlyArray<RawLakeFeature | 0 | null | undefined>;
}

export interface LakeGroupRef {
  i: number;
  name: string;
  oldGroup: string | null;
}

export interface LakeCandidate {
  i: number;
  name: string;
  group: string | null;
}

export type LakeGroupResolution =
  | { kind: "found"; ref: LakeGroupRef }
  | { kind: "not_found"; message: string }
  | { kind: "ambiguous"; candidates: LakeCandidate[] }
  | {
      kind: "mismatch";
      i: number;
      actualName: string;
      requestedName: string;
    };

export interface SetLakeGroupRuntime {
  /**
   * Resolve a lake by `id`, `name`, or both. Returns a discriminated
   * union the tool maps to a ToolResult.
   */
  find(input: { id?: number; name?: string }): LakeGroupResolution;
  /**
   * Return the list of group ids that exist as direct `<g>` children of
   * `#lakes`, or `null` when the DOM / element is unavailable.
   */
  listGroups(): string[] | null;
  /**
   * Move the lake's SVG element under the target `<g>` and write
   * `feature.group = group`. Throws when the SVG element or target
   * group element is missing.
   *
   * Returns `{changed}`:
   *   - `false` when the target group equals the current group (no-op);
   *     `feature.group` is left untouched and no DOM mutation occurs.
   *   - `true` after the data and DOM are updated.
   *
   * `oldGroup` is the value of `feature.group` BEFORE this call (or
   * `null` when the feature had no group).
   */
  apply(
    i: number,
    group: string,
  ): { changed: boolean; oldGroup: string | null };
}

/**
 * Iterate `pack.features` (skipping the `[0]` placeholder and any
 * non-object slot) and collect all lakes with a name matching `needle`
 * case-insensitively.
 */
export function findLakeCandidates(
  pack: FeaturesPackLike | undefined,
  needle: string,
): LakeCandidate[] {
  const features = pack?.features;
  if (!Array.isArray(features)) return [];
  const lower = needle.trim().toLowerCase();
  if (!lower) return [];
  const out: LakeCandidate[] = [];
  for (let idx = 1; idx < features.length; idx++) {
    const f = features[idx];
    if (!f || typeof f !== "object") continue;
    if (f.type !== "lake") continue;
    const name = (f.name ?? "").trim();
    if (name.toLowerCase() !== lower) continue;
    out.push({
      i: f.i,
      name,
      group: typeof f.group === "string" ? f.group : null,
    });
  }
  return out;
}

/**
 * Look up `pack.features[*]` for a lake whose `i` matches `id` (skipping
 * the `[0]` placeholder). Returns the feature only when `type === "lake"`.
 */
export function findLakeById(
  pack: FeaturesPackLike | undefined,
  id: number,
): RawLakeFeature | null {
  const features = pack?.features;
  if (!Array.isArray(features)) return null;
  if (!Number.isInteger(id) || id <= 0) return null;
  for (let idx = 1; idx < features.length; idx++) {
    const f = features[idx];
    if (!f || typeof f !== "object") continue;
    if (f.i !== id) continue;
    if (f.type !== "lake") return null;
    return f;
  }
  return null;
}

function getDocument(): Document | null {
  if (typeof document === "undefined") return null;
  return document;
}

/**
 * Escape an attribute-value string for use inside a CSS attribute
 * selector built with double quotes — `\` and `"` only. We don't try
 * to be a full CSS.escape since the only callsite passes group ids
 * already validated against the live #lakes children.
 */
function escapeAttrValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export const defaultSetLakeGroupRuntime: SetLakeGroupRuntime = {
  find(input): LakeGroupResolution {
    const pack = getPack<FeaturesPackLike>();

    if (typeof input.id === "number") {
      const lake = findLakeById(pack, input.id);
      if (!lake) {
        return {
          kind: "not_found",
          message: `No lake found with id ${input.id}.`,
        };
      }
      const actualName = (lake.name ?? "").trim();
      if (typeof input.name === "string") {
        const requested = input.name.trim();
        if (
          requested.length > 0 &&
          actualName.toLowerCase() !== requested.toLowerCase()
        ) {
          return {
            kind: "mismatch",
            i: lake.i,
            actualName,
            requestedName: requested,
          };
        }
      }
      return {
        kind: "found",
        ref: {
          i: lake.i,
          name: actualName,
          oldGroup: typeof lake.group === "string" ? lake.group : null,
        },
      };
    }

    if (typeof input.name === "string") {
      const candidates = findLakeCandidates(pack, input.name);
      if (candidates.length === 0) {
        return {
          kind: "not_found",
          message: `No lake found with name ${JSON.stringify(input.name)}.`,
        };
      }
      if (candidates.length > 1) {
        return { kind: "ambiguous", candidates };
      }
      const c = candidates[0];
      return {
        kind: "found",
        ref: { i: c.i, name: c.name, oldGroup: c.group },
      };
    }

    return {
      kind: "not_found",
      message: "Provide either id or name to identify the lake.",
    };
  },
  listGroups(): string[] | null {
    const doc = getDocument();
    if (!doc) return null;
    const lakesRoot = doc.getElementById("lakes");
    if (!lakesRoot) return null;
    const groups: string[] = [];
    const children = lakesRoot.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (
        child?.tagName &&
        child.tagName.toLowerCase() === "g" &&
        typeof child.id === "string" &&
        child.id
      ) {
        groups.push(child.id);
      }
    }
    return groups;
  },
  apply(
    i: number,
    group: string,
  ): { changed: boolean; oldGroup: string | null } {
    const pack = getPack<FeaturesPackLike>();
    const lake = findLakeById(pack, i);
    if (!lake) throw new Error(`Lake ${i} not found.`);
    const oldGroup = typeof lake.group === "string" ? lake.group : null;

    const doc = getDocument();
    if (!doc) {
      throw new Error("document is not available.");
    }
    const lakesRoot = doc.getElementById("lakes");
    if (!lakesRoot) {
      throw new Error("#lakes SVG element not found.");
    }
    let targetGroup: Element | null = null;
    const children = lakesRoot.children;
    for (let idx = 0; idx < children.length; idx++) {
      const child = children[idx];
      if (
        child?.tagName &&
        child.tagName.toLowerCase() === "g" &&
        child.id === group
      ) {
        targetGroup = child;
        break;
      }
    }
    if (!targetGroup) {
      throw new Error(
        `No lake group with id ${JSON.stringify(group)} under #lakes.`,
      );
    }
    const lakeEl = lakesRoot.querySelector(
      `[data-f="${escapeAttrValue(String(i))}"]`,
    );
    if (!lakeEl) {
      throw new Error(`Lake i=${i} has no SVG element under #lakes.`);
    }
    if (lakeEl.parentElement === targetGroup && oldGroup === group) {
      return { changed: false, oldGroup };
    }
    targetGroup.appendChild(lakeEl);
    lake.group = group;
    return { changed: true, oldGroup };
  },
};

export function createSetLakeGroupTool(
  runtime: SetLakeGroupRuntime = defaultSetLakeGroupRuntime,
): Tool {
  return {
    name: "set_lake_group",
    description:
      "Move a lake into a different lake group — same side-effect as picking a group from the Edit Lake dialog's Group dropdown. Writes feature.group on the matching pack.features[*] entry and re-parents the lake's <use> element under the target <g> inside #lakes. Default groups are freshwater, salt, sinkhole, frozen, lava, dry; custom groups created via the editor are also accepted (the tool reads the live <g> children of #lakes). Identify the lake by numeric id (pack.features[*].i) and/or current name (case-insensitive exact match). When a name matches multiple lakes, the tool errors with a list of candidates so the caller can disambiguate by id. Does NOT create new groups — pair with a future add_lake_group tool for that.",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "integer",
          description:
            "The lake's pack.features[*].i value. Either id or name must be provided; supplying both requires them to match.",
        },
        name: {
          type: "string",
          description:
            "The lake's current name (case-insensitive exact match). Either id or name must be provided.",
        },
        group: {
          type: "string",
          description:
            "Target lake group id; must already exist as a <g> directly under #lakes (e.g. freshwater, salt, sinkhole, frozen, lava, dry, or any custom group).",
        },
      },
      required: ["group"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        id?: unknown;
        name?: unknown;
        group?: unknown;
      };

      // group validation
      if (typeof input.group !== "string" || !input.group.trim()) {
        return errorResult("group must be a non-empty string.");
      }
      const targetGroup = input.group.trim();

      // id / name validation
      let parsedId: number | undefined;
      let parsedName: string | undefined;
      if (input.id !== undefined && input.id !== null) {
        if (
          typeof input.id !== "number" ||
          !Number.isInteger(input.id) ||
          input.id <= 0
        ) {
          return errorResult("id must be a positive integer.");
        }
        parsedId = input.id;
      }
      if (input.name !== undefined && input.name !== null) {
        if (typeof input.name !== "string" || !input.name.trim()) {
          return errorResult("name must be a non-empty string.");
        }
        parsedName = input.name.trim();
      }
      if (parsedId === undefined && parsedName === undefined) {
        return errorResult("Provide either id or name to identify the lake.");
      }

      // resolve lake
      const findInput: { id?: number; name?: string } = {};
      if (parsedId !== undefined) findInput.id = parsedId;
      if (parsedName !== undefined) findInput.name = parsedName;
      const resolved = runtime.find(findInput);
      if (resolved.kind === "not_found") {
        return errorResult(resolved.message);
      }
      if (resolved.kind === "ambiguous") {
        return errorResult(
          `Multiple lakes match name ${JSON.stringify(parsedName ?? "")}; disambiguate by id.`,
          { candidates: resolved.candidates },
        );
      }
      if (resolved.kind === "mismatch") {
        return errorResult(
          `Lake i=${resolved.i} is named ${JSON.stringify(resolved.actualName)}, not ${JSON.stringify(resolved.requestedName)}.`,
        );
      }
      const ref = resolved.ref;

      // validate target group exists
      const groups = runtime.listGroups();
      if (groups === null) {
        return errorResult("#lakes SVG element not found.");
      }
      if (!groups.includes(targetGroup)) {
        return errorResult(
          `No lake group with id ${JSON.stringify(targetGroup)} under #lakes.`,
          { available: groups },
        );
      }

      // apply
      let result: { changed: boolean; oldGroup: string | null };
      try {
        result = runtime.apply(ref.i, targetGroup);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: ref.i,
        name: ref.name,
        old_group: result.oldGroup,
        new_group: targetGroup,
        changed: result.changed,
      });
    },
  };
}

export const setLakeGroupTool = createSetLakeGroupTool();
