import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type CultureInfo,
  type CultureInfoPackLike,
  type CultureInfoRuntime,
  createGetCultureInfoTool,
  defaultCultureInfoRuntime,
  getCultureInfoTool,
  type NameBaseEntry,
  type PopulationRates,
  type ReadCultureResult,
  readCultureInfoFromPack,
} from "./get-culture-info";

interface FakeCulture {
  i: number;
  name?: string;
  color?: string;
  type?: string;
  base?: number;
  shield?: string;
  code?: string;
  cells?: number;
  area?: number;
  rural?: number;
  urban?: number;
  expansionism?: number;
  origins?: number[];
  center?: number;
  lock?: boolean;
  removed?: boolean;
}

interface FakeState {
  i: number;
  name?: string;
  culture?: number;
  removed?: boolean;
}

interface FakeBurg {
  i: number;
  name?: string;
  cell?: number;
  culture?: number;
  removed?: boolean;
}

interface FakePack {
  cultures: Array<FakeCulture | undefined>;
  burgs: Array<FakeBurg | undefined>;
  states: Array<FakeState | undefined>;
  cells: {
    p: Array<[number, number] | undefined>;
    culture: number[];
  };
}

function makePack(): FakePack {
  return {
    cultures: [
      { i: 0, name: "Wildlands", base: 0 },
      undefined,
      {
        i: 2,
        name: "Highlanders",
        color: "#a0b0c0",
        type: "Highland",
        base: 3,
        shield: "oldFrench",
        code: "Hl",
        cells: 123,
        area: 5000,
        rural: 100,
        urban: 40,
        expansionism: 1.25,
        origins: [0, 1],
        center: 42,
        lock: false,
      },
      { i: 3, name: "Removed Culture", removed: true },
      { i: 4, name: "Seafarers", base: 99, rural: 10, urban: 5 },
    ],
    burgs: [
      { i: 0, name: "placeholder" },
      { i: 1, name: "Ironhold", cell: 10 }, // cell culture 2
      { i: 2, name: "Stormport", cell: 11 }, // cell culture 2
      { i: 3, name: "OldTown", cell: 12, removed: true }, // cell culture 2 but removed
      { i: 4, name: "Landfall", cell: 20 }, // cell culture 4
      { i: 5, name: "Fallback", culture: 2 }, // no cell, fallback to burg.culture
    ],
    states: [
      { i: 0, name: "Neutrals", culture: 2 },
      { i: 1, name: "Kingdom of the Hill", culture: 2 },
      { i: 2, name: "Altaria", culture: 2 },
      { i: 3, name: "Removed Realm", culture: 2, removed: true },
      { i: 4, name: "Seakingdom", culture: 4 },
    ],
    cells: {
      p: new Array(100).fill(undefined) as Array<[number, number] | undefined>,
      culture: new Array(100).fill(0),
    },
  };
}

function seedCells(pack: FakePack): FakePack {
  pack.cells.p[42] = [500, 600];
  pack.cells.culture[10] = 2;
  pack.cells.culture[11] = 2;
  pack.cells.culture[12] = 2;
  pack.cells.culture[20] = 4;
  return pack;
}

function makeRates(overrides: Partial<PopulationRates> = {}): PopulationRates {
  return { populationRate: 1000, urbanization: 2, ...overrides };
}

function makeBases(): NameBaseEntry[] {
  return [
    { name: "German" },
    { name: "Norse" },
    { name: "Celtic" },
    { name: "Elven" },
    { name: "Dwarven" },
  ];
}

function runtimeReturning(result: ReadCultureResult): CultureInfoRuntime {
  return { readCulture: () => result };
}

