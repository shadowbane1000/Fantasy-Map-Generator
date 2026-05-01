import { errorResult, getGlobal, getPack, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import type { LabelLookup } from "./set-label-group";

/**
 * Runtime seam for `regenerate_label_name`. Every operation that
 * touches the DOM, `window.pack`, or the legacy `Names` / `findCell`
 * globals goes through one of these methods so unit tests can drive
 * the tool without a real browser.
 */
export interface RegenerateLabelNameRuntime {
  /**
   * Resolve the `<text>` with the given id. Identical semantics to
   * `set-label-size.ts`: only a `<text>` whose direct parent is a `<g>`
   * directly under `#labels` is "found".
   */
  findLabel(labelId: string): LabelLookup;
  /** Return the sole `<textPath>` child of the `<text>`, or null. */
  getTextpath(textEl: Element): Element | null;
  /** Return the `<text>`'s SVG bounding box. May throw. */
  getBBox(textEl: Element): {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Find the cell index for the given coordinates. */
  findCell(x: number, y: number): number;
  /** Read `pack.states[stateId].culture`. Throws on missing data. */
  getStateCulture(stateId: number): number;
  /** Read `pack.cells.culture[cellIndex]`. Throws on missing data. */
  getCellCulture(cellIndex: number): number;
  /**
   * Generate a state-style name for the given culture, mirroring
   * `Names.getState(Names.getCulture(culture, 4, 7, ""), culture)`.
   */
  generateStateName(culture: number): string;
  /** Generate a culture-style name, mirroring `Names.getCulture(culture)`. */
  generateCultureName(culture: number): string;
  /**
   * Replace the `<textPath>` content with the given HTML. Default
   * impl does `textPath.innerHTML = html`, matching the legacy
   * editor's `changeText()`.
   */
  setTextpathContent(textPathEl: Element, html: string): void;
}

interface D3LabelsLike {
  node?: () => Element | null | undefined;
}

interface PackStatesLike {
  states?: unknown[];
}

interface PackCellsLike {
  cells?: { culture?: unknown };
}

interface NamesModuleLike {
  getCulture?: (...args: unknown[]) => string;
  getState?: (base: string, culture: number) => string;
}

function getDocument(): Document | null {
  if (typeof document === "undefined") return null;
  return document;
}

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

function getStateFromPack(stateId: number): { culture?: unknown } {
  const pack = getPack<PackStatesLike>();
  if (!pack) {
    throw new Error("pack is not available; the map hasn't finished loading.");
  }
  const states = pack.states;
  if (!Array.isArray(states)) {
    throw new Error("pack.states is unavailable. Generate a map first.");
  }
  const state = states[stateId];
  if (!state || typeof state !== "object") {
    throw new Error(`pack.states[${stateId}] is missing.`);
  }
  return state as { culture?: unknown };
}

function getCellsCultureArray(): ArrayLike<unknown> {
  const pack = getPack<PackCellsLike>();
  if (!pack) {
    throw new Error("pack is not available; the map hasn't finished loading.");
  }
  if (!pack.cells || typeof pack.cells !== "object") {
    throw new Error("pack.cells is unavailable. Generate a map first.");
  }
  const culture = (pack.cells as { culture?: unknown }).culture;
  if (!culture || typeof (culture as ArrayLike<unknown>).length !== "number") {
    throw new Error("pack.cells.culture is unavailable.");
  }
  return culture as ArrayLike<unknown>;
}

function requireNames(): NamesModuleLike {
  const names = getGlobal<NamesModuleLike>("Names");
  if (!names) {
    throw new Error("Names is not available; the map hasn't finished loading.");
  }
  return names;
}

export const defaultRegenerateLabelNameRuntime: RegenerateLabelNameRuntime = {
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
  getTextpath(textEl: Element): Element | null {
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
  getBBox(textEl: Element): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    const fn = (textEl as { getBBox?: () => DOMRect }).getBBox;
    if (typeof fn !== "function") {
      throw new Error("getBBox is not available on the label element.");
    }
    const box = fn.call(textEl) as
      | DOMRect
      | {
          x: number;
          y: number;
          width: number;
          height: number;
        };
    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    };
  },
  findCell(x: number, y: number): number {
    const fn = getGlobal<(x: number, y: number) => number>("findCell");
    if (typeof fn !== "function") {
      throw new Error(
        "findCell is not available; the map hasn't finished loading.",
      );
    }
    return fn(x, y);
  },
  getStateCulture(stateId: number): number {
    const state = getStateFromPack(stateId);
    const culture = state.culture;
    if (typeof culture !== "number" || !Number.isFinite(culture)) {
      throw new Error(
        `pack.states[${stateId}].culture is missing or not a number.`,
      );
    }
    return culture;
  },
  getCellCulture(cellIndex: number): number {
    const cultureArr = getCellsCultureArray();
    if (cellIndex < 0 || cellIndex >= cultureArr.length) {
      throw new Error(
        `pack.cells.culture[${cellIndex}] is out of range (length ${cultureArr.length}).`,
      );
    }
    const value = cultureArr[cellIndex];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(
        `pack.cells.culture[${cellIndex}] is missing or not a number.`,
      );
    }
    return value;
  },
  generateStateName(culture: number): string {
    const names = requireNames();
    if (typeof names.getCulture !== "function") {
      throw new Error("Names.getCulture is not available.");
    }
    if (typeof names.getState !== "function") {
      throw new Error("Names.getState is not available.");
    }
    const base = names.getCulture(culture, 4, 7, "");
    return names.getState(base, culture);
  },
  generateCultureName(culture: number): string {
    const names = requireNames();
    if (typeof names.getCulture !== "function") {
      throw new Error("Names.getCulture is not available.");
    }
    return names.getCulture(culture);
  },
  setTextpathContent(textPathEl: Element, html: string): void {
    (textPathEl as { innerHTML: string }).innerHTML = html;
  },
};

