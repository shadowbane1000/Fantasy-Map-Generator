import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createGetProvinceInfoTool,
  defaultProvinceInfoRuntime,
  getProvinceInfoTool,
  type PopulationRates,
  type ProvinceInfo,
  type ProvinceInfoPackLike,
  type ProvinceInfoRuntime,
  type ReadProvinceResult,
  readProvinceInfoFromPack,
} from "./get-province-info";

interface FakeProvince {
  i: number;
  name?: string;
  fullName?: string;
  formName?: string;
  color?: string;
  state?: number;
  burg?: number;
  center?: number;
  coa?: { custom?: boolean; [key: string]: unknown };
  lock?: boolean;
  removed?: boolean;
}

interface FakeState {
  i: number;
  name?: string;
  removed?: boolean;
}

interface FakeBurg {
  i: number;
  name?: string;
  cell?: number;
  x?: number;
  y?: number;
  population?: number;
  removed?: boolean;
}

interface FakePack {
  provinces: Array<FakeProvince | undefined>;
  states: Array<FakeState | undefined>;
  burgs: Array<FakeBurg | undefined>;
  cells: {
    p: Array<[number, number] | undefined>;
    province: number[];
    pop: number[];
    area: number[];
  };
}

function makePack(): FakePack {
  return {
    provinces: [
      { i: 0, name: "placeholder" },
      {
        i: 1,
        name: "Rookmark",
        fullName: "The Principality of Rookmark",
        formName: "Principality",
        color: "#aabbcc",
        state: 3,
        burg: 7,
        center: 42,
        coa: { shield: "heater", custom: true },
        lock: false,
      },
      { i: 2, name: "Elsewhere", state: 4, burg: 8, center: 20 },
      {
        i: 3,
        name: "Ashgard",
        fullName: "The Duchy of Ashgard",
        state: 3,
        burg: 0,
      },
      { i: 4, name: "Removed", state: 3, removed: true },
    ],
    states: [
      { i: 0, name: "Neutrals" },
      undefined,
      undefined,
      { i: 3, name: "Altaria" },
      { i: 4, name: "Seakingdom" },
    ],
    burgs: [
      { i: 0, name: "placeholder" },
      {
        i: 1,
        name: "Ironhold",
        cell: 10,
        x: 10,
        y: 20,
        population: 5,
      },
      undefined,
      undefined,
      undefined,
      {
        i: 5,
        name: "OldStormport",
        cell: 11,
        x: 0,
        y: 0,
        population: 8,
        removed: true,
      },
      undefined,
      {
        i: 7,
        name: "Stormport",
        cell: 42,
        x: 100,
        y: 200,
        population: 12,
      },
      { i: 8, name: "Elseburg", cell: 20, x: 1, y: 1, population: 2 },
      { i: 9, name: "Outerhold", cell: 50, x: 300, y: 400, population: 3 },
    ],
    cells: {
      p: new Array(100).fill(undefined) as Array<[number, number] | undefined>,
      province: new Array(100).fill(0),
      pop: new Array(100).fill(0),
      area: new Array(100).fill(0),
    },
  };
}

function seedCells(pack: FakePack): FakePack {
  pack.cells.p[42] = [500, 600];
  // Province 1 covers cells 10, 11, 42, 50.
  pack.cells.province[10] = 1;
  pack.cells.province[11] = 1;
  pack.cells.province[42] = 1;
  pack.cells.province[50] = 1;
  // Province 2 covers cell 20.
  pack.cells.province[20] = 2;
  // Per-cell populations (rural).
  pack.cells.pop[10] = 4;
  pack.cells.pop[11] = 6;
  pack.cells.pop[42] = 10;
  pack.cells.pop[50] = 5;
  pack.cells.pop[20] = 2;
  // Areas.
  pack.cells.area[10] = 11;
  pack.cells.area[11] = 22;
  pack.cells.area[42] = 33;
  pack.cells.area[50] = 44;
  pack.cells.area[20] = 7;
  return pack;
}

function makeRates(overrides: Partial<PopulationRates> = {}): PopulationRates {
  return { populationRate: 1000, urbanization: 2, ...overrides };
}

