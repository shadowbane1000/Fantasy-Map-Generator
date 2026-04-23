import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindBurgsByCultureTool,
  DEFAULT_FIND_BURGS_BY_CULTURE_LIMIT,
  defaultFindBurgsByCultureRuntime,
  type FindBurgsByCultureResult,
  type FindBurgsByCultureRuntime,
  findBurgsByCultureInPack,
  findBurgsByCultureTool,
  MAX_FIND_BURGS_BY_CULTURE_LIMIT,
  type ResolveCultureResult,
  resolveCultureRefInPack,
} from "./find-burgs-by-culture";

interface FakePack {
  burgs: Array<{
    i: number;
    name?: string;
    x?: number;
    y?: number;
    culture?: number;
    capital?: number;
    population?: number;
    removed?: boolean;
  }>;
  cultures: Array<{
    i: number;
    name?: string;
    removed?: boolean;
  }>;
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findBurgsByCultureInPack>[0];
}

function makePack(): FakePack {
  // Cultures:
  //   0: "Wildlands" (allowed target)
  //   1: "Highlanders"
  //   2: "Seafarers"
  //   3: "Ghost" (removed)
  //
  // Burgs:
  //   0: placeholder
  //   1: capital of culture 1 (capital=1)
  //   2: town in culture 1
  //   3: town in culture 2
  //   4: town in culture 1 (capital=0)
  //   5: town in culture 2 (capital=1)
  //   6: town in Wildlands (culture 0)
  //   7: removed, culture 1 — should be skipped
  //   8: no culture field — should not match anything non-zero
  return {
    burgs: [
      { i: 0 },
      {
        i: 1,
        name: "Astral",
        x: 100,
        y: 200,
        culture: 1,
        capital: 1,
        population: 12.5,
      },
      {
        i: 2,
        name: "Birchwell",
        x: 110,
        y: 210,
        culture: 1,
        capital: 0,
        population: 4.3,
      },
      {
        i: 3,
        name: "Coldreach",
        x: 300,
        y: 400,
        culture: 2,
        capital: 0,
        population: 2.1,
      },
      {
        i: 4,
        name: "Dusktown",
        x: 115,
        y: 220,
        culture: 1,
        capital: 0,
        population: 1.2,
      },
      {
        i: 5,
        name: "Emberkeep",
        x: 320,
        y: 410,
        culture: 2,
        capital: 1,
        population: 8.0,
      },
      {
        i: 6,
        name: "Freehold",
        x: 500,
        y: 500,
        culture: 0,
        capital: 0,
        population: 0.5,
      },
      {
        i: 7,
        name: "Gone",
        x: 0,
        y: 0,
        culture: 1,
        capital: 0,
        population: 1,
        removed: true,
      },
      { i: 8, name: "Orphan", x: 0, y: 0 },
    ],
    cultures: [
      { i: 0, name: "Wildlands" },
      { i: 1, name: "Highlanders" },
      { i: 2, name: "Seafarers" },
      { i: 3, name: "Ghost", removed: true },
    ],
  };
}

function runtimeReturning(opts: {
  resolve?: ResolveCultureResult;
  find?: FindBurgsByCultureResult;
}): FindBurgsByCultureRuntime {
  return {
    resolveCulture: () => opts.resolve ?? { i: 1, name: "Highlanders" },
    find: () => opts.find ?? { burgs: [], count: 0 },
  };
}

function realRuntime(): FindBurgsByCultureRuntime {
  const pack = asPack(makePack());
  return {
    resolveCulture: (ref) => resolveCultureRefInPack(pack, ref),
    find: (cultureI, limit) => findBurgsByCultureInPack(pack, cultureI, limit),
  };
}

