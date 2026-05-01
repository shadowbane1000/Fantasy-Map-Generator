import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import type { LabelLookup } from "./set-label-group";

/**
 * Parses a `translate(x, y)` substring out of an SVG `transform`
 * attribute and returns the captured x/y as numbers, or null if the
 * value does not match. Mirrors the loose semantics of the legacy
 * `parseTransform` helper in `public/modules/ui/labels-editor.js`:
 * any number of whitespace characters around / between the values,
 * comma OR whitespace separator, decimal/sign/exponent allowed.
 *
 * Tokens that pass the regex but fail `parseFloat` to a finite number
 * (or where one passes and the other does not) yield null — we want
 * "either both parsed or both unknown" rather than half-parsed.
 */
const TRANSLATE_RE = /translate\(\s*([-\d.eE+]+)\s*[,\s]\s*([-\d.eE+]+)\s*\)/;

function parseTranslate(raw: string | null): { x: number; y: number } | null {
  if (raw == null) return null;
  const m = TRANSLATE_RE.exec(raw);
  if (!m) return null;
  const xs = m[1];
  const ys = m[2];
  if (xs == null || ys == null) return null;
  const x = parseFloat(xs);
  const y = parseFloat(ys);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

export interface MoveLabelRuntime {
  /**
   * Resolve the `<text>` with the given id. Same semantics as
   * `set-label-group.ts`'s `findLabel` — only a `<text>` whose direct
   * parent is a `<g>` directly under `#labels` is considered "found".
   */
  findLabel(labelId: string): LabelLookup;
  /**
   * Read the `transform` attribute on the `<text>` element, or null
   * when the attribute is unset / `getAttribute` is unavailable.
   */
  getTransform(textEl: Element): string | null;
  /**
   * Write the `transform` attribute on the `<text>` element. The value
   * already includes the `translate(...)` wrapper.
   */
  setTransform(textEl: Element, value: string): void;
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

export const defaultMoveLabelRuntime: MoveLabelRuntime = {
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
  getTransform(textEl: Element): string | null {
    if (typeof textEl.getAttribute !== "function") return null;
    return textEl.getAttribute("transform");
  },
  setTransform(textEl: Element, value: string): void {
    textEl.setAttribute("transform", value);
  },
};

export function createMoveLabelTool(
  runtime: MoveLabelRuntime = defaultMoveLabelRuntime,
): Tool {
  return {
    name: "move_label",
    description:
      "Re-position a single label by writing transform=\"translate(x,y)\" on its <text> element under #labels — same end-state as dragging the label in the Edit Label dialog (labels-editor.js → dragLabel). Pure DOM operation: writes only the <text>'s transform attribute. Does NOT mutate the <textPath>'s `d` attribute (the path geometry stays put — the transform repositions the rendered glyphs). Does NOT mutate pack (labels carry no pack mirror — position is purely SVG state). The x/y inputs are ABSOLUTE translate values in map-space coordinates (the same system used by find_cell_at_coords, move_burg, etc.), not deltas. To nudge by an offset, call this tool with the absolute target — the response's old_x/old_y let you compute prior position. Limitation: there is no separate get_label_info tool today, so for first-time movers the only way to read the prior translate is from this tool's response. The label is searched scoped to descendants of #labels: any <text> with this id elsewhere in the document is rejected. No range clamping — labels can validly move anywhere, even off-canvas.",
    input_schema: {
      type: "object",
      properties: {
        label_id: {
          type: "string",
          description:
            'The exact id attribute of the <text> element to move (e.g. "stateLabel0", "burgLabel5", "addedLabel_42"). Must resolve to a <text> whose direct parent is a <g> directly under #labels.',
        },
        x: {
          type: "number",
          description:
            "New x translate value, in map-space coordinates. Finite number; negative and non-integer accepted. Absolute, not a delta.",
        },
        y: {
          type: "number",
          description:
            "New y translate value, in map-space coordinates. Finite number; negative and non-integer accepted. Absolute, not a delta.",
        },
      },
      required: ["label_id", "x", "y"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        label_id?: unknown;
        x?: unknown;
        y?: unknown;
      };

      if (typeof input.label_id !== "string" || !input.label_id.trim()) {
        return errorResult("label_id must be a non-empty string.");
      }
      const labelId = input.label_id.trim();

      if (typeof input.x !== "number" || !Number.isFinite(input.x)) {
        return errorResult("x must be a finite number.");
      }
      if (typeof input.y !== "number" || !Number.isFinite(input.y)) {
        return errorResult("y must be a finite number.");
      }
      const x = input.x;
      const y = input.y;

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

      // Read existing transform BEFORE writing the new one. parseTranslate
      // returns null when the attribute is missing, contains garbage
      // (e.g. "translate(foo)"), or holds an unrelated transform
      // (e.g. "rotate(45)"). We surface that null as separate
      // old_x/old_y nulls so callers can detect "no prior value".
      const oldRaw = runtime.getTransform(textEl);
      const parsed = parseTranslate(oldRaw);
      const oldX: number | null = parsed ? parsed.x : null;
      const oldY: number | null = parsed ? parsed.y : null;

      const transform = `translate(${x},${y})`;
      try {
        runtime.setTransform(textEl, transform);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        label_id: labelId,
        old_x: oldX,
        old_y: oldY,
        new_x: x,
        new_y: y,
      });
    },
  };
}

export const moveLabelTool = createMoveLabelTool();
