import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindRiversByBasinTool,
  DEFAULT_FIND_RIVERS_BY_BASIN_LIMIT,
  defaultFindRiversByBasinRuntime,
  type FindRiversByBasinResult,
  type FindRiversByBasinRuntime,
  findRiversByBasinInPack,
  findRiversByBasinTool,
  MAX_FIND_RIVERS_BY_BASIN_LIMIT,
  type ResolveBasinResult,
  resolveBasinRefInPack,
} from "./find-rivers-by-basin";

interface FakeRiver {
  i: number;
  name?: string;
  type?: string;
  parent?: number;
  basin?: number;
  source?: number;
  mouth?: number;
  length?: number;
  discharge?: number;
  removed?: boolean;
}

interface FakePack {
  rivers: FakeRiver[];
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findRiversByBasinInPack>[0];
}

function makePack(): FakePack {
  // Basin 5 ("Great River") has three tributaries (1, 2, 3) and itself.
  // Basin 10 ("Small River") stands alone.
  // River 7 has no basin at all (stray — not counted in any basin).
  // River 8 is removed (would otherwise belong to basin 5).
  // Index 0 is the placeholder.
  return {
    rivers: [
      { i: 0, name: "placeholder" },
      {
        i: 1,
        name: "Ashwater",
        basin: 5,
        parent: 5,
        source: 11,
        mouth: 12,
        length: 40,
        discharge: 5,
        type: "Stream",
      },
      {
        i: 2,
        name: "Brookbend",
        basin: 5,
        parent: 1,
        source: 21,
        mouth: 22,
        length: 25,
        discharge: 2,
        type: "Creek",
      },
      {
        i: 3,
        name: "Clearflow",
        basin: 5,
        parent: 5,
        source: 31,
        mouth: 32,
        length: 60,
        discharge: 8,
        type: "River",
      },
      {
        i: 5,
        name: "Great River",
        basin: 5,
        parent: 5,
        source: 51,
        mouth: 52,
        length: 200,
        discharge: 50,
        type: "River",
      },
      {
        i: 7,
        name: "Lonely Creek",
        source: 71,
        mouth: 72,
        length: 10,
        discharge: 1,
      },
      { i: 8, name: "Deleted", basin: 5, removed: true },
      {
        i: 10,
        name: "Small River",
        basin: 10,
        parent: 10,
        source: 101,
        mouth: 102,
        length: 30,
        discharge: 3,
        type: "River",
      },
    ],
  };
}

function runtimeReturning(
  resolved: ResolveBasinResult,
  result?: FindRiversByBasinResult,
): FindRiversByBasinRuntime {
  return {
    resolveBasin: () => resolved,
    find: () => (result ?? "not-ready") as FindRiversByBasinResult,
  };
}

describe("find_rivers_by_basin — resolveBasinRefInPack", () => {
  it("resolves numeric id for an active river", () => {
    const res = resolveBasinRefInPack(asPack(makePack()), 5);
    expect(res).toEqual({ i: 5, name: "Great River" });
  });

  it("resolves case-insensitive name", () => {
    const res = resolveBasinRefInPack(asPack(makePack()), "great river");
    expect(res).toEqual({ i: 5, name: "Great River" });
  });

  it("returns 'not-found' for unknown numeric id", () => {
    expect(resolveBasinRefInPack(asPack(makePack()), 999)).toBe("not-found");
  });

  it("returns 'not-found' for removed river", () => {
    // river 8 is removed
    expect(resolveBasinRefInPack(asPack(makePack()), 8)).toBe("not-found");
  });

  it("returns 'not-found' for unknown name", () => {
    expect(resolveBasinRefInPack(asPack(makePack()), "nope")).toBe("not-found");
  });

  it("returns 'not-ready' when pack missing", () => {
    expect(resolveBasinRefInPack(undefined, 5)).toBe("not-ready");
    expect(
      resolveBasinRefInPack(
        {} as unknown as Parameters<typeof resolveBasinRefInPack>[0],
        5,
      ),
    ).toBe("not-ready");
  });
});

