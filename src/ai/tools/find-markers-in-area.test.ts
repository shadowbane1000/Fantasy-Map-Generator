import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindMarkersInAreaTool,
  DEFAULT_FIND_MARKERS_IN_AREA_LIMIT,
  defaultFindMarkersInAreaRuntime,
  type FindMarkersInAreaResult,
  type FindMarkersInAreaRuntime,
  findMarkersInAreaInPack,
  findMarkersInAreaTool,
  MAX_FIND_MARKERS_IN_AREA_LIMIT,
} from "./find-markers-in-area";

interface FakePack {
  markers: Array<{
    i: number;
    type?: string;
    icon?: string;
    x?: number;
    y?: number;
    removed?: boolean;
  }>;
  cells: {
    i: number[];
    p: Array<[number, number] | undefined>;
  };
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findMarkersInAreaInPack>[0];
}

function makePack(): FakePack {
  // Markers arranged around (100, 100) with known offsets.
  //   i=1: (100, 100) — center hit, type=castle
  //   i=2: (103, 104) — distance 5, type=castle
  //   i=3: (110, 100) — distance 10 exact, type=mine
  //   i=4: (100, 110) — distance 10 exact, type=MINE (case variant)
  //   i=5: (115, 115) — ~21.2, type=battlefield
  //   i=6: (200, 200) — far away, type=castle
  //   i=7: removed=true (would match otherwise), type=castle
  //   i=8: missing coords, type=castle
  //   i=9: (50, 50), no type
  return {
    markers: [
      { i: 1, type: "castle", icon: "castle", x: 100, y: 100 },
      { i: 2, type: "castle", icon: "castle", x: 103, y: 104 },
      { i: 3, type: "mine", icon: "mine", x: 110, y: 100 },
      { i: 4, type: "MINE", icon: "mine", x: 100, y: 110 },
      { i: 5, type: "battlefield", icon: "crossed-swords", x: 115, y: 115 },
      { i: 6, type: "castle", icon: "castle", x: 200, y: 200 },
      {
        i: 7,
        type: "castle",
        icon: "castle",
        x: 100,
        y: 100,
        removed: true,
      },
      { i: 8, type: "castle", icon: "castle" },
      { i: 9, icon: "pin", x: 50, y: 50 },
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
        [0, 0],
        [50, 50],
      ],
    },
  };
}

function runtimeReturning(
  result: FindMarkersInAreaResult,
): FindMarkersInAreaRuntime {
  return { find: () => result };
}

