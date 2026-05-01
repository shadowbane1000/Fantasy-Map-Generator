import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import type { LabelLookup } from "./set-label-group";

/**
 * Inclusive percentage bounds for the relative font-size value. The
 * legacy slider in `src/index.html` (`#labelRelativeSize`) uses
 * min=30/max=300, but we widen the AI-tool range to [10, 1000] to
 * allow micro/banner labels that the slider was not designed for
 * while still rejecting pathological values.
 */
const MIN_SIZE = 10;
const MAX_SIZE = 1000;

export interface SetLabelSizeRuntime {
  /**
   * Resolve the `<text>` with the given id. Same semantics as
   * `set-label-group.ts`'s `findLabel` — only a `<text>` whose direct
   * parent is a `<g>` directly under `#labels` is considered "found".
   */
  findLabel(labelId: string): LabelLookup;
  /**
   * Return the sole `<textPath>` child of the given `<text>` element,
   * or null if no such child exists.
   */
  findTextPath(textEl: Element): Element | null;
  /**
   * Read the `font-size` attribute on the `<textPath>` element, or
   * null when the attribute is unset / `getAttribute` is unavailable.
   */
  getFontSize(textPathEl: Element): string | null;
  /**
   * Write the `font-size` attribute on the `<textPath>` element. The
   * value passed already includes the trailing `%`.
   */
  setFontSize(textPathEl: Element, value: string): void;
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
 * selection's underlying node and falls back to
 * `document.getElementById("labels")`.
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

export const defaultSetLabelSizeRuntime: SetLabelSizeRuntime = {
  findLabel(labelId: string): LabelLookup {
    const labelsRoot = resolveLabelsRoot();
    if (!labelsRoot) return { kind: "labels_root_missing" };
    const doc = getDocument();
    const fast = doc ? doc.getElementById(labelId) : null;
    if (fast) {
      return classifyFoundElement(fast, labelsRoot);
    }
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
  findTextPath(textEl: Element): Element | null {
    const children = textEl.children;
    if (!children) return null;
    for (let i = 0; i < children.length; i += 1) {
      const child = children[i];
      if (
        child &&
        typeof child.tagName === "string" &&
        child.tagName.toLowerCase() === "textpath"
      ) {
        return child;
      }
    }
    return null;
  },
  getFontSize(textPathEl: Element): string | null {
    if (typeof textPathEl.getAttribute !== "function") return null;
    return textPathEl.getAttribute("font-size");
  },
  setFontSize(textPathEl: Element, value: string): void {
    textPathEl.setAttribute("font-size", value);
  },
};

export function createSetLabelSizeTool(
  runtime: SetLabelSizeRuntime = defaultSetLabelSizeRuntime,
): Tool {
  return {
    name: "set_label_size",
    description:
      'Set the relative font-size percentage on a single label\'s <textPath>, mirroring the "Size:" slider in the Edit Label dialog (labels-editor.js → changeRelativeSize). Pure DOM operation: writes font-size="<size>%" on the <textPath> child of the <text id={label_id}> under #labels. Does NOT mutate pack (labels carry no pack mirror — relative size is purely SVG state). Diverges intentionally from the legacy editor, which also calls changeText() to rebuild the <tspan> content; for a pure size change the rebuilt content is identical to the existing content, so re-rendering is a no-op we skip. Allowed range is [10, 1000] (inclusive); the legacy slider uses 30..300 but we widen to permit AI-driven micro/banner sizing. The label is searched scoped to descendants of #labels: any <text> with this id elsewhere in the document is rejected.',
    input_schema: {
      type: "object",
      properties: {
        label_id: {
          type: "string",
          description:
            'The exact id attribute of the <text> element to size (e.g. "stateLabel0", "burgLabel5", "addedLabel_42"). Must resolve to a <text> whose direct parent is a <g> directly under #labels.',
        },
        size: {
          type: "number",
          description:
            "Percentage value to write to the textPath's font-size attribute (no % suffix — the tool adds it). Must be a finite positive number in [10, 1000]. 100 means 'group default size'.",
        },
      },
      required: ["label_id", "size"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        label_id?: unknown;
        size?: unknown;
      };

      if (typeof input.label_id !== "string" || !input.label_id.trim()) {
        return errorResult("label_id must be a non-empty string.");
      }
      const labelId = input.label_id.trim();

      if (typeof input.size !== "number") {
        return errorResult("size must be a finite positive number.");
      }
      const size = input.size;
      if (!Number.isFinite(size) || size <= 0) {
        return errorResult("size must be a finite positive number.");
      }
      if (size < MIN_SIZE || size > MAX_SIZE) {
        return errorResult(
          `size must be between ${MIN_SIZE} and ${MAX_SIZE} (got ${size}).`,
        );
      }

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

      const textPathEl = runtime.findTextPath(textEl);
      if (!textPathEl) {
        return errorResult(
          `Label ${JSON.stringify(labelId)} has no <textPath>.`,
        );
      }

      // Read previous value before overwriting. parseFloat handles
      // values like "100%", "120px", " 80 " gracefully and returns NaN
      // for unparseable inputs ("abc", null, ""). We surface NaN as
      // null so callers can detect "no prior value to compare against".
      const oldRaw = runtime.getFontSize(textPathEl);
      const oldParsed = oldRaw == null ? Number.NaN : parseFloat(oldRaw);
      const oldSize: number | null = Number.isFinite(oldParsed)
        ? oldParsed
        : null;

      try {
        runtime.setFontSize(textPathEl, `${size}%`);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        label_id: labelId,
        old_size: oldSize,
        new_size: size,
      });
    },
  };
}

export const setLabelSizeTool = createSetLabelSizeTool();
