import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindReligionsInAreaTool,
  DEFAULT_FIND_RELIGIONS_IN_AREA_LIMIT,
  defaultFindReligionsInAreaRuntime,
  type FindReligionsInAreaResult,
  type FindReligionsInAreaRuntime,
  findReligionsInAreaInPack,
  findReligionsInAreaTool,
  MAX_FIND_RELIGIONS_IN_AREA_LIMIT,
} from "./find-religions-in-area";

interface FakePack {
  religions: Array<{
    i: number;
    name?: string;
    type?: string;
    form?: string;
    color?: string;
    center?: number;
    removed?: boolean;
  }>;
  cells: {
    i: number[];
    p: Array<[number, number] | undefined>;
  };
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findReligionsInAreaInPack>[0];
}

function makePack(): FakePack {
  // Religions with center cells mapped via cells.p:
  //   cells.p[1] = (100, 100)
  //   cells.p[2] = (103, 104)
  //   cells.p[3] = (110, 100)
  //   cells.p[4] = (100, 110)
  //   cells.p[5] = (115, 115)
  //   cells.p[6] = (200, 200)
  //   cells.p[7] = undefined (no coords)
  //   cells.p[8] = (50, 50)
  //
  // Religions:
  //   i=0: No religion placeholder
  //   i=1: center=1, full metadata
  //   i=2: center=2
  //   i=3: center=3
  //   i=4: center=4
  //   i=5: center=5
  //   i=6: center=6 (far)
  //   i=7: center=1, removed=true (would match but skipped)
  //   i=8: no center → skipped
  //   i=9: center=7 (cell has no coords) → skipped
  //   i=10: center=8 (corner)
  return {
    religions: [
      { i: 0, name: "No religion" },
      {
        i: 1,
        name: "Core Faith",
        color: "#f00",
        type: "Organized",
        form: "Monotheism",
        center: 1,
      },
      { i: 2, name: "North Cult", center: 2, type: "Cult" },
      { i: 3, name: "East Folk", center: 3, type: "Folk" },
      { i: 4, name: "South Heresy", center: 4, type: "Heresy" },
      { i: 5, name: "Edge", center: 5 },
      { i: 6, name: "Far", center: 6 },
      { i: 7, name: "Gone", center: 1, removed: true },
      { i: 8, name: "NoCenter" },
      { i: 9, name: "BadCenter", center: 7 },
      { i: 10, name: "Corner", center: 8 },
    ],
    cells: {
      i: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      p: [
        [0, 0],
        [100, 100],
        [103, 104],
        [110, 100],
        [100, 110],
        [115, 115],
        [200, 200],
        undefined, // cell 7 has no point
        [50, 50],
        [0, 0],
      ],
    },
  };
}

function runtimeReturning(
  result: FindReligionsInAreaResult,
): FindReligionsInAreaRuntime {
  return { find: () => result };
}