describe("find_markers_in_area — pure / seam", () => {
  it("rectangle returns every active marker inside the box (inclusive edges)", () => {
    const result = findMarkersInAreaInPack(asPack(makePack()), {
      kind: "rect",
      x1: 100,
      y1: 100,
      x2: 110,
      y2: 110,
      type: null,
      limit: 100,
    }) as { markers: Array<{ i: number }>; count: number; area: unknown };
    const ids = new Set(result.markers.map((m) => m.i));
    // (100,100), (103,104), (110,100), (100,110) — marker 5 is (115,115) excluded,
    // marker 7 is removed, marker 9 is (50,50) excluded.
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
    const result = findMarkersInAreaInPack(asPack(makePack()), {
      kind: "rect",
      x1: 110,
      y1: 110,
      x2: 100,
      y2: 100,
      type: null,
      limit: 100,
    }) as {
      markers: Array<{ i: number }>;
      area: { x1: number; x2: number; y1: number; y2: number };
    };
    const ids = new Set(result.markers.map((m) => m.i));
    expect(ids).toEqual(new Set([1, 2, 3, 4]));
    expect(result.area.x1).toBe(100);
    expect(result.area.x2).toBe(110);
    expect(result.area.y1).toBe(100);
    expect(result.area.y2).toBe(110);
  });

  it("rectangle marker distance is null", () => {
    const result = findMarkersInAreaInPack(asPack(makePack()), {
      kind: "rect",
      x1: 0,
      y1: 0,
      x2: 500,
      y2: 500,
      type: null,
      limit: 100,
    }) as { markers: Array<{ distance: number | null }> };
    for (const m of result.markers) expect(m.distance).toBeNull();
  });

  it("circle-coords returns every marker inside radius with distance", () => {
    const result = findMarkersInAreaInPack(asPack(makePack()), {
      kind: "circle-coords",
      x: 100,
      y: 100,
      radius: 10,
      type: null,
      limit: 100,
    }) as {
      markers: Array<{ i: number; distance: number | null }>;
      count: number;
      area: unknown;
    };
    const ids = new Set(result.markers.map((m) => m.i));
    // radius 10 from (100,100): 1 (0), 2 (5), 3 (10 exact), 4 (10 exact)
    expect(ids).toEqual(new Set([1, 2, 3, 4]));
    expect(result.count).toBe(4);
    expect(result.area).toEqual({
      kind: "circle",
      x: 100,
      y: 100,
      radius: 10,
    });
    for (const m of result.markers) {
      expect(typeof m.distance).toBe("number");
      expect(m.distance).toBeLessThanOrEqual(10);
    }
  });

  it("circle-cell resolves center via pack.cells.p[cell]", () => {
    const result = findMarkersInAreaInPack(asPack(makePack()), {
      kind: "circle-cell",
      cell: 1,
      radius: 5,
      type: null,
      limit: 100,
    }) as {
      markers: Array<{ i: number }>;
      count: number;
      area: { x: number; y: number; radius: number };
    };
    // cells.p[1] = (100,100). Radius 5 hits marker 1 (0) and marker 2 (5).
    const ids = new Set(result.markers.map((m) => m.i));
    expect(ids).toEqual(new Set([1, 2]));
    expect(result.area).toEqual({ kind: "circle", x: 100, y: 100, radius: 5 });
  });

  it("radius 0 returns only markers exactly at center", () => {
    const result = findMarkersInAreaInPack(asPack(makePack()), {
      kind: "circle-coords",
      x: 100,
      y: 100,
      radius: 0,
      type: null,
      limit: 100,
    }) as { markers: Array<{ i: number }>; count: number };
    expect(result.markers.map((m) => m.i)).toEqual([1]);
    expect(result.count).toBe(1);
  });

  it("limit truncates markers but count reports full total", () => {
    const result = findMarkersInAreaInPack(asPack(makePack()), {
      kind: "circle-coords",
      x: 100,
      y: 100,
      radius: 10,
      type: null,
      limit: 2,
    }) as { markers: Array<{ i: number }>; count: number };
    expect(result.markers.length).toBe(2);
    expect(result.count).toBe(4);
  });

  it("skips removed markers, and markers without coords", () => {
    const result = findMarkersInAreaInPack(asPack(makePack()), {
      kind: "rect",
      x1: -1000,
      y1: -1000,
      x2: 1000,
      y2: 1000,
      type: null,
      limit: 100,
    }) as { markers: Array<{ i: number }>; count: number };
    const ids = new Set(result.markers.map((m) => m.i));
    expect(ids.has(7)).toBe(false); // removed
    expect(ids.has(8)).toBe(false); // no coords
    // Active valid markers: 1,2,3,4,5,6,9 = 7 total
    expect(result.count).toBe(7);
  });

  it("type filter matches case-insensitively", () => {
    const result = findMarkersInAreaInPack(asPack(makePack()), {
      kind: "rect",
      x1: -1000,
      y1: -1000,
      x2: 1000,
      y2: 1000,
      type: "mine",
      limit: 100,
    }) as { markers: Array<{ i: number; type: string | null }>; count: number };
    const ids = new Set(result.markers.map((m) => m.i));
    // marker 3 is "mine", marker 4 is "MINE" (case variant) — both included.
    expect(ids).toEqual(new Set([3, 4]));
    expect(result.count).toBe(2);
  });

  it("type filter excludes markers whose type is missing / not a string", () => {
    const result = findMarkersInAreaInPack(asPack(makePack()), {
      kind: "rect",
      x1: -1000,
      y1: -1000,
      x2: 1000,
      y2: 1000,
      type: "castle",
      limit: 100,
    }) as { markers: Array<{ i: number }>; count: number };
    const ids = new Set(result.markers.map((m) => m.i));
    // marker 9 has no type — must be excluded. marker 7 is removed.
    expect(ids.has(9)).toBe(false);
    expect(ids.has(7)).toBe(false);
    expect(ids).toEqual(new Set([1, 2, 6]));
    expect(result.count).toBe(3);
  });

  it("returns empty list and count 0 when no markers match", () => {
    const result = findMarkersInAreaInPack(asPack(makePack()), {
      kind: "circle-coords",
      x: 9999,
      y: 9999,
      radius: 1,
      type: null,
      limit: 100,
    }) as { markers: unknown[]; count: number };
    expect(result.markers).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("returns 'not-ready' when pack or pack.markers is missing", () => {
    expect(
      findMarkersInAreaInPack(undefined, {
        kind: "circle-coords",
        x: 0,
        y: 0,
        radius: 1,
        type: null,
        limit: 100,
      }),
    ).toBe("not-ready");
    expect(
      findMarkersInAreaInPack(
        {} as unknown as Parameters<typeof findMarkersInAreaInPack>[0],
        {
          kind: "rect",
          x1: 0,
          y1: 0,
          x2: 1,
          y2: 1,
          type: null,
          limit: 100,
        },
      ),
    ).toBe("not-ready");
  });

  it("circle-cell returns 'out-of-bounds' when cell >= cells.i.length", () => {
    expect(
      findMarkersInAreaInPack(asPack(makePack()), {
        kind: "circle-cell",
        cell: 999,
        radius: 10,
        type: null,
        limit: 100,
      }),
    ).toBe("out-of-bounds");
  });

  it("circle-cell returns 'no-cell-point' when cells.p[cell] is undefined", () => {
    expect(
      findMarkersInAreaInPack(asPack(makePack()), {
        kind: "circle-cell",
        cell: 7,
        radius: 10,
        type: null,
        limit: 100,
      }),
    ).toBe("no-cell-point");
  });
});

describe("find_markers_in_area — tool surface", () => {
  function realRuntime(): FindMarkersInAreaRuntime {
    const pack = asPack(makePack());
    return {
      find: (q) => findMarkersInAreaInPack(pack, q),
    };
  }

  it("rejects when no area supplied", async () => {
    const tool = createFindMarkersInAreaTool(realRuntime());
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/either a rectangle/i);
  });

  it("rejects when rectangle and circle params mixed", async () => {
    const tool = createFindMarkersInAreaTool(realRuntime());
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
    const tool = createFindMarkersInAreaTool(realRuntime());
    for (const bad of [
      { x1: 0, y1: 0, x2: 10 }, // y2 missing
      { x1: 0, y1: 0, y2: 10 }, // x2 missing
      { x1: 0, x2: 10, y2: 10 }, // y1 missing
      { y1: 0, x2: 10, y2: 10 }, // x1 missing
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/rectangle requires/i);
    }
  });

  it("rejects non-finite rectangle corners", async () => {
    const tool = createFindMarkersInAreaTool(realRuntime());
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
    const tool = createFindMarkersInAreaTool(realRuntime());
    const r = await tool.execute({ x: 1, y: 2, cell: 0, radius: 5 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not both/i);
  });

  it("rejects circle with neither center form", async () => {
    const tool = createFindMarkersInAreaTool(realRuntime());
    const r = await tool.execute({ radius: 5 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/center/i);
  });

  it("rejects circle missing y (or x) when the other is supplied", async () => {
    const tool = createFindMarkersInAreaTool(realRuntime());
    const r1 = await tool.execute({ x: 1, radius: 5 });
    expect(r1.isError).toBe(true);
    expect(JSON.parse(r1.content).error).toMatch(/both/i);
    const r2 = await tool.execute({ y: 1, radius: 5 });
    expect(r2.isError).toBe(true);
    expect(JSON.parse(r2.content).error).toMatch(/both/i);
  });

  it("rejects non-finite x / y", async () => {
    const tool = createFindMarkersInAreaTool(realRuntime());
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
    const tool = createFindMarkersInAreaTool(realRuntime());
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
    const tool = createFindMarkersInAreaTool(realRuntime());
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

  it("rejects empty-string / non-string type", async () => {
    const tool = createFindMarkersInAreaTool(realRuntime());
    for (const bad of [
      { x1: 0, y1: 0, x2: 10, y2: 10, type: "" },
      { x1: 0, y1: 0, x2: 10, y2: 10, type: "   " },
      { x1: 0, y1: 0, x2: 10, y2: 10, type: 42 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/type/i);
    }
  });

  it("accepts radius = 0", async () => {
    const tool = createFindMarkersInAreaTool(realRuntime());
    const r = await tool.execute({ x: 100, y: 100, radius: 0 });
    expect(r.isError).toBeFalsy();
    const body = JSON.parse(r.content);
    expect(body.ok).toBe(true);
    expect(body.markers).toEqual([
      { i: 1, type: "castle", icon: "castle", x: 100, y: 100, distance: 0 },
    ]);
    expect(body.count).toBe(1);
    expect(body.area).toEqual({
      kind: "circle",
      x: 100,
      y: 100,
      radius: 0,
    });
  });

  it("rejects out-of-range limit", async () => {
    const tool = createFindMarkersInAreaTool(realRuntime());
    for (const bad of [
      { x1: 0, y1: 0, x2: 1, y2: 1, limit: 0 },
      {
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
        limit: MAX_FIND_MARKERS_IN_AREA_LIMIT + 1,
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
    const tool = createFindMarkersInAreaTool(runtimeReturning("not-ready"));
    const result = await tool.execute({ x: 0, y: 0, radius: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("surfaces 'out-of-bounds' as a structured error", async () => {
    const tool = createFindMarkersInAreaTool(runtimeReturning("out-of-bounds"));
    const result = await tool.execute({ cell: 99, radius: 1 });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.error).toMatch(/out of bounds/i);
    expect(body.error).toMatch(/99/);
  });

  it("surfaces 'no-cell-point' as a structured error", async () => {
    const tool = createFindMarkersInAreaTool(runtimeReturning("no-cell-point"));
    const result = await tool.execute({ cell: 3, radius: 1 });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.error).toMatch(/no coordinates/i);
    expect(body.error).toMatch(/3/);
  });

  it("returns ok with rectangle results and echoes area", async () => {
    const tool = createFindMarkersInAreaTool(realRuntime());
    const result = await tool.execute({
      x1: 100,
      y1: 100,
      x2: 110,
      y2: 110,
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(new Set(body.markers.map((m: { i: number }) => m.i))).toEqual(
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
    for (const m of body.markers) expect(m.distance).toBeNull();
  });

  it("returns ok with circle results (distance populated)", async () => {
    const tool = createFindMarkersInAreaTool(realRuntime());
    const result = await tool.execute({ x: 100, y: 100, radius: 10 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(new Set(body.markers.map((m: { i: number }) => m.i))).toEqual(
      new Set([1, 2, 3, 4]),
    );
    expect(body.count).toBe(4);
    expect(body.area).toEqual({
      kind: "circle",
      x: 100,
      y: 100,
      radius: 10,
    });
    for (const m of body.markers) expect(typeof m.distance).toBe("number");
  });

  it("honors limit end-to-end", async () => {
    const tool = createFindMarkersInAreaTool(realRuntime());
    const result = await tool.execute({
      x: 100,
      y: 100,
      radius: 10,
      limit: 2,
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.markers.length).toBe(2);
    expect(body.count).toBe(4);
  });

  it("applies type filter end-to-end (case-insensitive)", async () => {
    const tool = createFindMarkersInAreaTool(realRuntime());
    const result = await tool.execute({
      x1: -1000,
      y1: -1000,
      x2: 1000,
      y2: 1000,
      type: "CASTLE",
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(new Set(body.markers.map((m: { i: number }) => m.i))).toEqual(
      new Set([1, 2, 6]),
    );
    expect(body.count).toBe(3);
  });

  it("is exported as findMarkersInAreaTool with the expected schema", () => {
    expect(findMarkersInAreaTool.name).toBe("find_markers_in_area");
    expect(findMarkersInAreaTool.input_schema.type).toBe("object");
    expect(findMarkersInAreaTool.input_schema.required).toBeUndefined();
    expect(findMarkersInAreaTool.input_schema.properties.x1).toBeDefined();
    expect(findMarkersInAreaTool.input_schema.properties.y1).toBeDefined();
    expect(findMarkersInAreaTool.input_schema.properties.x2).toBeDefined();
    expect(findMarkersInAreaTool.input_schema.properties.y2).toBeDefined();
    expect(findMarkersInAreaTool.input_schema.properties.x).toBeDefined();
    expect(findMarkersInAreaTool.input_schema.properties.y).toBeDefined();
    expect(findMarkersInAreaTool.input_schema.properties.cell).toBeDefined();
    expect(findMarkersInAreaTool.input_schema.properties.radius).toBeDefined();
    expect(findMarkersInAreaTool.input_schema.properties.type).toBeDefined();
    expect(findMarkersInAreaTool.input_schema.properties.limit).toBeDefined();
  });

  it("exposes DEFAULT / MAX limit constants", () => {
    expect(DEFAULT_FIND_MARKERS_IN_AREA_LIMIT).toBe(10000);
    expect(MAX_FIND_MARKERS_IN_AREA_LIMIT).toBe(100000);
  });
});

// ----- defaultFindMarkersInAreaRuntime integration -----

describe("defaultFindMarkersInAreaRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("reads real pack via default runtime for a rectangle query", () => {
    const result = defaultFindMarkersInAreaRuntime.find({
      kind: "rect",
      x1: 100,
      y1: 100,
      x2: 110,
      y2: 110,
      type: null,
      limit: 100,
    }) as { markers: Array<{ i: number }>; count: number };
    expect(new Set(result.markers.map((m) => m.i))).toEqual(
      new Set([1, 2, 3, 4]),
    );
    expect(result.count).toBe(4);
  });

  it("reads real pack via default runtime for a circle-coords query", () => {
    const result = defaultFindMarkersInAreaRuntime.find({
      kind: "circle-coords",
      x: 100,
      y: 100,
      radius: 10,
      type: null,
      limit: 100,
    }) as {
      markers: Array<{ i: number; distance: number | null }>;
      area: unknown;
    };
    expect(new Set(result.markers.map((m) => m.i))).toEqual(
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
    const result = defaultFindMarkersInAreaRuntime.find({
      kind: "circle-cell",
      cell: 1,
      radius: 5,
      type: null,
      limit: 100,
    }) as { markers: Array<{ i: number }>; area: { x: number; y: number } };
    expect(new Set(result.markers.map((m) => m.i))).toEqual(new Set([1, 2]));
    expect(result.area).toEqual({
      kind: "circle",
      x: 100,
      y: 100,
      radius: 5,
    });
  });

  it("applies type filter through default runtime", () => {
    const result = defaultFindMarkersInAreaRuntime.find({
      kind: "rect",
      x1: -1000,
      y1: -1000,
      x2: 1000,
      y2: 1000,
      type: "mine",
      limit: 100,
    }) as { markers: Array<{ i: number }>; count: number };
    expect(new Set(result.markers.map((m) => m.i))).toEqual(new Set([3, 4]));
    expect(result.count).toBe(2);
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(
      defaultFindMarkersInAreaRuntime.find({
        kind: "circle-coords",
        x: 0,
        y: 0,
        radius: 1,
        type: null,
        limit: 100,
      }),
    ).toBe("not-ready");
    const result = await findMarkersInAreaTool.execute({
      x: 0,
      y: 0,
      radius: 1,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
