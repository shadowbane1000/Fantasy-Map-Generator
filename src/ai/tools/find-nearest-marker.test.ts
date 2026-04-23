import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindNearestMarkerTool,
  defaultFindNearestMarkerRuntime,
  type FindNearestMarkerResult,
  type FindNearestMarkerRuntime,
  findNearestMarkerInPack,
  findNearestMarkerTool,
} from "./find-nearest-marker";

interface FakeMarker {
  i: number;
  type?: string;
  icon?: string;
  x?: number;
  y?: number;
  removed?: boolean;
}

interface FakePack {
  markers: FakeMarker[];
  cells?: {
    i?: number[];
    p?: Array<[number, number] | undefined>;
  };
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findNearestMarkerInPack>[0];
}

function makePack(): FakePack {
  return {
    markers: [
      { i: 0, type: "castle", icon: "C", x: 100, y: 100 },
      { i: 1, type: "castle", icon: "C", x: 500, y: 500 },
      {
        i: 2,
        type: "battlefield",
        icon: "B",
        x: 110,
        y: 110,
      },
      {
        i: 3,
        type: "castle",
        icon: "C",
        x: 120,
        y: 120,
        removed: true,
      },
      { i: 4, type: "volcano", icon: "V", x: 300, y: 300 },
      // marker with no type — never matches a type filter.
      { i: 5, icon: "?", x: 105, y: 105 },
    ],
    cells: {
      i: [0, 1, 2],
      p: [
        [50, 50],
        [110, 110],
        [499, 499],
      ],
    },
  };
}

function makeTiePack(): FakePack {
  // Two markers equidistant from (0,0) to exercise tie-break.
  return {
    markers: [
      { i: 1, type: "castle", icon: "C", x: 3, y: 4 }, // dist 5
      { i: 2, type: "castle", icon: "C", x: 4, y: 3 }, // dist 5
    ],
  };
}

function runtimeReturning(
  result: FindNearestMarkerResult,
): FindNearestMarkerRuntime {
  return { findNearest: () => result };
}

