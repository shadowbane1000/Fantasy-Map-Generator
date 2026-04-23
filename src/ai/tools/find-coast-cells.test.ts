import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindCoastCellsTool,
  DEFAULT_FIND_COAST_CELLS_LIMIT,
  defaultFindCoastCellsRuntime,
  type FindCoastCellsResult,
  type FindCoastCellsRuntime,
  type FindCoastSide,
  findCoastCellsInPack,
  findCoastCellsTool,
  MAX_FIND_COAST_CELLS_LIMIT,
} from "./find-coast-cells";

interface FakePack {
  cells: {
    t: number[];
  };
}

function makePack(): FakePack {
  // 12 cells with a mix of every markup value:
  //   -2 = DEEP_WATER, -1 = WATER_COAST, 0 = unmarked,
  //    1 = LAND_COAST, 2 = LANDLOCKED, 3 = DEEPER_LAND.
  // Coast land indices: 3, 7, 11.
  // Coast water indices: 1, 6.
  // Everything else is non-coast.
  return {
    cells: {
      t: [-2, -1, -2, 1, 2, 3, -1, 1, 3, 0, 2, 1],
    },
  };
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findCoastCellsInPack>[0];
}

function runtimeReturning(result: FindCoastCellsResult): FindCoastCellsRuntime {
  return { find: () => result };
}

function realRuntime(): FindCoastCellsRuntime {
  const pack = asPack(makePack());
  return {
    find: (side, limit) => findCoastCellsInPack(pack, side, limit),
  };
}

