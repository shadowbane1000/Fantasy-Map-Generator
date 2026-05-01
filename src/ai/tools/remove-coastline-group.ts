import { errorResult, getGlobal, okResult } from "./_shared";
import { sanitizeGroupName } from "./add-route-group";
import type { Tool, ToolResult } from "./index";

/**
 * Re-export `sanitizeGroupName` for symmetry with `add-coastline-group.ts`
 * — callers / tests can import the name pipeline from either side of the
 * add/remove pair without juggling import paths.
 */
export { sanitizeGroupName };

/**
 * The two coastline groups the legacy editor refuses to remove:
 *   `if (["sea_island", "lake_island"].includes(group)) return tip(...)`
 * (`public/modules/ui/coastline-editor.js#removeCoastlineGroup`). These
 * are the structural defaults — sea_island is also the move target for
 * children of any custom group being removed, so removing it would
 * break the tool's own contract.
 */
export const DEFAULT_COASTLINE_GROUPS = ["sea_island", "lake_island"] as const;

/**
 * Minimal D3-selection-like surface we need from `window.coastline` to
 * resolve the coastline `<g>` root. `node()` returns the underlying
 * SVG element (or null/undefined when the selection is empty).
 */
interface D3CoastlineLike {
  node?: () => Element | null | undefined;
}

export interface RemoveCoastlineGroupRuntime {
  /**
   * True iff the `#coastline` SVG layer is reachable — either via the
   * `window.coastline` D3 selection's `.node()`, or as a direct
   * `document.getElementById("coastline")`. When both are absent this
   * is `false` and the tool surfaces a layer-unavailable error before
   * touching anything else.
   */
  coastlineLayerExists(): boolean;
  /**
   * True iff a `<g id={id}>` exists as a direct child of `#coastline`.
   * Mirrors the legacy `byId(group)` check, scoped to the coastline
   * layer so unrelated elements with colliding ids don't satisfy the
   * precondition by accident.
   */
  groupExists(id: string): boolean;
  /**
   * True iff `<g id="sea_island">` exists as a direct child of
   * `#coastline`. Required because every child of the removed group is
   * moved into sea_island; without it we cannot honour the legacy
   * behaviour and refuse to mutate.
   */
  seaIslandExists(): boolean;
  /**
   * Move every child of `<g id={id}>` into `<g id="sea_island">` via
   * DOM `appendChild` (which moves nodes, preserving order), then
   * remove the now-empty `<g id={id}>`. Returns the count moved.
   * Throws when `#coastline`, the group, or sea_island is missing —
   * the tool propagates that as an error.
   */
  moveChildrenAndRemoveGroup(id: string): number;
  /**
   * Best-effort: remove the matching `<option value={id}>` from
   * `<select id="coastlineGroup">`. Returns `true` when an option was
   * removed; `false` when the dropdown or matching option is absent.
   * Never throws — the editor may not even be open when the AI calls
   * this tool, and that is not an error.
   */
  removeDropdownOption(id: string): boolean;
}

function getDocument(): Document | null {
  if (typeof document === "undefined") return null;
  return document;
}

