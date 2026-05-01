import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import type { LabelLookup } from "./set-label-group";

/**
 * Inclusive percentage bounds for the `startOffset` value. The legacy
 * slider in `src/index.html` (`#labelStartOffset` / `#labelStartOffsetValue`)
 * uses min=20/max=80, and the numeric handler in
 * `public/modules/ui/labels-editor.js` (`changeStartOffsetFromValue`)
 * explicitly clamps with `Math.min(80, Math.max(20, this.value))`. There
 * is no UI affordance for offsets outside this band, so the AI tool
 * adopts the same window verbatim.
 */
const MIN_OFFSET = 20;
const MAX_OFFSET = 80;

export interface SetLabelOffsetRuntime {
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
   * Read the `startOffset` attribute on the `<textPath>` element, or
   * null when the attribute is unset / `getAttribute` is unavailable.
   */
  getStartOffset(textPathEl: Element): string | null;
  /**
   * Write the `startOffset` attribute on the `<textPath>` element. The
   * value passed already includes the trailing `%`.
   */
  setStartOffset(textPathEl: Element, value: string): void;
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

export const defaultSetLabelOffsetRuntime: SetLabelOffsetRuntime = {
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
  getStartOffset(textPathEl: Element): string | null {
    if (typeof textPathEl.getAttribute !== "function") return null;
    return textPathEl.getAttribute("startOffset");
  },
  setStartOffset(textPathEl: Element, value: string): void {
    textPathEl.setAttribute("startOffset", value);
  },
};

export function createSetLabelOffsetTool(
  runtime: SetLabelOffsetRuntime = defaultSetLabelOffsetRuntime,
): Tool {
  return {
    name: "set_label_offset",
    description:
      'Set the startOffset percentage on a single label\'s <textPath>, mirroring the "Offset:" slider in the Edit Label dialog (labels-editor.js → changeStartOffset / changeStartOffsetFromValue). Pure DOM operation: writes startOffset="<offset>%" on the <textPath> child of the <text id={label_id}> under #labels. Does NOT mutate pack — startOffset is purely SVG state and labels carry no pack mirror for it. Allowed range is [20, 80] (inclusive), matching the legacy slider/numeric input min/max in src/index.html. The label is searched scoped to descendants of #labels: any <text> with this id elsewhere in the document is rejected.',
    input_schema: {
      type: "object",
      properties: {
        label_id: {
          type: "string",
          description:
            'The exact id attribute of the <text> element to offset (e.g. "stateLabel0", "burgLabel5", "addedLabel_42"). Must resolve to a <text> whose direct parent is a <g> directly under #labels.',
        },
        offset: {
          type: "number",
          description:
            "Percentage value to write to the textPath's startOffset attribute (no % suffix — the tool adds it). Must be a finite number in [20, 80]. 50 centers the text on its path.",
        },
      },
      required: ["label_id", "offset"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        label_id?: unknown;
        offset?: unknown;
      };

      if (typeof input.label_id !== "string" || !input.label_id.trim()) {
        return errorResult("label_id must be a non-empty string.");
      }
      const labelId = input.label_id.trim();

      if (typeof input.offset !== "number") {
        return errorResult("offset must be a finite number.");
      }
      const offset = input.offset;
      if (!Number.isFinite(offset)) {
        return errorResult("offset must be a finite number.");
      }
      if (offset < MIN_OFFSET || offset > MAX_OFFSET) {
        return errorResult(
          `offset must be between ${MIN_OFFSET} and ${MAX_OFFSET} (got ${offset}).`,
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
      // values like "50%", "40px", " 60 " gracefully and returns NaN
      // for unparseable inputs ("abc", null, ""). We surface NaN as
      // null so callers can detect "no prior value to compare against".
      const oldRaw = runtime.getStartOffset(textPathEl);
      const oldParsed = oldRaw == null ? Number.NaN : parseFloat(oldRaw);
      const oldOffset: number | null = Number.isFinite(oldParsed)
        ? oldParsed
        : null;

      try {
        runtime.setStartOffset(textPathEl, `${offset}%`);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        label_id: labelId,
        old_offset: oldOffset,
        new_offset: offset,
      });
    },
  };
}

export const setLabelOffsetTool = createSetLabelOffsetTool();
