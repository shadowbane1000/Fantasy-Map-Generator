import {
  errorResult,
  findEntityByRef,
  getGlobal,
  getPack,
  okResult,
  type RawBurg,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export type PointSpec =
  | { kind: "coords"; x: number; y: number }
  | { kind: "cell"; cell: number }
  | { kind: "burg"; ref: number | string };

export interface ResolvedPoint {
  x: number;
  y: number;
}

export type PointError =
  | "not-ready"
  | "out-of-bounds"
  | "no-cell-point"
  | "burg-not-found";

interface PackLike {
  burgs?: RawBurg[];
  cells?: {
    i?: ArrayLike<number>;
    p?: ArrayLike<[number, number] | undefined>;
  };
}

function resolvePoint(
  pack: PackLike | undefined,
  spec: PointSpec,
): ResolvedPoint | PointError {
  if (spec.kind === "coords") return { x: spec.x, y: spec.y };
  if (!pack) return "not-ready";

  if (spec.kind === "cell") {
    const cellsIndex = pack.cells?.i;
    if (!cellsIndex) return "not-ready";
    if (spec.cell < 0 || spec.cell >= cellsIndex.length) return "out-of-bounds";
    const point = pack.cells?.p?.[spec.cell];
    if (!Array.isArray(point)) return "no-cell-point";
    const [px, py] = point;
    if (typeof px !== "number" || typeof py !== "number")
      return "no-cell-point";
    return { x: px, y: py };
  }

  // burg form
  if (!pack.burgs) return "not-ready";
  const burg = findEntityByRef(pack.burgs, spec.ref);
  if (!burg) return "burg-not-found";
  // index-0 placeholder has i === 0 so findEntityByRef rejects it already;
  // still double-check coords defensively.
  const bx = burg.x;
  const by = burg.y;
  if (typeof bx !== "number" || typeof by !== "number") return "burg-not-found";
  return { x: bx, y: by };
}

export interface MeasureResult {
  pixels: number;
  from: ResolvedPoint;
  to: ResolvedPoint;
}

export type MeasureInPackResult =
  | { ok: true; value: MeasureResult }
  | { ok: false; error: PointError; which: "from" | "to" };

export function measureDistanceInPack(
  pack: PackLike | undefined,
  from: PointSpec,
  to: PointSpec,
): MeasureInPackResult {
  const fromPoint = resolvePoint(pack, from);
  if (typeof fromPoint === "string") {
    return { ok: false, error: fromPoint, which: "from" };
  }
  const toPoint = resolvePoint(pack, to);
  if (typeof toPoint === "string") {
    return { ok: false, error: toPoint, which: "to" };
  }
  const dx = toPoint.x - fromPoint.x;
  const dy = toPoint.y - fromPoint.y;
  const pixels = Math.hypot(dx, dy);
  return { ok: true, value: { pixels, from: fromPoint, to: toPoint } };
}

export interface ScaleInfo {
  distanceScale: number;
  distanceUnit: string;
}

export interface MeasureDistanceRuntime {
  measure(from: PointSpec, to: PointSpec): MeasureInPackResult;
  readScale(): ScaleInfo;
}

function readScaleFromGlobals(): ScaleInfo {
  const scaleRaw = getGlobal<number>("distanceScale");
  const distanceScale =
    typeof scaleRaw === "number" && Number.isFinite(scaleRaw) ? scaleRaw : 1;

  let distanceUnit = "mi";
  // Prefer the DOM input (what the UI labels rulers with).
  if (typeof document !== "undefined") {
    const el = document.getElementById("distanceUnitInput") as
      | HTMLInputElement
      | HTMLSelectElement
      | null;
    const v = el?.value;
    if (typeof v === "string" && v.trim()) {
      distanceUnit = v;
      return { distanceScale, distanceUnit };
    }
  }
  // Fall back to window.options.distanceUnit.
  const options = getGlobal<{ distanceUnit?: unknown }>("options");
  const optUnit = options?.distanceUnit;
  if (typeof optUnit === "string" && optUnit.trim()) {
    distanceUnit = optUnit;
  }
  return { distanceScale, distanceUnit };
}

export const defaultMeasureDistanceRuntime: MeasureDistanceRuntime = {
  measure(from, to) {
    return measureDistanceInPack(getPack<PackLike>(), from, to);
  },
  readScale() {
    return readScaleFromGlobals();
  },
};

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isNonNegativeInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

type ParsedForm =
  | { form: "cell"; from: PointSpec; to: PointSpec }
  | { form: "burg"; from: PointSpec; to: PointSpec }
  | { form: "coords"; from: PointSpec; to: PointSpec }
  | { error: string };

const FORM_MESSAGE =
  "Provide exactly one of: (from_cell + to_cell), (from_burg + to_burg), or (from_x + from_y + to_x + to_y).";

function parseInput(raw: unknown): ParsedForm {
  const input = (raw ?? {}) as {
    from_cell?: unknown;
    to_cell?: unknown;
    from_burg?: unknown;
    to_burg?: unknown;
    from_x?: unknown;
    from_y?: unknown;
    to_x?: unknown;
    to_y?: unknown;
  };

  const hasFromCell = input.from_cell !== undefined && input.from_cell !== null;
  const hasToCell = input.to_cell !== undefined && input.to_cell !== null;
  const hasFromBurg = input.from_burg !== undefined && input.from_burg !== null;
  const hasToBurg = input.to_burg !== undefined && input.to_burg !== null;
  const hasFromX = input.from_x !== undefined && input.from_x !== null;
  const hasFromY = input.from_y !== undefined && input.from_y !== null;
  const hasToX = input.to_x !== undefined && input.to_x !== null;
  const hasToY = input.to_y !== undefined && input.to_y !== null;

  const cellForm = hasFromCell || hasToCell;
  const burgForm = hasFromBurg || hasToBurg;
  const coordForm = hasFromX || hasFromY || hasToX || hasToY;

  const formsPresent = [cellForm, burgForm, coordForm].filter(Boolean).length;
  if (formsPresent === 0) return { error: FORM_MESSAGE };
  if (formsPresent > 1) return { error: FORM_MESSAGE };

  if (cellForm) {
    if (!hasFromCell || !hasToCell) return { error: FORM_MESSAGE };
    if (!isNonNegativeInt(input.from_cell)) {
      return { error: "from_cell must be a non-negative integer." };
    }
    if (!isNonNegativeInt(input.to_cell)) {
      return { error: "to_cell must be a non-negative integer." };
    }
    return {
      form: "cell",
      from: { kind: "cell", cell: input.from_cell },
      to: { kind: "cell", cell: input.to_cell },
    };
  }

  if (burgForm) {
    if (!hasFromBurg || !hasToBurg) return { error: FORM_MESSAGE };
    const fromRef = input.from_burg;
    const toRef = input.to_burg;
    const fromOk =
      (typeof fromRef === "number" && Number.isInteger(fromRef)) ||
      (typeof fromRef === "string" && fromRef.trim().length > 0);
    const toOk =
      (typeof toRef === "number" && Number.isInteger(toRef)) ||
      (typeof toRef === "string" && toRef.trim().length > 0);
    if (!fromOk) {
      return {
        error: "from_burg must be an integer id or a non-empty string name.",
      };
    }
    if (!toOk) {
      return {
        error: "to_burg must be an integer id or a non-empty string name.",
      };
    }
    return {
      form: "burg",
      from: { kind: "burg", ref: fromRef as number | string },
      to: { kind: "burg", ref: toRef as number | string },
    };
  }

  // coord form
  if (!hasFromX || !hasFromY || !hasToX || !hasToY) {
    return { error: FORM_MESSAGE };
  }
  if (!isFiniteNumber(input.from_x)) {
    return { error: "from_x must be a finite number." };
  }
  if (!isFiniteNumber(input.from_y)) {
    return { error: "from_y must be a finite number." };
  }
  if (!isFiniteNumber(input.to_x)) {
    return { error: "to_x must be a finite number." };
  }
  if (!isFiniteNumber(input.to_y)) {
    return { error: "to_y must be a finite number." };
  }
  return {
    form: "coords",
    from: { kind: "coords", x: input.from_x, y: input.from_y },
    to: { kind: "coords", x: input.to_x, y: input.to_y },
  };
}

function describeError(
  which: "from" | "to",
  error: PointError,
  spec: PointSpec,
): string {
  if (error === "not-ready") {
    return "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).";
  }
  if (error === "out-of-bounds") {
    const cell = spec.kind === "cell" ? spec.cell : "?";
    return `${which}_cell ${cell} is out of bounds.`;
  }
  if (error === "no-cell-point") {
    const cell = spec.kind === "cell" ? spec.cell : "?";
    return `${which}_cell ${cell} has no coordinates.`;
  }
  // burg-not-found
  const ref = spec.kind === "burg" ? spec.ref : "?";
  return `${which}_burg ${JSON.stringify(ref)} not found.`;
}

export function createMeasureDistanceTool(
  runtime: MeasureDistanceRuntime = defaultMeasureDistanceRuntime,
): Tool {
  return {
    name: "measure_distance",
    description:
      "Measure the straight-line (Euclidean) distance between two points on the map, returned in both raw SVG pixels and scaled real-world units. Parallels the Measurer tool's 2-point ruler label (`rn(length * distanceScale) + ' ' + distanceUnitInput.value` in `public/modules/ui/measurers.js`) but returns the number instead of drawing anything — no mutation, no SVG. Accepts exactly one of three point-pair forms: (a) `from_cell` + `to_cell` (non-negative integers — reads `pack.cells.p[cell]`), (b) `from_burg` + `to_burg` (each a numeric burg id OR a case-insensitive name / fullName; index-0 placeholder and `removed: true` burgs are rejected), or (c) `from_x` + `from_y` + `to_x` + `to_y` (finite numbers in SVG pixel space). Computes `Math.hypot(dx, dy)` for `pixels` and multiplies by the current `distanceScale` (from `public/main.js`) for `scaled`; the returned `unit` comes from the `#distanceUnitInput` DOM field (fallback `window.options.distanceUnit`, fallback `\"mi\"`). Useful when the AI needs a numeric distance for reasoning — 'how far is Stormport from Ashgard' or 'is cell 1234 within 100 km of the coast' — without littering the map with rulers. Errors on missing / un-generated map, mixed or incomplete forms, unknown / removed burgs, out-of-bounds cells, cells with no `pack.cells.p` entry, and non-finite coordinates. Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        from_cell: {
          type: "integer",
          minimum: 0,
          description:
            "Start point — packed cell index whose centroid (`pack.cells.p[from_cell]`) is the 'from' point. Use with `to_cell`; mutually exclusive with the burg and coordinate forms.",
        },
        to_cell: {
          type: "integer",
          minimum: 0,
          description:
            "End point — packed cell index (`pack.cells.p[to_cell]`). Use with `from_cell`.",
        },
        from_burg: {
          description:
            "Start point — burg identity. Integer id (`burg.i`) or case-insensitive name / fullName. Use with `to_burg`.",
        },
        to_burg: {
          description:
            "End point — burg identity (id or case-insensitive name / fullName). Use with `from_burg`.",
        },
        from_x: {
          type: "number",
          description:
            "Start X in SVG pixel space. Use with `from_y`, `to_x`, `to_y`.",
        },
        from_y: {
          type: "number",
          description: "Start Y in SVG pixel space.",
        },
        to_x: {
          type: "number",
          description: "End X in SVG pixel space.",
        },
        to_y: {
          type: "number",
          description: "End Y in SVG pixel space.",
        },
      },
    },
    execute(rawInput: unknown): ToolResult {
      const parsed = parseInput(rawInput);
      if ("error" in parsed) return errorResult(parsed.error);

      const outcome = runtime.measure(parsed.from, parsed.to);
      if (!outcome.ok) {
        return errorResult(
          describeError(
            outcome.which,
            outcome.error,
            outcome.which === "from" ? parsed.from : parsed.to,
          ),
        );
      }

      const { distanceScale, distanceUnit } = runtime.readScale();
      const { pixels, from, to } = outcome.value;
      const scaled = pixels * distanceScale;
      return okResult({
        pixels,
        scaled,
        unit: distanceUnit,
        from: { x: from.x, y: from.y },
        to: { x: to.x, y: to.y },
      });
    },
  };
}

export const measureDistanceTool = createMeasureDistanceTool();
