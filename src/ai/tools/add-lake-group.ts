import { errorResult, getGlobal, okResult } from "./_shared";
import { sanitizeGroupName } from "./add-route-group";
import type { Tool, ToolResult } from "./index";

/**
 * Re-export `sanitizeGroupName` from `add-route-group` so callers /
 * tests can use a single import path. Lakes use the same regex
 * pipeline as routes: `lowercase → spaces→underscores → strip
 * non-\w/\s`. Crucially, this tool does NOT prefix the result —
 * lake group ids are bare ("freshwater", "salt", custom names).
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

export interface AddLakeGroupRuntime {
  /**
   * True iff a DOM element with the given id already exists ANYWHERE
   * in the document. Mirrors the UI's `byId(group)` check, which is
   * global to the document, not scoped to `#lakes`.
   */
  idExists(id: string): IdExistsCheck;
  /**
   * Append a new `<g id={id}>` under the `#lakes` SVG layer. When a
   * `<g id="freshwater">` already exists, perform a shallow clone of
   * its attributes so the new group inherits any default styling;
   * otherwise create a bare `<g>`. Either way, the new id is set
   * explicitly. Throws when the lakes layer is unavailable.
   */
  appendGroup(id: string): void;
}

interface ElementLike {
  tagName?: string;
  setAttribute?(name: string, value: string): void;
  cloneNode?(deep: boolean): ElementLike;
  appendChild?(node: unknown): unknown;
}

interface D3LakesLike {
  node?: () => ElementLike | null | undefined;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function resolveLakesRoot(): ElementLike | null {
  // Prefer the D3 selection's underlying DOM node, matching how the
  // UI accesses the layer (e.g. `lakes.node()` patterns elsewhere).
  const lakesSel = getGlobal<D3LakesLike>("lakes");
  if (lakesSel && typeof lakesSel.node === "function") {
    const node = lakesSel.node();
    if (node) return node;
  }
  if (typeof document !== "undefined") {
    const el = document.getElementById("lakes");
    if (el) return el as unknown as ElementLike;
  }
  return null;
}

function findFreshwaterTemplate(): ElementLike | null {
  if (typeof document === "undefined") return null;
  const el = document.getElementById("freshwater");
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

export const defaultAddLakeGroupRuntime: AddLakeGroupRuntime = {
  idExists(id: string): IdExistsCheck {
    if (typeof document === "undefined") return { exists: false };
    const el = document.getElementById(id);
    if (!el) return { exists: false };
    const tag = (el as unknown as ElementLike).tagName?.toLowerCase?.();
    return tag ? { exists: true, tag } : { exists: true };
  },
  appendGroup(id: string): void {
    const lakesRoot = resolveLakesRoot();
    if (!lakesRoot || typeof lakesRoot.appendChild !== "function") {
      throw new Error("#lakes SVG layer is unavailable.");
    }
    const template = findFreshwaterTemplate();
    let newGroup: ElementLike;
    if (template && typeof template.cloneNode === "function") {
      newGroup = template.cloneNode(false);
    } else {
      newGroup = buildBareG();
    }
    if (typeof newGroup.setAttribute !== "function") {
      throw new Error("Cannot set id on the new <g> element.");
    }
    newGroup.setAttribute("id", id);
    lakesRoot.appendChild(newGroup);
  },
};

export function createAddLakeGroupTool(
  runtime: AddLakeGroupRuntime = defaultAddLakeGroupRuntime,
): Tool {
  return {
    name: "add_lake_group",
    description: `Create a new (empty) lake group container (<g> element) under the #lakes SVG layer — same primitive as the Edit Lake dialog's "create new group" flow (lakes-editor.js → createNewGroup), minus the auto-move-of-the-selected-lake step. Sanitizes the user-supplied name (lowercase, spaces→underscores, strips non-\\w/\\s chars; NO "route-" or other prefix is added — lake group ids are bare like "freshwater", "salt", or any custom name). Rejects empty/numeric-leading/colliding ids (collision check is global to the document, matching byId() in the UI). When a <g id="freshwater"> exists, the new <g> shallow-clones its attributes so it inherits any default styling; otherwise a bare <g> is created. Sets the new id explicitly and appends under #lakes. This only creates the group container — it does not move any existing lakes; pair with set_lake_group for that.`,
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          minLength: 1,
          description:
            'Human-friendly group name. Will be lowercased, spaces converted to underscores, and non-word characters stripped. Final id must not collide with an existing element. No prefix is added — bare ids like "wetlands" or "marsh" are used as-is.',
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

      try {
        runtime.appendGroup(sanitized);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({ id: sanitized });
    },
  };
}

export const addLakeGroupTool = createAddLakeGroupTool();