describe("find_religions_in_area — pure / seam", () => {
  it("rectangle returns every active religion inside the box (inclusive edges)", () => {
    const result = findReligionsInAreaInPack(asPack(makePack()), {
      kind: "rect",
      x1: 100,
      y1: 100,
      x2: 110,
      y2: 110,
      limit: 100,
    }) as {
      religions: Array<{ i: number }>;
      count: number;
      area: unknown;
    };
    const ids = new Set(result.religions.map((r) => r.i));
    // centers at (100,100), (103,104), (110,100), (100,110)
    expect(ids).toEqual(new Set([1, 2, 3, 4]));
    expect(result.count).toBe(4);
    expect(result.area).toEqual({
      kind: "rect",
      x1: 100,
      y1: 100,
      x2: 110,
      y2: 110,
    });
  });

  it("rectangle normalises reversed corners", () => {
    const result = findReligionsInAreaInPack(asPack(makePack()), {
      kind: "rect",
      x1: 110,
      y1: 110,
      x2: 100,
      y2: 100,
      limit: 100,
    }) as {
      religions: Array<{ i: number }>;
      area: { x1: number; x2: number; y1: number; y2: number };
    };
    const ids = new Set(result.religions.map((r) => r.i));
    expect(ids).toEqual(new Set([1, 2, 3, 4]));
    expect(result.area.x1).toBe(100);
    expect(result.area.x2).toBe(110);
    expect(result.area.y1).toBe(100);
    expect(result.area.y2).toBe(110);
  });

  it("rectangle religion distance is null", () => {
    const result = findReligionsInAreaInPack(asPack(makePack()), {
      kind: "rect",
      x1: 0,
      y1: 0,
      x2: 500,
      y2: 500,
      limit: 100,
    }) as { religions: Array<{ distance: number | null }> };
    for (const r of result.religions) expect(r.distance).toBeNull();
  });

  it("circle-coords returns every religion inside radius with distance", () => {
    const result = findReligionsInAreaInPack(asPack(makePack()), {
      kind: "circle-coords",
      x: 100,
      y: 100,
      radius: 10,
      limit: 100,
    }) as {
      religions: Array<{ i: number; distance: number | null }>;
      count: number;
      area: unknown;
    };
    const ids = new Set(result.religions.map((r) => r.i));
    // radius 10 from (100,100): i=1 (0), i=2 (5), i=3 (10 exact), i=4 (10 exact)
    expect(ids).toEqual(new Set([1, 2, 3, 4]));
    expect(result.count).toBe(4);
    expect(result.area).toEqual({
      kind: "circle",
      x: 100,
      y: 100,
      radius: 10,
    });
    for (const r of result.religions) {
      expect(typeof r.distance).toBe("number");
      expect(r.distance).toBeLessThanOrEqual(10);
    }
  });

  it("circle-cell resolves center via pack.cells.p[cell]", () => {
    const result = findReligionsInAreaInPack(asPack(makePack()), {
      kind: "circle-cell",
      cell: 1,
      radius: 5,
      limit: 100,
    }) as {
      religions: Array<{ i: number }>;
      count: number;
      area: { x: number; y: number; radius: number };
    };
    // cells.p[1] = (100,100). Radius 5 hits i=1 (0) and i=2 (5).
    const ids = new Set(result.religions.map((r) => r.i));
    expect(ids).toEqual(new Set([1, 2]));
    expect(result.area).toEqual({ kind: "circle", x: 100, y: 100, radius: 5 });
  });

  it("radius 0 returns only religions exactly at center", () => {
    const result = findReligionsInAreaInPack(asPack(makePack()), {
      kind: "circle-coords",
      x: 100,
      y: 100,
      radius: 0,
      limit: 100,
    }) as { religions: Array<{ i: number }>; count: number };
    // Only i=1 center is exactly (100,100).
    expect(new Set(result.religions.map((r) => r.i))).toEqual(new Set([1]));
    expect(result.count).toBe(1);
  });

  it("limit truncates religions but count reports full total", () => {
    const result = findReligionsInAreaInPack(asPack(makePack()), {
      kind: "circle-coords",
      x: 100,
      y: 100,
      radius: 10,
      limit: 2,
    }) as { religions: Array<{ i: number }>; count: number };
    expect(result.religions.length).toBe(2);
    expect(result.count).toBe(4);
  });

  it("skips i=0, removed, no-center, and bad-center religions", () => {
    const result = findReligionsInAreaInPack(asPack(makePack()), {
      kind: "rect",
      x1: -1000,
      y1: -1000,
      x2: 1000,
      y2: 1000,
      limit: 100,
    }) as { religions: Array<{ i: number }>; count: number };
    const ids = new Set(result.religions.map((r) => r.i));
    expect(ids.has(0)).toBe(false); // placeholder
    expect(ids.has(7)).toBe(false); // removed
    expect(ids.has(8)).toBe(false); // no center field
    expect(ids.has(9)).toBe(false); // center cell has no coords
    // Active valid religions: 1,2,3,4,5,6,10 = 7 total
    expect(result.count).toBe(7);
  });

  it("returns empty list and count 0 when no religion matches", () => {
    const result = findReligionsInAreaInPack(asPack(makePack()), {
      kind: "circle-coords",
      x: 9999,
      y: 9999,
      radius: 1,
      limit: 100,
    }) as { religions: unknown[]; count: number };
    expect(result.religions).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("resolves position strictly via cells.p[religion.center]", () => {
    const result = findReligionsInAreaInPack(asPack(makePack()), {
      kind: "rect",
      x1: 0,
      y1: 0,
      x2: 500,
      y2: 500,
      limit: 100,
    }) as {
      religions: Array<{ i: number; x: number; y: number }>;
    };
    const byId = new Map(result.religions.map((r) => [r.i, r]));
    expect(byId.get(1)).toEqual(expect.objectContaining({ x: 100, y: 100 }));
    expect(byId.get(2)).toEqual(expect.objectContaining({ x: 103, y: 104 }));
    expect(byId.get(10)).toEqual(expect.objectContaining({ x: 50, y: 50 }));
  });

  it("echoes name/color/type/form when present, null otherwise", () => {
    const result = findReligionsInAreaInPack(asPack(makePack()), {
      kind: "circle-coords",
      x: 100,
      y: 100,
      radius: 0,
      limit: 100,
    }) as {
      religions: Array<{
        i: number;
        name: string;
        color: string | null;
        type: string | null;
        form: string | null;
      }>;
    };
    const r1 = result.religions.find((r) => r.i === 1);
    expect(r1?.name).toBe("Core Faith");
    expect(r1?.color).toBe("#f00");
    expect(r1?.type).toBe("Organized");
    expect(r1?.form).toBe("Monotheism");

    const allResult = findReligionsInAreaInPack(asPack(makePack()), {
      kind: "rect",
      x1: 0,
      y1: 0,
      x2: 500,
      y2: 500,
      limit: 100,
    }) as {
      religions: Array<{
        i: number;
        color: string | null;
        type: string | null;
        form: string | null;
      }>;
    };
    const r5 = allResult.religions.find((r) => r.i === 5);
    expect(r5?.color).toBeNull();
    expect(r5?.type).toBeNull();
    expect(r5?.form).toBeNull();
  });

  it("returns 'not-ready' when pack or pack.religions is missing", () => {
    expect(
      findReligionsInAreaInPack(undefined, {
        kind: "circle-coords",
        x: 0,
        y: 0,
        radius: 1,
        limit: 100,
      }),
    ).toBe("not-ready");
    expect(
      findReligionsInAreaInPack(
        {} as unknown as Parameters<typeof findReligionsInAreaInPack>[0],
        { kind: "rect", x1: 0, y1: 0, x2: 1, y2: 1, limit: 100 },
      ),
    ).toBe("not-ready");
  });

  it("circle-cell returns 'out-of-bounds' when cell >= cells.i.length", () => {
    expect(
      findReligionsInAreaInPack(asPack(makePack()), {
        kind: "circle-cell",
        cell: 999,
        radius: 10,
        limit: 100,
      }),
    ).toBe("out-of-bounds");
  });

  it("circle-cell returns 'no-cell-point' when cells.p[cell] is undefined", () => {
    expect(
      findReligionsInAreaInPack(asPack(makePack()), {
        kind: "circle-cell",
        cell: 7,
        radius: 10,
        limit: 100,
      }),
    ).toBe("no-cell-point");
  });
});

describe("find_religions_in_area — tool surface", () => {
  function realRuntime(): FindReligionsInAreaRuntime {
    const pack = asPack(makePack());
    return {
      find: (q) => findReligionsInAreaInPack(pack, q),
    };
  }

  it("rejects when no area supplied", async () => {
    const tool = createFindReligionsInAreaTool(realRuntime());
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/either a rectangle/i);
  });

  it("rejects when rectangle and circle params mixed", async () => {
    const tool = createFindReligionsInAreaTool(realRuntime());
    const result = await tool.execute({
      x1: 0,
      y1: 0,
      x2: 10,
      y2: 10,
      radius: 5,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not both/i);
  });

  it("rejects incomplete rectangle", async () => {
    const tool = createFindReligionsInAreaTool(realRuntime());
    for (const bad of [
      { x1: 0, y1: 0, x2: 10 },
      { x1: 0, y1: 0, y2: 10 },
      { x1: 0, x2: 10, y2: 10 },
      { y1: 0, x2: 10, y2: 10 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/rectangle requires/i);
    }
  });

  it("rejects non-finite rectangle corners", async () => {
    const tool = createFindReligionsInAreaTool(realRuntime());
    for (const bad of [
      { x1: "0", y1: 0, x2: 10, y2: 10 },
      { x1: 0, y1: Number.NaN, x2: 10, y2: 10 },
      { x1: 0, y1: 0, x2: Number.POSITIVE_INFINITY, y2: 10 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/finite numbers/i);
    }
  });

  it("rejects circle with both (x,y) and cell", async () => {
    const tool = createFindReligionsInAreaTool(realRuntime());
    const r = await tool.execute({ x: 1, y: 2, cell: 0, radius: 5 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not both/i);
  });

  it("rejects circle with neither center form", async () => {
    const tool = createFindReligionsInAreaTool(realRuntime());
    const r = await tool.execute({ radius: 5 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/center/i);
  });

  it("rejects circle missing y (or x) when the other is supplied", async () => {
    const tool = createFindReligionsInAreaTool(realRuntime());
    const r1 = await tool.execute({ x: 1, radius: 5 });
    expect(r1.isError).toBe(true);
    expect(JSON.parse(r1.content).error).toMatch(/both/i);
    const r2 = await tool.execute({ y: 1, radius: 5 });
    expect(r2.isError).toBe(true);
    expect(JSON.parse(r2.content).error).toMatch(/both/i);
  });

  it("rejects non-finite x / y", async () => {
    const tool = createFindReligionsInAreaTool(realRuntime());
    for (const bad of [
      { x: "1", y: 2, radius: 5 },
      { x: 1, y: Number.NaN, radius: 5 },
      { x: Number.POSITIVE_INFINITY, y: 1, radius: 5 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/finite/i);
    }
  });

  it("rejects non-integer / negative cell", async () => {
    const tool = createFindReligionsInAreaTool(realRuntime());
    for (const bad of [
      { cell: "1", radius: 5 },
      { cell: 1.5, radius: 5 },
      { cell: -1, radius: 5 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/non-negative integer/i);
    }
  });

  it("rejects missing / non-finite / negative radius on circle query", async () => {
    const tool = createFindReligionsInAreaTool(realRuntime());
    for (const bad of [
      { x: 1, y: 1 },
      { x: 1, y: 1, radius: "10" },
      { x: 1, y: 1, radius: Number.NaN },
      { x: 1, y: 1, radius: Number.POSITIVE_INFINITY },
      { x: 1, y: 1, radius: -1 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/radius/i);
    }
  });

  it("accepts radius = 0", async () => {
    const tool = createFindReligionsInAreaTool(realRuntime());
    const r = await tool.execute({ x: 100, y: 100, radius: 0 });
    expect(r.isError).toBeFalsy();
    const body = JSON.parse(r.content);
    expect(body.ok).toBe(true);
    const ids = new Set(body.religions.map((r: { i: number }) => r.i));
    expect(ids).toEqual(new Set([1]));
    expect(body.count).toBe(1);
    expect(body.area).toEqual({
      kind: "circle",
      x: 100,
      y: 100,
      radius: 0,
    });
  });

  it("rejects out-of-range limit", async () => {
    const tool = createFindReligionsInAreaTool(realRuntime());
    for (const bad of [
      { x1: 0, y1: 0, x2: 1, y2: 1, limit: 0 },
      {
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
        limit: MAX_FIND_RELIGIONS_IN_AREA_LIMIT + 1,
      },
      { x1: 0, y1: 0, x2: 1, y2: 1, limit: 1.5 },
      { x1: 0, y1: 0, x2: 1, y2: 1, limit: "10" },
      { x1: 0, y1: 0, x2: 1, y2: 1, limit: -1 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/limit/i);
    }
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createFindReligionsInAreaTool(runtimeReturning("not-ready"));
    const result = await tool.execute({ x: 0, y: 0, radius: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("surfaces 'out-of-bounds' as a structured error", async () => {
    const tool = createFindReligionsInAreaTool(
      runtimeReturning("out-of-bounds"),
    );
    const result = await tool.execute({ cell: 99, radius: 1 });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.error).toMatch(/out of bounds/i);
    expect(body.error).toMatch(/99/);
  });

  it("surfaces 'no-cell-point' as a structured error", async () => {
    const tool = createFindReligionsInAreaTool(
      runtimeReturning("no-cell-point"),
    );
    const result = await tool.execute({ cell: 3, radius: 1 });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.error).toMatch(/no coordinates/i);
    expect(body.error).toMatch(/3/);
  });

  it("returns ok with rectangle results and echoes area", async () => {
    const tool = createFindReligionsInAreaTool(realRuntime());
    const result = await tool.execute({
      x1: 100,
      y1: 100,
      x2: 110,
      y2: 110,
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(new Set(body.religions.map((r: { i: number }) => r.i))).toEqual(
      new Set([1, 2, 3, 4]),
    );
    expect(body.count).toBe(4);
    expect(body.area).toEqual({
      kind: "rect",
      x1: 100,
      y1: 100,
      x2: 110,
      y2: 110,
    });
    for (const r of body.religions) expect(r.distance).toBeNull();
  });

  it("returns ok with circle results (distance populated)", async () => {
    const tool = createFindReligionsInAreaTool(realRuntime());
    const result = await tool.execute({ x: 100, y: 100, radius: 10 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(new Set(body.religions.map((r: { i: number }) => r.i))).toEqual(
      new Set([1, 2, 3, 4]),
    );
    expect(body.count).toBe(4);
    expect(body.area).toEqual({
      kind: "circle",
      x: 100,
      y: 100,
      radius: 10,
    });
    for (const r of body.religions) expect(typeof r.distance).toBe("number");
  });

  it("honors limit end-to-end", async () => {
    const tool = createFindReligionsInAreaTool(realRuntime());
    const result = await tool.execute({
      x: 100,
      y: 100,
      radius: 10,
      limit: 2,
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.religions.length).toBe(2);
    expect(body.count).toBe(4);
  });

  it("is exported as findReligionsInAreaTool with the expected schema", () => {
    expect(findReligionsInAreaTool.name).toBe("find_religions_in_area");
    expect(findReligionsInAreaTool.input_schema.type).toBe("object");
    expect(findReligionsInAreaTool.input_schema.required).toBeUndefined();
    expect(findReligionsInAreaTool.input_schema.properties.x1).toBeDefined();
    expect(findReligionsInAreaTool.input_schema.properties.y1).toBeDefined();
    expect(findReligionsInAreaTool.input_schema.properties.x2).toBeDefined();
    expect(findReligionsInAreaTool.input_schema.properties.y2).toBeDefined();
    expect(findReligionsInAreaTool.input_schema.properties.x).toBeDefined();
    expect(findReligionsInAreaTool.input_schema.properties.y).toBeDefined();
    expect(findReligionsInAreaTool.input_schema.properties.cell).toBeDefined();
    expect(
      findReligionsInAreaTool.input_schema.properties.radius,
    ).toBeDefined();
    expect(findReligionsInAreaTool.input_schema.properties.limit).toBeDefined();
  });

  it("exposes DEFAULT / MAX limit constants", () => {
    expect(DEFAULT_FIND_RELIGIONS_IN_AREA_LIMIT).toBe(10000);
    expect(MAX_FIND_RELIGIONS_IN_AREA_LIMIT).toBe(100000);
  });
});

// ----- defaultFindReligionsInAreaRuntime integration -----

describe("defaultFindReligionsInAreaRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("reads real pack via default runtime for a rectangle query", () => {
    const result = defaultFindReligionsInAreaRuntime.find({
      kind: "rect",
      x1: 100,
      y1: 100,
      x2: 110,
      y2: 110,
      limit: 100,
    }) as { religions: Array<{ i: number }>; count: number };
    expect(new Set(result.religions.map((r) => r.i))).toEqual(
      new Set([1, 2, 3, 4]),
    );
    expect(result.count).toBe(4);
  });

  it("reads real pack via default runtime for a circle-coords query", () => {
    const result = defaultFindReligionsInAreaRuntime.find({
      kind: "circle-coords",
      x: 100,
      y: 100,
      radius: 10,
      limit: 100,
    }) as {
      religions: Array<{ i: number; distance: number | null }>;
      area: unknown;
    };
    expect(new Set(result.religions.map((r) => r.i))).toEqual(
      new Set([1, 2, 3, 4]),
    );
    expect(result.area).toEqual({
      kind: "circle",
      x: 100,
      y: 100,
      radius: 10,
    });
  });

  it("reads real pack via default runtime for a circle-cell query", () => {
    const result = defaultFindReligionsInAreaRuntime.find({
      kind: "circle-cell",
      cell: 1,
      radius: 5,
      limit: 100,
    }) as {
      religions: Array<{ i: number }>;
      area: { x: number; y: number };
    };
    expect(new Set(result.religions.map((r) => r.i))).toEqual(new Set([1, 2]));
    expect(result.area).toEqual({
      kind: "circle",
      x: 100,
      y: 100,
      radius: 5,
    });
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(
      defaultFindReligionsInAreaRuntime.find({
        kind: "circle-coords",
        x: 0,
        y: 0,
        radius: 1,
        limit: 100,
      }),
    ).toBe("not-ready");
    const result = await findReligionsInAreaTool.execute({
      x: 0,
      y: 0,
      radius: 1,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
