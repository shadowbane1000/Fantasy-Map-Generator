import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindOrphanCellsTool,
  DEFAULT_FIND_ORPHAN_CELLS_LIMIT,
  defaultFindOrphanCellsRuntime,
  type FindOrphanCellsResult,
  type FindOrphanCellsRuntime,
  findOrphanCellsInPack,
  findOrphanCellsTool,
  MAX_FIND_ORPHAN_CELLS_LIMIT,
} from "./find-orphan-cells";

interface FakePack {
  cells: {
    state: number[];
    h: number[];
  };
}

function makePack(): FakePack {
  // 10 cells with mixed state + height:
  //   i=0  state=0  h=5   → orphan water
  //   i=1  state=0  h=18  → orphan water
  //   i=2  state=1  h=20  → assigned land (not orphan)
  //   i=3  state=0  h=20  → orphan land (shore)
  //   i=4  state=0  h=35  → orphan land
  //   i=5  state=2  h=50  → assigned
  //   i=6  state=0  h=60  → orphan land
  //   i=7  state=1  h=0   → assigned water
  //   i=8  state=0  h=80  → orphan land
  //   i=9  state=0  h=19  → orphan water (just below shore)
  return {
    cells: {
      state: [0, 0, 1, 0, 0, 2, 0, 1, 0, 0],
      h: [5, 18, 20, 20, 35, 50, 60, 0, 80, 19],
    },
  };
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findOrphanCellsInPack>[0];
}

function runtimeReturning(
  result: FindOrphanCellsResult,
): FindOrphanCellsRuntime {
  return { find: () => result };
}

function realRuntime(): FindOrphanCellsRuntime {
  const pack = asPack(makePack());
  return {
    find: (includeWater, limit) =>
      findOrphanCellsInPack(pack, includeWater, limit),
  };
}

