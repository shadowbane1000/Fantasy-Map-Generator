import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createMeasureDistanceTool,
  defaultMeasureDistanceRuntime,
  type MeasureDistanceRuntime,
  type MeasureInPackResult,
  measureDistanceInPack,
  measureDistanceTool,
  type PointSpec,
} from "./measure-distance";

interface FakeBurg {
  i: number;
  name?: string;
  fullName?: string;
  x?: number;
  y?: number;
  removed?: boolean;
}

interface FakePack {
  burgs?: FakeBurg[];
  cells?: {
    i?: number[];
    p?: Array<[number, number] | undefined>;
  };
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof measureDistanceInPack>[0];
}

function makePack(): FakePack {
  return {
    burgs: [
      { i: 0, name: "placeholder", x: 0, y: 0 },
      {
        i: 1,
        name: "Stormport",
        fullName: "City of Stormport",
        x: 100,
        y: 100,
      },
      { i: 2, name: "Ashgard", x: 400, y: 500 },
      { i: 3, name: "Gonehaven", x: 120, y: 120, removed: true },
    ],
    cells: {
      i: [0, 1, 2, 3],
      p: [
        [0, 0],
        [10, 10],
        [30, 40], // dist from (0,0) = 50
        [6, 8], // dist from (0,0) = 10
      ],
    },
  };
}

const fixedScaleRuntime = (
  pack: FakePack,
  distanceScale = 2,
  distanceUnit = "mi",
): MeasureDistanceRuntime => ({
  measure(from, to) {
    return measureDistanceInPack(asPack(pack), from, to);
  },
  readScale() {
    return { distanceScale, distanceUnit };
  },
});

describe("measure_distance — pure / seam", () => {
  it("coordinate form computes Euclidean distance (3-4-5 triangle)", () => {
    const result = measureDistanceInPack(
      asPack(makePack()),
      { kind: "coords", x: 0, y: 0 },
      { kind: "coords", x: 3, y: 4 },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.pixels).toBeCloseTo(5, 10);
    }
  });

  it("cell form resolves pack.cells.p for both endpoints", () => {
    const result = measureDistanceInPack(
      asPack(makePack()),
      { kind: "cell", cell: 0 },
      { kind: "cell", cell: 2 },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      // (0,0) → (30,40) ⇒ 50
      expect(result.value.pixels).toBeCloseTo(50, 10);
      expect(result.value.from).toEqual({ x: 0, y: 0 });
      expect(result.value.to).toEqual({ x: 30, y: 40 });
    }
  });

  it("burg form resolves numeric id and case-insensitive name", () => {
    const byId = measureDistanceInPack(
      asPack(makePack()),
      { kind: "burg", ref: 1 },
      { kind: "burg", ref: 2 },
    );
    expect(byId.ok).toBe(true);
    if (byId.ok) {
      // Stormport (100,100) → Ashgard (400,500); hypot(300,400)=500
      expect(byId.value.pixels).toBeCloseTo(500, 10);
    }

    const byName = measureDistanceInPack(
      asPack(makePack()),
      { kind: "burg", ref: "stormport" },
      { kind: "burg", ref: "ASHGARD" },
    );
    expect(byName.ok).toBe(true);
    if (byName.ok) {
      expect(byName.value.pixels).toBeCloseTo(500, 10);
    }
  });

  it("burg form rejects removed burgs and index-0 placeholder", () => {
    const removedCase = measureDistanceInPack(
      asPack(makePack()),
      { kind: "burg", ref: 3 },
      { kind: "burg", ref: 1 },
    );
    expect(removedCase.ok).toBe(false);
    if (!removedCase.ok) {
      expect(removedCase.error).toBe("burg-not-found");
      expect(removedCase.which).toBe("from");
    }

    const placeholderCase = measureDistanceInPack(
      asPack(makePack()),
      { kind: "burg", ref: 1 },
      { kind: "burg", ref: 0 },
    );
    expect(placeholderCase.ok).toBe(false);
    if (!placeholderCase.ok) {
      expect(placeholderCase.error).toBe("burg-not-found");
      expect(placeholderCase.which).toBe("to");
    }
  });

  it("scaled = pixels * distanceScale (tool-surface)", async () => {
    const tool = createMeasureDistanceTool(
      fixedScaleRuntime(makePack(), 2.5, "km"),
    );
    const out = await tool.execute({
      from_x: 0,
      from_y: 0,
      to_x: 3,
      to_y: 4,
    });
    expect(out.isError).toBeFalsy();
    const body = JSON.parse(out.content);
    expect(body.pixels).toBeCloseTo(5, 10);
    expect(body.scaled).toBeCloseTo(12.5, 10);
    expect(body.unit).toBe("km");
  });

  it("out-of-bounds cell surfaces the sentinel", () => {
    const result = measureDistanceInPack(
      asPack(makePack()),
      { kind: "cell", cell: 0 },
      { kind: "cell", cell: 9999 },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("out-of-bounds");
      expect(result.which).toBe("to");
    }
  });

  it("cell with no point returns 'no-cell-point'", () => {
    const pack = makePack();
    (pack.cells as { p: Array<[number, number] | undefined> }).p[1] = undefined;
    const result = measureDistanceInPack(
      asPack(pack),
      {
        kind: "cell",
        cell: 1,
      },
      { kind: "cell", cell: 2 },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("no-cell-point");
      expect(result.which).toBe("from");
    }
  });

  it("missing pack returns 'not-ready' for cell / burg forms", () => {
    const cellCase = measureDistanceInPack(
      undefined,
      { kind: "cell", cell: 1 },
      { kind: "cell", cell: 2 },
    );
    expect(cellCase.ok).toBe(false);
    if (!cellCase.ok) expect(cellCase.error).toBe("not-ready");

    const burgCase = measureDistanceInPack(
      undefined,
      { kind: "burg", ref: 1 },
      { kind: "burg", ref: 2 },
    );
    expect(burgCase.ok).toBe(false);
    if (!burgCase.ok) expect(burgCase.error).toBe("not-ready");
  });
});

