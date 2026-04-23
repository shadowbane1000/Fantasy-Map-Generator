import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addRulerTool,
  createAddRulerTool,
  type NewRuler,
  type RulerAddInput,
  type RulerAddRuntime,
} from "./add-ruler";

function makeRuntime(
  result: (input: RulerAddInput) => NewRuler = defaultResult,
): {
  runtime: RulerAddRuntime;
  add: ReturnType<typeof vi.fn<RulerAddRuntime["add"]>>;
} {
  const add = vi.fn<RulerAddRuntime["add"]>(result);
  return { runtime: { add }, add };
}

function defaultResult(input: RulerAddInput): NewRuler {
  return {
    id: 0,
    type: input.type,
    points: input.points,
  };
}

describe("add_ruler tool", () => {
  it("defaults to Ruler type when type is omitted", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddRulerTool(runtime);
    const result = await tool.execute({ x1: 10, y1: 20, x2: 30, y2: 40 });
    expect(result.isError).toBeFalsy();
    expect(add).toHaveBeenCalledWith({
      type: "Ruler",
      points: [
        [10, 20],
        [30, 40],
      ],
    });
    const body = JSON.parse(result.content);
    expect(body.type).toBe("Ruler");
    expect(body.points).toEqual([
      [10, 20],
      [30, 40],
    ]);
  });

  it("accepts 'ruler' / 'Ruler' / 'RULER' as Ruler", async () => {
    for (const typeVal of ["ruler", "Ruler", "RULER", "  ruler  "]) {
      const { runtime, add } = makeRuntime();
      const tool = createAddRulerTool(runtime);
      const result = await tool.execute({
        type: typeVal,
        x1: 1,
        y1: 2,
        x2: 3,
        y2: 4,
      });
      expect(result.isError).toBeFalsy();
      expect(add.mock.calls[0]?.[0].type).toBe("Ruler");
    }
  });

  it("resolves opisometer alias", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddRulerTool(runtime);
    const result = await tool.execute({
      type: "opisometer",
      x1: 5,
      y1: 5,
      x2: 50,
      y2: 50,
    });
    expect(result.isError).toBeFalsy();
    expect(add).toHaveBeenCalledWith({
      type: "Opisometer",
      points: [
        [5, 5],
        [50, 50],
      ],
    });
  });

  it("resolves planimeter alias and uses points[]", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddRulerTool(runtime);
    const result = await tool.execute({
      type: "planimeter",
      points: [
        [0, 0],
        [100, 0],
        [100, 100],
      ],
    });
    expect(result.isError).toBeFalsy();
    expect(add).toHaveBeenCalledWith({
      type: "Planimeter",
      points: [
        [0, 0],
        [100, 0],
        [100, 100],
      ],
    });
  });

  it("rejects unknown type aliases", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddRulerTool(runtime);
    for (const bad of ["yardstick", "measure", "tape", 42, {}]) {
      const result = await tool.execute({
        type: bad,
        x1: 1,
        y1: 2,
        x2: 3,
        y2: 4,
      });
      expect(result.isError).toBe(true);
    }
    expect(add).not.toHaveBeenCalled();
  });

  it("rejects empty-string type", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddRulerTool(runtime);
    const result = await tool.execute({
      type: "",
      x1: 1,
      y1: 2,
      x2: 3,
      y2: 4,
    });
    expect(result.isError).toBe(true);
    expect(add).not.toHaveBeenCalled();
  });

  it("rejects non-finite coordinates for Ruler / Opisometer", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddRulerTool(runtime);
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, "10", null]) {
      expect(
        (await tool.execute({ x1: bad, y1: 0, x2: 10, y2: 10 })).isError,
      ).toBe(true);
      expect(
        (await tool.execute({ x1: 0, y1: bad, x2: 10, y2: 10 })).isError,
      ).toBe(true);
      expect(
        (await tool.execute({ x1: 0, y1: 0, x2: bad, y2: 10 })).isError,
      ).toBe(true);
      expect(
        (await tool.execute({ x1: 0, y1: 0, x2: 10, y2: bad })).isError,
      ).toBe(true);
    }
    expect(add).not.toHaveBeenCalled();
  });

  it("rejects out-of-bounds coordinates when graph dimensions are set", async () => {
    const originalW = (globalThis as { graphWidth?: unknown }).graphWidth;
    const originalH = (globalThis as { graphHeight?: unknown }).graphHeight;
    (globalThis as { graphWidth?: unknown }).graphWidth = 800;
    (globalThis as { graphHeight?: unknown }).graphHeight = 600;

    try {
      const { runtime, add } = makeRuntime();
      const tool = createAddRulerTool(runtime);
      expect(
        (await tool.execute({ x1: -1, y1: 0, x2: 10, y2: 10 })).isError,
      ).toBe(true);
      expect(
        (await tool.execute({ x1: 0, y1: 0, x2: 801, y2: 10 })).isError,
      ).toBe(true);
      expect(
        (await tool.execute({ x1: 0, y1: 601, x2: 10, y2: 10 })).isError,
      ).toBe(true);
      // Edges are inclusive.
      expect(
        (await tool.execute({ x1: 0, y1: 0, x2: 800, y2: 600 })).isError,
      ).toBeFalsy();
      expect(add).toHaveBeenCalledTimes(1);
    } finally {
      (globalThis as { graphWidth?: unknown }).graphWidth = originalW;
      (globalThis as { graphHeight?: unknown }).graphHeight = originalH;
    }
  });

  it("rejects planimeter with fewer than 3 points", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddRulerTool(runtime);
    const result = await tool.execute({
      type: "planimeter",
      points: [
        [0, 0],
        [10, 10],
      ],
    });
    expect(result.isError).toBe(true);
    expect(add).not.toHaveBeenCalled();
  });

  it("rejects planimeter points that are not [x,y] pairs", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddRulerTool(runtime);
    const cases = [
      { points: "not-an-array" },
      { points: [[0, 0], [10, 10], [20]] },
      {
        points: [
          [0, 0],
          [10, 10],
          ["x", 20],
        ],
      },
      {
        points: [
          [0, 0],
          [10, 10],
          [Number.NaN, 20],
        ],
      },
    ];
    for (const payload of cases) {
      const result = await tool.execute({ type: "planimeter", ...payload });
      expect(result.isError).toBe(true);
    }
    expect(add).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const runtime: RulerAddRuntime = {
      add: vi.fn(() => {
        throw new Error("rulers missing");
      }),
    };
    const tool = createAddRulerTool(runtime);
    const result = await tool.execute({ x1: 0, y1: 0, x2: 1, y2: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/rulers missing/);
  });

  it("exposes the expected schema", () => {
    const tool = createAddRulerTool(makeRuntime().runtime);
    expect(tool.name).toBe("add_ruler");
    expect(tool.input_schema.required).toEqual(["x1", "y1", "x2", "y2"]);
  });
});

