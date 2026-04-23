import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindBurgsByReligionTool,
  DEFAULT_FIND_BURGS_BY_RELIGION_LIMIT,
  defaultFindBurgsByReligionRuntime,
  type FindBurgsByReligionResult,
  type FindBurgsByReligionRuntime,
  findBurgsByReligionInPack,
  findBurgsByReligionTool,
  MAX_FIND_BURGS_BY_RELIGION_LIMIT,
  type ResolveReligionResult,
  resolveReligionRefInPack,
} from "./find-burgs-by-religion";

interface FakePack {
  burgs: Array<{
    i: number;
    name?: string;
    x?: number;
    y?: number;
    cell?: number;
    capital?: number;
    population?: number;
    removed?: boolean;
  }>;
  religions: Array<{
    i: number;
    name?: string;
    removed?: boolean;
  }>;
  cells: {
    religion: Array<number | undefined>;
  };
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findBurgsByReligionInPack>[0];
}

function makePack(): FakePack {
  // Religions:
  //   0: "No religion" (allowed target; groups cells with no organized faith)
  //   1: "Ashenfaith"
  //   2: "Sealight"
  //   3: "Ghost" (removed)
  //
  // Cells (indices 0..10), cells.religion[cellI] holds the religion id.
  //   cell 10: religion 1
  //   cell 11: religion 1
  //   cell 12: religion 2
  //   cell 13: religion 1
  //   cell 14: religion 2
  //   cell 15: religion 0
  //   cell 16: religion 1 (used by removed burg)
  //   cell 17: religion 0 (orphan burg without cell — won't match on 0)
  //
  // Burgs:
  //   0: placeholder
  //   1: capital, cell 10, religion 1 via cells
  //   2: town, cell 11, religion 1
  //   3: town, cell 12, religion 2
  //   4: town, cell 13, religion 1
  //   5: capital town, cell 14, religion 2
  //   6: town, cell 15, religion 0 (No religion)
  //   7: removed, cell 16, religion 1 — skipped
  //   8: no cell field — skipped
  //   9: cell 99 (out of bounds in cells.religion) — undefined, skipped
  const cellReligion: Array<number | undefined> = [];
  cellReligion[10] = 1;
  cellReligion[11] = 1;
  cellReligion[12] = 2;
  cellReligion[13] = 1;
  cellReligion[14] = 2;
  cellReligion[15] = 0;
  cellReligion[16] = 1;
  cellReligion[17] = 0;

  return {
    burgs: [
      { i: 0 },
      {
        i: 1,
        name: "Astral",
        x: 100,
        y: 200,
        cell: 10,
        capital: 1,
        population: 12.5,
      },
      {
        i: 2,
        name: "Birchwell",
        x: 110,
        y: 210,
        cell: 11,
        capital: 0,
        population: 4.3,
      },
      {
        i: 3,
        name: "Coldreach",
        x: 300,
        y: 400,
        cell: 12,
        capital: 0,
        population: 2.1,
      },
      {
        i: 4,
        name: "Dusktown",
        x: 115,
        y: 220,
        cell: 13,
        capital: 0,
        population: 1.2,
      },
      {
        i: 5,
        name: "Emberkeep",
        x: 320,
        y: 410,
        cell: 14,
        capital: 1,
        population: 8.0,
      },
      {
        i: 6,
        name: "Freehold",
        x: 500,
        y: 500,
        cell: 15,
        capital: 0,
        population: 0.5,
      },
      {
        i: 7,
        name: "Gone",
        x: 0,
        y: 0,
        cell: 16,
        capital: 0,
        population: 1,
        removed: true,
      },
      { i: 8, name: "Orphan", x: 0, y: 0 },
      {
        i: 9,
        name: "Wandering",
        x: 0,
        y: 0,
        cell: 99,
        capital: 0,
        population: 1,
      },
    ],
    religions: [
      { i: 0, name: "No religion" },
      { i: 1, name: "Ashenfaith" },
      { i: 2, name: "Sealight" },
      { i: 3, name: "Ghost", removed: true },
    ],
    cells: { religion: cellReligion },
  };
}

function runtimeReturning(opts: {
  resolve?: ResolveReligionResult;
  find?: FindBurgsByReligionResult;
}): FindBurgsByReligionRuntime {
  return {
    resolveReligion: () => opts.resolve ?? { i: 1, name: "Ashenfaith" },
    find: () => opts.find ?? { burgs: [], count: 0 },
  };
}

