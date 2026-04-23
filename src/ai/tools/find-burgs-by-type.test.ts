import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindBurgsByTypeTool,
  DEFAULT_FIND_BURGS_BY_TYPE_LIMIT,
  defaultFindBurgsByTypeRuntime,
  type FindBurgsByTypeResult,
  type FindBurgsByTypeRuntime,
  findBurgsByTypeInPack,
  findBurgsByTypeTool,
  MAX_FIND_BURGS_BY_TYPE_LIMIT,
} from "./find-burgs-by-type";

interface FakePack {
  burgs: Array<{
    i: number;
    name?: string;
    x?: number;
    y?: number;
    type?: string;
    capital?: number;
    population?: number;
    removed?: boolean;
  }>;
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findBurgsByTypeInPack>[0];
}

function makePack(): FakePack {
  // Burgs:
  //   0: placeholder
  //   1: Generic, capital=1
  //   2: generic (lower casing in data) — still matches Generic
  //   3: Naval
  //   4: Naval, capital=1
  //   5: River
  //   6: Highland, removed=true (skipped)
  //   7: missing type (skipped — no type field)
  //   8: Generic
  return {
    burgs: [
      { i: 0 },
      {
        i: 1,
        name: "Astral",
        x: 100,
        y: 200,
        type: "Generic",
        capital: 1,
        population: 12.5,
      },
      {
        i: 2,
        name: "Birchwell",
        x: 110,
        y: 210,
        type: "generic",
        capital: 0,
        population: 4.3,
      },
      {
        i: 3,
        name: "Coldreach",
        x: 300,
        y: 400,
        type: "Naval",
        capital: 0,
        population: 2.1,
      },
      {
        i: 4,
        name: "Dusktown",
        x: 115,
        y: 220,
        type: "Naval",
        capital: 1,
        population: 9.5,
      },
      {
        i: 5,
        name: "Emberkeep",
        x: 320,
        y: 410,
        type: "River",
        capital: 0,
        population: 8.0,
      },
      {
        i: 6,
        name: "Gone",
        x: 0,
        y: 0,
        type: "Highland",
        capital: 0,
        population: 1,
        removed: true,
      },
      { i: 7, name: "Orphan", x: 0, y: 0 },
      {
        i: 8,
        name: "Freehold",
        x: 500,
        y: 500,
        type: "Generic",
        capital: 0,
        population: 0.5,
      },
    ],
  };
}

function runtimeReturning(
  result: FindBurgsByTypeResult,
): FindBurgsByTypeRuntime {
  return { find: () => result };
}

function realRuntime(): FindBurgsByTypeRuntime {
  const pack = asPack(makePack());
  return {
    find: (type, limit) => findBurgsByTypeInPack(pack, type, limit),
  };
}