describe("get_culture_info tool — pure / seam", () => {
  it("returns all fields for a fully populated culture", async () => {
    const pack = seedCells(makePack());
    const info = readCultureInfoFromPack(
      pack as CultureInfoPackLike,
      makeRates(),
      makeBases(),
      2,
    );
    expect(info).not.toBe("not-ready");
    expect(info).not.toBe("not-found");
    const tool = createGetCultureInfoTool(runtimeReturning(info));
    const result = await tool.execute({ culture: 2 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.i).toBe(2);
    expect(body.name).toBe("Highlanders");
    expect(body.color).toBe("#a0b0c0");
    expect(body.type).toBe("Highland");
    expect(body.expansionism).toBe(1.25);
    expect(body.base).toEqual({ id: 3, name: "Elven" });
    expect(body.center).toEqual({ cell: 42, x: 500, y: 600 });
    expect(body.origins).toEqual([0, 1]);
    expect(body.cells_count).toBe(123);
    expect(body.area).toBe(5000);
    expect(body.shield).toBe("oldFrench");
    expect(body.lock).toBe(false);
  });

  it("allows culture id 0 (Wildlands)", () => {
    const pack = makePack();
    const info = readCultureInfoFromPack(
      pack as CultureInfoPackLike,
      makeRates(),
      makeBases(),
      0,
    ) as CultureInfo;
    expect(info).not.toBe("not-found");
    expect(info.i).toBe(0);
    expect(info.name).toBe("Wildlands");
    expect(info.base).toEqual({ id: 0, name: "German" });
  });

  it("resolves base from nameBases[culture.base]", () => {
    const pack = makePack();
    const info = readCultureInfoFromPack(
      pack as CultureInfoPackLike,
      makeRates(),
      makeBases(),
      2,
    ) as CultureInfo;
    expect(info.base).toEqual({ id: 3, name: "Elven" });
  });

  it("base resolves to { id, name: null } when index is out of range", () => {
    const pack = makePack();
    const info = readCultureInfoFromPack(
      pack as CultureInfoPackLike,
      makeRates(),
      makeBases(),
      4,
    ) as CultureInfo;
    expect(info.base).toEqual({ id: 99, name: null });
  });

  it("base is null when culture.base is absent", () => {
    const pack = makePack();
    const c = pack.cultures[2];
    if (c) c.base = undefined;
    const info = readCultureInfoFromPack(
      pack as CultureInfoPackLike,
      makeRates(),
      makeBases(),
      2,
    ) as CultureInfo;
    expect(info.base).toBeNull();
  });

  it("base is { id, name: null } when nameBases is undefined", () => {
    const pack = makePack();
    const info = readCultureInfoFromPack(
      pack as CultureInfoPackLike,
      makeRates(),
      undefined,
      2,
    ) as CultureInfo;
    expect(info.base).toEqual({ id: 3, name: null });
  });

  it("center populated from pack.cells.p[culture.center]; null when absent", () => {
    const pack = seedCells(makePack());
    const info = readCultureInfoFromPack(
      pack as CultureInfoPackLike,
      makeRates(),
      makeBases(),
      2,
    ) as CultureInfo;
    expect(info.center).toEqual({ cell: 42, x: 500, y: 600 });

    const c = pack.cultures[2];
    if (c) c.center = undefined;
    const info2 = readCultureInfoFromPack(
      pack as CultureInfoPackLike,
      makeRates(),
      makeBases(),
      2,
    ) as CultureInfo;
    expect(info2.center).toBeNull();
  });

  it("origins is copied; defaults to [] when absent", () => {
    const pack = makePack();
    const info = readCultureInfoFromPack(
      pack as CultureInfoPackLike,
      makeRates(),
      makeBases(),
      2,
    ) as CultureInfo;
    expect(info.origins).toEqual([0, 1]);

    const c = pack.cultures[2];
    if (c) c.origins = undefined;
    const info2 = readCultureInfoFromPack(
      pack as CultureInfoPackLike,
      makeRates(),
      makeBases(),
      2,
    ) as CultureInfo;
    expect(info2.origins).toEqual([]);
  });

  it("population rates apply correctly", () => {
    const pack = makePack();
    // rural=100, urban=40, populationRate=1000, urbanization=2
    const info = readCultureInfoFromPack(
      pack as CultureInfoPackLike,
      makeRates(),
      makeBases(),
      2,
    ) as CultureInfo;
    // (100 + 40) * 1000 = 140000
    expect(info.population_total).toBe(140000);
    // 40 * 1000 * 2 = 80000
    expect(info.urban_population).toBe(80000);
    // 100 * 1000 = 100000
    expect(info.rural_population).toBe(100000);
  });

  it("burgs_count counts burgs via pack.cells.culture[burg.cell]", () => {
    const pack = seedCells(makePack());
    const info = readCultureInfoFromPack(
      pack as CultureInfoPackLike,
      makeRates(),
      makeBases(),
      2,
    ) as CultureInfo;
    // Burgs on culture 2 cells: #1 (cell 10), #2 (cell 11). #3 removed. #5 fallback.
    // Expected count: Ironhold (1), Stormport (2), Fallback (5) via burg.culture fallback -> 3
    expect(info.burgs_count).toBe(3);
  });

  it("burgs_count skips removed and placeholder burgs", () => {
    const pack = seedCells(makePack());
    const info = readCultureInfoFromPack(
      pack as CultureInfoPackLike,
      makeRates(),
      makeBases(),
      4,
    ) as CultureInfo;
    // culture 4: only burg #4 (cell 20 → culture 4)
    expect(info.burgs_count).toBe(1);
  });

  it("states_count counts only state.culture === i && !removed && i > 0", () => {
    const pack = makePack();
    const info = readCultureInfoFromPack(
      pack as CultureInfoPackLike,
      makeRates(),
      makeBases(),
      2,
    ) as CultureInfo;
    // State 0 skipped, state 1 and 2 match, state 3 removed.
    expect(info.states_count).toBe(2);
  });

  it("shield / lock pass through with defaults", () => {
    const pack = makePack();
    const info = readCultureInfoFromPack(
      pack as CultureInfoPackLike,
      makeRates(),
      makeBases(),
      2,
    ) as CultureInfo;
    expect(info.shield).toBe("oldFrench");
    expect(info.lock).toBe(false);

    const pack2 = makePack();
    const c = pack2.cultures[2];
    if (c) {
      c.lock = true;
      c.shield = undefined;
    }
    const info2 = readCultureInfoFromPack(
      pack2 as CultureInfoPackLike,
      makeRates(),
      makeBases(),
      2,
    ) as CultureInfo;
    expect(info2.lock).toBe(true);
    expect(info2.shield).toBeNull();
  });

  it("string-ref resolves by case-insensitive name", () => {
    const pack = makePack();
    const info = readCultureInfoFromPack(
      pack as CultureInfoPackLike,
      makeRates(),
      makeBases(),
      "HIGHLANDERS",
    ) as CultureInfo;
    expect(info.i).toBe(2);
  });

  it("returns 'not-found' for unknown / removed refs", () => {
    const pack = makePack();
    expect(
      readCultureInfoFromPack(
        pack as CultureInfoPackLike,
        makeRates(),
        makeBases(),
        99,
      ),
    ).toBe("not-found");
    expect(
      readCultureInfoFromPack(
        pack as CultureInfoPackLike,
        makeRates(),
        makeBases(),
        "removed culture",
      ),
    ).toBe("not-found");
    expect(
      readCultureInfoFromPack(
        pack as CultureInfoPackLike,
        makeRates(),
        makeBases(),
        "nonexistent",
      ),
    ).toBe("not-found");
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(
      readCultureInfoFromPack(undefined, makeRates(), makeBases(), 2),
    ).toBe("not-ready");
    expect(
      readCultureInfoFromPack(
        { cultures: undefined } as CultureInfoPackLike,
        makeRates(),
        makeBases(),
        2,
      ),
    ).toBe("not-ready");
  });

  it("is exported as getCultureInfoTool with the expected schema", () => {
    expect(getCultureInfoTool.name).toBe("get_culture_info");
    expect(getCultureInfoTool.input_schema.type).toBe("object");
    expect(getCultureInfoTool.input_schema.required).toEqual(["culture"]);
    expect(getCultureInfoTool.input_schema.properties.culture).toBeDefined();
  });

  it("tool rejects non-integer / missing / negative culture", async () => {
    const pack = makePack();
    const tool = createGetCultureInfoTool({
      readCulture: (ref) =>
        readCultureInfoFromPack(
          pack as CultureInfoPackLike,
          makeRates(),
          makeBases(),
          ref,
        ),
    });
    for (const bad of [
      {},
      { culture: 1.5 },
      { culture: null },
      { culture: "" },
      { culture: -1 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /non-negative integer id or a non-empty name/i,
      );
    }
  });

  it("tool surfaces not-found as a structured error with the ref quoted", async () => {
    const tool = createGetCultureInfoTool(runtimeReturning("not-found"));
    const result = await tool.execute({ culture: "foo" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/No culture found/i);
    expect(JSON.parse(result.content).error).toMatch(/"foo"/);
  });

  it("tool surfaces not-ready as a structured error", async () => {
    const tool = createGetCultureInfoTool(runtimeReturning("not-ready"));
    const result = await tool.execute({ culture: 2 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});

// ----- defaultCultureInfoRuntime integration -----

describe("defaultCultureInfoRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as {
    pack?: unknown;
    populationRate?: unknown;
    urbanization?: unknown;
    nameBases?: unknown;
  };
  const originalPack = globalsRef.pack;
  const originalRate = globalsRef.populationRate;
  const originalUrban = globalsRef.urbanization;
  const originalBases = globalsRef.nameBases;

  beforeEach(() => {
    globalsRef.pack = seedCells(makePack()) as unknown;
    globalsRef.populationRate = 1000;
    globalsRef.urbanization = 2;
    globalsRef.nameBases = makeBases() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
    globalsRef.populationRate = originalRate;
    globalsRef.urbanization = originalUrban;
    globalsRef.nameBases = originalBases;
  });

  it("reads a real packed culture through the default runtime", () => {
    const info = defaultCultureInfoRuntime.readCulture(2);
    expect(info).not.toBe("not-ready");
    expect(info).not.toBe("not-found");
    const ci = info as CultureInfo;
    expect(ci.i).toBe(2);
    expect(ci.name).toBe("Highlanders");
    expect(ci.base).toEqual({ id: 3, name: "Elven" });
    expect(ci.center).toEqual({ cell: 42, x: 500, y: 600 });
  });

  it("allows culture 0 through the default runtime", () => {
    const info = defaultCultureInfoRuntime.readCulture(0);
    expect(info).not.toBe("not-ready");
    expect(info).not.toBe("not-found");
    const ci = info as CultureInfo;
    expect(ci.i).toBe(0);
    expect(ci.name).toBe("Wildlands");
  });

  it("returns 'not-ready' when pack is missing", async () => {
    globalsRef.pack = undefined;
    expect(defaultCultureInfoRuntime.readCulture(2)).toBe("not-ready");
    const result = await getCultureInfoTool.execute({ culture: 2 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("returns 'not-found' for unknown culture id", async () => {
    expect(defaultCultureInfoRuntime.readCulture(999)).toBe("not-found");
    const result = await getCultureInfoTool.execute({ culture: 999 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/No culture found/i);
  });
});
