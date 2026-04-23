import { createPaginatedListTool, getGlobal } from "./_shared";
import type { Tool } from "./index";

/**
 * Read-only listing of every ruler / opisometer / planimeter /
 * RouteOpisometer currently placed on the map — the `.data` array of
 * the `Rulers` collection in `public/modules/ui/measurers.js`. Matches
 * the Rulers Overview / Units Editor listing. Complements `add_ruler`
 * (create), `clear_rulers` (bulk wipe), and `remove_ruler` (single
 * delete).
 */

export interface RulerSummary {
  i: number;
  type: string;
  points: number[][];
  length: number;
  unit: string | null;
}

interface MeasurerInstanceLike {
  id: number;
  points?: unknown;
  constructor?: { name?: string };
}

export interface RulerCollectionLike {
  data?: unknown;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function sanitisePoints(raw: unknown): number[][] {
  if (!Array.isArray(raw)) return [];
  const out: number[][] = [];
  for (const pair of raw) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const x = isFiniteNumber(pair[0]) ? pair[0] : 0;
    const y = isFiniteNumber(pair[1]) ? pair[1] : 0;
    out.push([x, y]);
  }
  return out;
}

function computeRulerLength(points: number[][], closed: boolean): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    total += Math.hypot(x1 - x2, y1 - y2);
  }
  if (closed && points.length >= 3) {
    const [x1, y1] = points[points.length - 1];
    const [x2, y2] = points[0];
    total += Math.hypot(x1 - x2, y1 - y2);
  }
  return total;
}

export function readRulersFromCollection(
  rulers: RulerCollectionLike | undefined | null,
  unit: string | null,
): RulerSummary[] | null {
  if (!rulers || !Array.isArray(rulers.data)) return null;
  const data = rulers.data as MeasurerInstanceLike[];
  return data
    .filter((r): r is MeasurerInstanceLike => !!r && typeof r === "object")
    .map((r): RulerSummary => {
      const type = r.constructor?.name ?? "Measurer";
      const points = sanitisePoints(r.points);
      const closed = type === "Planimeter";
      return {
        i: typeof r.id === "number" ? r.id : 0,
        type,
        points,
        length: computeRulerLength(points, closed),
        unit,
      };
    });
}

function readDistanceUnit(): string | null {
  if (typeof document === "undefined") return null;
  const el = document.getElementById("distanceUnitInput") as unknown as {
    value?: unknown;
  } | null;
  if (!el) return null;
  const v = el.value;
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length ? trimmed : null;
}

export interface RulersRuntime {
  readRulers(): RulerSummary[] | null;
}

export const defaultRulersRuntime: RulersRuntime = {
  readRulers(): RulerSummary[] | null {
    return readRulersFromCollection(
      getGlobal<RulerCollectionLike>("rulers"),
      readDistanceUnit(),
    );
  },
};

export function createListRulersTool(
  runtime: RulersRuntime = defaultRulersRuntime,
): Tool {
  return createPaginatedListTool<RulerSummary>({
    name: "list_rulers",
    description:
      "List every ruler / opisometer / planimeter / RouteOpisometer currently placed on the map — the `.data` array of the `Rulers` collection in `public/modules/ui/measurers.js`. Mirrors the Rulers Overview / Units Editor listing. Each entry reports `i` (the ruler id assigned by the `Measurer` base constructor as `rulers.data.length` at creation), `type` (class name — `Ruler` / `Opisometer` / `Planimeter` / `RouteOpisometer`), `points` (deep copy of `[x, y]` pairs), `length` (straight-line Σ `Math.hypot` of segments — matches `Ruler.getLength` in measurers.js; for `Planimeter` this is the closed-polygon perimeter; for curved `Opisometer` / `RouteOpisometer` it's the control-point polyline length, not the drawn curve's `el.getTotalLength()`), and `unit` (the current distance unit — value of `#distanceUnitInput`). Paginated: `limit` 1-500 (default 100), `offset` >= 0. Useful before `remove_ruler` (to pick an id) or `clear_rulers`. Requires an Anthropic API key (see \"Getting an API key\" below).",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 500,
          description: "Maximum number of rulers to return (default 100).",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Number of rulers to skip (default 0).",
        },
      },
    },
    collectionKey: "rulers",
    notReadyError:
      "Map is not ready yet; cannot list rulers. Wait for the 'map:generated' event on window.",
    read: () => runtime.readRulers(),
  });
}

export const listRulersTool = createListRulersTool();