function runtimeReturning(result: ReadProvinceResult): ProvinceInfoRuntime {
  return { readProvince: () => result };
}

describe("get_province_info tool — pure / seam", () => {
  it("returns all fields for a fully populated province", async () => {
    const pack = seedCells(makePack());
    const info = readProvinceInfoFromPack(
      pack as ProvinceInfoPackLike,
      makeRates(),
      1,
    );
    expect(info).not.toBe("not-ready");
    expect(info).not.toBe("not-found");
    expect(info).not.toBe("placeholder");
    const tool = createGetProvinceInfoTool(runtimeReturning(info));
    const result = await tool.execute({ province: 1 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.i).toBe(1);
    expect(body.name).toBe("Rookmark");
    expect(body.fullName).toBe("The Principality of Rookmark");
    expect(body.formName).toBe("Principality");
    expect(body.color).toBe("#aabbcc");
    expect(body.state).toEqual({ id: 3, name: "Altaria" });
    expect(body.capital).toEqual({
      id: 7,
      name: "Stormport",
      x: 100,
      y: 200,
    });
    expect(body.center).toEqual({ cell: 42, x: 500, y: 600 });
    // Cells 10, 11, 42, 50 -> 4.
    expect(body.cells_count).toBe(4);
    // Area sum: 11 + 22 + 33 + 44 = 110.
    expect(body.area).toBe(110);
    expect(body.coa).toEqual({ present: true, custom: true });
    expect(body.lock).toBe(false);
  });

  it("resolves state { id, name } from pack.states[province.state]", () => {
    const pack = makePack();
    const info = readProvinceInfoFromPack(
      pack as ProvinceInfoPackLike,
      makeRates(),
      1,
    ) as ProvinceInfo;
    expect(info.state).toEqual({ id: 3, name: "Altaria" });
  });

  it("state is { id, name: null } when id is out of range", () => {
    const pack = makePack();
    const p = pack.provinces[1];
    if (p) p.state = 99;
    const info = readProvinceInfoFromPack(
      pack as ProvinceInfoPackLike,
      makeRates(),
      1,
    ) as ProvinceInfo;
    expect(info.state).toEqual({ id: 99, name: null });
  });

  it("state is null when province.state is unset", () => {
    const pack = makePack();
    const p = pack.provinces[1];
    if (p) p.state = undefined;
    const info = readProvinceInfoFromPack(
      pack as ProvinceInfoPackLike,
      makeRates(),
      1,
    ) as ProvinceInfo;
    expect(info.state).toBeNull();
  });

  it("capital is null when province.burg is 0 or missing", () => {
    const pack = seedCells(makePack());
    const info = readProvinceInfoFromPack(
      pack as ProvinceInfoPackLike,
      makeRates(),
      3,
    ) as ProvinceInfo;
    expect(info.capital).toBeNull();
  });

  it("capital slot pointing at a removed burg still echoes the id", () => {
    const pack = seedCells(makePack());
    const p = pack.provinces[1];
    if (p) p.burg = 5; // burg 5 is removed
    const info = readProvinceInfoFromPack(
      pack as ProvinceInfoPackLike,
      makeRates(),
      1,
    ) as ProvinceInfo;
    expect(info.capital).toEqual({ id: 5, name: null, x: null, y: null });
  });

  it("center is populated from pack.cells.p[province.center]; null when absent", () => {
    const pack = seedCells(makePack());
    const info = readProvinceInfoFromPack(
      pack as ProvinceInfoPackLike,
      makeRates(),
      1,
    ) as ProvinceInfo;
    expect(info.center).toEqual({ cell: 42, x: 500, y: 600 });

    const p = pack.provinces[1];
    if (p) p.center = undefined;
    const info2 = readProvinceInfoFromPack(
      pack as ProvinceInfoPackLike,
      makeRates(),
      1,
    ) as ProvinceInfo;
    expect(info2.center).toBeNull();
  });

  it("cells_count counts cells where pack.cells.province === i", () => {
    const pack = seedCells(makePack());
    const info = readProvinceInfoFromPack(
      pack as ProvinceInfoPackLike,
      makeRates(),
      2,
    ) as ProvinceInfo;
    // Only cell 20 is in province 2.
    expect(info.cells_count).toBe(1);
  });

  it("burgs lists only non-removed burgs inside the province, sorted by id", () => {
    const pack = seedCells(makePack());
    const info = readProvinceInfoFromPack(
      pack as ProvinceInfoPackLike,
      makeRates(),
      1,
    ) as ProvinceInfo;
    // Province 1 cells: 10 (Ironhold #1), 11 (OldStormport #5 removed),
    // 42 (Stormport #7), 50 (Outerhold #9).
    expect(info.burgs).toEqual([
      { id: 1, name: "Ironhold" },
      { id: 7, name: "Stormport" },
      { id: 9, name: "Outerhold" },
    ]);
  });

  it("population totals apply rates correctly", () => {
    const pack = seedCells(makePack());
    // Province 1: rural pop cells = 4+6+10+5 = 25; urban from burgs
    // 1 (5) + 7 (12) + 9 (3) = 20 (burg 5 removed excluded).
    // populationRate=1000, urbanization=2.
    const info = readProvinceInfoFromPack(
      pack as ProvinceInfoPackLike,
      makeRates(),
      1,
    ) as ProvinceInfo;
    // rural * rate = 25 * 1000 = 25000
    expect(info.rural_population).toBe(25000);
    // urban * rate * urbanization = 20 * 1000 * 2 = 40000
    expect(info.urban_population).toBe(40000);
    // total = urban + rural = 65000
    expect(info.population_total).toBe(65000);
  });

  it("coa present/custom reflects province.coa / province.coa.custom", () => {
    const pack = makePack();
    const info = readProvinceInfoFromPack(
      pack as ProvinceInfoPackLike,
      makeRates(),
      1,
    ) as ProvinceInfo;
    expect(info.coa).toEqual({ present: true, custom: true });

    const pack2 = makePack();
    const p = pack2.provinces[1];
    if (p) p.coa = { shield: "heater" }; // no custom flag
    const info2 = readProvinceInfoFromPack(
      pack2 as ProvinceInfoPackLike,
      makeRates(),
      1,
    ) as ProvinceInfo;
    expect(info2.coa).toEqual({ present: true, custom: false });

    const pack3 = makePack();
    const p3 = pack3.provinces[1];
    if (p3) p3.coa = undefined;
    const info3 = readProvinceInfoFromPack(
      pack3 as ProvinceInfoPackLike,
      makeRates(),
      1,
    ) as ProvinceInfo;
    expect(info3.coa).toEqual({ present: false, custom: false });
  });

  it("lock pass-through defaults false", () => {
    const pack = makePack();
    const info = readProvinceInfoFromPack(
      pack as ProvinceInfoPackLike,
      makeRates(),
      1,
    ) as ProvinceInfo;
    expect(info.lock).toBe(false);

    const pack2 = makePack();
    const p = pack2.provinces[1];
    if (p) p.lock = true;
    const info2 = readProvinceInfoFromPack(
      pack2 as ProvinceInfoPackLike,
      makeRates(),
      1,
    ) as ProvinceInfo;
    expect(info2.lock).toBe(true);
  });

  it("string-ref resolves by case-insensitive name or fullName", () => {
    const pack = seedCells(makePack());
    const byName = readProvinceInfoFromPack(
      pack as ProvinceInfoPackLike,
      makeRates(),
      "rookmark",
    ) as ProvinceInfo;
    expect(byName.i).toBe(1);

    const byFullName = readProvinceInfoFromPack(
      pack as ProvinceInfoPackLike,
      makeRates(),
      "THE PRINCIPALITY OF ROOKMARK",
    ) as ProvinceInfo;
    expect(byFullName.i).toBe(1);
  });

  it("returns 'not-found' for unknown / removed refs", () => {
    const pack = makePack();
    expect(
      readProvinceInfoFromPack(pack as ProvinceInfoPackLike, makeRates(), 99),
    ).toBe("not-found");
    expect(
      readProvinceInfoFromPack(
        pack as ProvinceInfoPackLike,
        makeRates(),
        "removed",
      ),
    ).toBe("not-found");
    expect(
      readProvinceInfoFromPack(
        pack as ProvinceInfoPackLike,
        makeRates(),
        "nonexistent",
      ),
    ).toBe("not-found");
  });

  it("returns 'placeholder' for province 0", () => {
    const pack = makePack();
    expect(
      readProvinceInfoFromPack(pack as ProvinceInfoPackLike, makeRates(), 0),
    ).toBe("placeholder");
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(readProvinceInfoFromPack(undefined, makeRates(), 1)).toBe(
      "not-ready",
    );
    expect(
      readProvinceInfoFromPack(
        { provinces: undefined } as ProvinceInfoPackLike,
        makeRates(),
        1,
      ),
    ).toBe("not-ready");
  });

  it("tool rejects province 0 directly with a clear message", async () => {
    const tool = createGetProvinceInfoTool(runtimeReturning("placeholder"));
    const result = await tool.execute({ province: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/placeholder/i);
  });

  it("tool rejects non-integer / missing province via parseEntityRef", async () => {
    const pack = makePack();
    const tool = createGetProvinceInfoTool({
      readProvince: (ref) =>
        readProvinceInfoFromPack(
          pack as ProvinceInfoPackLike,
          makeRates(),
          ref,
        ),
    });
    for (const bad of [
      {},
      { province: 1.5 },
      { province: null },
      { province: "" },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /positive integer id or a non-empty name/i,
      );
    }
  });

  it("tool surfaces not-found as a structured error with the ref quoted", async () => {
    const tool = createGetProvinceInfoTool(runtimeReturning("not-found"));
    const result = await tool.execute({ province: "foo" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/No province found/i);
    expect(JSON.parse(result.content).error).toMatch(/"foo"/);
  });

  it("tool surfaces not-ready as a structured error", async () => {
    const tool = createGetProvinceInfoTool(runtimeReturning("not-ready"));
    const result = await tool.execute({ province: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("is exported as getProvinceInfoTool with the expected schema", () => {
    expect(getProvinceInfoTool.name).toBe("get_province_info");
    expect(getProvinceInfoTool.input_schema.type).toBe("object");
    expect(getProvinceInfoTool.input_schema.required).toEqual(["province"]);
    expect(getProvinceInfoTool.input_schema.properties.province).toBeDefined();
  });
});

// ----- defaultProvinceInfoRuntime integration -----

describe("defaultProvinceInfoRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as {
    pack?: unknown;
    populationRate?: unknown;
    urbanization?: unknown;
  };
  const originalPack = globalsRef.pack;
  const originalRate = globalsRef.populationRate;
  const originalUrban = globalsRef.urbanization;

  beforeEach(() => {
    globalsRef.pack = seedCells(makePack()) as unknown;
    globalsRef.populationRate = 1000;
    globalsRef.urbanization = 2;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
    globalsRef.populationRate = originalRate;
    globalsRef.urbanization = originalUrban;
  });

  it("reads a real packed province through the default runtime", () => {
    const info = defaultProvinceInfoRuntime.readProvince(1);
    expect(info).not.toBe("not-ready");
    expect(info).not.toBe("not-found");
    expect(info).not.toBe("placeholder");
    const pi = info as ProvinceInfo;
    expect(pi.i).toBe(1);
    expect(pi.name).toBe("Rookmark");
    expect(pi.state).toEqual({ id: 3, name: "Altaria" });
    expect(pi.capital?.name).toBe("Stormport");
    expect(pi.cells_count).toBe(4);
  });

  it("returns 'not-ready' when pack is missing", async () => {
    globalsRef.pack = undefined;
    expect(defaultProvinceInfoRuntime.readProvince(1)).toBe("not-ready");
    const result = await getProvinceInfoTool.execute({ province: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("returns 'not-found' for unknown province id", async () => {
    expect(defaultProvinceInfoRuntime.readProvince(999)).toBe("not-found");
    const result = await getProvinceInfoTool.execute({ province: 999 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/No province found/i);
  });
});
