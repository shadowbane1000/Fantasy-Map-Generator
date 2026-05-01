import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Discriminated union returned by the runtime's `findLabel`. Carries
 * the resolved `<text>` element and its current parent `<g>` (which
 * MUST be a direct child of `#labels`) on success, or one of several
 * specific failure modes the executor maps to user-facing errors.
 */
export type LabelLookup =
  | { kind: "found"; el: Element; parent: Element }
  | { kind: "labels_root_missing" }
  | { kind: "not_found" }
  | { kind: "outside_labels" }
  | { kind: "unexpected_parent" };

/**
 * Discriminated union returned by the runtime's `findTargetGroup`. On
 * miss we surface the list of available `<g>` ids under `#labels` so
 * the caller's error message can hint at what they could have picked.
 */
export type TargetGroupLookup =
  | { kind: "found"; el: Element }
  | { kind: "missing"; available: string[] }
  | { kind: "labels_root_missing" };

export interface SetLabelGroupRuntime {
  /**
   * Resolve the `<text>` with the given id. We trust ONLY a `<text>`
   * that is a descendant of `#labels` whose direct parent is itself
   * a direct `<g>` child of `#labels` — anything else is reported via
   * one of the non-`found` variants.
   */
  findLabel(labelId: string): LabelLookup;
  /**
   * Resolve a `<g id={group}>` that is a direct child of `#labels`.
   */
  findTargetGroup(group: string): TargetGroupLookup;
  /**
   * Re-parent `textEl` under `targetGroupEl`. Implementations call
   * `targetGroupEl.appendChild(textEl)` (DOM appendChild moves the
   * node when it already has a parent).
   */
  move(textEl: Element, targetGroupEl: Element): void;
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

export const defaultSetLabelGroupRuntime: SetLabelGroupRuntime = {
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
  findTargetGroup(group: string): TargetGroupLookup {
    const labelsRoot = resolveLabelsRoot();
    if (!labelsRoot) return { kind: "labels_root_missing" };
    const children = labelsRoot.children;
    const available: string[] = [];
    let match: Element | null = null;
    for (let i = 0; i < children.length; i += 1) {
      const child = children[i];
      if (
        child?.tagName &&
        child.tagName.toLowerCase() === "g" &&
        typeof child.id === "string" &&
        child.id
      ) {
        available.push(child.id);
        if (child.id === group) match = child;
      }
    }
    if (match) return { kind: "found", el: match };
    return { kind: "missing", available };
  },
  move(textEl: Element, targetGroupEl: Element): void {
    targetGroupEl.appendChild(textEl);
  },
};

export function createSetLabelGroupTool(
  runtime: SetLabelGroupRuntime = defaultSetLabelGroupRuntime,
): Tool {
  return {
    name: "set_label_group",
    description:
      'Move a single label (a <text> element under #labels) into a different label group — same side-effect as picking a different group from the Edit Label dialog\'s Group dropdown (labels-editor.js → changeGroup). Pure DOM operation: re-parents the <text> under the target <g>; does NOT mutate pack (labels have no pack mirror — group membership is purely SVG state). The tool searches for the label scoped to descendants of #labels: any <text> with this id elsewhere in the document is rejected. The target group must already exist as a <g> directly under #labels (e.g. "states", "burgLabels", "addedLabels", or any custom group created via add_label_group). When old_group equals new_group the call is a no-op success with changed=false. Note: unlike the Edit Label dialog, this tool does NOT filter "states" or "burgLabels" out of the candidate target list; it will move labels into or out of those groups freely.',
    input_schema: {
      type: "object",
      properties: {
        label_id: {
          type: "string",
          description:
            'The exact id attribute of the <text> element to move (e.g. "stateLabel0", "burgLabel5", "addedLabel_42"). Must resolve to a <text> whose direct parent is a <g> directly under #labels.',
        },
        group: {
          type: "string",
          description:
            'Target label group id; must already exist as a <g> directly under #labels (e.g. "states", "burgLabels", "addedLabels", or any custom group). Use add_label_group to create new groups first.',
        },
      },
      required: ["label_id", "group"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        label_id?: unknown;
        group?: unknown;
      };

      if (typeof input.label_id !== "string" || !input.label_id.trim()) {
        return errorResult("label_id must be a non-empty string.");
      }
      if (typeof input.group !== "string" || !input.group.trim()) {
        return errorResult("group must be a non-empty string.");
      }
      const labelId = input.label_id.trim();
      const targetGroupId = input.group.trim();

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
      const { el: textEl, parent: currentParent } = lookup;
      const oldGroupId =
        typeof currentParent.id === "string" ? currentParent.id : "";

      const target = runtime.findTargetGroup(targetGroupId);
      if (target.kind === "labels_root_missing") {
        return errorResult("#labels SVG element not found.");
      }
      if (target.kind === "missing") {
        return errorResult(
          `No label group with id ${JSON.stringify(targetGroupId)} under #labels.`,
          { available: target.available },
        );
      }
      const targetGroupEl = target.el;

      if (currentParent === targetGroupEl) {
        return okResult({
          label_id: labelId,
          old_group: oldGroupId,
          new_group: targetGroupId,
          changed: false,
        });
      }

      try {
        runtime.move(textEl, targetGroupEl);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        label_id: labelId,
        old_group: oldGroupId,
        new_group: targetGroupId,
        changed: true,
      });
    },
  };
}

export const setLabelGroupTool = createSetLabelGroupTool();