describe("find_rivers_by_basin — findRiversByBasinInPack", () => {
  it("returns root + tributaries when include_self=true", () => {
    const res = findRiversByBasinInPack(asPack(makePack()), 5, true, 100) as {
      basin: { i: number; name: string };
      rivers: Array<{ i: number }>;
      count: number;
    };
    const ids = new Set(res.rivers.map((r) => r.i));
    expect(ids).toEqual(new Set([1, 2, 3, 5]));
    expect(res.count).toBe(4);
    expect(res.basin).toEqual({ i: 5, name: "Great River" });
  });

  it("omits root when include_self=false", () => {
    const res = findRiversByBasinInPack(asPack(makePack()), 5, false, 100) as {
      rivers: Array<{ i: number }>;
      count: number;
    };
    const ids = new Set(res.rivers.map((r) => r.i));
    expect(ids).toEqual(new Set([1, 2, 3]));
    expect(res.count).toBe(3);
  });

  it("skips removed rivers, placeholder, and wrong-basin rivers", () => {
    const res = findRiversByBasinInPack(asPack(makePack()), 5, true, 100) as {
      rivers: Array<{ i: number }>;
    };
    const ids = new Set(res.rivers.map((r) => r.i));
    expect(ids.has(0)).toBe(false); // placeholder
    expect(ids.has(7)).toBe(false); // no basin
    expect(ids.has(8)).toBe(false); // removed
    expect(ids.has(10)).toBe(false); // different basin
  });

  it("populates all hit fields from RawRiver", () => {
    const res = findRiversByBasinInPack(asPack(makePack()), 5, false, 100) as {
      rivers: Array<{
        i: number;
        name: string;
        type: string | null;
        parent: number;
        source: number;
        mouth: number;
        length: number;
        discharge: number;
      }>;
    };
    const ash = res.rivers.find((r) => r.i === 1);
    expect(ash).toMatchObject({
      i: 1,
      name: "Ashwater",
      type: "Stream",
      parent: 5,
      source: 11,
      mouth: 12,
      length: 40,
      discharge: 5,
    });
  });

  it("limit truncates rivers but count reports full total", () => {
    const res = findRiversByBasinInPack(asPack(makePack()), 5, true, 2) as {
      rivers: Array<{ i: number }>;
      count: number;
    };
    expect(res.rivers.length).toBe(2);
    expect(res.count).toBe(4);
  });

  it("returns empty rivers + count 0 when no match", () => {
    const res = findRiversByBasinInPack(
      asPack(makePack()),
      9999,
      true,
      100,
    ) as {
      rivers: unknown[];
      count: number;
      basin: { i: number; name: string };
    };
    expect(res.rivers).toEqual([]);
    expect(res.count).toBe(0);
    expect(res.basin).toEqual({ i: 9999, name: "" });
  });

  it("returns single-river payload when basin has only the root (include_self=true)", () => {
    const res = findRiversByBasinInPack(asPack(makePack()), 10, true, 100) as {
      rivers: Array<{ i: number }>;
      count: number;
    };
    expect(res.rivers.map((r) => r.i)).toEqual([10]);
    expect(res.count).toBe(1);
  });

  it("returns 'not-ready' when pack missing", () => {
    expect(findRiversByBasinInPack(undefined, 5, true, 100)).toBe("not-ready");
    expect(
      findRiversByBasinInPack(
        {} as unknown as Parameters<typeof findRiversByBasinInPack>[0],
        5,
        true,
        100,
      ),
    ).toBe("not-ready");
  });

  it("handles missing optional fields with safe fallbacks", () => {
    const sparsePack: FakePack = {
      rivers: [
        { i: 0 },
        { i: 1, basin: 5 }, // no name, no type, no coords
        { i: 5, basin: 5 },
      ],
    };
    const res = findRiversByBasinInPack(asPack(sparsePack), 5, false, 100) as {
      rivers: Array<{
        i: number;
        name: string;
        type: string | null;
        parent: number;
        source: number;
        mouth: number;
        length: number;
        discharge: number;
      }>;
    };
    expect(res.rivers).toEqual([
      {
        i: 1,
        name: "",
        type: null,
        parent: 0,
        source: 0,
        mouth: 0,
        length: 0,
        discharge: 0,
      },
    ]);
  });
});