describe("defaultRulerAddRuntime (integration)", () => {
  const drawMock = vi.fn();

  class StubMeasurer {
    public id: number;
    public points: number[][];
    public draw = drawMock;
    constructor(points: number[][]) {
      this.points = points;
      const coll = (globalThis as { rulers?: { data?: unknown[] } }).rulers;
      this.id = Array.isArray(coll?.data) ? coll.data.length : 0;
    }
  }

  const originalRulers = (globalThis as { rulers?: unknown }).rulers;
  const originalRuler = (globalThis as { Ruler?: unknown }).Ruler;
  const originalOpisometer = (globalThis as { Opisometer?: unknown })
    .Opisometer;
  const originalPlanimeter = (globalThis as { Planimeter?: unknown })
    .Planimeter;

  beforeEach(() => {
    drawMock.mockReset();
    const data: StubMeasurer[] = [];
    (globalThis as unknown as { rulers: unknown }).rulers = {
      data,
      create(Type: new (p: number[][]) => StubMeasurer, pts: number[][]) {
        const inst = new Type(pts);
        data.push(inst);
        return inst;
      },
    };
    (globalThis as unknown as { Ruler: unknown }).Ruler = StubMeasurer;
    (globalThis as unknown as { Opisometer: unknown }).Opisometer =
      StubMeasurer;
    (globalThis as unknown as { Planimeter: unknown }).Planimeter =
      StubMeasurer;
  });

  afterEach(() => {
    (globalThis as { rulers?: unknown }).rulers = originalRulers;
    (globalThis as { Ruler?: unknown }).Ruler = originalRuler;
    (globalThis as { Opisometer?: unknown }).Opisometer = originalOpisometer;
    (globalThis as { Planimeter?: unknown }).Planimeter = originalPlanimeter;
  });

  it("pushes a Ruler onto rulers.data and calls draw()", async () => {
    const result = await addRulerTool.execute({
      x1: 10,
      y1: 20,
      x2: 30,
      y2: 40,
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.id).toBe(0);
    expect(body.type).toBe("Ruler");
    expect(body.points).toEqual([
      [10, 20],
      [30, 40],
    ]);
    const rulers = (
      globalThis as unknown as { rulers: { data: StubMeasurer[] } }
    ).rulers;
    expect(rulers.data).toHaveLength(1);
    expect(rulers.data[0]?.points).toEqual([
      [10, 20],
      [30, 40],
    ]);
    expect(drawMock).toHaveBeenCalledTimes(1);
  });

  it("second add increments the id", async () => {
    await addRulerTool.execute({ x1: 0, y1: 0, x2: 1, y2: 1 });
    const second = await addRulerTool.execute({ x1: 5, y1: 5, x2: 6, y2: 6 });
    expect(second.isError).toBeFalsy();
    expect(JSON.parse(second.content).id).toBe(1);
  });

  it("creates a Planimeter with a 3-point polygon", async () => {
    const result = await addRulerTool.execute({
      type: "planimeter",
      points: [
        [0, 0],
        [100, 0],
        [100, 100],
      ],
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).type).toBe("Planimeter");
    const rulers = (
      globalThis as unknown as { rulers: { data: StubMeasurer[] } }
    ).rulers;
    expect(rulers.data).toHaveLength(1);
    expect(rulers.data[0]?.points).toEqual([
      [0, 0],
      [100, 0],
      [100, 100],
    ]);
    expect(drawMock).toHaveBeenCalledTimes(1);
  });

  it("errors when window.rulers is missing", async () => {
    (globalThis as { rulers?: unknown }).rulers = undefined;
    const result = await addRulerTool.execute({
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/rulers collection/);
  });

  it("errors when the class global is missing", async () => {
    (globalThis as { Opisometer?: unknown }).Opisometer = undefined;
    const result = await addRulerTool.execute({
      type: "opisometer",
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Opisometer/);
  });

  it("swallows draw() failures but still returns ok", async () => {
    drawMock.mockImplementationOnce(() => {
      throw new Error("layer not mounted");
    });
    const result = await addRulerTool.execute({
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
    });
    expect(result.isError).toBeFalsy();
    const rulers = (
      globalThis as unknown as { rulers: { data: StubMeasurer[] } }
    ).rulers;
    expect(rulers.data).toHaveLength(1);
  });
});
