import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Discriminated union returned by the runtime's `findLabel`. Carries
 * the resolved `<text>` element and its current parent `<g>` (which
 * MUST be a direct child of `#labels`) on success, or one of several
 * specific failure modes the executor maps to user-facing errors.
 *
 * Same shape as `set-label-group.ts` — kept separate so each tool's
 * runtime can evolve independently, but the classification rules are
 * the same.
 */
export type LabelLookup =
  | { kind: "found"; el: Element; parent: Element }
  | { kind: "labels_root_missing" }
  | { kind: "not_found" }
  | { kind: "outside_labels" }
  | { kind: "unexpected_parent" };

export interface RemoveLabelRuntime {
  /**
   * Resolve the `<text>` with the given id. We trust ONLY a `<text>`
   * that is a descendant of `#labels` whose direct parent is itself
   * a direct `<g>` child of `#labels` — anything else is reported via
   * one of the non-`found` variants.
   */
  findLabel(labelId: string): LabelLookup;
  /**
   * Remove the companion `<textPath_${labelId}>` element. The legacy
   * editor uses `defs.select("#textPath_" + id).remove()` which
   * resolves the id globally — so we use a document-wide
   * `getElementById` here, matching that behaviour. Returns `true`
   * when the element was found and removed; `false` when it was
   * absent (lenient — missing defs are not an error).
   */
  removeTextpath(labelId: string): boolean;
  /** Remove `textEl` from its parent. Implementations call `textEl.remove()`. */
  removeLabel(textEl: Element): void;
}

interface D3LabelsLike {
  node?: () => Element | null | undefined;
}

function getDocument(): Document | null {
  if (typeof document === "undefined") return null;
  return document;
}

/**
 * Resolve the `#labels` SVG layer. Prefers the `window.labels` D3
 * selection's underlying node (the way the editor accesses the layer)
 * and falls back to `document.getElementById("labels")`.
 */
function resolveLabelsRoot(): Element | null {
  const labelsSel = getGlobal<D3LabelsLike>("labels");
  if (labelsSel && typeof labelsSel.node === "function") {
    const node = labelsSel.node();
    if (node) return node;
  }
  const doc = getDocument();
  if (!doc) return null;
  return doc.getElementById("labels");
}

function isDirectGroupChildOfLabels(
  candidate: Element | null,
  labelsRoot: Element,
): boolean {
  if (!candidate) return false;
  if (candidate.parentElement !== labelsRoot) return false;
  if (typeof candidate.tagName !== "string") return false;
  return candidate.tagName.toLowerCase() === "g";
}

function classifyFoundElement(el: Element, labelsRoot: Element): LabelLookup {
  const tag = typeof el.tagName === "string" ? el.tagName.toLowerCase() : "";
  if (tag !== "text") return { kind: "outside_labels" };
  // walk up to verify the text is a descendant of labelsRoot
  let cursor: Element | null = el.parentElement;
  let foundUnderLabels = false;
  while (cursor) {
    if (cursor === labelsRoot) {
      foundUnderLabels = true;
      break;
    }
    cursor = cursor.parentElement;
  }
  if (!foundUnderLabels) return { kind: "outside_labels" };
  const parent = el.parentElement;
  if (!isDirectGroupChildOfLabels(parent, labelsRoot)) {
    return { kind: "unexpected_parent" };
  }
  return { kind: "found", el, parent: parent as Element };
}

export const defaultRemoveLabelRuntime: RemoveLabelRuntime = {
  findLabel(labelId: string): LabelLookup {
    const labelsRoot = resolveLabelsRoot();
    if (!labelsRoot) return { kind: "labels_root_missing" };
    const doc = getDocument();
    // First try a global getElementById — cheap and matches how
    // labels-editor.js itself locates elements (`byId(...)`). Then
    // verify it is a `<text>` under #labels.
    const fast = doc ? doc.getElementById(labelId) : null;
    if (fast) {
      return classifyFoundElement(fast, labelsRoot);
    }
    // Fallback: scan `<text>` descendants of #labels in case the global
    // lookup was unavailable (e.g. shadow DOM, custom document mock).
    if (typeof labelsRoot.querySelectorAll === "function") {
      const texts = labelsRoot.querySelectorAll("text");
      for (let i = 0; i < texts.length; i += 1) {
        const t = texts[i];
        if (t && t.id === labelId) {
          return classifyFoundElement(t, labelsRoot);
        }
      }
    }
    return { kind: "not_found" };
  },
  removeTextpath(labelId: string): boolean {
    const doc = getDocument();
    if (!doc) return false;
    const def = doc.getElementById(`textPath_${labelId}`);
    if (!def) return false;
    def.remove();
    return true;
  },
  removeLabel(textEl: Element): void {
    textEl.remove();
  },
};

export function createRemoveLabelTool(
  runtime: RemoveLabelRuntime = defaultRemoveLabelRuntime,
): Tool {
  return {
    name: "remove_label",
    description:
      'Permanently delete a single label — same side-effect as the Edit Label dialog\'s "Remove" button (labels-editor.js → removeLabel). DESTRUCTIVE AND IRREVERSIBLE: removes the `<text>` element with id `label_id` AND its companion `<textPath id="textPath_{label_id}">` definition (which may live anywhere in the document, not just under `<defs>`). Pure DOM operation: does NOT mutate pack (labels have no pack mirror). The tool searches for the label scoped to descendants of `#labels`: any `<text>` with this id elsewhere in the document is rejected. Lenient on the def: if `textPath_{label_id}` is missing, the call still succeeds (`textpath_removed: false`). Returns { ok, label_id, textpath_removed }.',
    input_schema: {
      type: "object",
      properties: {
        label_id: {
          type: "string",
          description:
            'The exact id attribute of the <text> element to remove (e.g. "stateLabel0", "burgLabel5", "addedLabel_42"). Must resolve to a <text> whose direct parent is a <g> directly under #labels.',
        },
      },
      required: ["label_id"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { label_id?: unknown };

      if (typeof input.label_id !== "string" || !input.label_id.trim()) {
        return errorResult("label_id must be a non-empty string.");
      }
      const labelId = input.label_id.trim();

      const lookup = runtime.findLabel(labelId);
      if (lookup.kind === "labels_root_missing") {
        return errorResult("#labels SVG element not found.");
      }
      if (lookup.kind === "not_found") {
        return errorResult(
          `No label found with id ${JSON.stringify(labelId)}.`,
        );
      }
      if (lookup.kind === "outside_labels") {
        return errorResult(
          `Label ${JSON.stringify(labelId)} not found under #labels.`,
        );
      }
      if (lookup.kind === "unexpected_parent") {
        return errorResult(
          `Label ${JSON.stringify(labelId)} has unexpected parent.`,
        );
      }
      const { el: textEl } = lookup;

      // Remove the textPath def first (lenient — missing is fine), then
      // the <text> element. Mirrors the order in
      // labels-editor.js → removeLabel.
      const textpathRemoved = runtime.removeTextpath(labelId);
      try {
        runtime.removeLabel(textEl);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        label_id: labelId,
        textpath_removed: textpathRemoved,
      });
    },
  };
}

export const removeLabelTool = createRemoveLabelTool();