describe("find_nearest_marker — pure / seam", () => {
  it("coordinate query returns the closest active marker", () => {
    const result = findNearestMarkerInPack(asPack(makePack()), {
      kind: "coords",
      x: 110,
      y: 110,
      type: null,
    });
    // battlefield at (110, 110) is exactly at the query.
    expect(result).toMatchObject({ i: 2, type: "battlefield" });
  });

  it("cell query resolves pack.cells.p[cell] then returns closest marker", () => {
    const result = findNearestMarkerInPack(asPack(makePack()), {
      kind: "cell",
      cell: 2,
      type: null,
    });
    // cells.p[2] = (499, 499); closest marker is castle at (500, 500).
    expect(result).toMatchObject({ i: 1, type: "castle" });
  });

  it("skips removed markers", () => {
    // Gonemarker (i=3) at (120,120) is closer to (119,119) than the
    // one at (110,110) but is removed. Expect battlefield at (110,110).
    const result = findNearestMarkerInPack(asPack(makePack()), {
      kind: "coords",
      x: 119,
      y: 119,
      type: null,
    });
    expect(result).toMatchObject({ i: 2 });
  });

  it("filters by type (case-insensitive)", () => {
    // Query (110, 110) — absolute nearest ignoring type is battlefield i=2.
    // With type=castle filter, the nearest castle is i=0 at (100, 100).
    const result = findNearestMarkerInPack(asPack(makePack()), {
      kind: "coords",
      x: 110,
      y: 110,
      type: "castle",
    });
    expect(result).toMatchObject({ i: 0, type: "castle" });
  });

  it("type filter excludes markers with no type", () => {
    // Marker i=5 has no type and sits at (105, 105); query at (105, 105).
    // Without type filter nearest is i=5; with type=castle we expect i=0.
    const noFilter = findNearestMarkerInPack(asPack(makePack()), {
      kind: "coords",
      x: 105,
      y: 105,
      type: null,
    });
    expect(noFilter).toMatchObject({ i: 5 });
    const withFilter = findNearestMarkerInPack(asPack(makePack()), {
      kind: "coords",
      x: 105,
      y: 105,
      type: "castle",
    });
    expect(withFilter).toMatchObject({ i: 0, type: "castle" });
  });

  it("breaks ties deterministically by iteration order", () => {
    const result = findNearestMarkerInPack(asPack(makeTiePack()), {
      kind: "coords",
      x: 0,
      y: 0,
      type: null,
    });
    expect(result).toMatchObject({ i: 1 });
  });

  it("distance is the Euclidean distance from the query point", () => {
    const result = findNearestMarkerInPack(asPack(makePack()), {
      kind: "coords",
      x: 103,
      y: 104,
      type: "castle",
    }) as { distance: number };
    // Closest castle to (103, 104) is i=0 at (100, 100); dx=3, dy=4, dist=5.
    expect(result.distance).toBeCloseTo(5, 10);
  });

  it("returns { i: null, ... } when no active markers exist", () => {
    const pack: FakePack = { markers: [] };
    const result = findNearestMarkerInPack(asPack(pack), {
      kind: "coords",
      x: 10,
      y: 10,
      type: null,
    });
    expect(result).toEqual({
      i: null,
      type: null,
      icon: null,
      x: null,
      y: null,
      distance: null,
    });
  });

  it("returns { i: null, ... } when type filter excludes everything", () => {
    const result = findNearestMarkerInPack(asPack(makePack()), {
      kind: "coords",
      x: 0,
      y: 0,
      type: "shipwreck",
    });
    expect(result).toEqual({
      i: null,
      type: null,
      icon: null,
      x: null,
      y: null,
      distance: null,
    });
  });

  it("returns 'not-ready' when pack.markers is missing", () => {
    expect(
      findNearestMarkerInPack(undefined, {
        kind: "coords",
        x: 1,
        y: 2,
        type: null,
      }),
    ).toBe("not-ready");
    expect(
      findNearestMarkerInPack(
        {} as unknown as Parameters<typeof findNearestMarkerInPack>[0],
        { kind: "coords", x: 1, y: 2, type: null },
      ),
    ).toBe("not-ready");
  });

  it("returns 'out-of-bounds' when cell is past cells.i.length", () => {
    expect(
      findNearestMarkerInPack(asPack(makePack()), {
        kind: "cell",
        cell: 999,
        type: null,
      }),
    ).toBe("out-of-bounds");
  });

  it("returns 'no-cell-point' when cells.p[cell] is undefined", () => {
    const pack = makePack();
    (pack.cells as { p: Array<[number, number] | undefined> }).p[1] = undefined;
    expect(
      findNearestMarkerInPack(asPack(pack), {
        kind: "cell",
        cell: 1,
        type: null,
      }),
    ).toBe("no-cell-point");
  });
});

