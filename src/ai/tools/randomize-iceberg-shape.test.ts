import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDefaultRegistry } from "../index";
import { ToolRegistry } from "./index";
import {
  createRandomizeIcebergShapeTool,
  defaultRandomizeIcebergShapeRuntime,
  type RandomizeIcebergShapeIceRef,
  type RandomizeIcebergShapeRuntime,
  randomizeIcebergShapeTool,
} from "./randomize-iceberg-shape";

interface IceFixture {
  i: number;
  type: "glacier" | "iceberg";
  points: number[][];
}

interface RuntimeStubs {
  runtime: RandomizeIcebergShapeRuntime;
  ice: IceFixture[];
  findIce: ReturnType<typeof vi.fn>;
  randomizeIcebergShape: ReturnType<typeof vi.fn>;
  redrawIceberg: ReturnType<typeof vi.fn>;
}

function makeRuntime(
  initial: IceFixture[] = [],
  randomizeImpl?: (id: number, ice: IceFixture[]) => void,
): RuntimeStubs {
  // Mutable underlying array (mirrors pack.ice).
  const ice: IceFixture[] = initial.map((entry) => ({
    ...entry,
    points: entry.points.map((p) => [...p]),
  }));

  const findIce = vi.fn((id: number): RandomizeIcebergShapeIceRef | null => {
    const entry = ice.find((e) => e.i === id);
    if (!entry) return null;
    return { i: entry.i, type: entry.type, point_count: entry.points.length };
  });
  const randomizeIcebergShape = vi.fn((id: number): void => {
    if (randomizeImpl) {
      randomizeImpl(id, ice);
      return;
    }
    const entry = ice.find((e) => e.i === id);
    if (entry) {
      // Default stub: replace points with a 5-vertex polygon (different from
      // initial 6) so tests can verify mutation actually happened.
      entry.points = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0.5, 1.5],
        [0, 1],
      ];
    }
  });
  const redrawIceberg = vi.fn();

  const runtime: RandomizeIcebergShapeRuntime = {
    findIce,
    randomizeIcebergShape,
    redrawIceberg,
  };
  return { runtime, ice, findIce, randomizeIcebergShape, redrawIceberg };
}

const SIX_POINT_POLY: number[][] = [
  [0, 0],
  [1, 0],
  [2, 1],
  [2, 2],
  [1, 3],
  [0, 2],
];

