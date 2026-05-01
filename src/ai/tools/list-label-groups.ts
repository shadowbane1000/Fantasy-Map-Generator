import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { BASIC_LABEL_GROUPS } from "./remove-label-group";

/**
 * Label-group ids that the legacy labels-editor's group-dropdown
 * filters out — matches the literal in `selectLabelGroup` of
 * `public/modules/ui/labels-editor.js`:
 *
 * ```js
 * labels.selectAll(":scope > g").each(function () {
 *   if (this.id === "states") return;
 *   if (this.id === "burgLabels") return;
 *   select.options.add(new Option(this.id, this.id, false, this.id === group));
 * });
 * ```
 *
 * The AI tool exposes the FULL list of label groups (including these
 * two); the flag is provided so the AI can explain to the user why
 * moving labels to/from these groups behaves differently in the
 * legacy editor than via the `set_label_group` tool.
 */
export const EDITOR_FILTERED_LABEL_GROUPS = ["states", "burgLabels"] as const;

/** A single entry in the tool's response array. */
export interface LabelGroupSummary {
  id: string;
  label_count: number;
  is_basic: boolean;
  is_filtered_in_editor: boolean;
}

/**
 * Description of a single `<g>` element under #labels — what the
 * runtime hands back from `readGroupElements`. Unlike lakes/routes,
 * labels have no `pack` mirror, so `textCount` (count of `<text>`
 * descendants of the `<g>`) IS the source of truth.
 */
export interface LabelGroupElement {
  id: string;
  textCount: number;
}

export interface ListLabelGroupsRuntime {
  /**
   * Return the ordered list of `<g>` children directly under the
   * `#labels` SVG layer (i.e. one entry per label group), in document
   * order, each with the count of `<text>` descendants in that group.
   * Returns `null` when the labels layer is unavailable — which the
   * tool surfaces as an error.
   */
  readGroupElements(): LabelGroupElement[] | null;
}

interface MinimalElementLike {
  id?: string;
  tagName?: string;
  children?: ArrayLike<unknown>;
  getElementsByTagName?: (tag: string) => ArrayLike<unknown>;
}

interface D3MultiSelectionLike {
  // d3 v5/v6 store the live nodes under `_groups[0]`. We mirror the
  // exact path used by `selectLabelGroup()` in labels-editor.js so we
  // pick up whatever the UI sees.
  _groups?: ArrayLike<unknown>[];
}

interface LabelsD3SelectionLike {
  selectAll?: (selector: string) => D3MultiSelectionLike;
}

function countTextDescendants(el: MinimalElementLike): number {
  if (typeof el.getElementsByTagName !== "function") return 0;
  const texts = el.getElementsByTagName("text");
  if (!texts || typeof texts.length !== "number") return 0;
  return texts.length;
}

function readFromD3Selection(): LabelGroupElement[] | null {
  const labelsSel = getGlobal<LabelsD3SelectionLike>("labels");
  if (!labelsSel || typeof labelsSel.selectAll !== "function") return null;
  // `:scope > g` mirrors selectLabelGroup() in labels-editor.js — only
  // direct <g> children of #labels (skipping nested groups inside
  // individual labels' control-points / textPath defs).
  const sel = labelsSel.selectAll(":scope > g");
  const nodes = sel?._groups?.[0];
  if (!nodes || typeof nodes.length !== "number") return null;
  const out: LabelGroupElement[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const el = nodes[i] as MinimalElementLike | null | undefined;
    if (!el || typeof el.id !== "string") continue;
    out.push({ id: el.id, textCount: countTextDescendants(el) });
  }
  return out;
}

function readFromDom(): LabelGroupElement[] | null {
  if (typeof document === "undefined") return null;
  const root = document.getElementById("labels");
  if (!root) return null;
  const out: LabelGroupElement[] = [];
  const children = root.children;
  if (!children || typeof children.length !== "number") return out;
  for (let i = 0; i < children.length; i += 1) {
    const child = children[i] as unknown as MinimalElementLike;
    const tag = (child?.tagName ?? "").toLowerCase();
    if (tag !== "g") continue;
    if (typeof child.id !== "string") continue;
    out.push({ id: child.id, textCount: countTextDescendants(child) });
  }
  return out;
}

export const defaultListLabelGroupsRuntime: ListLabelGroupsRuntime = {
  readGroupElements(): LabelGroupElement[] | null {
    const fromD3 = readFromD3Selection();
    if (fromD3) return fromD3;
    return readFromDom();
  },
};

export function createListLabelGroupsTool(
  runtime: ListLabelGroupsRuntime = defaultListLabelGroupsRuntime,
): Tool {
  return {
    name: "list_label_groups",
    description: `List the existing label groups on the current map — same source the Edit Label dialog reads (labels-editor.js → selectLabelGroup): direct <g> children of the #labels SVG layer, in document order. Each entry reports id (e.g. "states", "burgLabels", "addedLabels", or any custom group), label_count (count of <text> descendants of the <g> — labels live entirely in SVG with no pack mirror), is_basic (true iff id is one of ${BASIC_LABEL_GROUPS.join(", ")} — these are the built-in groups whose <g> shell is preserved by remove_label_group so the renderer can still emit them on the next regenerate), and is_filtered_in_editor (true iff id is one of ${EDITOR_FILTERED_LABEL_GROUPS.join(", ")} — these are the groups the legacy labels-editor's group dropdown filters out; this AI tool intentionally exposes the FULL list including them, so set_label_group can move labels to/from any group). Returns { count, groups }. Read-only; takes no parameters. Errors when the #labels SVG layer is missing.`,
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      const elements = runtime.readGroupElements();
      if (elements === null) {
        return errorResult(
          "Labels layer is unavailable; cannot list label groups. Wait for the map to finish loading.",
        );
      }
      const basics = new Set<string>(BASIC_LABEL_GROUPS);
      const filtered = new Set<string>(EDITOR_FILTERED_LABEL_GROUPS);

      const groups: LabelGroupSummary[] = elements.map((el) => ({
        id: el.id,
        label_count: el.textCount,
        is_basic: basics.has(el.id),
        is_filtered_in_editor: filtered.has(el.id),
      }));

      return okResult({ count: groups.length, groups });
    },
  };
}

export const listLabelGroupsTool = createListLabelGroupsTool();
