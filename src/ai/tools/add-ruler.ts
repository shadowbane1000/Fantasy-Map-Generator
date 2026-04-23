import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Canonical ruler class names — the keys of the `typeMap` inside
 * `public/modules/ui/measurers.js` (`Rulers.fromString`). Each name is
 * the `window.<ClassName>` global that constructs a new measurer.
 */
export const RULER_CLASS_NAMES = ["Ruler", "Opisometer", "Planimeter"] as const;
export type RulerClassName = (typeof RULER_CLASS_NAMES)[number];

/**
 * Map input aliases → canonical class name. Accepts both lowercase
 * (`"ruler"`) and PascalCase (`"Ruler"`) forms so the AI can use
 * whichever it prefers.
 */
const TYPE_ALIASES: Record<string, RulerClassName> = {
  ruler: "Ruler",
  opisometer: "Opisometer",
  planimeter: "Planimeter",
};

export interface RulerAddInput {
  type: RulerClassName;
  points: number[][];
}

export interface NewRuler {
  id: number;
  type: RulerClassName;
  points: number[][];
}

export interface RulerAddRuntime {
  add(input: RulerAddInput): NewRuler;
}

interface MeasurerInstance {
  id: number;
  points: number[][];
  draw?: () => unknown;
}

interface RulersCollection {
  data: MeasurerInstance[];
  create: (Type: unknown, points: number[][]) => MeasurerInstance;
}

type MeasurerCtor = new (points: number[][]) => MeasurerInstance;

export const defaultRulerAddRuntime: RulerAddRuntime = {
  add(input: RulerAddInput): NewRuler {
    const rulers = getGlobal<RulersCollection>("rulers");
    if (
      !rulers ||
      typeof rulers.create !== "function" ||
      !Array.isArray(rulers.data)
    ) {
      throw new Error("rulers collection is not available.");
    }
    const Ctor = getGlobal<MeasurerCtor>(input.type);
    if (typeof Ctor !== "function") {
      throw new Error(`${input.type} class is not available yet.`);
    }
    const instance = rulers.create(Ctor, input.points);
    try {
      instance.draw?.();
    } catch {
      // Best-effort: the data mutation already happened.
    }
    return {
      id: instance.id,
      type: input.type,
      points: instance.points,
    };
  },
};

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function resolveType(raw: unknown): RulerClassName | null {
  if (raw === undefined || raw === null) return "Ruler";
  if (typeof raw !== "string") return null;
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  return TYPE_ALIASES[key] ?? null;
}

function readGraphBounds(): { width: number; height: number } | null {
  const width = getGlobal<number>("graphWidth");
  const height = getGlobal<number>("graphHeight");
  if (isFiniteNumber(width) && isFiniteNumber(height)) return { width, height };
  return null;
}

function validateCoord(
  value: unknown,
  name: string,
  bounds: { width: number; height: number } | null,
  axis: "x" | "y",
): string | null {
  if (!isFiniteNumber(value)) return `${name} must be a finite number.`;
  if (bounds) {
    const max = axis === "x" ? bounds.width : bounds.height;
    if (value < 0 || value > max) {
      return `${name} (${value}) is out of bounds [0, ${max}].`;
    }
  }
  return null;
}

function validatePointsArray(
  raw: unknown,
  bounds: { width: number; height: number } | null,
  minLength: number,
): { points: number[][] } | { error: string } {
  if (!Array.isArray(raw)) {
    return { error: "points must be an array of [x, y] pairs." };
  }
  if (raw.length < minLength) {
    return {
      error: `points must have at least ${minLength} entries (got ${raw.length}).`,
    };
  }
  const cleaned: number[][] = [];
  for (let i = 0; i < raw.length; i++) {
    const pair = raw[i];
    if (!Array.isArray(pair) || pair.length < 2) {
      return { error: `points[${i}] must be an [x, y] pair.` };
    }
    const [x, y] = pair;
    const xErr = validateCoord(x, `points[${i}].x`, bounds, "x");
    if (xErr) return { error: xErr };
    const yErr = validateCoord(y, `points[${i}].y`, bounds, "y");
    if (yErr) return { error: yErr };
    cleaned.push([x as number, y as number]);
  }
  return { points: cleaned };
}

export function createAddRulerTool(
  runtime: RulerAddRuntime = defaultRulerAddRuntime,
): Tool {
  return {
    name: "add_ruler",
    description:
      'Add a new ruler / measurer to the map — same data mutation the Measurer tool performs when clicked via the Units Editor. Delegates to window.rulers.create(Type, points) from public/modules/ui/measurers.js and best-effort calls instance.draw(). For straight rulers (type "ruler", default) and opisometers pass (x1, y1, x2, y2). For planimeters pass a closed polygon via points[]. Returns {id, type, points}.',
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description:
            "Ruler type — 'ruler' (straight line, default), 'opisometer' (curved line), or 'planimeter' (closed polygon, requires points[]). Case-insensitive.",
        },
        x1: {
          type: "number",
          description:
            "Start X in map pixel space (required for ruler / opisometer; ignored for planimeter).",
        },
        y1: {
          type: "number",
          description:
            "Start Y in map pixel space (required for ruler / opisometer; ignored for planimeter).",
        },
        x2: {
          type: "number",
          description:
            "End X in map pixel space (required for ruler / opisometer; ignored for planimeter).",
        },
        y2: {
          type: "number",
          description:
            "End Y in map pixel space (required for ruler / opisometer; ignored for planimeter).",
        },
        points: {
          type: "array",
          description:
            "Array of [x, y] pairs — required when type=planimeter (length ≥ 3). Ignored for ruler / opisometer (which use x1, y1, x2, y2).",
          items: {
            type: "array",
            items: { type: "number" },
            minItems: 2,
            maxItems: 2,
          },
        },
      },
      required: ["x1", "y1", "x2", "y2"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as Record<string, unknown>;

      const type = resolveType(input.type);
      if (type === null) {
        const supported = RULER_CLASS_NAMES.map((n) => n.toLowerCase()).join(
          ", ",
        );
        return errorResult(
          `type must be one of: ${supported}. Got: ${JSON.stringify(input.type)}.`,
        );
      }

      const bounds = readGraphBounds();

      let points: number[][];
      if (type === "Planimeter") {
        const result = validatePointsArray(input.points, bounds, 3);
        if ("error" in result) return errorResult(result.error);
        points = result.points;
      } else {
        const x1Err = validateCoord(input.x1, "x1", bounds, "x");
        if (x1Err) return errorResult(x1Err);
        const y1Err = validateCoord(input.y1, "y1", bounds, "y");
        if (y1Err) return errorResult(y1Err);
        const x2Err = validateCoord(input.x2, "x2", bounds, "x");
        if (x2Err) return errorResult(x2Err);
        const y2Err = validateCoord(input.y2, "y2", bounds, "y");
        if (y2Err) return errorResult(y2Err);
        points = [
          [input.x1 as number, input.y1 as number],
          [input.x2 as number, input.y2 as number],
        ];
      }

      try {
        const created = runtime.add({ type, points });
        return okResult({
          id: created.id,
          type: created.type,
          points: created.points,
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

export const addRulerTool = createAddRulerTool();