describe("find_burgs_by_type — pure scanner", () => {
  it("matches burgs by type case-insensitively (Generic)", () => {
    const result = findBurgsByTypeInPack(
      asPack(makePack()),
      "Generic",
      DEFAULT_FIND_BURGS_BY_TYPE_LIMIT,
    ) as {
      type: string;
      burgs: Array<{ i: number; capital: boolean }>;
      count: number;
    };
    const ids = new Set(result.burgs.map((b) => b.i));
    // Generic burgs: 1 ("Generic"), 2 ("generic"), 8 ("Generic"); 6 removed
    expect(ids).toEqual(new Set([1, 2, 8]));
    expect(result.count).toBe(3);
    expect(result.type).toBe("Generic");
    const byId = new Map(result.burgs.map((b) => [b.i, b]));
    expect(byId.get(1)?.capital).toBe(true);
    expect(byId.get(2)?.capital).toBe(false);
    expect(byId.get(8)?.capital).toBe(false);
  });

  it("returns burgs for a second type cleanly (no cross-contamination)", () => {
    const result = findBurgsByTypeInPack(
      asPack(makePack()),
      "Naval",
      DEFAULT_FIND_BURGS_BY_TYPE_LIMIT,
    ) as { burgs: Array<{ i: number; capital: boolean }>; count: number };
    const ids = new Set(result.burgs.map((b) => b.i));
    expect(ids).toEqual(new Set([3, 4]));
    expect(result.count).toBe(2);
    const byId = new Map(result.burgs.map((b) => [b.i, b]));
    expect(byId.get(3)?.capital).toBe(false);
    expect(byId.get(4)?.capital).toBe(true);
  });

  it("returns empty list when no burg has the given type", () => {
    const result = findBurgsByTypeInPack(
      asPack(makePack()),
      "Nomadic",
      DEFAULT_FIND_BURGS_BY_TYPE_LIMIT,
    ) as { burgs: unknown[]; count: number };
    expect(result.burgs).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("skips i=0 placeholder, removed burgs, and burgs with no type", () => {
    const result = findBurgsByTypeInPack(
      asPack(makePack()),
      "Highland",
      DEFAULT_FIND_BURGS_BY_TYPE_LIMIT,
    ) as { burgs: Array<{ i: number }>; count: number };
    // The only Highland burg is removed (i=6).
    expect(result.burgs).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("truncates `burgs` at limit but preserves full `count`", () => {
    const result = findBurgsByTypeInPack(asPack(makePack()), "Generic", 2) as {
      burgs: Array<{ i: number }>;
      count: number;
    };
    expect(result.burgs.length).toBe(2);
    expect(result.count).toBe(3);
  });

  it("populates x, y, name, population from the raw burg", () => {
    const result = findBurgsByTypeInPack(
      asPack(makePack()),
      "Naval",
      DEFAULT_FIND_BURGS_BY_TYPE_LIMIT,
    ) as {
      burgs: Array<{
        i: number;
        name: string;
        x: number;
        y: number;
        population: number;
        capital: boolean;
      }>;
    };
    const byId = new Map(result.burgs.map((b) => [b.i, b]));
    expect(byId.get(4)).toEqual({
      i: 4,
      name: "Dusktown",
      x: 115,
      y: 220,
      population: 9.5,
      capital: true,
    });
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(
      findBurgsByTypeInPack(
        undefined,
        "Generic",
        DEFAULT_FIND_BURGS_BY_TYPE_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.burgs is missing", () => {
    const pack = {} as unknown as Parameters<typeof findBurgsByTypeInPack>[0];
    expect(
      findBurgsByTypeInPack(pack, "Generic", DEFAULT_FIND_BURGS_BY_TYPE_LIMIT),
    ).toBe("not-ready");
  });
});

describe("find_burgs_by_type — tool surface", () => {
  it("returns ok=true with canonical type, burgs, and count", async () => {
    const tool = createFindBurgsByTypeTool(realRuntime());
    const result = await tool.execute({ type: "Generic" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.type).toBe("Generic");
    expect(new Set(body.burgs.map((b: { i: number }) => b.i))).toEqual(
      new Set([1, 2, 8]),
    );
    expect(body.count).toBe(3);
  });

  it("accepts type case-insensitively and echoes canonical casing", async () => {
    const tool = createFindBurgsByTypeTool(realRuntime());
    for (const variant of ["naval", "NAVAL", "Naval", " naval "]) {
      const result = await tool.execute({ type: variant });
      expect(result.isError).toBeFalsy();
      const body = JSON.parse(result.content);
      expect(body.type).toBe("Naval");
      expect(new Set(body.burgs.map((b: { i: number }) => b.i))).toEqual(
        new Set([3, 4]),
      );
    }
  });

  it("rejects missing / non-string / empty type", async () => {
    const tool = createFindBurgsByTypeTool(realRuntime());
    for (const bad of [
      {},
      { type: null },
      { type: "" },
      { type: "   " },
      { type: 42 },
      { type: true },
      { type: [] },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      const body = JSON.parse(r.content);
      expect(body.error).toMatch(/type/i);
      // Supported list is echoed for type-related errors.
      expect(Array.isArray(body.supported)).toBe(true);
    }
  });

  it("rejects unknown type with the supported list", async () => {
    const tool = createFindBurgsByTypeTool(realRuntime());
    const result = await tool.execute({ type: "Metropolis" });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.error).toMatch(/unknown burg type/i);
    expect(body.supported).toEqual(
      expect.arrayContaining(["Generic", "Naval", "River"]),
    );
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createFindBurgsByTypeTool(runtimeReturning("not-ready"));
    const result = await tool.execute({ type: "Generic" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("respects explicit limit and reports full count", async () => {
    const tool = createFindBurgsByTypeTool(realRuntime());
    const result = await tool.execute({ type: "Generic", limit: 2 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.burgs.length).toBe(2);
    expect(body.count).toBe(3);
  });

  it("rejects invalid limit", async () => {
    const tool = createFindBurgsByTypeTool(realRuntime());
    for (const bad of [
      { type: "Generic", limit: 0 },
      { type: "Generic", limit: -1 },
      { type: "Generic", limit: 1.5 },
      { type: "Generic", limit: "10" },
      { type: "Generic", limit: MAX_FIND_BURGS_BY_TYPE_LIMIT + 1 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/limit must be an integer/);
    }
  });

  it("applies default limit when omitted", async () => {
    let receivedLimit = -1;
    const runtime: FindBurgsByTypeRuntime = {
      find: (_type, limit) => {
        receivedLimit = limit;
        return { type: "Generic", burgs: [], count: 0 };
      },
    };
    const tool = createFindBurgsByTypeTool(runtime);
    await tool.execute({ type: "Generic" });
    expect(receivedLimit).toBe(DEFAULT_FIND_BURGS_BY_TYPE_LIMIT);
  });

  it("accepts limit at the boundaries (1 and MAX)", async () => {
    const tool = createFindBurgsByTypeTool(realRuntime());
    const r1 = await tool.execute({ type: "Generic", limit: 1 });
    expect(r1.isError).toBeFalsy();
    const b1 = JSON.parse(r1.content);
    expect(b1.burgs.length).toBe(1);
    expect(b1.count).toBe(3);
    const r2 = await tool.execute({
      type: "Generic",
      limit: MAX_FIND_BURGS_BY_TYPE_LIMIT,
    });
    expect(r2.isError).toBeFalsy();
    expect(JSON.parse(r2.content).burgs.length).toBe(3);
  });

  it("returns empty list when no burg matches the type", async () => {
    const tool = createFindBurgsByTypeTool(realRuntime());
    const result = await tool.execute({ type: "Nomadic" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.type).toBe("Nomadic");
    expect(body.burgs).toEqual([]);
    expect(body.count).toBe(0);
  });

  it("is exported as findBurgsByTypeTool with the expected schema", () => {
    expect(findBurgsByTypeTool.name).toBe("find_burgs_by_type");
    expect(findBurgsByTypeTool.input_schema.type).toBe("object");
    expect(findBurgsByTypeTool.input_schema.required).toEqual(["type"]);
    expect(findBurgsByTypeTool.input_schema.properties.type).toBeDefined();
    expect(findBurgsByTypeTool.input_schema.properties.limit).toBeDefined();
  });

  it("exposes DEFAULT / MAX limit constants", () => {
    expect(DEFAULT_FIND_BURGS_BY_TYPE_LIMIT).toBe(10000);
    expect(MAX_FIND_BURGS_BY_TYPE_LIMIT).toBe(100000);
  });
});

// ----- defaultFindBurgsByTypeRuntime integration -----

describe("defaultFindBurgsByTypeRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("finds burgs via the default runtime for Generic", () => {
    const result = defaultFindBurgsByTypeRuntime.find(
      "Generic",
      DEFAULT_FIND_BURGS_BY_TYPE_LIMIT,
    ) as { burgs: Array<{ i: number }>; count: number };
    expect(new Set(result.burgs.map((b) => b.i))).toEqual(new Set([1, 2, 8]));
    expect(result.count).toBe(3);
  });

  it("tool uses default runtime end-to-end", async () => {
    const result = await findBurgsByTypeTool.execute({ type: "Naval" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.type).toBe("Naval");
    expect(new Set(body.burgs.map((b: { i: number }) => b.i))).toEqual(
      new Set([3, 4]),
    );
    expect(body.count).toBe(2);
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(
      defaultFindBurgsByTypeRuntime.find(
        "Generic",
        DEFAULT_FIND_BURGS_BY_TYPE_LIMIT,
      ),
    ).toBe("not-ready");
    const result = await findBurgsByTypeTool.execute({ type: "Generic" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
