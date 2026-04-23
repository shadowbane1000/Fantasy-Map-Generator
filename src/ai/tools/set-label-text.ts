import { errorResult, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface LabelFindHit {
  id: string;
  currentText: string;
}

export interface LabelFindAmbiguous {
  error: "ambiguous";
  ids: string[];
}

export type LabelFindResult = LabelFindHit | LabelFindAmbiguous | null;

export interface SetLabelTextRuntime {
  find: (label: string) => LabelFindResult;
  apply: (id: string, text: string) => void;
}

function isAmbiguous(result: LabelFindResult): result is LabelFindAmbiguous {
  return (
    result !== null &&
    typeof result === "object" &&
    "error" in result &&
    result.error === "ambiguous"
  );
}

function getDocument(): Document | null {
  if (typeof document === "undefined") return null;
  return document;
}

function isInLabelsGroup(el: Element): boolean {
  let parent: Element | null = el.parentElement;
  while (parent) {
    if (parent.id === "labels") return true;
    parent = parent.parentElement;
  }
  return false;
}

function readLabelText(textEl: Element): string | null {
  const textPath = textEl.querySelector("textPath");
  if (!textPath) return null;
  const tspans = textPath.querySelectorAll("tspan");
  if (tspans.length === 0) return textPath.textContent ?? "";
  const lines: string[] = [];
  for (let i = 0; i < tspans.length; i += 1) {
    lines.push(tspans[i].textContent ?? "");
  }
  return lines.join("|");
}

function rebuildLabel(textEl: Element, text: string): void {
  const textPath = textEl.querySelector("textPath");
  if (!textPath) {
    throw new Error(`Label ${textEl.id} has no textPath; cannot edit text.`);
  }
  const lines = text.split("|");
  if (lines.length > 1) {
    const top = (lines.length - 1) / -2;
    textPath.innerHTML = lines
      .map(
        (line, index) =>
          `<tspan x="0" dy="${index ? 1 : top}em">${line}</tspan>`,
      )
      .join("");
  } else {
    textPath.innerHTML = `<tspan x="0">${lines[0]}</tspan>`;
  }
}

export const defaultSetLabelTextRuntime: SetLabelTextRuntime = {
  find(label: string): LabelFindResult {
    const doc = getDocument();
    if (!doc) return null;

    const byId = doc.getElementById(label);
    if (
      byId &&
      byId.tagName?.toLowerCase() === "text" &&
      isInLabelsGroup(byId)
    ) {
      const current = readLabelText(byId);
      if (current === null) return null;
      return { id: byId.id, currentText: current };
    }

    const labelsRoot = doc.getElementById("labels");
    if (!labelsRoot) return null;
    const all = labelsRoot.querySelectorAll("text");
    const matches: Array<{ id: string; currentText: string }> = [];
    for (let i = 0; i < all.length; i += 1) {
      const el = all[i];
      const current = readLabelText(el);
      if (current === null) continue;
      if (current === label && el.id) {
        matches.push({ id: el.id, currentText: current });
      }
    }
    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0];
    return { error: "ambiguous", ids: matches.map((m) => m.id) };
  },
  apply(id: string, text: string): void {
    const doc = getDocument();
    if (!doc) {
      throw new Error("document is not available.");
    }
    const el = doc.getElementById(id);
    if (!el) {
      throw new Error(`Label ${id} not found.`);
    }
    rebuildLabel(el, text);
  },
};

export function createSetLabelTextTool(
  runtime: SetLabelTextRuntime = defaultSetLabelTextRuntime,
): Tool {
  return {
    name: "set_label_text",
    description:
      "Rewrite the text of a specific on-map label — state label (stateLabel{i}), burg label (burgLabel{i}), or custom added label (label{i}). Mirrors the Labels Editor's text field: splits on '|' for multi-line (each segment becomes a <tspan>), rebuilds the <textPath>'s inner tspans using the same dy offsets. Matches by DOM id first; falls back to exact current pipe-joined text. Ambiguous text matches error with candidate ids. Does NOT rename the underlying state / burg data — use rename_state / rename_burg for that.",
    input_schema: {
      type: "object",
      properties: {
        label: {
          type: "string",
          description:
            "The label's DOM id (e.g. 'stateLabel3', 'burgLabel5', 'label1234') OR its exact current on-map text (multi-line labels joined with '|').",
        },
        text: {
          type: "string",
          description:
            "New text for the label. Use '|' to split into multiple lines (each becomes a <tspan>). Empty / whitespace-only values are rejected.",
        },
      },
      required: ["label", "text"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { label?: unknown; text?: unknown };

      if (typeof input.label !== "string" || !input.label.trim()) {
        return errorResult("label must be a non-empty string.");
      }
      const label = input.label;

      if (typeof input.text !== "string") {
        return errorResult("text must be a non-empty string.");
      }
      if (input.text.length === 0 || input.text.trim().length === 0) {
        return errorResult("text must be a non-empty string.");
      }
      const text = input.text;

      const found = runtime.find(label);
      if (found === null) {
        return errorResult(`Label ${JSON.stringify(label)} not found.`);
      }
      if (isAmbiguous(found)) {
        return errorResult(
          `Multiple labels match text ${JSON.stringify(label)}: ${found.ids.join(", ")}. Pass the DOM id instead.`,
        );
      }

      try {
        runtime.apply(found.id, text);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        id: found.id,
        previousText: found.currentText,
        text,
      });
    },
  };
}

export const setLabelTextTool = createSetLabelTextTool();
