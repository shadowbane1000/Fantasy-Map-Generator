import { errorResult, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Label-group ids whose `<g>` shell is preserved on removal — matches
 * the `basic = group === "states" || group === "addedLabels"` literal
 * in `removeLabelsGroup` (`public/modules/ui/labels-editor.js`). For
 * these groups, removing the group only deletes the labels (and their
 * textPath defs) it contains; the `<g>` itself stays so the renderer
 * can still emit those built-in categories on the next regenerate.
 */
export const BASIC_LABEL_GROUPS = ["states", "addedLabels"] as const;

export interface RemoveLabelGroupRuntime {
  /** True when an SVG `<g id={group}>` exists as a direct child of #labels. */
  groupExists(group: string): boolean;
  /**
   * Walk every `<text>` descendant of `<g id={group}>` under #labels.
   * For each, look up `textPath_<labelId>` in the document and remove
   * it if present, then remove the `<text>` element. Returns
   * `{ labelsRemoved, textpathsRemoved }`. May report
   * `textpathsRemoved < labelsRemoved` when some defs were already
   * missing — matches the lenient behaviour described in the tool
   * description.
   * Throws when `document`, `#labels`, or the group element is missing.
   */
  removeAllLabelsAndTextpaths(group: string): {
    labelsRemoved: number;
    textpathsRemoved: number;
  };
  /**
   * Remove `<g id={group}>` from `#labels`. Returns `true` when the
   * element was found and removed; `false` when it was already absent.
   * Never throws.
   */
  removeGroupElement(group: string): boolean;
}

function getDocument(): Document | null {
  if (typeof document === "undefined") return null;
  return document;
}

function findDirectGroupChild(labelsRoot: Element, id: string): Element | null {
  const children = labelsRoot.children;
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

export const defaultRemoveLabelGroupRuntime: RemoveLabelGroupRuntime = {
  groupExists(group): boolean {
    const doc = getDocument();
    if (!doc) return false;
    const labelsRoot = doc.getElementById("labels");
    if (!labelsRoot) return false;
    return findDirectGroupChild(labelsRoot, group) !== null;
  },
  removeAllLabelsAndTextpaths(group): {
    labelsRemoved: number;
    textpathsRemoved: number;
  } {
    const doc = getDocument();
    if (!doc) {
      throw new Error("document is not available.");
    }
    const labelsRoot = doc.getElementById("labels");
    if (!labelsRoot) {
      throw new Error("#labels SVG element not found.");
    }
    const groupEl = findDirectGroupChild(labelsRoot, group);
    if (!groupEl) {
      throw new Error(
        `No label group with id ${JSON.stringify(group)} under #labels.`,
      );
    }
    // Match D3's `selectAll("text")` semantics — descendant-inclusive.
    // `getElementsByTagName` returns a live HTMLCollection; snapshot it
    // first because we'll be removing nodes during iteration.
    const liveTexts = groupEl.getElementsByTagName("text");
    const texts: Element[] = [];
    for (let i = 0; i < liveTexts.length; i += 1) {
      const t = liveTexts[i];
      if (t) texts.push(t);
    }
    let labelsRemoved = 0;
    let textpathsRemoved = 0;
    for (const text of texts) {
      const labelId = text.id;
      // Even when the label has no id (defensive), still remove the
      // <text>; just skip the textPath lookup.
      if (labelId) {
        const def = doc.getElementById(`textPath_${labelId}`);
        if (def) {
          def.remove();
          textpathsRemoved += 1;
        }
      }
      text.remove();
      labelsRemoved += 1;
    }
    return { labelsRemoved, textpathsRemoved };
  },
  removeGroupElement(group): boolean {
    const doc = getDocument();
    if (!doc) return false;
    const labelsRoot = doc.getElementById("labels");
    if (!labelsRoot) return false;
    const groupEl = findDirectGroupChild(labelsRoot, group);
    if (!groupEl) return false;
    groupEl.remove();
    return true;
  },
};

export function createRemoveLabelGroupTool(
  runtime: RemoveLabelGroupRuntime = defaultRemoveLabelGroupRuntime,
): Tool {
  return {
    name: "remove_label_group",
    description: `Permanently delete a label group's contents — same side-effect as the Edit Label dialog's "Remove group" button (labels-editor.js → removeLabelsGroup). DESTRUCTIVE AND IRREVERSIBLE: every <text> descendant of <g id={group}> under #labels is removed, along with its corresponding <textPath id="textPath_{labelId}"> definition (which may live anywhere in the document, not just under #labels). For the basic built-in groups (${BASIC_LABEL_GROUPS.join(", ")}), the <g> shell itself is preserved so the renderer can still emit those built-in categories on the next regenerate; for any other (custom) group, the <g> element is removed too. Errors when no <g id={group}> exists as a direct child of #labels or when #labels is missing. Returns { group, labels_removed, textpaths_removed, group_removed }; textpaths_removed may be less than labels_removed when some textPath defs were already missing.`,
    input_schema: {
      type: "object",
      properties: {
        group: {
          type: "string",
          description:
            "Label group SVG id to clear or remove. Must exist as a direct <g> child of #labels. Basic groups (states, addedLabels) keep their <g> shell after this; custom groups are removed entirely.",
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

      if (!runtime.groupExists(group)) {
        return errorResult(
          `No label group element found with id ${JSON.stringify(group)}.`,
        );
      }

      let labelsRemoved: number;
      let textpathsRemoved: number;
      try {
        const counts = runtime.removeAllLabelsAndTextpaths(group);
        labelsRemoved = counts.labelsRemoved;
        textpathsRemoved = counts.textpathsRemoved;
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      const isBasic = (BASIC_LABEL_GROUPS as readonly string[]).includes(group);
      let groupRemoved = false;
      if (!isBasic) {
        groupRemoved = runtime.removeGroupElement(group);
      }

      return okResult({
        ok: true,
        group,
        labels_removed: labelsRemoved,
        textpaths_removed: textpathsRemoved,
        group_removed: groupRemoved,
      });
    },
  };
}

export const removeLabelGroupTool = createRemoveLabelGroupTool();
