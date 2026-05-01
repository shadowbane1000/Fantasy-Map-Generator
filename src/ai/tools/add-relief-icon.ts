import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Append a single relief icon (`<use>` element) to the `terrain` SVG
 * layer at an explicit map coordinate. This is a deterministic,
 * single-icon counterpart to the per-icon-placement step inside
 * `dragToAdd` in `public/modules/ui/relief-editor.js`:
 *
 * ```js
 * const h = rn((size / 2) * (Math.random() * 0.4 + 0.8), 2);
 * const x = rn(cx - h, 2);
 * const y = rn(cy - h, 2);
 * const s = rn(h * 2, 2);
 * terrain
 *   .insert("use", ":nth-child(" + nth + ")")
 *   .attr("href", type)
 *   .attr("x", x)
 *   .attr("y", y)
 *   .attr("width", s)
 *   .attr("height", s);
 * ```
 *
 * Differences from the bulk-add UI (intentional):
 *   - No random size jitter — the user gets exactly the size they
 *     asked for.
 *   - `appendChild`, not `insert(":nth-child(N)")` — z-order is just
 *     "last appended".
 *   - No water-cell skip and no spacing/quadtree check — the caller is
 *     being explicit about placement.
 *
 * Relief icons are pure SVG state: they live as `<use>` elements under
 * `<g id="terrain">` and are NOT mirrored in `pack`, so the tool only
 * touches the DOM.
 */

interface TerrainSelectionLike {
  /** D3 selection's underlying DOM node — the `<g id="terrain">`. */
  node?: () => Element | null;
}

export interface AddReliefIconRuntime {
  /**
   * Return the terrain SVG root element (`<g id="terrain">`) — the
   * container under which relief `<use>` icons live. Return `null`
   * when neither the `window.terrain` D3 selection nor the `#terrain`
   * SVG element is available (e.g. the map hasn't loaded yet).
   */
  getTerrainRoot(): Element | null;
}

export const defaultAddReliefIconRuntime: AddReliefIconRuntime = {
  getTerrainRoot(): Element | null {
    const sel = getGlobal<TerrainSelectionLike>("terrain");
    if (sel && typeof sel.node === "function") {
      const node = sel.node();
      if (node) return node;
    }
    if (typeof document !== "undefined") {
      const el = document.getElementById("terrain");
      if (el) return el;
    }
    return null;
  },
};

const SIZE_MIN = 2;
const SIZE_MAX = 50;
const SIZE_DEFAULT = 5;
const SIZE_RANGE_MESSAGE = `size must be a finite number in [${SIZE_MIN}, ${SIZE_MAX}].`;
const SVG_NS = "http://www.w3.org/2000/svg";

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

interface DocumentLike {
  createElementNS?: (ns: string, qualifiedName: string) => Element;
  createElement?: (tagName: string) => Element;
}

function resolveOwnerDocument(root: Element): DocumentLike | null {
  const owner = (root as { ownerDocument?: DocumentLike | null }).ownerDocument;
  if (owner) return owner;
  if (typeof document !== "undefined") {
    return document as unknown as DocumentLike;
  }
  return null;
}

function createUseElement(doc: DocumentLike): Element | null {
  if (typeof doc.createElementNS === "function") {
    return doc.createElementNS(SVG_NS, "use");
  }
  if (typeof doc.createElement === "function") {
    return doc.createElement("use");
  }
  return null;
}