describe("find_orphan_cells — pure collector", () => {
  it("collects land-only orphans by default (include_water=false)", () => {
    const result = findOrphanCellsInPack(
      asPack(makePack()),
      false,
      DEFAULT_FIND_ORPHAN_CELLS_LIMIT,
    );
    // Orphan land cells: 3 (h=20), 4 (h=35), 6 (h=60), 8 (h=80).
    expect(result).toEqual({ cells: [3, 4, 6, 8], count: 4 });
  });

  it("include_water=true returns every state===0 cell regardless of height", () => {
    const result = findOrphanCellsInPack(
      asPack(makePack()),
      true,
      DEFAULT_FIND_ORPHAN_CELLS_LIMIT,
    );
    // Every cell with state===0: 0, 1, 3, 4, 6, 8, 9.
    expect(result).toEqual({ cells: [0, 1, 3, 4, 6, 8, 9], count: 7 });
  });

  it("returns empty cells and count=0 when no cell is orphaned", () => {
    const pack = makePack();
    // Assign every cell to state 1.
    for (let k = 0; k < pack.cells.state.length; k++) pack.cells.state[k] = 1;
    const result = findOrphanCellsInPack(
      asPack(pack),
      false,
      DEFAULT_FIND_ORPHAN_CELLS_LIMIT,
    );
    expect(result).toEqual({ cells: [], count: 0 });
  });

  it("returns empty cells when every orphan is water and include_water=false", () => {
    const pack = makePack();
    // Flip every orphan land cell to state 1 so only orphan water remains.
    for (let k = 0; k < pack.cells.state.length; k++) {
      if (pack.cells.state[k] === 0 && pack.cells.h[k] >= 20) {
        pack.cells.state[k] = 1;
      }
    }
    const result = findOrphanCellsInPack(
      asPack(pack),
      false,
      DEFAULT_FIND_ORPHAN_CELLS_LIMIT,
    );
    expect(result).toEqual({ cells: [], count: 0 });
    const withWater = findOrphanCellsInPack(
      asPack(pack),
      true,
      DEFAULT_FIND_ORPHAN_CELLS_LIMIT,
    );
    // Orphan water cells still present: 0, 1, 9.
    expect(withWater).toEqual({ cells: [0, 1, 9], count: 3 });
  });

  it("truncates `cells` at limit but preserves full `count`", () => {
    const result = findOrphanCellsInPack(asPack(makePack()), true, 3);
    expect(result).toEqual({ cells: [0, 1, 3], count: 7 });
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(
      findOrphanCellsInPack(undefined, false, DEFAULT_FIND_ORPHAN_CELLS_LIMIT),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.cells is missing", () => {
    const pack = {} as unknown as Parameters<typeof findOrphanCellsInPack>[0];
    expect(
      findOrphanCellsInPack(pack, false, DEFAULT_FIND_ORPHAN_CELLS_LIMIT),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.cells.state is missing", () => {
    const pack = { cells: { h: [20, 30] } } as unknown as Parameters<
      typeof findOrphanCellsInPack
    >[0];
    expect(
      findOrphanCellsInPack(pack, false, DEFAULT_FIND_ORPHAN_CELLS_LIMIT),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.cells.h is missing and include_water=false", () => {
    const pack = { cells: { state: [0, 1, 0] } } as unknown as Parameters<
      typeof findOrphanCellsInPack
    >[0];
    expect(
      findOrphanCellsInPack(pack, false, DEFAULT_FIND_ORPHAN_CELLS_LIMIT),
    ).toBe("not-ready");
  });

  it("allows missing pack.cells.h when include_water=true", () => {
    const pack = { cells: { state: [0, 1, 0, 2] } } as unknown as Parameters<
      typeof findOrphanCellsInPack
    >[0];
    const result = findOrphanCellsInPack(
      pack,
      true,
      DEFAULT_FIND_ORPHAN_CELLS_LIMIT,
    );
    expect(result).toEqual({ cells: [0, 2], count: 2 });
  });
});

describe("find_orphan_cells — tool surface", () => {
  it("returns ok=true with land-only orphans by default", async () => {
    const tool = createFindOrphanCellsTool(realRuntime());
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      cells: [3, 4, 6, 8],
      count: 4,
      include_water: false,
    });
  });

  it("accepts include_water=true and returns water + land orphans", async () => {
    const tool = createFindOrphanCellsTool(realRuntime());
    const result = await tool.execute({ include_water: true });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      cells: [0, 1, 3, 4, 6, 8, 9],
      count: 7,
      include_water: true,
    });
  });

  it("respects limit and still reports full count", async () => {
    const tool = createFindOrphanCellsTool(realRuntime());
    const result = await tool.execute({ include_water: true, limit: 3 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.cells).toHaveLength(3);
    expect(body.count).toBe(7);
  });

  it("applies default limit when omitted", async () => {
    let receivedLimit = -1;
    const runtime: FindOrphanCellsRuntime = {
      find: (_includeWater, limit) => {
        receivedLimit = limit;
        return { cells: [], count: 0 };
      },
    };
    const tool = createFindOrphanCellsTool(runtime);
    await tool.execute({});
    expect(receivedLimit).toBe(DEFAULT_FIND_ORPHAN_CELLS_LIMIT);
  });

  it("applies default include_water=false when omitted", async () => {
    let receivedIncludeWater: boolean | null = null;
    const runtime: FindOrphanCellsRuntime = {
      find: (includeWater, _limit) => {
        receivedIncludeWater = includeWater;
        return { cells: [], count: 0 };
      },
    };
    const tool = createFindOrphanCellsTool(runtime);
    await tool.execute({});
    expect(receivedIncludeWater).toBe(false);
  });

  it("rejects non-boolean include_water", async () => {
    const tool = createFindOrphanCellsTool(realRuntime());
    for (const bad of [
      { include_water: "true" },
      { include_water: 1 },
      { include_water: 0 },
      { include_water: {} },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /include_water must be a boolean/,
      );
    }
  });

  it("rejects invalid limit", async () => {
    const tool = createFindOrphanCellsTool(realRuntime());
    for (const bad of [
      { limit: 0 },
      { limit: -1 },
      { limit: 1.5 },
      { limit: "10" },
      { limit: MAX_FIND_ORPHAN_CELLS_LIMIT + 1 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/limit must be an integer/);
    }
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createFindOrphanCellsTool(runtimeReturning("not-ready"));
    const r = await tool.execute({});
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not ready/i);
  });

  it("is exported as findOrphanCellsTool with the expected schema", () => {
    expect(findOrphanCellsTool.name).toBe("find_orphan_cells");
    expect(findOrphanCellsTool.input_schema.type).toBe("object");
    expect(findOrphanCellsTool.input_schema.required).toBeUndefined();
    expect(
      findOrphanCellsTool.input_schema.properties.include_water,
    ).toBeDefined();
    expect(findOrphanCellsTool.input_schema.properties.limit).toBeDefined();
  });

  it("exposes DEFAULT / MAX limit constants", () => {
    expect(DEFAULT_FIND_ORPHAN_CELLS_LIMIT).toBe(10000);
    expect(MAX_FIND_ORPHAN_CELLS_LIMIT).toBe(100000);
  });
});

// ----- defaultFindOrphanCellsRuntime integration -----

describe("defaultFindOrphanCellsRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as {
    pack?: unknown;
  };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("reads real pack via the default runtime (happy path)", () => {
    const result = defaultFindOrphanCellsRuntime.find(
      false,
      DEFAULT_FIND_ORPHAN_CELLS_LIMIT,
    );
    expect(result).toEqual({ cells: [3, 4, 6, 8], count: 4 });
  });

  it("tool uses default runtime to resolve against globals", async () => {
    const result = await findOrphanCellsTool.execute({ include_water: true });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      cells: [0, 1, 3, 4, 6, 8, 9],
      count: 7,
      include_water: true,
    });
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(
      defaultFindOrphanCellsRuntime.find(
        false,
        DEFAULT_FIND_ORPHAN_CELLS_LIMIT,
      ),
    ).toBe("not-ready");
    const result = await findOrphanCellsTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
