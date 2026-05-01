import { errorResult, getPack, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { DEFAULT_LAKE_GROUPS } from "./list-lake-groups";

/**
 * Minimal pack.features lake entry shape this tool reads/writes. We
 * only need `type`, `group`, and `removed` — the rest of the slot is
 * left untouched.
 */
interface LakeFeatureLike {
  type?: unknown;
  group?: unknown;
  removed?: unknown;
}

interface FeaturesPackLike {
  features?: ReadonlyArray<LakeFeatureLike | 0 | null | undefined>;
}

export interface RemoveLakeGroupRuntime {
  /** True when an SVG `<g id={group}>` exists as a direct child of #lakes. */
  groupExists(group: string): boolean;
  /** True when `<g id="freshwater">` exists as a direct child of #lakes. */
  freshwaterExists(): boolean;
  /**
   * Walk pack.features and set `feature.group = "freshwater"` for every
   * lake whose `feature.group === group` and `feature.removed !== true`.
   * Returns the count of features changed. Throws when `pack.features`
   * is unavailable — the tool surfaces that as an error so data and DOM
   * stay in sync (see plan_295.md "Legacy bug").
   */
  reassignFeaturesToFreshwater(group: string): number;
  /**
   * Move every direct child of `<g id={group}>` into `<g id="freshwater">`
   * (using DOM `appendChild`, which moves nodes), then remove the now
   * empty `<g id={group}>`. Returns the count of DOM nodes moved.
   * Throws when either group element is missing.
   */
  moveChildrenAndRemoveGroup(group: string): number;
  /**
   * Best-effort: remove the `<option value={group}>` entry from the
   * editor's `<select id="lakeGroup">` if the dropdown exists. Returns
   * `true` when an option was removed; `false` when the dropdown or
   * matching option is absent. Never throws.
   */
  removeDropdownOption(group: string): boolean;
}

function getDocument(): Document | null {
  if (typeof document === "undefined") return null;
  return document;
}

function findDirectGroupChild(lakesRoot: Element, id: string): Element | null {
  const children = lakesRoot.children;
  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    if (
      child?.tagName &&
      child.tagName.toLowerCase() === "g" &&
      child.id === id
    ) {
      return child;
    }
  }
  return null;
}