function findDirectGroupChild(
  coastlineRoot: Element,
  id: string,
): Element | null {
  const children = coastlineRoot.children;
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

/**
 * Resolve the `#coastline` root element. Prefers the D3 selection
 * (matches how the legacy editor reaches the layer); falls back to
 * `document.getElementById("coastline")`. Returns null when neither
 * resolves — the caller treats that as a layer-unavailable error.
 */
function resolveCoastlineRoot(): Element | null {
  const coastlineSel = getGlobal<D3CoastlineLike>("coastline");
  if (coastlineSel && typeof coastlineSel.node === "function") {
    const node = coastlineSel.node();
    if (node) return node;
  }
  const doc = getDocument();
  if (!doc) return null;
  return doc.getElementById("coastline");
}

export const defaultRemoveCoastlineGroupRuntime: RemoveCoastlineGroupRuntime = {
  coastlineLayerExists(): boolean {
    return resolveCoastlineRoot() !== null;
  },
  groupExists(id): boolean {
    const root = resolveCoastlineRoot();
    if (!root) return false;
    return findDirectGroupChild(root, id) !== null;
  },
  seaIslandExists(): boolean {
    const root = resolveCoastlineRoot();
    if (!root) return false;
    return findDirectGroupChild(root, "sea_island") !== null;
  },
  moveChildrenAndRemoveGroup(id): number {
    const root = resolveCoastlineRoot();
    if (!root) {
      throw new Error("#coastline SVG layer is not available.");
    }
    const groupEl = findDirectGroupChild(root, id);
    if (!groupEl) {
      throw new Error(
        `No coastline group with id ${JSON.stringify(id)} under #coastline.`,
      );
    }
    const seaIslandEl = findDirectGroupChild(root, "sea_island");
    if (!seaIslandEl) {
      throw new Error(
        '<g id="sea_island"> not found under #coastline; cannot reassign children.',
      );
    }
    let moved = 0;
    // Mirrors the legacy `while (groupEl.childNodes.length)
    // sea.appendChild(groupEl.childNodes[0])` loop. Using `firstChild`
    // (rather than `children[0]`) preserves any text/whitespace nodes
    // the editor may have left in place — same node set as the legacy
    // `childNodes[0]` indexing.
    while (groupEl.firstChild) {
      seaIslandEl.appendChild(groupEl.firstChild);
      moved += 1;
    }
    groupEl.remove();
    return moved;
  },
  removeDropdownOption(id): boolean {
    try {
      const doc = getDocument();
      if (!doc) return false;
      const select = doc.getElementById("coastlineGroup");
      if (!select) return false;
      // <select> exposes an `options` HTMLOptionsCollection. Be lenient
      // about non-HTMLSelectElement shapes (e.g. test stubs without
      // the full prototype chain).
      const optionsLike = (
        select as unknown as {
          options?: ArrayLike<{ value?: string; remove?: () => void }>;
        }
      ).options;
      if (!optionsLike || typeof optionsLike.length !== "number") return false;
      for (let i = 0; i < optionsLike.length; i += 1) {
        const opt = optionsLike[i];
        if (opt && opt.value === id && typeof opt.remove === "function") {
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

export function createRemoveCoastlineGroupTool(
  runtime: RemoveCoastlineGroupRuntime = defaultRemoveCoastlineGroupRuntime,
): Tool {
  return {
    name: "remove_coastline_group",
    description: `Remove a custom coastline group container (<g> element) from the #coastline SVG layer — same side-effect as the Coastline Editor "Remove" button (coastline-editor.js → removeCoastlineGroup). Sanitizes the supplied name with the same pipeline as add_coastline_group (lowercase, spaces→underscores, strip non-\\w/\\s; NO prefix added). Refuses to remove the two default groups (${DEFAULT_COASTLINE_GROUPS.join(", ")}); these are structural and sea_island is also the move target for the removed group's children. Before mutating, the tool verifies the named <g> exists as a direct child of #coastline AND that <g id="sea_island"> is present (the move target). Every child of the removed <g> is then moved into <g id="sea_island"> via appendChild (preserving order), and the now-empty <g> is removed. Best-effort dropdown cleanup: removes the matching <option> from <select id="coastlineGroup"> when the editor is open. Coastline features are NOT mirrored in pack (unlike lake features), so this is purely a DOM-side operation — no pack mutation is performed. Returns { ok, id, moved_count, dropdown_option_removed }.`,
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Coastline group name to remove. Will be sanitized identically to add_coastline_group (lowercase, spaces→underscores, strip non-\\w/\\s). Must NOT resolve to sea_island or lake_island; must exist as a direct <g> child of #coastline.",
        },
      },
      required: ["name"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { name?: unknown };

      if (typeof input.name !== "string" || input.name.trim().length === 0) {
        return errorResult("name must be a non-empty string.");
      }

      const id = sanitizeGroupName(input.name);
      if (id.length === 0) {
        return errorResult(
          "Group name must contain at least one valid character.",
        );
      }

      if ((DEFAULT_COASTLINE_GROUPS as readonly string[]).includes(id)) {
        return errorResult(
          `Cannot remove the default '${id}' coastline group.`,
        );
      }

      if (!runtime.coastlineLayerExists()) {
        return errorResult("coastline SVG layer is not available.");
      }

      if (!runtime.groupExists(id)) {
        return errorResult(
          `No coastline group with id '${id}' exists under #coastline.`,
        );
      }

      if (!runtime.seaIslandExists()) {
        return errorResult(
          `Cannot remove '${id}': the default 'sea_island' group is missing.`,
        );
      }

      let movedCount: number;
      try {
        movedCount = runtime.moveChildrenAndRemoveGroup(id);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      const dropdownOptionRemoved = runtime.removeDropdownOption(id);

      return okResult({
        id,
        moved_count: movedCount,
        dropdown_option_removed: dropdownOptionRemoved,
      });
    },
  };
}

export const removeCoastlineGroupTool = createRemoveCoastlineGroupTool();
