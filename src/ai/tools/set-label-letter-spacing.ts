import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import type { LabelLookup } from "./set-label-group";

/**
 * Inclusive bounds (in px) for the `letter-spacing` value. The legacy
 * slider in `src/index.html` (`#labelLetterSpacingSize`) uses
 * `min="0" max="20" step=".01"`. There is no UI affordance for values
 * outside this band, so the AI tool adopts the same window verbatim.
 */
const MIN_LETTER_SPACING = 0;
const MAX_LETTER_SPACING = 20;

export interface SetLabelLetterSpacingRuntime {
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
   * Read the `letter-spacing` attribute on the `<textPath>` element, or
   * null when the attribute is unset / `getAttribute` is unavailable.
   */
  getLetterSpacing(textPathEl: Element): string | null;
  /**
   * Write the `letter-spacing` attribute on the `<textPath>` element. The
   * value passed already includes the trailing `px`.
   */
  setLetterSpacing(textPathEl: Element, value: string): void;
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

export const defaultSetLabelLetterSpacingRuntime: SetLabelLetterSpacingRuntime =
  {
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
    getLetterSpacing(textPathEl: Element): string | null {
      if (typeof textPathEl.getAttribute !== "function") return null;
      return textPathEl.getAttribute("letter-spacing");
    },
    setLetterSpacing(textPathEl: Element, value: string): void {
      textPathEl.setAttribute("letter-spacing", value);
    },
  };

export function createSetLabelLetterSpacingTool(
  runtime: SetLabelLetterSpacingRuntime = defaultSetLabelLetterSpacingRuntime,
): Tool {
  return {
    name: "set_label_letter_spacing",
    description:
      'Set the letter-spacing (in px) on a single label\'s <textPath>, mirroring the "Letter spacing" slider in the Edit Label dialog (labels-editor.js → changeLetterSpacingSize). Pure DOM operation: writes letter-spacing="<n>px" on the <textPath> child of the <text id={label_id}> under #labels. Does NOT mutate pack — letter-spacing is purely SVG state and labels carry no pack mirror for it. Allowed range is [0, 20] (inclusive), matching the legacy slider min/max in src/index.html. The label is searched scoped to descendants of #labels: any <text> with this id elsewhere in the document is rejected.',
    input_schema: {
      type: "object",
      properties: {
        label_id: {
          type: "string",
          description:
            'The exact id attribute of the <text> element to adjust (e.g. "stateLabel0", "burgLabel5", "addedLabel_42"). Must resolve to a <text> whose direct parent is a <g> directly under #labels.',
        },
        letter_spacing: {
          type: "number",
          description:
            "Px value to write to the textPath's letter-spacing attribute (no px suffix — the tool adds it). Must be a finite number in [0, 20]. 0 means no extra spacing; larger values spread letters apart.",
        },
      },
      required: ["label_id", "letter_spacing"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        label_id?: unknown;
        letter_spacing?: unknown;
      };

      if (typeof input.label_id !== "string" || !input.label_id.trim()) {
        return errorResult("label_id must be a non-empty string.");
      }
      const labelId = input.label_id.trim();

      if (typeof input.letter_spacing !== "number") {
        return errorResult("letter_spacing must be a finite number.");
      }
      const letterSpacing = input.letter_spacing;
      if (!Number.isFinite(letterSpacing)) {
        return errorResult("letter_spacing must be a finite number.");
      }
      if (
        letterSpacing < MIN_LETTER_SPACING ||
        letterSpacing > MAX_LETTER_SPACING
      ) {
        return errorResult(
          `letter_spacing must be between ${MIN_LETTER_SPACING} and ${MAX_LETTER_SPACING} (got ${letterSpacing}).`,
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
      // values like "3.5px", "2", " 4 " gracefully and returns NaN
      // for unparseable inputs ("abc", null, ""). We surface NaN as
      // null so callers can detect "no prior value to compare against".
      const oldRaw = runtime.getLetterSpacing(textPathEl);
      const oldParsed = oldRaw == null ? Number.NaN : parseFloat(oldRaw);
      const oldLetterSpacing: number | null = Number.isFinite(oldParsed)
        ? oldParsed
        : null;

      try {
        runtime.setLetterSpacing(textPathEl, `${letterSpacing}px`);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        label_id: labelId,
        old_letter_spacing: oldLetterSpacing,
        new_letter_spacing: letterSpacing,
      });
    },
  };
}

export const setLabelLetterSpacingTool = createSetLabelLetterSpacingTool();