describe("find_rivers_by_basin — tool surface", () => {
  function realRuntime(): FindRiversByBasinRuntime {
    const pack = asPack(makePack());
    return {
      resolveBasin: (ref) => resolveBasinRefInPack(pack, ref),
      find: (basinI, includeSelf, limit) =>
        findRiversByBasinInPack(pack, basinI, includeSelf, limit),
    };
  }

  it("rejects missing basin", async () => {
    const tool = createFindRiversByBasinTool(realRuntime());
    const r = await tool.execute({});
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/basin/i);
  });

  it("rejects invalid basin (boolean, null)", async () => {
    const tool = createFindRiversByBasinTool(realRuntime());
    for (const bad of [{ basin: true }, { basin: null }, { basin: [] }]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/basin/i);
    }
  });

  it("rejects non-boolean include_self", async () => {
    const tool = createFindRiversByBasinTool(realRuntime());
    const r = await tool.execute({ basin: 5, include_self: "yes" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/include_self/i);
  });

  it("accepts include_self explicitly false", async () => {
    const tool = createFindRiversByBasinTool(realRuntime());
    const r = await tool.execute({ basin: 5, include_self: false });
    expect(r.isError).toBeFalsy();
    const body = JSON.parse(r.content);
    expect(new Set(body.rivers.map((x: { i: number }) => x.i))).toEqual(
      new Set([1, 2, 3]),
    );
    expect(body.count).toBe(3);
  });

  it("rejects out-of-range limit", async () => {
    const tool = createFindRiversByBasinTool(realRuntime());
    for (const bad of [
      { basin: 5, limit: 0 },
      { basin: 5, limit: MAX_FIND_RIVERS_BY_BASIN_LIMIT + 1 },
      { basin: 5, limit: 1.5 },
      { basin: 5, limit: -1 },
      { basin: 5, limit: "10" },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/limit/i);
    }
  });

  it("surfaces 'not-ready' from resolveBasin as structured error", async () => {
    const tool = createFindRiversByBasinTool(runtimeReturning("not-ready"));
    const r = await tool.execute({ basin: 5 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not ready/i);
  });

  it("surfaces 'not-found' from resolveBasin as structured error", async () => {
    const tool = createFindRiversByBasinTool(runtimeReturning("not-found"));
    const r = await tool.execute({ basin: 999 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/no river/i);
    expect(JSON.parse(r.content).error).toMatch(/999/);
  });

  it("surfaces 'not-ready' from find step as structured error", async () => {
    const tool = createFindRiversByBasinTool(
      runtimeReturning({ i: 5, name: "Great River" }, "not-ready"),
    );
    const r = await tool.execute({ basin: 5 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not ready/i);
  });

  it("returns ok with resolved basin echo and full tributary list", async () => {
    const tool = createFindRiversByBasinTool(realRuntime());
    const r = await tool.execute({ basin: "Great River" });
    expect(r.isError).toBeFalsy();
    const body = JSON.parse(r.content);
    expect(body.ok).toBe(true);
    expect(body.basin).toEqual({ i: 5, name: "Great River" });
    expect(new Set(body.rivers.map((x: { i: number }) => x.i))).toEqual(
      new Set([1, 2, 3, 5]),
    );
    expect(body.count).toBe(4);
  });

  it("honors limit end-to-end", async () => {
    const tool = createFindRiversByBasinTool(realRuntime());
    const r = await tool.execute({ basin: 5, limit: 2 });
    expect(r.isError).toBeFalsy();
    const body = JSON.parse(r.content);
    expect(body.rivers.length).toBe(2);
    expect(body.count).toBe(4);
  });

  it("is exported as findRiversByBasinTool with expected schema", () => {
    expect(findRiversByBasinTool.name).toBe("find_rivers_by_basin");
    expect(findRiversByBasinTool.input_schema.type).toBe("object");
    expect(findRiversByBasinTool.input_schema.required).toEqual(["basin"]);
    expect(findRiversByBasinTool.input_schema.properties.basin).toBeDefined();
    expect(
      findRiversByBasinTool.input_schema.properties.include_self,
    ).toBeDefined();
    expect(findRiversByBasinTool.input_schema.properties.limit).toBeDefined();
  });

  it("exposes DEFAULT / MAX limit constants", () => {
    expect(DEFAULT_FIND_RIVERS_BY_BASIN_LIMIT).toBe(10000);
    expect(MAX_FIND_RIVERS_BY_BASIN_LIMIT).toBe(100000);
  });
});

// ----- defaultFindRiversByBasinRuntime integration -----

describe("defaultFindRiversByBasinRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("resolveBasin reads real pack via default runtime", () => {
    expect(defaultFindRiversByBasinRuntime.resolveBasin(5)).toEqual({
      i: 5,
      name: "Great River",
    });
    expect(defaultFindRiversByBasinRuntime.resolveBasin("great river")).toEqual(
      { i: 5, name: "Great River" },
    );
    expect(defaultFindRiversByBasinRuntime.resolveBasin(999)).toBe("not-found");
  });

  it("find reads real pack via default runtime (include_self=true)", () => {
    const res = defaultFindRiversByBasinRuntime.find(5, true, 100) as {
      rivers: Array<{ i: number }>;
      count: number;
      basin: { i: number; name: string };
    };
    expect(new Set(res.rivers.map((r) => r.i))).toEqual(new Set([1, 2, 3, 5]));
    expect(res.count).toBe(4);
    expect(res.basin).toEqual({ i: 5, name: "Great River" });
  });

  it("find reads real pack via default runtime (include_self=false)", () => {
    const res = defaultFindRiversByBasinRuntime.find(5, false, 100) as {
      rivers: Array<{ i: number }>;
      count: number;
    };
    expect(new Set(res.rivers.map((r) => r.i))).toEqual(new Set([1, 2, 3]));
    expect(res.count).toBe(3);
  });

  it("end-to-end via findRiversByBasinTool with real pack", async () => {
    const r = await findRiversByBasinTool.execute({ basin: 5 });
    expect(r.isError).toBeFalsy();
    const body = JSON.parse(r.content);
    expect(body.ok).toBe(true);
    expect(body.basin).toEqual({ i: 5, name: "Great River" });
    expect(new Set(body.rivers.map((x: { i: number }) => x.i))).toEqual(
      new Set([1, 2, 3, 5]),
    );
  });

  it("returns 'not-ready' when pack missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(defaultFindRiversByBasinRuntime.resolveBasin(5)).toBe("not-ready");
    const r = await findRiversByBasinTool.execute({ basin: 5 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not ready/i);
  });
});