describe("find_nearest_marker — tool surface", () => {
  function realRuntime(): FindNearestMarkerRuntime {
    const pack = asPack(makePack());
    return {
      findNearest: (q) => findNearestMarkerInPack(pack, q),
    };
  }

  it("rejects when neither x/y nor cell provided", async () => {
    const tool = createFindNearestMarkerTool(realRuntime());
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /either \(x, y\) coordinates or a cell id/i,
    );
  });

  it("rejects when both x/y and cell are provided", async () => {
    const tool = createFindNearestMarkerTool(realRuntime());
    const result = await tool.execute({ x: 1, y: 2, cell: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not both/i);
  });

  it("rejects non-finite x or y", async () => {
    const tool = createFindNearestMarkerTool(realRuntime());
    for (const bad of [
      { x: "1", y: 2 },
      { x: 1, y: "2" },
      { x: Number.NaN, y: 2 },
      { x: 1, y: Number.POSITIVE_INFINITY },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/finite/i);
    }
  });

  it("rejects missing y when x is provided (and vice versa)", async () => {
    const tool = createFindNearestMarkerTool(realRuntime());
    const r1 = await tool.execute({ x: 1 });
    expect(r1.isError).toBe(true);
    expect(JSON.parse(r1.content).error).toMatch(/both/i);
    const r2 = await tool.execute({ y: 1 });
    expect(r2.isError).toBe(true);
    expect(JSON.parse(r2.content).error).toMatch(/both/i);
  });

  it("rejects non-integer or negative cell", async () => {
    const tool = createFindNearestMarkerTool(realRuntime());
    for (const bad of [{ cell: "1" }, { cell: 1.5 }, { cell: -1 }]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/non-negative integer/i);
    }
  });

  it("rejects empty-string or non-string type", async () => {
    const tool = createFindNearestMarkerTool(realRuntime());
    for (const bad of [
      { x: 0, y: 0, type: "" },
      { x: 0, y: 0, type: "   " },
      { x: 0, y: 0, type: 5 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/non-empty string/i);
    }
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createFindNearestMarkerTool(runtimeReturning("not-ready"));
    const result = await tool.execute({ x: 0, y: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("surfaces 'out-of-bounds' as a structured error", async () => {
    const tool = createFindNearestMarkerTool(runtimeReturning("out-of-bounds"));
    const result = await tool.execute({ cell: 99 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/out of bounds/i);
  });

  it("surfaces 'no-cell-point' as a structured error", async () => {
    const tool = createFindNearestMarkerTool(runtimeReturning("no-cell-point"));
    const result = await tool.execute({ cell: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no coordinates/i);
  });

  it("returns ok=true with i=null when map has no matching markers", async () => {
    const tool = createFindNearestMarkerTool(
      runtimeReturning({
        i: null,
        type: null,
        icon: null,
        x: null,
        y: null,
        distance: null,
      }),
    );
    const result = await tool.execute({ x: 5, y: 5 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      i: null,
      type: null,
      icon: null,
      x: null,
      y: null,
      distance: null,
    });
  });

  it("returns ok=true with the found marker on a happy path", async () => {
    const tool = createFindNearestMarkerTool(realRuntime());
    const result = await tool.execute({ x: 102, y: 100, type: "CASTLE" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.i).toBe(0);
    expect(body.type).toBe("castle");
    expect(body.icon).toBe("C");
    expect(body.x).toBe(100);
    expect(body.y).toBe(100);
    expect(typeof body.distance).toBe("number");
  });

  it("is exported as findNearestMarkerTool with the expected schema", () => {
    expect(findNearestMarkerTool.name).toBe("find_nearest_marker");
    expect(findNearestMarkerTool.input_schema.type).toBe("object");
    // No required[] — oneOf-style validation is at runtime.
    expect(findNearestMarkerTool.input_schema.required).toBeUndefined();
    expect(findNearestMarkerTool.input_schema.properties.x).toBeDefined();
    expect(findNearestMarkerTool.input_schema.properties.y).toBeDefined();
    expect(findNearestMarkerTool.input_schema.properties.cell).toBeDefined();
    expect(findNearestMarkerTool.input_schema.properties.type).toBeDefined();
  });
});

// ----- defaultFindNearestMarkerRuntime integration -----

describe("defaultFindNearestMarkerRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("reads real pack via default runtime for a coordinate query", () => {
    const result = defaultFindNearestMarkerRuntime.findNearest({
      kind: "coords",
      x: 498,
      y: 499,
      type: null,
    });
    expect(result).toMatchObject({ i: 1, type: "castle" });
  });

  it("reads real pack via default runtime for a cell query", () => {
    const result = defaultFindNearestMarkerRuntime.findNearest({
      kind: "cell",
      cell: 1,
      type: null,
    });
    // cells.p[1] = (110, 110); exact hit on battlefield marker i=2.
    expect(result).toMatchObject({ i: 2, type: "battlefield" });
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(
      defaultFindNearestMarkerRuntime.findNearest({
        kind: "coords",
        x: 0,
        y: 0,
        type: null,
      }),
    ).toBe("not-ready");
    const result = await findNearestMarkerTool.execute({ x: 0, y: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
