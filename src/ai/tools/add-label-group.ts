import { errorResult, getGlobal, okResult } from "./_shared";
import { sanitizeGroupName } from "./add-route-group";
import type { Tool, ToolResult } from "./index";

/**
 * Re-export `sanitizeGroupName` from `add-route-group` so callers /
 * tests can use a single import path. Labels use the same regex
 * pipeline as routes/lakes: `lowercase → spaces→underscores → strip
 * non-\w/\s`. Crucially, this tool does NOT prefix the result —
 * label group ids are bare ("states", "addedLabels", custom names).
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

export interface AddLabelGroupRuntime {
  /**
   * True iff a DOM element with the given id already exists ANYWHERE
   * in the document. Mirrors the UI's `byId(group)` check, which is
   * global to the document, not scoped to `#labels`.
   */
  idExists(id: string): IdExistsCheck;
  /**
   * Append a new `<g id={id}>` under the `#labels` SVG layer. When a
   * `<g id="states">` already exists, perform a shallow clone of its
   * attributes so the new group inherits any default styling;
   * otherwise create a bare `<g>`. Either way, the new id is set
   * explicitly. Throws when the labels layer is unavailable.
   */
  appendGroup(id: string): void;
}

interface ElementLike {
  tagName?: string;
  setAttribute?(name: string, value: string): void;
  cloneNode?(deep: boolean): ElementLike;
  appendChild?(node: unknown): unknown;
}

interface D3LabelsLike {
  node?: () => ElementLike | null | undefined;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function resolveLabelsRoot(): ElementLike | null {
  // Prefer the D3 selection's underlying DOM node, matching how the
  // UI accesses the layer (e.g. `labels.selectAll(...)` patterns
  // elsewhere in `labels-editor.js`).
  const labelsSel = getGlobal<D3LabelsLike>("labels");
  if (labelsSel && typeof labelsSel.node === "function") {
    const node = labelsSel.node();
    if (node) return node;
  }
  if (typeof document !== "undefined") {
    const el = document.getElementById("labels");
    if (el) return el as unknown as ElementLike;
  }
  return null;
}

function findStatesTemplate(): ElementLike | null {
  if (typeof document === "undefined") return null;
  const el = document.getElementById("states");
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

export const defaultAddLabelGroupRuntime: AddLabelGroupRuntime = {
  idExists(id: string): IdExistsCheck {
    if (typeof document === "undefined") return { exists: false };
    const el = document.getElementById(id);
    if (!el) return { exists: false };
    const tag = (el as unknown as ElementLike).tagName?.toLowerCase?.();
    return tag ? { exists: true, tag } : { exists: true };
  },
  appendGroup(id: string): void {
    const labelsRoot = resolveLabelsRoot();
    if (!labelsRoot || typeof labelsRoot.appendChild !== "function") {
      throw new Error("#labels SVG layer is unavailable.");
    }
    const template = findStatesTemplate();
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
    labelsRoot.appendChild(newGroup);
  },
};

export function createAddLabelGroupTool(
  runtime: AddLabelGroupRuntime = defaultAddLabelGroupRuntime,
): Tool {
  return {
    name: "add_label_group",
    description: `Create a new (empty) label group container (<g> element) under the #labels SVG layer — same primitive as the Edit Label dialog's "create new group" flow (labels-editor.js → createNewGroup), minus the auto-move-of-the-selected-label step. Sanitizes the user-supplied name (lowercase, spaces→underscores, strips non-\\w/\\s chars; NO "route-" or other prefix is added — label group ids are bare like "states", "addedLabels", or any custom name). Rejects empty/numeric-leading/colliding ids (collision check is global to the document, matching byId() in the UI). When a <g id="states"> exists, the new <g> shallow-clones its attributes so it inherits any default styling; otherwise a bare <g> is created. Sets the new id explicitly and appends under #labels. This only creates the group container — it does not move any existing labels; pair with a label-assignment tool for that.`,
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          minLength: 1,
          description:
            'Human-friendly group name. Will be lowercased, spaces converted to underscores, and non-word characters stripped. Final id must not collide with an existing element. No prefix is added — bare ids like "regions" or "landmarks" are used as-is.',
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

export const addLabelGroupTool = createAddLabelGroupTool();