const STATE_LABEL_PREFIX = "stateLabel";
const STATE_LABEL_NOTE =
  "This is just a label. Use rename_state to change the state's actual name.";

function readOldText(textPathEl: Element): string | null {
  const children = textPathEl.children;
  if (children && children.length > 0) {
    const tspans: string[] = [];
    let sawTspan = false;
    for (let i = 0; i < children.length; i += 1) {
      const child = children[i];
      if (
        child &&
        typeof child.tagName === "string" &&
        child.tagName.toLowerCase() === "tspan"
      ) {
        sawTspan = true;
        const text = child.textContent ?? "";
        tspans.push(text);
      }
    }
    if (sawTspan) {
      return tspans.join("|");
    }
  }
  const fallback = textPathEl.textContent;
  if (typeof fallback === "string" && fallback.length > 0) return fallback;
  return null;
}

function buildTspanHtml(name: string): string {
  const lines = name.split("|");
  if (lines.length > 1) {
    const top = (lines.length - 1) / -2;
    return lines
      .map(
        (line, index) =>
          `<tspan x="0" dy="${index ? 1 : top}em">${line}</tspan>`,
      )
      .join("");
  }
  return `<tspan x="0">${lines[0]}</tspan>`;
}

function parseStateSuffix(labelId: string): number | null {
  const suffix = labelId.slice(STATE_LABEL_PREFIX.length);
  if (suffix.length === 0) return null;
  // Reject leading whitespace, "+", "-" prefixes, and any non-digit
  // characters. The legacy editor uses `+labelId.slice(10)` which would
  // accept e.g. " 5" or "5e2"; we are stricter to avoid surprises.
  if (!/^\d+$/.test(suffix)) return null;
  const n = Number(suffix);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

export function createRegenerateLabelNameTool(
  runtime: RegenerateLabelNameRuntime = defaultRegenerateLabelNameRuntime,
): Tool {
  return {
    name: "regenerate_label_name",
    description:
      'Re-roll a single label\'s text using a culture-aware random name, mirroring the "Random" button next to the text input in the Edit Label dialog (labels-editor.js → generateRandomName + changeText). Branches on label id: ids starting with "stateLabel" use Names.getState(Names.getCulture(culture, 4, 7, ""), culture) where culture comes from pack.states[id].culture; other ids look up a cell via the bbox center then call Names.getCulture(pack.cells.culture[cell]). NOTE: the non-state branch mirrors a long-standing bug in the legacy editor — the X coordinate it passes to findCell is (box.x + box.width) / 2, which is the average of x and width rather than the bbox centroid (box.x + box.width / 2). We replicate the bug exactly so this tool produces the same names as the editor; do not "fix" it. Pure DOM operation: writes new <tspan> children on the label\'s <textPath> and does NOT mutate pack. Returns { ok, label_id, kind: "state"|"other", old_text, new_text, note? } where note carries the editor\'s tip "This is just a label. Use rename_state to change the state\'s actual name." for state labels.',
    input_schema: {
      type: "object",
      properties: {
        label_id: {
          type: "string",
          description:
            'The exact id attribute of the <text> element (e.g. "stateLabel0", "burgLabel5", "addedLabel_42"). Must resolve to a <text> whose direct parent is a <g> directly under #labels.',
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

      const textPathEl = runtime.getTextpath(textEl);
      if (!textPathEl) {
        return errorResult(
          `Label ${JSON.stringify(labelId)} has no <textPath>.`,
        );
      }

      const oldText = readOldText(textPathEl);

      let kind: "state" | "other";
      let generated: string;
      let note: string | undefined;

      if (labelId.startsWith(STATE_LABEL_PREFIX)) {
        const stateId = parseStateSuffix(labelId);
        if (stateId === null) {
          const suffix = labelId.slice(STATE_LABEL_PREFIX.length);
          return errorResult(
            `stateLabel id must be followed by a non-negative integer (got ${JSON.stringify(suffix)}).`,
          );
        }
        let culture: number;
        try {
          culture = runtime.getStateCulture(stateId);
        } catch (err) {
          return errorResult(err instanceof Error ? err.message : String(err));
        }
        try {
          generated = runtime.generateStateName(culture);
        } catch (err) {
          return errorResult(err instanceof Error ? err.message : String(err));
        }
        kind = "state";
        note = STATE_LABEL_NOTE;
      } else {
        let box: { x: number; y: number; width: number; height: number };
        try {
          box = runtime.getBBox(textEl);
        } catch (err) {
          return errorResult(err instanceof Error ? err.message : String(err));
        }
        // LEGACY QUIRK: `(box.x + box.width) / 2` matches labels-editor.js's
        // `generateRandomName`, which mixes a coordinate with a length.
        // Mathematically meaningless, but we mirror it so this tool produces
        // the same names as the editor. Do not "fix" without coordinating
        // with the upstream behaviour.
        const cellX = (box.x + box.width) / 2;
        const cellY = (box.y + box.height) / 2;
        let cell: number;
        try {
          cell = runtime.findCell(cellX, cellY);
        } catch (err) {
          return errorResult(err instanceof Error ? err.message : String(err));
        }
        if (typeof cell !== "number" || !Number.isInteger(cell) || cell < 0) {
          return errorResult(
            `findCell did not return a valid cell index for (${cellX}, ${cellY}).`,
          );
        }
        let culture: number;
        try {
          culture = runtime.getCellCulture(cell);
        } catch (err) {
          return errorResult(err instanceof Error ? err.message : String(err));
        }
        try {
          generated = runtime.generateCultureName(culture);
        } catch (err) {
          return errorResult(err instanceof Error ? err.message : String(err));
        }
        kind = "other";
      }

      if (typeof generated !== "string" || !generated.trim()) {
        return errorResult("Name generator returned an empty/invalid name.");
      }
      const newText = generated.trim();
      const html = buildTspanHtml(newText);

      try {
        runtime.setTextpathContent(textPathEl, html);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      const body: Record<string, unknown> = {
        label_id: labelId,
        kind,
        old_text: oldText,
        new_text: newText,
      };
      if (note !== undefined) body.note = note;
      return okResult(body);
    },
  };
}

export const regenerateLabelNameTool = createRegenerateLabelNameTool();
