import { errorResult, getGlobal, getPack, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Minimal shape of a `pack.ice` entry that this tool reads / writes.
 * The real entries also carry `points`, `cellId`, `size`, etc.; we only
 * touch `i`, `type`, and `offset`.
 */
interface RawIceElement {
  i: number;
  type?: "glacier" | "iceberg";
  offset?: [number, number] | null;
  points?: unknown;
  size?: number;
  cellId?: number;
}

interface IcePackLike {
  ice?: RawIceElement[];
}

/**
 * What `findIce` returns when both the pack entry and its SVG element
 * are resolved. `iceData` is a live reference into `pack.ice` so the
 * tool can read its prior `offset` and write the new one.
 */
export interface MoveIceFound {
  kind: "found";
  ref: { i: number; type: "glacier" | "iceberg" };
  svgEl: Element;
  iceData: RawIceElement;
}

export type MoveIceLookup =
  | MoveIceFound
  | { kind: "not_found" }
  | { kind: "ice_root_missing" }
  | { kind: "svg_not_found" };

/**
 * Runtime seam for `move_ice`. Every interaction with the legacy
 * globals (`pack`, `window.ice`, `document`) goes through one of these
 * methods so unit tests can drive the tool without a real browser.
 */
export interface MoveIceRuntime {
  /**
   * Resolve the ice element for `id`: returns the pack entry AND the
   * `<*[data-id={id}]>` SVG node under `#ice` together. Discriminated
   * union explains why a lookup failed.
   */
  findIce(id: number): MoveIceLookup;
  /**
   * Write `transform` on the SVG element. Splitting this from the
   * lookup keeps the test surface small.
   */
  setTransform(svgEl: Element, value: string): void;
  /**
   * Write `iceData.offset = [x, y]` on the pack entry.
   */
  setOffset(iceData: RawIceElement, x: number, y: number): void;
}

interface D3IceLike {
  node?: () => Element | null | undefined;
}

function getDocument(): Document | null {
  if (typeof document === "undefined") return null;
  return document;
}

/**
 * Resolve the `#ice` SVG layer. Prefers `window.ice` (the D3 selection
 * `public/main.js` puts on the global) and falls back to
 * `document.getElementById("ice")`.
 */
function resolveIceRoot(): Element | null {
  const iceSel = getGlobal<D3IceLike>("ice");
  if (iceSel && typeof iceSel.node === "function") {
    const node = iceSel.node();
    if (node) return node;
  }
  const doc = getDocument();
  if (!doc) return null;
  return doc.getElementById("ice");
}

function getIceArrayOrNull(): RawIceElement[] | null {
  const pack = getPack<IcePackLike>();
  if (!pack) return null;
  const ice = pack.ice;
  return Array.isArray(ice) ? ice : null;
}

export const defaultMoveIceRuntime: MoveIceRuntime = {
  findIce(id: number): MoveIceLookup {
    const ice = getIceArrayOrNull();
    if (!ice) {
      // Surfacing as `ice_root_missing` would be misleading here —
      // the issue is pack-side. Throw so the executor turns it into
      // a generic error.
      throw new Error("pack.ice is not available.");
    }
    const entry = ice.find((element) => element && element.i === id);
    if (!entry) return { kind: "not_found" };

    const iceRoot = resolveIceRoot();
    if (!iceRoot) return { kind: "ice_root_missing" };

    // id is validated to be a non-negative integer by the executor, so
    // String(id) contains only [0-9] — safe to interpolate into the
    // attribute selector without escaping.
    let svgEl: Element | null = null;
    if (typeof iceRoot.querySelector === "function") {
      svgEl = iceRoot.querySelector(`[data-id="${String(id)}"]`);
    }
    if (!svgEl) return { kind: "svg_not_found" };

    const type = entry.type === "glacier" ? "glacier" : "iceberg";
    return {
      kind: "found",
      ref: { i: entry.i, type },
      svgEl,
      iceData: entry,
    };
  },
  setTransform(svgEl, value) {
    svgEl.setAttribute("transform", value);
  },
  setOffset(iceData, x, y) {
    iceData.offset = [x, y];
  },
};

function validateId(
  value: unknown,
): { ok: true; id: number } | { ok: false; error: string } {
  if (value === undefined || value === null) {
    return { ok: false, error: "id is required." };
  }
  if (typeof value !== "number") {
    return { ok: false, error: "id must be a non-negative integer." };
  }
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    return { ok: false, error: "id must be a non-negative integer." };
  }
  return { ok: true, id: value };
}

function readOldOffset(iceData: RawIceElement): [number, number] | null {
  const o = iceData.offset;
  if (!Array.isArray(o)) return null;
  if (o.length < 2) return null;
  const x = o[0];
  const y = o[1];
  if (typeof x !== "number" || !Number.isFinite(x)) return null;
  if (typeof y !== "number" || !Number.isFinite(y)) return null;
  return [x, y];
}

export function createMoveIceTool(
  runtime: MoveIceRuntime = defaultMoveIceRuntime,
): Tool {
  return {
    name: "move_ice",
    description:
      'Re-position an ice element (glacier or iceberg) by id — same end-state as dragging the element in the Edit Ice dialog (public/modules/ui/ice-editor.js#dragElement). Writes transform="translate(x,y)" on the matching <*[data-id={id}]> SVG node under #ice AND writes pack.ice[matched].offset = [x, y]. The geometry in pack.ice[*].points stays put — only the offset/transform is changed (matching the legacy drag handler). The x/y inputs are ABSOLUTE translate values in map-space coordinates (the same system used by find_cell_at_coords, move_burg, move_label, etc.), not deltas. To nudge by an offset, read the current offset via list_ice first and add the delta. No range clamping — ice can validly move anywhere in map coordinate space.',
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "integer",
          minimum: 0,
          description:
            "Ice element id (matches pack.ice[*].i, not array index). Ids start at 0.",
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
      required: ["id", "x", "y"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        id?: unknown;
        x?: unknown;
        y?: unknown;
      };

      const idResult = validateId(input.id);
      if (!idResult.ok) return errorResult(idResult.error);
      const { id } = idResult;

      if (typeof input.x !== "number" || !Number.isFinite(input.x)) {
        return errorResult("x must be a finite number.");
      }
      if (typeof input.y !== "number" || !Number.isFinite(input.y)) {
        return errorResult("y must be a finite number.");
      }
      const x = input.x;
      const y = input.y;

      let lookup: MoveIceLookup;
      try {
        lookup = runtime.findIce(id);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
      if (lookup.kind === "ice_root_missing") {
        return errorResult("#ice SVG element not found.");
      }
      if (lookup.kind === "not_found") {
        return errorResult(`No ice element found with id ${id}.`);
      }
      if (lookup.kind === "svg_not_found") {
        return errorResult(`SVG element not found for ice id ${id}.`);
      }

      const { ref, svgEl, iceData } = lookup;
      const oldOffset = readOldOffset(iceData);
      const transform = `translate(${x},${y})`;

      try {
        runtime.setTransform(svgEl, transform);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
      try {
        runtime.setOffset(iceData, x, y);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        id: ref.i,
        type: ref.type,
        old_offset: oldOffset,
        new_offset: [x, y],
      });
    },
  };
}

export const moveIceTool = createMoveIceTool();