describe("measure_distance — tool surface", () => {
  function makeTool(pack: FakePack = makePack()) {
    return createMeasureDistanceTool(fixedScaleRuntime(pack));
  }

  it("rejects when no form supplied", async () => {
    const out = await makeTool().execute({});
    expect(out.isError).toBe(true);
    expect(JSON.parse(out.content).error).toMatch(/exactly one of/i);
  });

  it("rejects when two forms supplied simultaneously", async () => {
    const tool = makeTool();
    const out = await tool.execute({
      from_cell: 0,
      to_cell: 1,
      from_x: 0,
      from_y: 0,
      to_x: 1,
      to_y: 1,
    });
    expect(out.isError).toBe(true);
    expect(JSON.parse(out.content).error).toMatch(/exactly one of/i);

    const out2 = await tool.execute({
      from_cell: 0,
      to_cell: 1,
      from_burg: 1,
      to_burg: 2,
    });
    expect(out2.isError).toBe(true);
    expect(JSON.parse(out2.content).error).toMatch(/exactly one of/i);
  });

  it("rejects incomplete coordinate form", async () => {
    const tool = makeTool();
    const out = await tool.execute({ from_x: 0, from_y: 0, to_x: 1 });
    expect(out.isError).toBe(true);
    expect(JSON.parse(out.content).error).toMatch(/exactly one of/i);
  });

  it("rejects non-finite coordinates", async () => {
    const tool = makeTool();
    for (const bad of [
      { from_x: Number.NaN, from_y: 0, to_x: 1, to_y: 1 },
      { from_x: 0, from_y: Number.POSITIVE_INFINITY, to_x: 1, to_y: 1 },
      { from_x: 0, from_y: 0, to_x: "1", to_y: 1 },
      { from_x: 0, from_y: 0, to_x: 1, to_y: null as unknown as number },
    ]) {
      const out = await tool.execute(bad);
      expect(out.isError).toBe(true);
      const err = JSON.parse(out.content).error as string;
      expect(err).toMatch(/(finite|exactly one of)/i);
    }
  });

  it("rejects non-integer / negative cell", async () => {
    const tool = makeTool();
    for (const bad of [
      { from_cell: -1, to_cell: 1 },
      { from_cell: 1.5, to_cell: 1 },
      { from_cell: 0, to_cell: "1" },
    ]) {
      const out = await tool.execute(bad);
      expect(out.isError).toBe(true);
      expect(JSON.parse(out.content).error).toMatch(/non-negative integer/i);
    }
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createMeasureDistanceTool({
      measure: () => ({ ok: false, error: "not-ready", which: "from" }),
      readScale: () => ({ distanceScale: 1, distanceUnit: "mi" }),
    });
    const out = await tool.execute({ from_cell: 0, to_cell: 1 });
    expect(out.isError).toBe(true);
    expect(JSON.parse(out.content).error).toMatch(/not ready/i);
  });

  it("surfaces 'out-of-bounds' as a structured error", async () => {
    const tool = makeTool();
    const out = await tool.execute({ from_cell: 0, to_cell: 99 });
    expect(out.isError).toBe(true);
    expect(JSON.parse(out.content).error).toMatch(/out of bounds/i);
  });

  it("surfaces 'no-cell-point' as a structured error", async () => {
    const pack = makePack();
    (pack.cells as { p: Array<[number, number] | undefined> }).p[1] = undefined;
    const tool = makeTool(pack);
    const out = await tool.execute({ from_cell: 1, to_cell: 2 });
    expect(out.isError).toBe(true);
    expect(JSON.parse(out.content).error).toMatch(/no coordinates/i);
  });

  it("surfaces unknown burg as a structured error", async () => {
    const tool = makeTool();
    const out = await tool.execute({ from_burg: "nowhere", to_burg: 1 });
    expect(out.isError).toBe(true);
    expect(JSON.parse(out.content).error).toMatch(/not found/i);
  });

  it("happy path returns ok with pixels / scaled / unit / from / to", async () => {
    const tool = makeTool();
    const out = await tool.execute({
      from_x: 0,
      from_y: 0,
      to_x: 3,
      to_y: 4,
    });
    expect(out.isError).toBeFalsy();
    const body = JSON.parse(out.content);
    expect(body.ok).toBe(true);
    expect(body.pixels).toBeCloseTo(5, 10);
    expect(body.scaled).toBeCloseTo(10, 10); // scale=2 in fixedScaleRuntime
    expect(body.unit).toBe("mi");
    expect(body.from).toEqual({ x: 0, y: 0 });
    expect(body.to).toEqual({ x: 3, y: 4 });
  });

  it("exported measureDistanceTool has the expected schema shape", () => {
    expect(measureDistanceTool.name).toBe("measure_distance");
    expect(measureDistanceTool.input_schema.type).toBe("object");
    // No `required` — runtime validates which form is used.
    expect(measureDistanceTool.input_schema.required).toBeUndefined();
    const props = measureDistanceTool.input_schema.properties;
    expect(props.from_cell).toBeDefined();
    expect(props.to_cell).toBeDefined();
    expect(props.from_burg).toBeDefined();
    expect(props.to_burg).toBeDefined();
    expect(props.from_x).toBeDefined();
    expect(props.from_y).toBeDefined();
    expect(props.to_x).toBeDefined();
    expect(props.to_y).toBeDefined();
  });

  it("rejects empty-string burg refs", async () => {
    const tool = makeTool();
    const out = await tool.execute({ from_burg: "", to_burg: 1 });
    expect(out.isError).toBe(true);
    expect(JSON.parse(out.content).error).toMatch(
      /integer id or a non-empty string/i,
    );
  });
});

