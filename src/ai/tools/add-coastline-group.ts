import { errorResult, getGlobal, okResult } from "./_shared";
import { sanitizeGroupName } from "./add-route-group";
import type { Tool, ToolResult } from "./index";

/**
 * Re-export `sanitizeGroupName` from `add-route-group` so callers /
 * tests can use a single import path. Coastline groups use the same
 * regex pipeline as routes / lakes / labels: `lowercase →
 * spaces→underscores → strip non-\w/\s`. Crucially, this tool does
 * NOT prefix the result — coastline group ids are bare ("sea_island",
 * "lake_island", or any custom name).
 */
export { sanitizeGroupName };

/**
 * Result of a runtime id-existence check. We surface the existing
 * element's tag name so the error message can hint at what is in the
 * way (`<g>`, `<input>`, etc.) — matching the spirit of the UI's
 * generic "Element with this id already exists" message while giving
 * the chat caller a bit more context.
 */
export interface IdExistsCheck {
  exists: boolean;
  tag?: string;
}

/**
 * Outcome of `appendGroup`. Tracks whether we cloned attributes from
 * `<g id="sea_island">` so the tool's success payload can surface the
 * `cloned_from` field without doing a second DOM walk inside the
 * tool body. Slight divergence from `add-lake-group.ts`'s `void`
 * return — see plan 349.
 */
export interface AppendGroupResult {
  /**
   * id of the template the new group's attributes were cloned from
   * (currently always `"sea_island"` when a clone happens), or `null`
   * when a bare `<g>` was created.
   */
  clonedFrom: string | null;
}

export interface AddCoastlineGroupRuntime {
  /**
   * True iff a DOM element with the given id already exists ANYWHERE
   * in the document. Mirrors the UI's `byId(group)` check, which is
   * global to the document, not scoped to `#coastline`.
   */
  idExists(id: string): IdExistsCheck;
  /**
   * Append a new `<g id={id}>` under the `#coastline` SVG layer. When
   * a `<g id="sea_island">` already exists, perform a shallow clone
   * of its attributes so the new group inherits any default styling;
   * otherwise create a bare `<g>`. Either way, the new id is set
   * explicitly. Throws when the coastline layer is unavailable.
   */
  appendGroup(id: string): AppendGroupResult;
}

interface ElementLike {
  tagName?: string;
  setAttribute?(name: string, value: string): void;
  cloneNode?(deep: boolean): ElementLike;
  appendChild?(node: unknown): unknown;
}

