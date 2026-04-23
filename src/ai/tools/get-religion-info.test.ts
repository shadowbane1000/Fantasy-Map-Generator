import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createGetReligionInfoTool,
  defaultReligionInfoRuntime,
  getReligionInfoTool,
  type PopulationRates,
  type ReadReligionResult,
  type ReligionInfo,
  type ReligionInfoPackLike,
  type ReligionInfoRuntime,
  readReligionInfoFromPack,
} from "./get-religion-info";

interface FakeReligion {
  i: number;
  name?: string;
  color?: string;
  type?: string;
  form?: string;
  deity?: string | null;
  code?: string;
  culture?: number;
  center?: number;
  expansion?: string;
  expansionism?: number;
  origins?: number[];
  cells?: number;
  area?: number;
  rural?: number;
  urban?: number;
  lock?: boolean;
  removed?: boolean;
}

interface FakeBurg {
  i: number;
  name?: string;
  x?: number;
  y?: number;
  cell?: number;
  state?: number;
  removed?: boolean;
}

interface FakeCulture {
  i: number;
  name?: string;
  removed?: boolean;
}

interface FakeState {
  i: number;
  name?: string;
  capital?: number;
  removed?: boolean;
}

interface FakePack {
  religions: Array<FakeReligion | undefined>;
  burgs: Array<FakeBurg | undefined>;
  cultures: Array<FakeCulture | undefined>;
  states: Array<FakeState | undefined>;
  cells: {
    p: Array<[number, number] | undefined>;
    religion: Array<number | undefined>;
  };
}

function makePack(): FakePack {
  return {
    religions: [
      { i: 0, name: "No religion" },
      undefined,
      undefined,
      {
        i: 3,
        name: "Ashenfaith",
        color: "#aabbcc",
        type: "Organized",
        form: "Monotheism",
        deity: "Ashara",
        code: "AF",
        culture: 2,
        center: 42,
        expansion: "global",
        expansionism: 1.5,
        origins: [0, 1],
        cells: 123,
        area: 4567,
        rural: 100,
        urban: 40,
        lock: false,
      },
      {
        i: 4,
        name: "Forgotten Cult",
        removed: true,
      },
    ],
    burgs: [
      { i: 0, name: "placeholder" },
      { i: 1, name: "Ironhold", cell: 10 }, // cell religion 3
      undefined,
      undefined,
      undefined,
      { i: 5, name: "OldStormport", cell: 15, removed: true }, // removed
      undefined,
      { i: 7, name: "Stormport", cell: 20 }, // cell religion 3
      { i: 8, name: "Other Town", cell: 30 }, // cell religion 5 (different)
      { i: 9, name: "Second Ashenfaith", cell: 25 }, // cell religion 3
    ],
    cultures: [
      { i: 0, name: "Wildlands" },
      undefined,
      { i: 2, name: "Highlanders" },
    ],
    states: [
      { i: 0, name: "Neutrals" },
      { i: 1, name: "Realm of Stormport", capital: 7 }, // capital cell religion 3
      { i: 2, name: "Realm of Ironhold", capital: 1 }, // capital cell religion 3
      { i: 3, name: "Elsewhere", capital: 8 }, // capital cell religion 5
      { i: 4, name: "Removed State", capital: 9, removed: true }, // removed
    ],
    cells: {
      p: new Array(100).fill(undefined) as Array<[number, number] | undefined>,
      religion: new Array(100).fill(undefined) as Array<number | undefined>,
    },
  };
}

function seedCells(pack: FakePack): FakePack {
  pack.cells.p[42] = [500, 600];
  pack.cells.religion[10] = 3;
  pack.cells.religion[20] = 3;
  pack.cells.religion[25] = 3;
  pack.cells.religion[30] = 5;
  return pack;
}

function makeRates(overrides: Partial<PopulationRates> = {}): PopulationRates {
  return { populationRate: 1000, urbanization: 2, ...overrides };
}

function runtimeReturning(result: ReadReligionResult): ReligionInfoRuntime {
  return { readReligion: () => result };
}

