import {
  type EntityLike,
  errorResult,
  getGlobal,
  getPack,
  okResult,
  parseEntityRef,
} from "./_shared";
import {
  ADJACENT_ENTITY_TYPES,
  type AdjacentEntityType,
} from "./find-adjacent-entities";
import { FOCUS_ZOOM_DURATION, FOCUS_ZOOM_LEVEL } from "./focus-on-map";
import {
  type Bbox,
  type CollectEntityBboxResult,
  collectEntityBbox,
} from "./get-entity-bbox";
import type { Tool, ToolResult } from "./index";

interface ArrayLikeReadonly<T> {
  length: number;
  [index: number]: T;
}

interface PackLike {
  cells?: {
    i?: ArrayLikeReadonly<number>;
    p?: ArrayLikeReadonly<ArrayLikeReadonly<number> | undefined>;
    state?: ArrayLikeReadonly<number>;
    province?: ArrayLikeReadonly<number>;
    culture?: ArrayLikeReadonly<number>;
    religion?: ArrayLikeReadonly<number>;
    biome?: ArrayLikeReadonly<number>;
  };
  states?: EntityLike[];
  provinces?: EntityLike[];
  cultures?: EntityLike[];
  religions?: EntityLike[];
}

interface BiomesDataLike {
  i?: number[];
  name?: string[];
}

export const DEFAULT_FOCUS_PADDING = 50;
export const MAX_FOCUS_PADDING = 10000;
export const MIN_FIT_SCALE = 1;
export const FALLBACK_VIEWPORT_SIZE = 1000;

export interface Viewport {
  width: number;
  height: number;
}

/**
 * Pure helper: given a bbox width/height and viewport width/height,
 * compute the zoom scale that fits the (padded) bbox into the viewport.
 * Clamped to [MIN_FIT_SCALE, maxScale]. A zero-size bbox (single cell
 * selection) returns `maxScale`.
 */
export function computeFitScale(
  bboxWidth: number,
  bboxHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  padding: number,
  maxScale: number,
): number {
  const effectiveWidth = bboxWidth + 2 * padding;
  const effectiveHeight = bboxHeight + 2 * padding;
  if (effectiveWidth <= 0 && effectiveHeight <= 0) return maxScale;
  const sx =
    effectiveWidth > 0
      ? viewportWidth / effectiveWidth
      : Number.POSITIVE_INFINITY;
  const sy =
    effectiveHeight > 0
      ? viewportHeight / effectiveHeight
      : Number.POSITIVE_INFINITY;
  const raw = Math.min(sx, sy);
  if (!Number.isFinite(raw)) return maxScale;
  return Math.max(MIN_FIT_SCALE, Math.min(maxScale, raw));
}

export interface FocusOnEntityRuntime {
  collect(
    type: AdjacentEntityType,
    ref: number | string,
  ): CollectEntityBboxResult;
  getViewport(): Viewport;
  zoomTo(x: number, y: number, z: number, d: number): void;
}

function readViewport(): Viewport {
  const w = getGlobal<number>("svgWidth");
  const h = getGlobal<number>("svgHeight");
  const width =
    typeof w === "number" && Number.isFinite(w) && w > 0
      ? w
      : FALLBACK_VIEWPORT_SIZE;
  const height =
    typeof h === "number" && Number.isFinite(h) && h > 0
      ? h
      : FALLBACK_VIEWPORT_SIZE;
  return { width, height };
}

export const defaultFocusOnEntityRuntime: FocusOnEntityRuntime = {
  collect(type, ref) {
    return collectEntityBbox(
      getPack<PackLike>(),
      getGlobal<BiomesDataLike>("biomesData"),
      type,
      ref,
    );
  },
  getViewport() {
    return readViewport();
  },
  zoomTo(x, y, z, d) {
    const fn =
      getGlobal<(x: number, y: number, z: number, d: number) => void>("zoomTo");
    if (typeof fn !== "function") throw new Error("zoomTo is not available.");
    fn(x, y, z, d);
  },
};

function parseEntityType(value: unknown): AdjacentEntityType | null {
  if (typeof value !== "string") return null;
  const needle = value.trim().toLowerCase();
  if (!needle) return null;
  for (const t of ADJACENT_ENTITY_TYPES) {
    if (t === needle) return t;
  }
  return null;
}

function parseBiomeEntityRef(
  value: unknown,
): { ok: true; ref: number | string } | { ok: false; error: string } {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return { ok: true, ref: value };
  }
  if (typeof value === "string" && value.trim()) {
    return { ok: true, ref: value };
  }
  return {
    ok: false,
    error:
      "entity must be a non-negative integer id or a non-empty name string for the biome domain.",
  };
}

function parsePadding(value: unknown): number | string {
  if (value === undefined || value === null) return DEFAULT_FOCUS_PADDING;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_FOCUS_PADDING
  ) {
    return `padding must be an integer in [0, ${MAX_FOCUS_PADDING}].`;
  }
  return value;
}