describe("find_coast_cells — pure collector", () => {
  it("collects LAND_COAST cells (t === 1) for side='land'", () => {
    const result = findCoastCellsInPack(
      asPack(makePack()),
      "land",
      DEFAULT_FIND_COAST_CELLS_LIMIT,
    );
    expect(result).toEqual({ cells: [3, 7, 11], count: 3 });
  });

  it("collects WATER_COAST cells (t === -1) for side='water'", () => {
    const result = findCoastCellsInPack(
      asPack(makePack()),
      "water",
      DEFAULT_FIND_COAST_CELLS_LIMIT,
    );
    expect(result).toEqual({ cells: [1, 6], count: 2 });
  });

  it("collects both ±1 cells for side='all'", () => {
    const result = findCoastCellsInPack(
      asPack(makePack()),
      "all",
      DEFAULT_FIND_COAST_CELLS_LIMIT,
    );
    expect(result).toEqual({ cells: [1, 3, 6, 7, 11], count: 5 });
  });

  it("skips ±2 (landlocked / deep water) and ±3 (deeper land)", () => {
    // None of the non-coast values should sneak in for any side.
    for (const side of ["land", "water", "all"] as FindCoastSide[]) {
      const result = findCoastCellsInPack(
        asPack(makePack()),
        side,
        DEFAULT_FIND_COAST_CELLS_LIMIT,
      );
      if (result === "not-ready") throw new Error("unexpected not-ready");
      for (const i of result.cells) {
        expect(Math.abs(makePack().cells.t[i])).toBe(1);
      }
    }
  });

  it("returns empty cells and count=0 when no cell matches the side", () => {
    // Zero out every coast cell so no ±1 remains.
    const pack = makePack();
    for (let k = 0; k < pack.cells.t.length; k++) {
      if (pack.cells.t[k] === 1 || pack.cells.t[k] === -1) pack.cells.t[k] = 0;
    }
    expect(
      findCoastCellsInPack(
        asPack(pack),
        "land",
        DEFAULT_FIND_COAST_CELLS_LIMIT,
      ),
    ).toEqual({ cells: [], count: 0 });
    expect(
      findCoastCellsInPack(
        asPack(pack),
        "water",
        DEFAULT_FIND_COAST_CELLS_LIMIT,
      ),
    ).toEqual({ cells: [], count: 0 });
    expect(
      findCoastCellsInPack(asPack(pack), "all", DEFAULT_FIND_COAST_CELLS_LIMIT),
    ).toEqual({ cells: [], count: 0 });
  });

  it("truncates `cells` at limit but preserves full `count`", () => {
    const result = findCoastCellsInPack(asPack(makePack()), "all", 2);
    expect(result).toEqual({ cells: [1, 3], count: 5 });
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(
      findCoastCellsInPack(undefined, "land", DEFAULT_FIND_COAST_CELLS_LIMIT),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.cells is missing", () => {
    const pack = {} as unknown as Parameters<typeof findCoastCellsInPack>[0];
    expect(
      findCoastCellsInPack(pack, "land", DEFAULT_FIND_COAST_CELLS_LIMIT),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.cells.t is missing", () => {
    const pack = { cells: {} } as unknown as Parameters<
      typeof findCoastCellsInPack
    >[0];
    expect(
      findCoastCellsInPack(pack, "land", DEFAULT_FIND_COAST_CELLS_LIMIT),
    ).toBe("not-ready");
  });
});

describe("find_coast_cells — tool surface", () => {
  it("returns ok=true with land coast cells when side is omitted", async () => {
    const tool = createFindCoastCellsTool(realRuntime());
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      side: "land",
      cells: [3, 7, 11],
      count: 3,
    });
  });

  it("returns water coast cells for side='water'", async () => {
    const tool = createFindCoastCellsTool(realRuntime());
    const result = await tool.execute({ side: "water" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      side: "water",
      cells: [1, 6],
      count: 2,
    });
  });

  it("returns the full coastline for side='all'", async () => {
    const tool = createFindCoastCellsTool(realRuntime());
    const result = await tool.execute({ side: "all" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      side: "all",
      cells: [1, 3, 6, 7, 11],
      count: 5,
    });
  });

  it("accepts side case-insensitively", async () => {
    const tool = createFindCoastCellsTool(realRuntime());
    for (const side of ["LAND", "Water", "ALL"]) {
      const result = await tool.execute({ side });
      expect(result.isError).toBeFalsy();
      const body = JSON.parse(result.content);
      expect(body.side).toBe(side.toLowerCase());
    }
  });

  it("respects limit and still reports full count", async () => {
    const tool = createFindCoastCellsTool(realRuntime());
    const result = await tool.execute({ side: "all", limit: 2 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.cells).toHaveLength(2);
    expect(body.count).toBe(5);
  });

  it("rejects invalid side", async () => {
    const tool = createFindCoastCellsTool(realRuntime());
    for (const bad of [
      { side: "" },
      { side: "shore" },
      { side: "both" },
      { side: 1 },
      { side: true },
      { side: [] },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /side must be one of "land", "water", "all"/,
      );
    }
  });

  it("rejects invalid limit", async () => {
    const tool = createFindCoastCellsTool(realRuntime());
    for (const bad of [
      { limit: 0 },
      { limit: -1 },
      { limit: 1.5 },
      { limit: "10" },
      { limit: MAX_FIND_COAST_CELLS_LIMIT + 1 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/limit must be an integer/);
    }
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createFindCoastCellsTool(runtimeReturning("not-ready"));
    const r = await tool.execute({});
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not ready/i);
  });

  it("applies default side='land' and default limit when omitted", async () => {
    let receivedSide: FindCoastSide | null = null;
    let receivedLimit = -1;
    const runtime: FindCoastCellsRuntime = {
      find: (side, limit) => {
        receivedSide = side;
        receivedLimit = limit;
        return { cells: [], count: 0 };
      },
    };
    const tool = createFindCoastCellsTool(runtime);
    await tool.execute({});
    expect(receivedSide).toBe("land");
    expect(receivedLimit).toBe(DEFAULT_FIND_COAST_CELLS_LIMIT);
  });

  it("is exported as findCoastCellsTool with the expected schema", () => {
    expect(findCoastCellsTool.name).toBe("find_coast_cells");
    expect(findCoastCellsTool.input_schema.type).toBe("object");
    expect(findCoastCellsTool.input_schema.required).toEqual([]);
    expect(findCoastCellsTool.input_schema.properties.side).toBeDefined();
    expect(findCoastCellsTool.input_schema.properties.limit).toBeDefined();
    const sideProp = findCoastCellsTool.input_schema.properties
      .side as unknown as { enum: readonly string[] };
    expect(sideProp.enum).toEqual(["land", "water", "all"]);
  });

  it("exposes DEFAULT / MAX limit constants", () => {
    expect(DEFAULT_FIND_COAST_CELLS_LIMIT).toBe(10000);
    expect(MAX_FIND_COAST_CELLS_LIMIT).toBe(100000);
  });
});

// ----- defaultFindCoastCellsRuntime integration -----

describe("defaultFindCoastCellsRuntime (integration)", () => {
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

  it("reads real pack via the default runtime (happy path, land)", () => {
    const result = defaultFindCoastCellsRuntime.find(
      "land",
      DEFAULT_FIND_COAST_CELLS_LIMIT,
    );
    expect(result).toEqual({ cells: [3, 7, 11], count: 3 });
  });

  it("tool uses default runtime to resolve against globals", async () => {
    const result = await findCoastCellsTool.execute({ side: "all" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      side: "all",
      cells: [1, 3, 6, 7, 11],
      count: 5,
    });
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(
      defaultFindCoastCellsRuntime.find("land", DEFAULT_FIND_COAST_CELLS_LIMIT),
    ).toBe("not-ready");
    const result = await findCoastCellsTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("returns 'not-ready' when pack.cells.t is missing", async () => {
    globalsRef.pack = { cells: {} } as unknown;
    expect(
      defaultFindCoastCellsRuntime.find(
        "water",
        DEFAULT_FIND_COAST_CELLS_LIMIT,
      ),
    ).toBe("not-ready");
  });
});