describe("randomize_iceberg_shape tool (injected runtime)", () => {
  it("happy path: randomize iceberg id=7, mutates points, redraws once", async () => {
    const { runtime, ice, randomizeIcebergShape, redrawIceberg } = makeRuntime([
      { i: 7, type: "iceberg", points: SIX_POINT_POLY },
    ]);
    const tool = createRandomizeIcebergShapeTool(runtime);
    const result = await tool.execute({ id: 7 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: 7,
      point_count: 5,
    });
    expect(randomizeIcebergShape).toHaveBeenCalledTimes(1);
    expect(randomizeIcebergShape).toHaveBeenCalledWith(7);
    expect(redrawIceberg).toHaveBeenCalledTimes(1);
    expect(redrawIceberg).toHaveBeenCalledWith(7);
    // Underlying array was mutated to a different polygon.
    expect(ice[0].points.length).toBe(5);
    expect(ice[0].points).not.toEqual(SIX_POINT_POLY);
  });

  it("reports the post-mutation point_count even when count > original", async () => {
    const { runtime } = makeRuntime(
      [{ i: 3, type: "iceberg", points: [[0, 0]] }],
      (id, ice) => {
        const entry = ice.find((e) => e.i === id);
        if (entry) {
          entry.points = [
            [0, 0],
            [1, 0],
            [1, 1],
            [0.5, 1.5],
            [0, 1],
            [-1, 1],
            [-1, 0],
          ];
        }
      },
    );
    const tool = createRandomizeIcebergShapeTool(runtime);
    const result = await tool.execute({ id: 3 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: 3,
      point_count: 7,
    });
  });

  it("rejects glacier id with explicit message", async () => {
    const { runtime, randomizeIcebergShape, redrawIceberg } = makeRuntime([
      { i: 0, type: "glacier", points: [[0, 0]] },
    ]);
    const tool = createRandomizeIcebergShapeTool(runtime);
    const result = await tool.execute({ id: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /Glaciers cannot be randomized/,
    );
    expect(randomizeIcebergShape).not.toHaveBeenCalled();
    expect(redrawIceberg).not.toHaveBeenCalled();
  });

  it("errors when no ice element matches the id", async () => {
    const { runtime, randomizeIcebergShape, redrawIceberg } = makeRuntime([
      { i: 1, type: "iceberg", points: SIX_POINT_POLY },
    ]);
    const tool = createRandomizeIcebergShapeTool(runtime);
    const result = await tool.execute({ id: 99 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /No ice element found with id 99/,
    );
    expect(randomizeIcebergShape).not.toHaveBeenCalled();
    expect(redrawIceberg).not.toHaveBeenCalled();
  });

  it("rejects non-integer / non-number / negative ids", async () => {
    const { runtime, randomizeIcebergShape } = makeRuntime([
      { i: 1, type: "iceberg", points: SIX_POINT_POLY },
    ]);
    const tool = createRandomizeIcebergShapeTool(runtime);
    for (const bad of [
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -1,
      "1",
      true,
      {},
      [],
    ]) {
      const result = await tool.execute({ id: bad });
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content).error).toMatch(
        /id must be a non-negative integer/,
      );
    }
    expect(randomizeIcebergShape).not.toHaveBeenCalled();
  });

  it("rejects missing id (undefined / null / absent)", async () => {
    const { runtime, randomizeIcebergShape } = makeRuntime();
    const tool = createRandomizeIcebergShapeTool(runtime);
    expect(JSON.parse((await tool.execute({})).content).error).toMatch(
      /id is required/,
    );
    expect(
      JSON.parse((await tool.execute({ id: undefined })).content).error,
    ).toMatch(/id is required/);
    expect(
      JSON.parse((await tool.execute({ id: null })).content).error,
    ).toMatch(/id is required/);
    expect(randomizeIcebergShape).not.toHaveBeenCalled();
  });

  it("surfaces errors thrown by runtime.findIce (e.g. pack missing)", async () => {
    const { runtime, randomizeIcebergShape } = makeRuntime();
    runtime.findIce = vi.fn(() => {
      throw new Error("pack.ice is not available.");
    });
    const tool = createRandomizeIcebergShapeTool(runtime);
    const result = await tool.execute({ id: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack\.ice/);
    expect(randomizeIcebergShape).not.toHaveBeenCalled();
  });

  it("surfaces errors thrown by randomizeIcebergShape; redraw not called", async () => {
    const { runtime, ice, redrawIceberg } = makeRuntime([
      { i: 7, type: "iceberg", points: SIX_POINT_POLY },
    ]);
    runtime.randomizeIcebergShape = vi.fn(() => {
      throw new Error("Ice.randomizeIcebergShape blew up");
    });
    const tool = createRandomizeIcebergShapeTool(runtime);
    const result = await tool.execute({ id: 7 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /Ice\.randomizeIcebergShape blew up/,
    );
    expect(redrawIceberg).not.toHaveBeenCalled();
    // points untouched.
    expect(ice[0].points).toEqual(SIX_POINT_POLY);
  });

  it("surfaces errors thrown by redrawIceberg", async () => {
    const { runtime, randomizeIcebergShape } = makeRuntime([
      { i: 7, type: "iceberg", points: SIX_POINT_POLY },
    ]);
    runtime.redrawIceberg = vi.fn(() => {
      throw new Error("redrawIceberg blew up");
    });
    const tool = createRandomizeIcebergShapeTool(runtime);
    const result = await tool.execute({ id: 7 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/redrawIceberg blew up/);
    // randomizeIcebergShape was still called (redraw failure is downstream).
    expect(randomizeIcebergShape).toHaveBeenCalledWith(7);
  });

  it("tool name + ToolRegistry round-trip", async () => {
    const { runtime } = makeRuntime([
      { i: 7, type: "iceberg", points: SIX_POINT_POLY },
    ]);
    const tool = createRandomizeIcebergShapeTool(runtime);
    expect(tool.name).toBe("randomize_iceberg_shape");
    const registry = new ToolRegistry();
    registry.register(tool);
    const result = await registry.run("randomize_iceberg_shape", { id: 7 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      id: 7,
      point_count: 5,
    });
  });
});

describe("defaultRandomizeIcebergShapeRuntime", () => {
  type GlobalShape = {
    pack?: unknown;
    Ice?: unknown;
    redrawIceberg?: unknown;
  };
  let prevPack: unknown;
  let prevIce: unknown;
  let prevRedraw: unknown;

  beforeEach(() => {
    prevPack = (globalThis as GlobalShape).pack;
    prevIce = (globalThis as GlobalShape).Ice;
    prevRedraw = (globalThis as GlobalShape).redrawIceberg;
  });
  afterEach(() => {
    if (prevPack === undefined) {
      delete (globalThis as GlobalShape).pack;
    } else {
      (globalThis as GlobalShape).pack = prevPack;
    }
    if (prevIce === undefined) {
      delete (globalThis as GlobalShape).Ice;
    } else {
      (globalThis as GlobalShape).Ice = prevIce;
    }
    if (prevRedraw === undefined) {
      delete (globalThis as GlobalShape).redrawIceberg;
    } else {
      (globalThis as GlobalShape).redrawIceberg = prevRedraw;
    }
  });

  it("happy path: stubs Ice.randomizeIcebergShape + redrawIceberg + pack.ice and round-trips", async () => {
    const ice: Array<{
      i: number;
      type: "glacier" | "iceberg";
      points: number[][];
    }> = [
      { i: 0, type: "glacier", points: [[0, 0]] },
      { i: 1, type: "iceberg", points: [...SIX_POINT_POLY.map((p) => [...p])] },
    ];
    (globalThis as GlobalShape).pack = { ice };
    (globalThis as GlobalShape).Ice = {
      randomizeIcebergShape: vi.fn((id: number) => {
        const e = ice.find((entry) => entry.i === id);
        if (e) {
          e.points = [
            [10, 10],
            [11, 10],
            [11, 11],
            [10, 11],
          ];
        }
      }),
    };
    (globalThis as GlobalShape).redrawIceberg = vi.fn();
    const tool = createRandomizeIcebergShapeTool();
    const result = await tool.execute({ id: 1 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: 1,
      point_count: 4,
    });
    expect(ice[1].points.length).toBe(4);
    const stubbedRedraw = (
      globalThis as unknown as {
        redrawIceberg: ReturnType<typeof vi.fn>;
      }
    ).redrawIceberg;
    expect(stubbedRedraw).toHaveBeenCalledWith(1);
  });

  it("findIce throws when pack is missing", () => {
    delete (globalThis as GlobalShape).pack;
    expect(() => defaultRandomizeIcebergShapeRuntime.findIce(0)).toThrow(
      /pack/,
    );
  });

  it("findIce throws when pack.ice is missing", () => {
    (globalThis as GlobalShape).pack = {};
    expect(() => defaultRandomizeIcebergShapeRuntime.findIce(0)).toThrow(
      /pack\.ice/,
    );
  });

  it("default tool returns clear error when pack.ice is missing", async () => {
    (globalThis as GlobalShape).pack = {};
    (globalThis as GlobalShape).Ice = { randomizeIcebergShape: vi.fn() };
    (globalThis as GlobalShape).redrawIceberg = vi.fn();
    const tool = createRandomizeIcebergShapeTool();
    const result = await tool.execute({ id: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack\.ice/);
  });

  it("default tool returns clear error when pack is missing", async () => {
    delete (globalThis as GlobalShape).pack;
    (globalThis as GlobalShape).Ice = { randomizeIcebergShape: vi.fn() };
    (globalThis as GlobalShape).redrawIceberg = vi.fn();
    const tool = createRandomizeIcebergShapeTool();
    const result = await tool.execute({ id: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack/);
  });

  it("randomizeIcebergShape throws when Ice global is missing", () => {
    delete (globalThis as GlobalShape).Ice;
    expect(() =>
      defaultRandomizeIcebergShapeRuntime.randomizeIcebergShape(0),
    ).toThrow(/Ice\.randomizeIcebergShape/);
  });

  it("randomizeIcebergShape throws when Ice.randomizeIcebergShape is not a function", () => {
    (globalThis as GlobalShape).Ice = {};
    expect(() =>
      defaultRandomizeIcebergShapeRuntime.randomizeIcebergShape(0),
    ).toThrow(/Ice\.randomizeIcebergShape/);
  });

  it("redrawIceberg throws when global redrawIceberg is missing", () => {
    delete (globalThis as GlobalShape).redrawIceberg;
    expect(() => defaultRandomizeIcebergShapeRuntime.redrawIceberg(0)).toThrow(
      /redrawIceberg/,
    );
  });

  it("default tool returns clear error when redrawIceberg is missing", async () => {
    const ice = [
      { i: 1, type: "iceberg" as const, points: [...SIX_POINT_POLY] },
    ];
    (globalThis as GlobalShape).pack = { ice };
    (globalThis as GlobalShape).Ice = {
      randomizeIcebergShape: vi.fn(),
    };
    delete (globalThis as GlobalShape).redrawIceberg;
    const tool = createRandomizeIcebergShapeTool();
    const result = await tool.execute({ id: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/redrawIceberg/);
  });

  it("default tool returns clear error when Ice.randomizeIcebergShape is missing", async () => {
    const ice = [
      { i: 1, type: "iceberg" as const, points: [...SIX_POINT_POLY] },
    ];
    (globalThis as GlobalShape).pack = { ice };
    (globalThis as GlobalShape).Ice = {};
    (globalThis as GlobalShape).redrawIceberg = vi.fn();
    const tool = createRandomizeIcebergShapeTool();
    const result = await tool.execute({ id: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /Ice\.randomizeIcebergShape/,
    );
  });
});

describe("randomize_iceberg_shape tool registration", () => {
  it("exposes the expected tool name", () => {
    expect(randomizeIcebergShapeTool.name).toBe("randomize_iceberg_shape");
  });

  it("is reachable via buildDefaultRegistry", () => {
    const registry = buildDefaultRegistry();
    const tool = registry
      .list()
      .find((t) => t.name === "randomize_iceberg_shape");
    expect(tool).toBeDefined();
  });
});