export function createAddReliefIconTool(
  runtime: AddReliefIconRuntime = defaultAddReliefIconRuntime,
): Tool {
  return {
    name: "add_relief_icon",
    description:
      "Append a single relief icon (mountain, hill, tree, swamp, etc) as a `<use>` element under `<g id=\"terrain\">` at an explicit map coordinate. Single-icon, deterministic counterpart to the Edit Relief Icons → Bulk Add → drag flow (`dragToAdd` in `public/modules/ui/relief-editor.js`). Inputs: `type` (required, full href value with leading '#', e.g. '#relief-mount-1'), `x` and `y` (required, center of the icon in map space), `size` (optional, side-length in map units; default 5; range [2, 50] mirroring the legacy size slider). Computes attributes h = size/2, x = round2(center.x - h), y = round2(center.y - h), width = height = round2(size) — the same 2-decimal rounding the legacy `rn(v, 2)` calls use. Differences from the bulk-add UI: NO random size jitter (you get exactly the size you ask for); icons are appended (z-order = last) instead of inserted at a computed `:nth-child`; the water-cell skip (`pack.cells.h[...] < 20`) and spacing/quadtree checks are NOT applied — the caller is explicit. Relief icons are pure SVG state (not mirrored in `pack`). Errors when `type` is missing/non-string, doesn't start with '#', when `x`/`y` are non-finite, when `size` is non-finite or out of [2, 50], or when neither `window.terrain` nor the `#terrain` SVG element is available. Returns `{ ok, type, center: [x, y], size, attributes: { x, y, width, height } }`.",
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description:
            "Relief icon type — the full `<use href>` value with leading '#' (e.g. '#relief-mount-1', '#relief-hill-2', '#relief-swamp-1'). Symbol definitions live in `src/index.html` (see the `<defs>` block around lines 3175-3260).",
        },
        x: {
          type: "number",
          description: "Center x of the icon in map space.",
        },
        y: {
          type: "number",
          description: "Center y of the icon in map space.",
        },
        size: {
          type: "number",
          minimum: SIZE_MIN,
          maximum: SIZE_MAX,
          description: `Icon side-length in map units. Default ${SIZE_DEFAULT}. Range [${SIZE_MIN}, ${SIZE_MAX}], matching the legacy size slider.`,
        },
      },
      required: ["type", "x", "y"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as Record<string, unknown>;

      if (typeof input.type !== "string") {
        return errorResult("type must be a string.");
      }
      if (!input.type.startsWith("#")) {
        return errorResult(
          "type must start with '#' (e.g. '#relief-mount-1').",
        );
      }
      const type = input.type;

      if (!isFiniteNumber(input.x)) {
        return errorResult("x must be a finite number.");
      }
      if (!isFiniteNumber(input.y)) {
        return errorResult("y must be a finite number.");
      }
      const x = input.x;
      const y = input.y;

      let size = SIZE_DEFAULT;
      if (input.size !== undefined && input.size !== null) {
        if (!isFiniteNumber(input.size)) {
          return errorResult(SIZE_RANGE_MESSAGE);
        }
        if (input.size < SIZE_MIN || input.size > SIZE_MAX) {
          return errorResult(SIZE_RANGE_MESSAGE);
        }
        size = input.size;
      }

      const root = runtime.getTerrainRoot();
      if (!root) {
        return errorResult(
          "Terrain layer is not available; the map hasn't finished loading.",
        );
      }

      const doc = resolveOwnerDocument(root);
      if (!doc) {
        return errorResult("Document is not available to create <use>.");
      }

      const useEl = createUseElement(doc);
      if (!useEl) {
        return errorResult("Document is not available to create <use>.");
      }

      const h = size / 2;
      const xAttr = round2(x - h);
      const yAttr = round2(y - h);
      const wAttr = round2(size);
      const hAttr = round2(size);

      useEl.setAttribute("href", type);
      useEl.setAttribute("x", String(xAttr));
      useEl.setAttribute("y", String(yAttr));
      useEl.setAttribute("width", String(wAttr));
      useEl.setAttribute("height", String(hAttr));

      try {
        root.appendChild(useEl);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        type,
        center: [x, y],
        size,
        attributes: {
          x: xAttr,
          y: yAttr,
          width: wAttr,
          height: hAttr,
        },
      });
    },
  };
}

export const addReliefIconTool = createAddReliefIconTool();