export function createFocusOnEntityTool(
  runtime: FocusOnEntityRuntime = defaultFocusOnEntityRuntime,
): Tool {
  return {
    name: "focus_on_entity",
    description:
      "Zoom / pan the map viewport to fit the full extent of a state / province / culture / religion / biome — the bbox-aware parallel of `focus_on_map` (which zooms to a single point at a fixed level: a burg's coords or a state's pole). Use this when you want the whole territory visible in frame, not just centered. Required `entity_type` (case-insensitive string, one of 'state', 'province', 'culture', 'religion', 'biome') and `entity` (positive integer id — non-negative for biome, where 0 = Marine — OR case-insensitive name / fullName; resolved via the shared `findEntityByRef` for the first four types and `findBiomeByRef` for biomes, skipping the index-0 placeholder / `removed: true` entries / the 'removed' biome sentinel). Optional `padding` (integer in [0, 10000], default 50) — extra pixel margin around the bbox so the edges don't kiss the viewport. Algorithm: reuses `get_entity_bbox`'s `collectEntityBbox` to compute axis-aligned bbox from `pack.cells.p[k]` for every cell with `pack.cells.<field>[k] === entity.i`; then computes a fit scale `min(svgWidth / (bbox.width + 2*padding), svgHeight / (bbox.height + 2*padding))` clamped to [1, 8]; finally calls the legacy `window.zoomTo(cx, cy, scale, 2000)` helper (same helper `focus_on_map` uses) to transition the D3 zoom transform. A single-cell entity (width=height=0) uses the max zoom level (8). Returns `{ ok, entity_type, i, name, bbox: {x_min, y_min, x_max, y_max, width, height, cx, cy}, padding }`. Useful for 'show me the whole X' camera requests, fit-to-extent before a screenshot / export, chaining after a `find_*` tool to inspect the hit visually, or pairing with `find_adjacent_entities` to frame a diplomatic neighborhood. Side-effect: triggers a zoom transition via `window.zoomTo`; does NOT mutate pack. Errors on invalid `entity_type`, missing / unresolvable `entity`, out-of-range `padding`, an entity with zero member cells (no bbox to fit), an un-generated map, or when `window.zoomTo` is unavailable. Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        entity_type: {
          type: "string",
          description:
            "Which entity collection to focus: 'state', 'province', 'culture', 'religion', or 'biome' (case-insensitive).",
        },
        entity: {
          type: ["integer", "string"],
          description:
            "Positive integer id (non-negative for 'biome' — 0 = Marine) or case-insensitive name / fullName of the entity to frame.",
        },
        padding: {
          type: "integer",
          minimum: 0,
          maximum: MAX_FOCUS_PADDING,
          description: `Extra pixel margin around the bbox before fitting (default ${DEFAULT_FOCUS_PADDING}).`,
        },
      },
      required: ["entity_type", "entity"],
    },
    execute(rawInput: unknown): ToolResult {
      const args = (rawInput ?? {}) as {
        entity_type?: unknown;
        entity?: unknown;
        padding?: unknown;
      };

      const type = parseEntityType(args.entity_type);
      if (!type) {
        return errorResult(
          `entity_type must be one of ${ADJACENT_ENTITY_TYPES.map((t) => `'${t}'`).join(", ")}.`,
        );
      }

      let ref: number | string;
      if (type === "biome") {
        const parsed = parseBiomeEntityRef(args.entity);
        if (!parsed.ok) return errorResult(parsed.error);
        ref = parsed.ref;
      } else {
        const parsed = parseEntityRef(args.entity, "entity");
        if (!parsed.ok) return errorResult(parsed.error);
        ref = parsed.ref;
      }

      const padding = parsePadding(args.padding);
      if (typeof padding === "string") return errorResult(padding);

      const result = runtime.collect(type, ref);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }
      if (result === "unknown-entity") {
        return errorResult(
          `Could not resolve ${type} ${JSON.stringify(args.entity)}.`,
        );
      }

      if (result.cells_count === 0) {
        return errorResult(
          `Cannot focus ${type} ${JSON.stringify(args.entity)}: it has no cells (bbox is empty).`,
        );
      }

      const bbox = result.bbox as Required<Bbox> & {
        width: number;
        height: number;
        cx: number;
        cy: number;
      };

      const viewport = runtime.getViewport();
      const scale = computeFitScale(
        bbox.width,
        bbox.height,
        viewport.width,
        viewport.height,
        padding,
        FOCUS_ZOOM_LEVEL,
      );

      try {
        runtime.zoomTo(bbox.cx, bbox.cy, scale, FOCUS_ZOOM_DURATION);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        entity_type: type,
        i: result.i,
        name: result.name,
        bbox: result.bbox,
        padding,
      });
    },
  };
}

export const focusOnEntityTool = createFocusOnEntityTool();
