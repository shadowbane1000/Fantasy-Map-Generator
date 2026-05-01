import { rn } from "../../utils/numberUtils";
import {
  errorResult,
  findEntityByRef,
  getGlobal,
  getPack,
  okResult,
  type Pack,
  parseEntityRef,
  type RawBurg,
  type RawCoa,
  type RawProvince,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export const EMBLEM_SIZE_MIN = 0;
export const EMBLEM_SIZE_MAX = 5;

export const EMBLEM_ENTITY_TYPES = ["state", "province", "burg"] as const;
export type EmblemEntityType = (typeof EMBLEM_ENTITY_TYPES)[number];

const EMBLEM_ENTITY_TYPE_SET: ReadonlySet<EmblemEntityType> = new Set(
  EMBLEM_ENTITY_TYPES,
);

export function resolveEmblemEntityType(
  value: unknown,
): EmblemEntityType | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  if (!key) return null;
  return EMBLEM_ENTITY_TYPE_SET.has(key as EmblemEntityType)
    ? (key as EmblemEntityType)
    : null;
}

export interface EmblemSizeRef {
  i: number;
  name: string;
  previousSize: number | null;
}

export interface SetEmblemSizeRuntime {
  find(
    entityType: EmblemEntityType,
    ref: number | string,
  ): EmblemSizeRef | null;
  apply(entityType: EmblemEntityType, i: number, size: number): void;
}

type EntityWithCoa =
  | RawState
  | RawProvince
  | (RawBurg & { pole?: number[] | [number, number] });

interface EmblemsSelection {
  select(selector: string): EmblemsSelection;
  remove(): unknown;
  attr(name: string): string | null;
  attr(name: string, value: string | number): EmblemsSelection;
  append(tag: string): EmblemsSelection;
}

interface D3Like {
  select(target: Element | string): EmblemsSelection;
}

/**
 * Resolve the d3 selection wrapping the `<g id="emblems">` SVG layer.
 * The legacy `let emblems = ...` binding in main.js does not attach to
 * globalThis, AND the `<g>` element itself has id="emblems" (which
 * DOM-shadows any same-named global). So we locate the element by id
 * and wrap it with d3 directly.
 */
function getEmblemsSelection(): EmblemsSelection | null {
  if (typeof document === "undefined") return null;
  const el = document.getElementById("emblems");
  if (!el) return null;
  const d3 = getGlobal<D3Like>("d3");
  if (!d3 || typeof d3.select !== "function") return null;
  return d3.select(el);
}

function pickCollection(
  pack: Pack | undefined,
  entityType: EmblemEntityType,
): EntityWithCoa[] | undefined {
  if (!pack) return undefined;
  if (entityType === "state") return pack.states as EntityWithCoa[] | undefined;
  if (entityType === "province")
    return pack.provinces as EntityWithCoa[] | undefined;
  return pack.burgs as EntityWithCoa[] | undefined;
}

function getCoordinate(
  entity: EntityWithCoa,
  axis: "x" | "y",
): number | undefined {
  const coa = entity.coa as (RawCoa & { x?: number; y?: number }) | undefined;
  const fromCoa = coa ? coa[axis] : undefined;
  if (typeof fromCoa === "number") return fromCoa;
  const fromEntity = (entity as { x?: number; y?: number })[axis];
  if (typeof fromEntity === "number") return fromEntity;
  const pole = (entity as { pole?: number[] | [number, number] }).pole;
  const idx = axis === "x" ? 0 : 1;
  if (Array.isArray(pole) && typeof pole[idx] === "number") return pole[idx];
  return undefined;
}