interface D3CoastlineLike {
  node?: () => ElementLike | null | undefined;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function resolveCoastlineRoot(): ElementLike | null {
  // Prefer the D3 selection's underlying DOM node, matching how the
  // UI accesses the layer (e.g. `coastline.selectAll("g")` patterns
  // in `coastline-editor.js`).
  const coastlineSel = getGlobal<D3CoastlineLike>("coastline");
  if (coastlineSel && typeof coastlineSel.node === "function") {
    const node = coastlineSel.node();
    if (node) return node;
  }
  if (typeof document !== "undefined") {
    const el = document.getElementById("coastline");
    if (el) return el as unknown as ElementLike;
  }
  return null;
}

function findSeaIslandTemplate(): ElementLike | null {
  if (typeof document === "undefined") return null;
  const el = document.getElementById("sea_island");
  if (!el) return null;
  const tag = (el as unknown as ElementLike).tagName?.toLowerCase?.();
  if (tag !== "g") return null;
  return el as unknown as ElementLike;
}

function buildBareG(): ElementLike {
  if (typeof document === "undefined") {
    throw new Error("document is not available; cannot create <g>.");
  }
  const doc = document as unknown as {
    createElementNS?: (ns: string, name: string) => ElementLike;
    createElement?: (name: string) => ElementLike;
  };
  if (typeof doc.createElementNS === "function") {
    return doc.createElementNS(SVG_NS, "g");
  }
  if (typeof doc.createElement === "function") {
    return doc.createElement("g");
  }
  throw new Error("document cannot create <g> element.");
}

export const defaultAddCoastlineGroupRuntime: AddCoastlineGroupRuntime = {
  idExists(id: string): IdExistsCheck {
    if (typeof document === "undefined") return { exists: false };
    const el = document.getElementById(id);
    if (!el) return { exists: false };
    const tag = (el as unknown as ElementLike).tagName?.toLowerCase?.();
    return tag ? { exists: true, tag } : { exists: true };
  },
  appendGroup(id: string): AppendGroupResult {
    const coastlineRoot = resolveCoastlineRoot();
    if (!coastlineRoot || typeof coastlineRoot.appendChild !== "function") {
      throw new Error("#coastline SVG layer is unavailable.");
    }
    const template = findSeaIslandTemplate();
    let newGroup: ElementLike;
    let clonedFrom: string | null = null;
    if (template && typeof template.cloneNode === "function") {
      newGroup = template.cloneNode(false);
      clonedFrom = "sea_island";
    } else {
      newGroup = buildBareG();
    }
    if (typeof newGroup.setAttribute !== "function") {
      throw new Error("Cannot set id on the new <g> element.");
    }
    // CRITICAL: set the id explicitly even when cloning. The shallow
    // clone of <g id="sea_island"> would otherwise carry the
    // sea_island id verbatim, which would silently break the layer.
    newGroup.setAttribute("id", id);
    coastlineRoot.appendChild(newGroup);
    return { clonedFrom };
  },
};

export function createAddCoastlineGroupTool(
  runtime: AddCoastlineGroupRuntime = defaultAddCoastlineGroupRuntime,
): Tool {
  return {
    name: "add_coastline_group",
    description: `Create a new (empty) coastline group container (<g> element) under the #coastline SVG layer — same primitive as the Coastline Editor "Add group" button (coastline-editor.js → createNewGroup), minus the auto-move-of-the-selected-coastline-path step. Sanitizes the user-supplied name (lowercase, spaces→underscores, strips non-\\w/\\s chars; NO "coast-" or other prefix is added — coastline group ids are bare like "sea_island", "lake_island", or any custom name). Rejects empty/numeric-leading/colliding ids (collision check is global to the document, matching byId() in the UI). When a <g id="sea_island"> exists, the new <g> shallow-clones its attributes so it inherits any default styling; otherwise a bare <g> is created. The new id is set explicitly so the clone never carries sea_island's id. This only creates the group container — it does not move any existing coastline paths; pair with a future set_coastline_group for that.`,
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          minLength: 1,
          description:
            'Human-friendly group name. Will be lowercased, spaces converted to underscores, and non-word characters stripped. Final id must not collide with an existing element. No prefix is added — bare ids like "shipping_lanes" or "storm_coast" are used as-is.',
        },
      },
      required: ["name"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { name?: unknown };

      if (typeof input.name !== "string" || input.name.trim().length === 0) {
        return errorResult("name must be a non-empty string.");
      }

      const sanitized = sanitizeGroupName(input.name);
      if (sanitized.length === 0) {
        return errorResult("Invalid group name (sanitized to empty).");
      }

      if (Number.isFinite(Number(sanitized.charAt(0)))) {
        return errorResult("Group name must start with a letter.");
      }

      const check = runtime.idExists(sanitized);
      if (check.exists) {
        const tagSuffix = check.tag ? ` (<${check.tag}>)` : "";
        return errorResult(
          `Element with id ${sanitized}${tagSuffix} already exists.`,
        );
      }

      let appendOutcome: AppendGroupResult;
      try {
        appendOutcome = runtime.appendGroup(sanitized);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        id: sanitized,
        cloned_from: appendOutcome.clonedFrom,
      });
    },
  };
}

export const addCoastlineGroupTool = createAddCoastlineGroupTool();