describe("get_religion_info tool — pure / seam", () => {
  it("returns all fields for a fully populated religion", async () => {
    const pack = seedCells(makePack());
    const info = readReligionInfoFromPack(
      pack as ReligionInfoPackLike,
      makeRates(),
      3,
    );
    expect(info).not.toBe("not-ready");
    expect(info).not.toBe("not-found");
    expect(info).not.toBe("placeholder");
    const tool = createGetReligionInfoTool(runtimeReturning(info));
    const result = await tool.execute({ religion: 3 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.i).toBe(3);
    expect(body.name).toBe("Ashenfaith");
    expect(body.color).toBe("#aabbcc");
    expect(body.type).toBe("Organized");
    expect(body.form).toBe("Monotheism");
    expect(body.deity).toBe("Ashara");
    expect(body.code).toBe("AF");
    expect(body.expansion).toBe("global");
    expect(body.expansionism).toBe(1.5);
    expect(body.culture).toEqual({ id: 2, name: "Highlanders" });
    expect(body.center).toEqual({ cell: 42, x: 500, y: 600 });
    expect(body.origins).toEqual([0, 1]);
    expect(body.cells_count).toBe(123);
    expect(body.area).toBe(4567);
    expect(body.lock).toBe(false);
  });

  it("resolves culture from pack.cultures[religion.culture]", () => {
    const pack = makePack();
    const info = readReligionInfoFromPack(
      pack as ReligionInfoPackLike,
      makeRates(),
      3,
    ) as ReligionInfo;
    expect(info.culture).toEqual({ id: 2, name: "Highlanders" });
  });

  it("culture resolves to { id, name: null } when id is out of range", () => {
    const pack = makePack();
    const r = pack.religions[3];
    if (r) r.culture = 99;
    const info = readReligionInfoFromPack(
      pack as ReligionInfoPackLike,
      makeRates(),
      3,
    ) as ReligionInfo;
    expect(info.culture).toEqual({ id: 99, name: null });
  });

  it("culture is null when religion.culture is undefined", () => {
    const pack = makePack();
    const r = pack.religions[3];
    if (r) r.culture = undefined;
    const info = readReligionInfoFromPack(
      pack as ReligionInfoPackLike,
      makeRates(),
      3,
    ) as ReligionInfo;
    expect(info.culture).toBeNull();
  });

  it("center is populated from pack.cells.p[religion.center]; null when absent", () => {
    const pack = seedCells(makePack());
    const info = readReligionInfoFromPack(
      pack as ReligionInfoPackLike,
      makeRates(),
      3,
    ) as ReligionInfo;
    expect(info.center).toEqual({ cell: 42, x: 500, y: 600 });

    const r = pack.religions[3];
    if (r) r.center = undefined;
    const info2 = readReligionInfoFromPack(
      pack as ReligionInfoPackLike,
      makeRates(),
      3,
    ) as ReligionInfo;
    expect(info2.center).toBeNull();
  });

  it("origins pass through as religion.origins ?? []", () => {
    const pack = makePack();
    const info = readReligionInfoFromPack(
      pack as ReligionInfoPackLike,
      makeRates(),
      3,
    ) as ReligionInfo;
    expect(info.origins).toEqual([0, 1]);

    const pack2 = makePack();
    const r = pack2.religions[3];
    if (r) r.origins = undefined;
    const info2 = readReligionInfoFromPack(
      pack2 as ReligionInfoPackLike,
      makeRates(),
      3,
    ) as ReligionInfo;
    expect(info2.origins).toEqual([]);
  });

  it("population_total / urban_population / rural_population apply rates correctly", () => {
    const pack = makePack();
    // rural=100, urban=40, populationRate=1000, urbanization=2
    const info = readReligionInfoFromPack(
      pack as ReligionInfoPackLike,
      makeRates(),
      3,
    ) as ReligionInfo;
    // rural + urban = 140; total = 140 * 1000 = 140000
    expect(info.population_total).toBe(140000);
    // urban * rate * urbanization = 40 * 1000 * 2 = 80000
    expect(info.urban_population).toBe(80000);
    // rural * rate = 100 * 1000 = 100000
    expect(info.rural_population).toBe(100000);
  });

  it("burgs_count counts only burgs whose cell.religion === i && !removed && i > 0", () => {
    const pack = seedCells(makePack());
    const info = readReligionInfoFromPack(
      pack as ReligionInfoPackLike,
      makeRates(),
      3,
    ) as ReligionInfo;
    // Active non-removed burgs on cells with religion 3: #1 Ironhold (cell 10), #7 Stormport (cell 20), #9 (cell 25).
    // #5 is removed, #0 is placeholder, #8 is on cell 30 (religion 5).
    expect(info.burgs_count).toBe(3);
  });

  it("states_count counts non-removed states whose capital-burg sits on a cell with this religion", () => {
    const pack = seedCells(makePack());
    const info = readReligionInfoFromPack(
      pack as ReligionInfoPackLike,
      makeRates(),
      3,
    ) as ReligionInfo;
    // State 1 capital=burg 7 (cell 20, religion 3) ✓
    // State 2 capital=burg 1 (cell 10, religion 3) ✓
    // State 3 capital=burg 8 (cell 30, religion 5) ✗
    // State 4 removed → skip
    expect(info.states_count).toBe(2);
  });

  it("lock pass-through defaults false", () => {
    const pack = makePack();
    const info = readReligionInfoFromPack(
      pack as ReligionInfoPackLike,
      makeRates(),
      3,
    ) as ReligionInfo;
    expect(info.lock).toBe(false);

    const pack2 = makePack();
    const r = pack2.religions[3];
    if (r) r.lock = true;
    const info2 = readReligionInfoFromPack(
      pack2 as ReligionInfoPackLike,
      makeRates(),
      3,
    ) as ReligionInfo;
    expect(info2.lock).toBe(true);
  });

  it("string-ref resolves by case-insensitive name", () => {
    const pack = makePack();
    const byName = readReligionInfoFromPack(
      pack as ReligionInfoPackLike,
      makeRates(),
      "ashenfaith",
    ) as ReligionInfo;
    expect(byName.i).toBe(3);
  });

  it("returns 'not-found' for unknown / removed refs", () => {
    const pack = makePack();
    expect(
      readReligionInfoFromPack(pack as ReligionInfoPackLike, makeRates(), 99),
    ).toBe("not-found");
    expect(
      readReligionInfoFromPack(
        pack as ReligionInfoPackLike,
        makeRates(),
        "forgotten cult",
      ),
    ).toBe("not-found");
    expect(
      readReligionInfoFromPack(
        pack as ReligionInfoPackLike,
        makeRates(),
        "nonexistent",
      ),
    ).toBe("not-found");
  });

  it("returns 'placeholder' for religion 0", () => {
    const pack = makePack();
    expect(
      readReligionInfoFromPack(pack as ReligionInfoPackLike, makeRates(), 0),
    ).toBe("placeholder");
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(readReligionInfoFromPack(undefined, makeRates(), 3)).toBe(
      "not-ready",
    );
    expect(
      readReligionInfoFromPack(
        { religions: undefined } as ReligionInfoPackLike,
        makeRates(),
        3,
      ),
    ).toBe("not-ready");
  });

  it("tool rejects religion 0 directly with a clear message", async () => {
    const tool = createGetReligionInfoTool(runtimeReturning("placeholder"));
    const result = await tool.execute({ religion: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/No religion/i);
  });

  it("tool rejects non-integer / missing religion via parseEntityRef", async () => {
    const pack = makePack();
    const tool = createGetReligionInfoTool({
      readReligion: (ref) =>
        readReligionInfoFromPack(
          pack as ReligionInfoPackLike,
          makeRates(),
          ref,
        ),
    });
    for (const bad of [
      {},
      { religion: 1.5 },
      { religion: null },
      { religion: "" },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /positive integer id or a non-empty name/i,
      );
    }
  });

  it("tool surfaces not-found as a structured error with the ref quoted", async () => {
    const tool = createGetReligionInfoTool(runtimeReturning("not-found"));
    const result = await tool.execute({ religion: "foo" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/No religion found/i);
    expect(JSON.parse(result.content).error).toMatch(/"foo"/);
  });

  it("tool surfaces not-ready as a structured error", async () => {
    const tool = createGetReligionInfoTool(runtimeReturning("not-ready"));
    const result = await tool.execute({ religion: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("is exported as getReligionInfoTool with the expected schema", () => {
    expect(getReligionInfoTool.name).toBe("get_religion_info");
    expect(getReligionInfoTool.input_schema.type).toBe("object");
    expect(getReligionInfoTool.input_schema.required).toEqual(["religion"]);
    expect(getReligionInfoTool.input_schema.properties.religion).toBeDefined();
  });
});

// ----- defaultReligionInfoRuntime integration -----

describe("defaultReligionInfoRuntime (integration)", () => {
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

  it("reads a real packed religion through the default runtime", () => {
    const info = defaultReligionInfoRuntime.readReligion(3);
    expect(info).not.toBe("not-ready");
    expect(info).not.toBe("not-found");
    expect(info).not.toBe("placeholder");
    const ri = info as ReligionInfo;
    expect(ri.i).toBe(3);
    expect(ri.name).toBe("Ashenfaith");
    expect(ri.culture).toEqual({ id: 2, name: "Highlanders" });
    expect(ri.center?.cell).toBe(42);
    expect(ri.burgs_count).toBe(3);
    expect(ri.states_count).toBe(2);
  });

  it("returns 'not-ready' when pack is missing", async () => {
    globalsRef.pack = undefined;
    expect(defaultReligionInfoRuntime.readReligion(3)).toBe("not-ready");
    const result = await getReligionInfoTool.execute({ religion: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("returns 'not-found' for unknown religion id", async () => {
    expect(defaultReligionInfoRuntime.readReligion(999)).toBe("not-found");
    const result = await getReligionInfoTool.execute({ religion: 999 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/No religion found/i);
  });
});