export const defaultSetEmblemSizeRuntime: SetEmblemSizeRuntime = {
  find(entityType, ref) {
    const pack = getPack<Pack>();
    const collection = pickCollection(pack, entityType);
    const entry = findEntityByRef(collection, ref);
    if (!entry) return null;
    const previousSize =
      typeof entry.coa?.size === "number" ? (entry.coa.size as number) : null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      previousSize,
    };
  },
  apply(entityType, i, size) {
    const pack = getPack<Pack>();
    if (!pack) {
      throw new Error(
        "window.pack is not available; the map hasn't finished loading.",
      );
    }
    const collection = pickCollection(pack, entityType);
    const entity = collection?.[i];
    if (!entity) {
      throw new Error(
        `${entityType[0]?.toUpperCase()}${entityType.slice(1)} ${i} not found.`,
      );
    }
    entity.coa = (entity.coa ?? {}) as RawCoa;
    (entity.coa as RawCoa & { size?: number }).size = size;

    try {
      const emblems = getEmblemsSelection();
      if (!emblems || typeof emblems.select !== "function") return;
      const g = emblems.select(`#${entityType}Emblems`);
      if (!g || typeof g.select !== "function") return;
      const existing = g.select(`[data-i='${i}']`);
      if (existing && typeof existing.remove === "function") {
        existing.remove();
      }
      if (size <= 0) return;

      const fontSizeAttr =
        typeof g.attr === "function" ? g.attr("font-size") : null;
      const categorySize = Number(fontSizeAttr) || 0;
      const shift = (categorySize * size) / 2;
      const x = getCoordinate(entity, "x");
      const y = getCoordinate(entity, "y");
      if (typeof x !== "number" || typeof y !== "number") return;
      const id = `${entityType}COA${i}`;

      const useEl = g.append("use");
      if (!useEl || typeof useEl.attr !== "function") return;
      useEl
        .attr("data-i", i)
        .attr("x", rn(x - shift, 2))
        .attr("y", rn(y - shift, 2))
        .attr("width", `${size}em`)
        .attr("height", `${size}em`)
        .attr("href", `#${id}`);
    } catch {
      // best-effort — DOM work must never block the data write
    }
  },
};

export function createSetEmblemSizeTool(
  runtime: SetEmblemSizeRuntime = defaultSetEmblemSizeRuntime,
): Tool {
  return {
    name: "set_emblem_size",
    description: `Set a single state/province/burg's emblem size — same side-effect as the "Size" slider/number input in the Emblem Editor. Writes \`entity.coa.size\` and best-effort updates the emblem layer's \`<use>\` element (removes the existing one and re-appends at the new size, anchored at the entity's center). Setting size to 0 hides the emblem (no \`<use>\` is re-appended). Initializes \`entity.coa = {}\` if missing; preserves any other existing coa fields (shield, custom, etc.). PER-ENTITY scope — does not cascade to other entities. Size must be a finite number in [${EMBLEM_SIZE_MIN}, ${EMBLEM_SIZE_MAX}] (UI slider step is 0.1).`,
    input_schema: {
      type: "object",
      properties: {
        entity_type: {
          type: "string",
          enum: [...EMBLEM_ENTITY_TYPES],
          description:
            "Which kind of entity owns the emblem: 'state', 'province', or 'burg'.",
        },
        entity: {
          type: ["integer", "string"],
          description:
            "Numeric id (> 0) of the entity, or its case-insensitive name.",
        },
        size: {
          type: "number",
          minimum: EMBLEM_SIZE_MIN,
          maximum: EMBLEM_SIZE_MAX,
          description: `Emblem size (finite number in [${EMBLEM_SIZE_MIN}, ${EMBLEM_SIZE_MAX}]). 0 hides the emblem.`,
        },
      },
      required: ["entity_type", "entity", "size"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        entity_type?: unknown;
        entity?: unknown;
        size?: unknown;
      };

      const entityType = resolveEmblemEntityType(input.entity_type);
      if (!entityType) {
        return errorResult(
          "entity_type must be one of: state, province, burg.",
        );
      }

      const refResult = parseEntityRef(input.entity, "entity");
      if (!refResult.ok) return errorResult(refResult.error);

      if (typeof input.size !== "number" || !Number.isFinite(input.size)) {
        return errorResult(
          `size must be a finite number in [${EMBLEM_SIZE_MIN}, ${EMBLEM_SIZE_MAX}].`,
        );
      }
      if (input.size < EMBLEM_SIZE_MIN || input.size > EMBLEM_SIZE_MAX) {
        return errorResult(
          `size must be a finite number in [${EMBLEM_SIZE_MIN}, ${EMBLEM_SIZE_MAX}].`,
        );
      }
      const size = input.size;

      const current = runtime.find(entityType, refResult.ref);
      if (!current) {
        const Cap = `${entityType[0]?.toUpperCase()}${entityType.slice(1)}`;
        return errorResult(
          `${Cap} ${JSON.stringify(refResult.ref)} not found.`,
        );
      }

      try {
        runtime.apply(entityType, current.i, size);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        entity_type: entityType,
        entity: { i: current.i, name: current.name },
        previous_size: current.previousSize,
        size,
      });
    },
  };
}

export const setEmblemSizeTool = createSetEmblemSizeTool();