function realRuntime(): FindBurgsByReligionRuntime {
  const pack = asPack(makePack());
  return {
    resolveReligion: (ref) => resolveReligionRefInPack(pack, ref),
    find: (religionI, limit) =>
      findBurgsByReligionInPack(pack, religionI, limit),
  };
}

describe("find_burgs_by_religion — pure scanner", () => {
  it("returns every active burg for a religion with multiple burgs", () => {
    const result = findBurgsByReligionInPack(
      asPack(makePack()),
      1,
      DEFAULT_FIND_BURGS_BY_RELIGION_LIMIT,
    ) as { burgs: Array<{ i: number; capital: boolean }>; count: number };
    const ids = new Set(result.burgs.map((b) => b.i));
    // religion 1: burgs 1, 2, 4 (7 removed, 9 out-of-bounds)
    expect(ids).toEqual(new Set([1, 2, 4]));
    expect(result.count).toBe(3);
    const byId = new Map(result.burgs.map((b) => [b.i, b]));
    expect(byId.get(1)?.capital).toBe(true);
    expect(byId.get(2)?.capital).toBe(false);
    expect(byId.get(4)?.capital).toBe(false);
  });

  it("returns burgs for a second religion cleanly (no cross-contamination)", () => {
    const result = findBurgsByReligionInPack(
      asPack(makePack()),
      2,
      DEFAULT_FIND_BURGS_BY_RELIGION_LIMIT,
    ) as { burgs: Array<{ i: number; capital: boolean }>; count: number };
    const ids = new Set(result.burgs.map((b) => b.i));
    expect(ids).toEqual(new Set([3, 5]));
    expect(result.count).toBe(2);
    const byId = new Map(result.burgs.map((b) => [b.i, b]));
    expect(byId.get(3)?.capital).toBe(false);
    expect(byId.get(5)?.capital).toBe(true);
  });

  it("returns 'No religion' (religion 0) burgs", () => {
    const result = findBurgsByReligionInPack(
      asPack(makePack()),
      0,
      DEFAULT_FIND_BURGS_BY_RELIGION_LIMIT,
    ) as { burgs: Array<{ i: number }>; count: number };
    const ids = new Set(result.burgs.map((b) => b.i));
    // only burg 6 is on a cell with religion 0; burg 8 has no cell, burg 9 is out-of-bounds
    expect(ids).toEqual(new Set([6]));
    expect(result.count).toBe(1);
  });

  it("returns empty list when the religion has no burgs", () => {
    // religion 3 (Ghost, removed) — no cell points to it even if caller asks.
    const result = findBurgsByReligionInPack(
      asPack(makePack()),
      3,
      DEFAULT_FIND_BURGS_BY_RELIGION_LIMIT,
    ) as { burgs: unknown[]; count: number };
    expect(result.burgs).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("skips i=0 placeholder and removed burgs", () => {
    const result = findBurgsByReligionInPack(
      asPack(makePack()),
      1,
      DEFAULT_FIND_BURGS_BY_RELIGION_LIMIT,
    ) as { burgs: Array<{ i: number }>; count: number };
    const ids = new Set(result.burgs.map((b) => b.i));
    expect(ids.has(0)).toBe(false);
    expect(ids.has(7)).toBe(false);
  });

  it("skips burgs whose cell is out-of-bounds in cells.religion", () => {
    const result = findBurgsByReligionInPack(
      asPack(makePack()),
      1,
      DEFAULT_FIND_BURGS_BY_RELIGION_LIMIT,
    ) as { burgs: Array<{ i: number }>; count: number };
    const ids = new Set(result.burgs.map((b) => b.i));
    // burg 9 has cell 99 which is undefined in cells.religion — must not match
    expect(ids.has(9)).toBe(false);
  });

  it("truncates `burgs` at limit but preserves full `count`", () => {
    const result = findBurgsByReligionInPack(asPack(makePack()), 1, 2) as {
      burgs: Array<{ i: number }>;
      count: number;
    };
    expect(result.burgs.length).toBe(2);
    expect(result.count).toBe(3);
  });

  it("populates x, y, name, population from the raw burg", () => {
    const result = findBurgsByReligionInPack(
      asPack(makePack()),
      2,
      DEFAULT_FIND_BURGS_BY_RELIGION_LIMIT,
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
      findBurgsByReligionInPack(
        undefined,
        1,
        DEFAULT_FIND_BURGS_BY_RELIGION_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.burgs is missing", () => {
    const pack = {
      cells: { religion: [] },
    } as unknown as Parameters<typeof findBurgsByReligionInPack>[0];
    expect(
      findBurgsByReligionInPack(pack, 1, DEFAULT_FIND_BURGS_BY_RELIGION_LIMIT),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.cells.religion is missing", () => {
    const pack = {
      burgs: [{ i: 0 }],
    } as unknown as Parameters<typeof findBurgsByReligionInPack>[0];
    expect(
      findBurgsByReligionInPack(pack, 1, DEFAULT_FIND_BURGS_BY_RELIGION_LIMIT),
    ).toBe("not-ready");
  });
});

describe("resolveReligionRefInPack", () => {
  it("resolves numeric id", () => {
    expect(resolveReligionRefInPack(asPack(makePack()), 1)).toEqual({
      i: 1,
      name: "Ashenfaith",
    });
  });

  it("resolves case-insensitive name", () => {
    expect(resolveReligionRefInPack(asPack(makePack()), "ashenfaith")).toEqual({
      i: 1,
      name: "Ashenfaith",
    });
  });

  it("allows numeric 0 (No religion)", () => {
    expect(resolveReligionRefInPack(asPack(makePack()), 0)).toEqual({
      i: 0,
      name: "No religion",
    });
  });

  it("returns 'not-found' for unknown name", () => {
    expect(resolveReligionRefInPack(asPack(makePack()), "nowhere")).toBe(
      "not-found",
    );
  });

  it("returns 'not-found' for removed religion by id", () => {
    expect(resolveReligionRefInPack(asPack(makePack()), 3)).toBe("not-found");
  });

  it("returns 'not-found' for out-of-range id", () => {
    expect(resolveReligionRefInPack(asPack(makePack()), 99)).toBe("not-found");
  });

  it("returns 'not-ready' when religions missing", () => {
    const pack = {} as unknown as Parameters<
      typeof resolveReligionRefInPack
    >[0];
    expect(resolveReligionRefInPack(pack, 1)).toBe("not-ready");
  });
});

describe("find_burgs_by_religion — tool surface", () => {
  it("returns ok=true with resolved religion, burgs, and count (numeric)", async () => {
    const tool = createFindBurgsByReligionTool(realRuntime());
    const result = await tool.execute({ religion: 1 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.religion).toEqual({ i: 1, name: "Ashenfaith" });
    expect(new Set(body.burgs.map((b: { i: number }) => b.i))).toEqual(
      new Set([1, 2, 4]),
    );
    expect(body.count).toBe(3);
  });

  it("accepts a string religion name (case-insensitive)", async () => {
    const tool = createFindBurgsByReligionTool(realRuntime());
    const result = await tool.execute({ religion: "sealight" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.religion).toEqual({ i: 2, name: "Sealight" });
    expect(new Set(body.burgs.map((b: { i: number }) => b.i))).toEqual(
      new Set([3, 5]),
    );
    expect(body.count).toBe(2);
  });

  it("accepts religion 0 (No religion)", async () => {
    const tool = createFindBurgsByReligionTool(realRuntime());
    const result = await tool.execute({ religion: 0 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.religion).toEqual({ i: 0, name: "No religion" });
    expect(new Set(body.burgs.map((b: { i: number }) => b.i))).toEqual(
      new Set([6]),
    );
    expect(body.count).toBe(1);
  });

  it("rejects missing / invalid religion", async () => {
    const tool = createFindBurgsByReligionTool(realRuntime());
    for (const bad of [
      {},
      { religion: null },
      { religion: "" },
      { religion: "   " },
      { religion: -1 },
      { religion: 1.5 },
      { religion: true },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /religion must be a non-negative integer id or a non-empty name string/i,
      );
    }
  });

  it("surfaces 'not-found' as a structured error", async () => {
    const tool = createFindBurgsByReligionTool(realRuntime());
    const result = await tool.execute({ religion: "nowhere" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no religion found/i);
  });

  it("surfaces 'not-ready' from resolveReligion as a structured error", async () => {
    const tool = createFindBurgsByReligionTool(
      runtimeReturning({ resolve: "not-ready" }),
    );
    const result = await tool.execute({ religion: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("surfaces 'not-ready' from find as a structured error", async () => {
    const tool = createFindBurgsByReligionTool(
      runtimeReturning({
        resolve: { i: 1, name: "Ashenfaith" },
        find: "not-ready",
      }),
    );
    const result = await tool.execute({ religion: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("rejects religion removed (resolves to not-found)", async () => {
    const tool = createFindBurgsByReligionTool(realRuntime());
    const result = await tool.execute({ religion: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no religion found/i);
  });

  it("respects explicit limit and reports full count", async () => {
    const tool = createFindBurgsByReligionTool(realRuntime());
    const result = await tool.execute({ religion: 1, limit: 2 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.burgs.length).toBe(2);
    expect(body.count).toBe(3);
  });

  it("rejects invalid limit", async () => {
    const tool = createFindBurgsByReligionTool(realRuntime());
    for (const bad of [
      { religion: 1, limit: 0 },
      { religion: 1, limit: -1 },
      { religion: 1, limit: 1.5 },
      { religion: 1, limit: "10" },
      { religion: 1, limit: MAX_FIND_BURGS_BY_RELIGION_LIMIT + 1 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/limit must be an integer/);
    }
  });

  it("applies default limit when omitted", async () => {
    let receivedLimit = -1;
    const runtime: FindBurgsByReligionRuntime = {
      resolveReligion: () => ({ i: 1, name: "Ashenfaith" }),
      find: (_religionI, limit) => {
        receivedLimit = limit;
        return { burgs: [], count: 0 };
      },
    };
    const tool = createFindBurgsByReligionTool(runtime);
    await tool.execute({ religion: 1 });
    expect(receivedLimit).toBe(DEFAULT_FIND_BURGS_BY_RELIGION_LIMIT);
  });

  it("returns empty list when the religion has no burgs", async () => {
    const runtime: FindBurgsByReligionRuntime = {
      resolveReligion: () => ({ i: 4, name: "EmptyFaith" }),
      find: () => ({ burgs: [], count: 0 }),
    };
    const tool = createFindBurgsByReligionTool(runtime);
    const result = await tool.execute({ religion: 4 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.religion).toEqual({ i: 4, name: "EmptyFaith" });
    expect(body.burgs).toEqual([]);
    expect(body.count).toBe(0);
  });

  it("is exported as findBurgsByReligionTool with the expected schema", () => {
    expect(findBurgsByReligionTool.name).toBe("find_burgs_by_religion");
    expect(findBurgsByReligionTool.input_schema.type).toBe("object");
    expect(findBurgsByReligionTool.input_schema.required).toEqual(["religion"]);
    expect(
      findBurgsByReligionTool.input_schema.properties.religion,
    ).toBeDefined();
    expect(findBurgsByReligionTool.input_schema.properties.limit).toBeDefined();
  });

  it("exposes DEFAULT / MAX limit constants", () => {
    expect(DEFAULT_FIND_BURGS_BY_RELIGION_LIMIT).toBe(10000);
    expect(MAX_FIND_BURGS_BY_RELIGION_LIMIT).toBe(100000);
  });
});

// ----- defaultFindBurgsByReligionRuntime integration -----

describe("defaultFindBurgsByReligionRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("resolves a religion via the default runtime", () => {
    expect(
      defaultFindBurgsByReligionRuntime.resolveReligion("Ashenfaith"),
    ).toEqual({
      i: 1,
      name: "Ashenfaith",
    });
  });

  it("finds burgs via the default runtime for religion 1", () => {
    const result = defaultFindBurgsByReligionRuntime.find(
      1,
      DEFAULT_FIND_BURGS_BY_RELIGION_LIMIT,
    ) as { burgs: Array<{ i: number }>; count: number };
    expect(new Set(result.burgs.map((b) => b.i))).toEqual(new Set([1, 2, 4]));
    expect(result.count).toBe(3);
  });

  it("tool uses default runtime end-to-end", async () => {
    const result = await findBurgsByReligionTool.execute({
      religion: "Sealight",
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.religion).toEqual({ i: 2, name: "Sealight" });
    expect(new Set(body.burgs.map((b: { i: number }) => b.i))).toEqual(
      new Set([3, 5]),
    );
    expect(body.count).toBe(2);
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(defaultFindBurgsByReligionRuntime.resolveReligion(1)).toBe(
      "not-ready",
    );
    expect(
      defaultFindBurgsByReligionRuntime.find(
        1,
        DEFAULT_FIND_BURGS_BY_RELIGION_LIMIT,
      ),
    ).toBe("not-ready");
    const result = await findBurgsByReligionTool.execute({ religion: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