describe("find_burgs_by_culture — pure scanner", () => {
  it("returns every active burg for a culture with multiple burgs", () => {
    const result = findBurgsByCultureInPack(
      asPack(makePack()),
      1,
      DEFAULT_FIND_BURGS_BY_CULTURE_LIMIT,
    ) as { burgs: Array<{ i: number; capital: boolean }>; count: number };
    const ids = new Set(result.burgs.map((b) => b.i));
    // culture 1 burgs: 1, 2, 4 (7 is removed)
    expect(ids).toEqual(new Set([1, 2, 4]));
    expect(result.count).toBe(3);
    const byId = new Map(result.burgs.map((b) => [b.i, b]));
    expect(byId.get(1)?.capital).toBe(true);
    expect(byId.get(2)?.capital).toBe(false);
    expect(byId.get(4)?.capital).toBe(false);
  });

  it("returns burgs for a second culture cleanly (no cross-contamination)", () => {
    const result = findBurgsByCultureInPack(
      asPack(makePack()),
      2,
      DEFAULT_FIND_BURGS_BY_CULTURE_LIMIT,
    ) as { burgs: Array<{ i: number; capital: boolean }>; count: number };
    const ids = new Set(result.burgs.map((b) => b.i));
    expect(ids).toEqual(new Set([3, 5]));
    expect(result.count).toBe(2);
    const byId = new Map(result.burgs.map((b) => [b.i, b]));
    expect(byId.get(3)?.capital).toBe(false);
    expect(byId.get(5)?.capital).toBe(true);
  });

  it("returns Wildlands (culture 0) burgs", () => {
    const result = findBurgsByCultureInPack(
      asPack(makePack()),
      0,
      DEFAULT_FIND_BURGS_BY_CULTURE_LIMIT,
    ) as { burgs: Array<{ i: number }>; count: number };
    const ids = new Set(result.burgs.map((b) => b.i));
    expect(ids).toEqual(new Set([6]));
    expect(result.count).toBe(1);
  });

  it("returns empty list when the culture has no burgs", () => {
    // culture 3 (Ghost) exists in fixture but no burg points to it.
    const result = findBurgsByCultureInPack(
      asPack(makePack()),
      3,
      DEFAULT_FIND_BURGS_BY_CULTURE_LIMIT,
    ) as { burgs: unknown[]; count: number };
    expect(result.burgs).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("skips i=0 placeholder and removed burgs", () => {
    const result = findBurgsByCultureInPack(
      asPack(makePack()),
      1,
      DEFAULT_FIND_BURGS_BY_CULTURE_LIMIT,
    ) as { burgs: Array<{ i: number }>; count: number };
    const ids = new Set(result.burgs.map((b) => b.i));
    expect(ids.has(0)).toBe(false);
    expect(ids.has(7)).toBe(false);
  });

  it("truncates `burgs` at limit but preserves full `count`", () => {
    const result = findBurgsByCultureInPack(asPack(makePack()), 1, 2) as {
      burgs: Array<{ i: number }>;
      count: number;
    };
    expect(result.burgs.length).toBe(2);
    expect(result.count).toBe(3);
  });

  it("populates x, y, name, population from the raw burg", () => {
    const result = findBurgsByCultureInPack(
      asPack(makePack()),
      2,
      DEFAULT_FIND_BURGS_BY_CULTURE_LIMIT,
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
    expect(byId.get(5)).toEqual({
      i: 5,
      name: "Emberkeep",
      x: 320,
      y: 410,
      population: 8.0,
      capital: true,
    });
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(
      findBurgsByCultureInPack(
        undefined,
        1,
        DEFAULT_FIND_BURGS_BY_CULTURE_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.burgs is missing", () => {
    const pack = {} as unknown as Parameters<
      typeof findBurgsByCultureInPack
    >[0];
    expect(
      findBurgsByCultureInPack(pack, 1, DEFAULT_FIND_BURGS_BY_CULTURE_LIMIT),
    ).toBe("not-ready");
  });
});

describe("resolveCultureRefInPack", () => {
  it("resolves numeric id", () => {
    expect(resolveCultureRefInPack(asPack(makePack()), 1)).toEqual({
      i: 1,
      name: "Highlanders",
    });
  });

  it("resolves case-insensitive name", () => {
    expect(resolveCultureRefInPack(asPack(makePack()), "highlanders")).toEqual({
      i: 1,
      name: "Highlanders",
    });
  });

  it("allows numeric 0 (Wildlands)", () => {
    expect(resolveCultureRefInPack(asPack(makePack()), 0)).toEqual({
      i: 0,
      name: "Wildlands",
    });
  });

  it("returns 'not-found' for unknown name", () => {
    expect(resolveCultureRefInPack(asPack(makePack()), "nowhere")).toBe(
      "not-found",
    );
  });

  it("returns 'not-found' for removed culture by id", () => {
    expect(resolveCultureRefInPack(asPack(makePack()), 3)).toBe("not-found");
  });

  it("returns 'not-found' for out-of-range id", () => {
    expect(resolveCultureRefInPack(asPack(makePack()), 99)).toBe("not-found");
  });

  it("returns 'not-ready' when cultures missing", () => {
    const pack = {} as unknown as Parameters<typeof resolveCultureRefInPack>[0];
    expect(resolveCultureRefInPack(pack, 1)).toBe("not-ready");
  });
});

describe("find_burgs_by_culture — tool surface", () => {
  it("returns ok=true with resolved culture, burgs, and count (numeric)", async () => {
    const tool = createFindBurgsByCultureTool(realRuntime());
    const result = await tool.execute({ culture: 1 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.culture).toEqual({ i: 1, name: "Highlanders" });
    expect(new Set(body.burgs.map((b: { i: number }) => b.i))).toEqual(
      new Set([1, 2, 4]),
    );
    expect(body.count).toBe(3);
  });

  it("accepts a string culture name (case-insensitive)", async () => {
    const tool = createFindBurgsByCultureTool(realRuntime());
    const result = await tool.execute({ culture: "seafarers" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.culture).toEqual({ i: 2, name: "Seafarers" });
    expect(new Set(body.burgs.map((b: { i: number }) => b.i))).toEqual(
      new Set([3, 5]),
    );
    expect(body.count).toBe(2);
  });

  it("accepts culture 0 (Wildlands)", async () => {
    const tool = createFindBurgsByCultureTool(realRuntime());
    const result = await tool.execute({ culture: 0 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.culture).toEqual({ i: 0, name: "Wildlands" });
    expect(new Set(body.burgs.map((b: { i: number }) => b.i))).toEqual(
      new Set([6]),
    );
    expect(body.count).toBe(1);
  });

  it("rejects missing / invalid culture", async () => {
    const tool = createFindBurgsByCultureTool(realRuntime());
    for (const bad of [
      {},
      { culture: null },
      { culture: "" },
      { culture: "   " },
      { culture: -1 },
      { culture: 1.5 },
      { culture: true },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /culture must be a non-negative integer id or a non-empty name string/i,
      );
    }
  });

  it("surfaces 'not-found' as a structured error", async () => {
    const tool = createFindBurgsByCultureTool(realRuntime());
    const result = await tool.execute({ culture: "nowhere" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no culture found/i);
  });

  it("surfaces 'not-ready' from resolveCulture as a structured error", async () => {
    const tool = createFindBurgsByCultureTool(
      runtimeReturning({ resolve: "not-ready" }),
    );
    const result = await tool.execute({ culture: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("surfaces 'not-ready' from find as a structured error", async () => {
    const tool = createFindBurgsByCultureTool(
      runtimeReturning({
        resolve: { i: 1, name: "Highlanders" },
        find: "not-ready",
      }),
    );
    const result = await tool.execute({ culture: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("rejects culture removed (resolves to not-found)", async () => {
    const tool = createFindBurgsByCultureTool(realRuntime());
    const result = await tool.execute({ culture: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no culture found/i);
  });

  it("respects explicit limit and reports full count", async () => {
    const tool = createFindBurgsByCultureTool(realRuntime());
    const result = await tool.execute({ culture: 1, limit: 2 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.burgs.length).toBe(2);
    expect(body.count).toBe(3);
  });

  it("rejects invalid limit", async () => {
    const tool = createFindBurgsByCultureTool(realRuntime());
    for (const bad of [
      { culture: 1, limit: 0 },
      { culture: 1, limit: -1 },
      { culture: 1, limit: 1.5 },
      { culture: 1, limit: "10" },
      { culture: 1, limit: MAX_FIND_BURGS_BY_CULTURE_LIMIT + 1 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/limit must be an integer/);
    }
  });

  it("applies default limit when omitted", async () => {
    let receivedLimit = -1;
    const runtime: FindBurgsByCultureRuntime = {
      resolveCulture: () => ({ i: 1, name: "Highlanders" }),
      find: (_cultureI, limit) => {
        receivedLimit = limit;
        return { burgs: [], count: 0 };
      },
    };
    const tool = createFindBurgsByCultureTool(runtime);
    await tool.execute({ culture: 1 });
    expect(receivedLimit).toBe(DEFAULT_FIND_BURGS_BY_CULTURE_LIMIT);
  });

  it("returns empty list when the culture has no burgs", async () => {
    const runtime: FindBurgsByCultureRuntime = {
      resolveCulture: () => ({ i: 4, name: "EmptyFolk" }),
      find: () => ({ burgs: [], count: 0 }),
    };
    const tool = createFindBurgsByCultureTool(runtime);
    const result = await tool.execute({ culture: 4 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.culture).toEqual({ i: 4, name: "EmptyFolk" });
    expect(body.burgs).toEqual([]);
    expect(body.count).toBe(0);
  });

  it("is exported as findBurgsByCultureTool with the expected schema", () => {
    expect(findBurgsByCultureTool.name).toBe("find_burgs_by_culture");
    expect(findBurgsByCultureTool.input_schema.type).toBe("object");
    expect(findBurgsByCultureTool.input_schema.required).toEqual(["culture"]);
    expect(
      findBurgsByCultureTool.input_schema.properties.culture,
    ).toBeDefined();
    expect(findBurgsByCultureTool.input_schema.properties.limit).toBeDefined();
  });

  it("exposes DEFAULT / MAX limit constants", () => {
    expect(DEFAULT_FIND_BURGS_BY_CULTURE_LIMIT).toBe(10000);
    expect(MAX_FIND_BURGS_BY_CULTURE_LIMIT).toBe(100000);
  });
});

// ----- defaultFindBurgsByCultureRuntime integration -----

describe("defaultFindBurgsByCultureRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("resolves a culture via the default runtime", () => {
    expect(
      defaultFindBurgsByCultureRuntime.resolveCulture("Highlanders"),
    ).toEqual({
      i: 1,
      name: "Highlanders",
    });
  });

  it("finds burgs via the default runtime for culture 1", () => {
    const result = defaultFindBurgsByCultureRuntime.find(
      1,
      DEFAULT_FIND_BURGS_BY_CULTURE_LIMIT,
    ) as { burgs: Array<{ i: number }>; count: number };
    expect(new Set(result.burgs.map((b) => b.i))).toEqual(new Set([1, 2, 4]));
    expect(result.count).toBe(3);
  });

  it("tool uses default runtime end-to-end", async () => {
    const result = await findBurgsByCultureTool.execute({
      culture: "Seafarers",
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.culture).toEqual({ i: 2, name: "Seafarers" });
    expect(new Set(body.burgs.map((b: { i: number }) => b.i))).toEqual(
      new Set([3, 5]),
    );
    expect(body.count).toBe(2);
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(defaultFindBurgsByCultureRuntime.resolveCulture(1)).toBe(
      "not-ready",
    );
    expect(
      defaultFindBurgsByCultureRuntime.find(
        1,
        DEFAULT_FIND_BURGS_BY_CULTURE_LIMIT,
      ),
    ).toBe("not-ready");
    const result = await findBurgsByCultureTool.execute({ culture: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