export const defaultRemoveLakeGroupRuntime: RemoveLakeGroupRuntime = {
  groupExists(group): boolean {
    const doc = getDocument();
    if (!doc) return false;
    const lakesRoot = doc.getElementById("lakes");
    if (!lakesRoot) return false;
    return findDirectGroupChild(lakesRoot, group) !== null;
  },
  freshwaterExists(): boolean {
    const doc = getDocument();
    if (!doc) return false;
    const lakesRoot = doc.getElementById("lakes");
    if (!lakesRoot) return false;
    return findDirectGroupChild(lakesRoot, "freshwater") !== null;
  },
  reassignFeaturesToFreshwater(group): number {
    const pack = getPack<FeaturesPackLike>();
    const features = pack?.features;
    if (!Array.isArray(features)) {
      throw new Error("pack.features is not available.");
    }
    let changed = 0;
    // Slot 0 is a placeholder; iterate from 1.
    for (let i = 1; i < features.length; i += 1) {
      const entry = features[i];
      if (!entry || typeof entry !== "object") continue;
      const f = entry as LakeFeatureLike & { group?: string };
      if (f.type !== "lake") continue;
      if (f.removed === true) continue;
      if (f.group !== group) continue;
      f.group = "freshwater";
      changed += 1;
    }
    return changed;
  },
  moveChildrenAndRemoveGroup(group): number {
    const doc = getDocument();
    if (!doc) {
      throw new Error("document is not available.");
    }
    const lakesRoot = doc.getElementById("lakes");
    if (!lakesRoot) {
      throw new Error("#lakes SVG element not found.");
    }
    const groupEl = findDirectGroupChild(lakesRoot, group);
    if (!groupEl) {
      throw new Error(
        `No lake group with id ${JSON.stringify(group)} under #lakes.`,
      );
    }
    const freshwaterEl = findDirectGroupChild(lakesRoot, "freshwater");
    if (!freshwaterEl) {
      throw new Error(
        '<g id="freshwater"> not found under #lakes; cannot reassign children.',
      );
    }
    let moved = 0;
    // Mirror the legacy `while (groupEl.childNodes.length)` loop. The
    // `firstChild` accessor includes text nodes; that matches the UI's
    // childNodes[0] behaviour so we preserve any whitespace nodes that
    // were already there.
    while (groupEl.firstChild) {
      freshwaterEl.appendChild(groupEl.firstChild);
      moved += 1;
    }
    groupEl.remove();
    return moved;
  },
  removeDropdownOption(group): boolean {
    try {
      const doc = getDocument();
      if (!doc) return false;
      const select = doc.getElementById("lakeGroup");
      if (!select) return false;
      // <select> exposes an `options` HTMLOptionsCollection. Be lenient
      // about non-HTMLSelectElement shapes (e.g. test stubs).
      const optionsLike = (
        select as unknown as {
          options?: ArrayLike<{ value?: string; remove?: () => void }>;
        }
      ).options;
      if (!optionsLike || typeof optionsLike.length !== "number") return false;
      for (let i = 0; i < optionsLike.length; i += 1) {
        const opt = optionsLike[i];
        if (opt && opt.value === group && typeof opt.remove === "function") {
          opt.remove();
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  },
};

export function createRemoveLakeGroupTool(
  runtime: RemoveLakeGroupRuntime = defaultRemoveLakeGroupRuntime,
): Tool {
  return {
    name: "remove_lake_group",
    description: `Delete a custom lake group and reassign every lake in it to "freshwater" — same side-effect as the Edit Lake dialog's "Remove group" button (lakes-editor.js → removeLakeGroup), but with the legacy data bug fixed: this tool ALSO updates pack.features[i].group to "freshwater" for every moved lake, so pack and SVG stay consistent. The default groups (${DEFAULT_LAKE_GROUPS.join(", ")}) cannot be removed. Errors when no <g id={group}> exists as a direct child of #lakes, when <g id="freshwater"> is missing, or when pack.features is unavailable. Best-effort dropdown cleanup: removes the matching <option> from <select id="lakeGroup"> if the editor is open. Returns { group, reassigned_count, svg_children_moved }.`,
    input_schema: {
      type: "object",
      properties: {
        group: {
          type: "string",
          description:
            "Lake group SVG id to delete. Must NOT be one of the defaults (freshwater, salt, sinkhole, frozen, lava, dry); must exist as a direct <g> child of #lakes.",
        },
      },
      required: ["group"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { group?: unknown };

      if (typeof input.group !== "string") {
        return errorResult("group must be a string.");
      }
      const group = input.group.trim();
      if (!group) {
        return errorResult("group must be a non-empty string.");
      }

      if ((DEFAULT_LAKE_GROUPS as readonly string[]).includes(group)) {
        return errorResult(
          `Default lake group ${JSON.stringify(group)} cannot be removed.`,
        );
      }

      if (!runtime.groupExists(group)) {
        return errorResult(
          `No lake group element found with id ${JSON.stringify(group)}.`,
        );
      }

      if (!runtime.freshwaterExists()) {
        return errorResult(
          '<g id="freshwater"> not found under #lakes; cannot reassign lakes.',
        );
      }

      let reassignedCount: number;
      try {
        reassignedCount = runtime.reassignFeaturesToFreshwater(group);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      let movedCount: number;
      try {
        movedCount = runtime.moveChildrenAndRemoveGroup(group);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      runtime.removeDropdownOption(group);

      return okResult({
        group,
        reassigned_count: reassignedCount,
        svg_children_moved: movedCount,
      });
    },
  };
}

export const removeLakeGroupTool = createRemoveLakeGroupTool();