// ----- defaultMeasureDistanceRuntime integration -----

describe("defaultMeasureDistanceRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as {
    pack?: unknown;
    distanceScale?: unknown;
    options?: unknown;
  };
  const originalPack = globalsRef.pack;
  const originalScale = globalsRef.distanceScale;
  const originalOptions = globalsRef.options;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
    globalsRef.distanceScale = 3 as unknown;
    globalsRef.options = { distanceUnit: "km" } as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
    globalsRef.distanceScale = originalScale;
    globalsRef.options = originalOptions;
  });

  it("reads real pack for a cell form measure", () => {
    const result: MeasureInPackResult = defaultMeasureDistanceRuntime.measure(
      { kind: "cell", cell: 0 },
      { kind: "cell", cell: 3 },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      // (0,0) → (6,8) ⇒ 10
      expect(result.value.pixels).toBeCloseTo(10, 10);
    }
  });

  it("reads real distanceScale global for scaled output", async () => {
    const out = await measureDistanceTool.execute({
      from_x: 0,
      from_y: 0,
      to_x: 3,
      to_y: 4,
    });
    expect(out.isError).toBeFalsy();
    const body = JSON.parse(out.content);
    expect(body.pixels).toBeCloseTo(5, 10);
    expect(body.scaled).toBeCloseTo(15, 10); // 5 * 3
  });

  it("falls back to options.distanceUnit when DOM input is absent", () => {
    const scale = defaultMeasureDistanceRuntime.readScale();
    expect(scale.distanceScale).toBe(3);
    // In node env there's no document, so it falls back to options.distanceUnit.
    expect(scale.distanceUnit).toBe("km");
  });

  it("returns 'not-ready' when pack is missing", async () => {
    globalsRef.pack = undefined;
    const result = defaultMeasureDistanceRuntime.measure(
      { kind: "cell", cell: 1 },
      { kind: "cell", cell: 2 },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("not-ready");

    const out = await measureDistanceTool.execute({
      from_cell: 1,
      to_cell: 2,
    });
    expect(out.isError).toBe(true);
    expect(JSON.parse(out.content).error).toMatch(/not ready/i);
  });

  it("uses defaults when distanceScale / options are absent", () => {
    globalsRef.distanceScale = undefined;
    globalsRef.options = undefined;
    const scale = defaultMeasureDistanceRuntime.readScale();
    expect(scale.distanceScale).toBe(1);
    expect(scale.distanceUnit).toBe("mi");
  });
});

// Unused export check — keeps linter happy by using the PointSpec type.
const _pointSpecCheck: PointSpec = { kind: "coords", x: 0, y: 0 };
void _pointSpecCheck;
