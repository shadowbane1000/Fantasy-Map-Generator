import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createGetStateInfoTool,
  defaultStateInfoRuntime,
  getStateInfoTool,
  type PopulationRates,
  type ReadStateResult,
  readStateInfoFromPack,
  type StateInfo,
  type StateInfoPackLike,
  type StateInfoRuntime,
} from "./get-state-info";

interface FakeState {
  i: number;
  name?: string;
  fullName?: string;
  form?: string;
  formName?: string;
  type?: string;
  color?: string;
  culture?: number;
  capital?: number;
  center?: number;
  expansionism?: number;
  cells?: number;
  area?: number;
  rural?: number;
  urban?: number;
  diplomacy?: string[];
  lock?: boolean;
  removed?: boolean;
}

interface FakeProvince {
  i: number;
  name?: string;
  state?: number;
  removed?: boolean;
}

interface FakeBurg {
  i: number;
  name?: string;
  x?: number;
  y?: number;
  state?: number;
  removed?: boolean;
}

interface FakeCulture {
  i: number;
  name?: string;
  removed?: boolean;
}

interface FakePack {
  states: Array<FakeState | undefined>;
  burgs: Array<FakeBurg | undefined>;
  cultures: Array<FakeCulture | undefined>;
  provinces: Array<FakeProvince | undefined>;
  cells: { p: Array<[number, number] | undefined> };
}

function makePack(): FakePack {
  return {
    states: [
      { i: 0, name: "Neutrals" },
      undefined,
      undefined,
      {
        i: 3,
        name: "Altaria",
        fullName: "The Kingdom of Altaria",
        form: "Monarchy",
        formName: "Kingdom",
        type: "Generic",
        color: "#aabbcc",
        culture: 2,
        capital: 7,
        center: 42,
        expansionism: 1.5,
        cells: 123,
        area: 4567,
        rural: 100,
        urban: 40,
        diplomacy: ["x", "Neutral", "Neutral", "x", "Enemy", "Ally"],
        lock: false,
      },
      {
        i: 4,
        name: "Removed Realm",
        removed: true,
      },
    ],
    burgs: [
      { i: 0, name: "placeholder" }, // index-0 sentinel
      { i: 1, name: "Ironhold", state: 3, x: 10, y: 20 },
      undefined,
      undefined,
      undefined,
      { i: 5, name: "OldStormport", state: 3, removed: true, x: 0, y: 0 },
      undefined,
      { i: 7, name: "Stormport", state: 3, x: 100, y: 200 },
      { i: 8, name: "Other Town", state: 4, x: 1, y: 1 },
      { i: 9, name: "Second Altarian", state: 3, x: 300, y: 400 },
    ],
    cultures: [
      { i: 0, name: "Wildlands" },
      undefined,
      { i: 2, name: "Highlanders" },
    ],
    provinces: [
      { i: 0, name: "placeholder" },
      { i: 1, name: "Rookmark", state: 3 },
      { i: 2, name: "Elsewhere", state: 4 },
      { i: 3, name: "Ashgard", state: 3 },
      { i: 4, name: "Removed", state: 3, removed: true },
    ],
    cells: {
      p: new Array(100).fill(undefined) as Array<[number, number] | undefined>,
    },
  };
}

function seedCells(pack: FakePack): FakePack {
  pack.cells.p[42] = [500, 600];
  return pack;
}

function makeRates(overrides: Partial<PopulationRates> = {}): PopulationRates {
  return { populationRate: 1000, urbanization: 2, ...overrides };
}

function runtimeReturning(result: ReadStateResult): StateInfoRuntime {
  return { readState: () => result };
}

describe("get_state_info tool — pure / seam", () => {
  it("returns all fields for a fully populated state", async () => {
    const pack = seedCells(makePack());
    const info = readStateInfoFromPack(
      pack as StateInfoPackLike,
      makeRates(),
      3,
    );
    expect(info).not.toBe("not-ready");
    expect(info).not.toBe("not-found");
    expect(info).not.toBe("neutral");
    const tool = createGetStateInfoTool(runtimeReturning(info));
    const result = await tool.execute({ state: 3 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.i).toBe(3);
    expect(body.name).toBe("Altaria");
    expect(body.fullName).toBe("The Kingdom of Altaria");
    expect(body.form).toBe("Monarchy");
    expect(body.formName).toBe("Kingdom");
    expect(body.type).toBe("Generic");
    expect(body.color).toBe("#aabbcc");
    expect(body.expansionism).toBe(1.5);
    expect(body.culture).toEqual({ id: 2, name: "Highlanders" });
    expect(body.capital).toEqual({
      id: 7,
      name: "Stormport",
      x: 100,
      y: 200,
    });
    expect(body.center).toEqual({ cell: 42, x: 500, y: 600 });
    expect(body.cells_count).toBe(123);
    expect(body.area).toBe(4567);
    expect(body.lock).toBe(false);
  });

  it("resolves culture from pack.cultures[state.culture]", () => {
    const pack = makePack();
    const info = readStateInfoFromPack(
      pack as StateInfoPackLike,
      makeRates(),
      3,
    ) as StateInfo;
    expect(info.culture).toEqual({ id: 2, name: "Highlanders" });
  });

  it("culture resolves to { id, name: null } when id is out of range", () => {
    const pack = makePack();
    const s = pack.states[3];
    if (s) s.culture = 99;
    const info = readStateInfoFromPack(
      pack as StateInfoPackLike,
      makeRates(),
      3,
    ) as StateInfo;
    expect(info.culture).toEqual({ id: 99, name: null });
  });

  it("capital is null when state.capital is 0 or missing", () => {
    const pack = makePack();
    const s = pack.states[3];
    if (s) s.capital = 0;
    const info = readStateInfoFromPack(
      pack as StateInfoPackLike,
      makeRates(),
      3,
    ) as StateInfo;
    expect(info.capital).toBeNull();
  });

  it("center is populated from pack.cells.p[state.center]; null when absent", () => {
    const pack = seedCells(makePack());
    const info = readStateInfoFromPack(
      pack as StateInfoPackLike,
      makeRates(),
      3,
    ) as StateInfo;
    expect(info.center).toEqual({ cell: 42, x: 500, y: 600 });

    const s = pack.states[3];
    if (s) s.center = undefined;
    const info2 = readStateInfoFromPack(
      pack as StateInfoPackLike,
      makeRates(),
      3,
    ) as StateInfo;
    expect(info2.center).toBeNull();
  });

  it("population_total / urban_population / rural_population apply rates correctly", () => {
    const pack = makePack();
    // rural=100, urban=40, populationRate=1000, urbanization=2
    const info = readStateInfoFromPack(
      pack as StateInfoPackLike,
      makeRates(),
      3,
    ) as StateInfo;
    // rural + urban = 140; total = 140 * 1000 = 140000
    expect(info.population_total).toBe(140000);
    // urban * rate * urbanization = 40 * 1000 * 2 = 80000
    expect(info.urban_population).toBe(80000);
    // rural * rate = 100 * 1000 = 100000
    expect(info.rural_population).toBe(100000);
  });

  it("burgs_count only includes burg.state === i && !removed && i > 0", () => {
    const pack = makePack();
    const info = readStateInfoFromPack(
      pack as StateInfoPackLike,
      makeRates(),
      3,
    ) as StateInfo;
    // Active non-removed burgs for state 3: #1 Ironhold, #7 Stormport, #9.
    // #5 OldStormport is removed, #0 is placeholder, #8 is in state 4.
    expect(info.burgs_count).toBe(3);
  });

  it("provinces only includes matching non-removed entries, as {id, name}", () => {
    const pack = makePack();
    const info = readStateInfoFromPack(
      pack as StateInfoPackLike,
      makeRates(),
      3,
    ) as StateInfo;
    expect(info.provinces).toEqual([
      { id: 1, name: "Rookmark" },
      { id: 3, name: "Ashgard" },
    ]);
  });

  it("diplomacy passes through as state.diplomacy ?? []", () => {
    const pack = makePack();
    const info = readStateInfoFromPack(
      pack as StateInfoPackLike,
      makeRates(),
      3,
    ) as StateInfo;
    expect(info.diplomacy).toEqual([
      "x",
      "Neutral",
      "Neutral",
      "x",
      "Enemy",
      "Ally",
    ]);
    const pack2 = makePack();
    const s = pack2.states[3];
    if (s) s.diplomacy = undefined;
    const info2 = readStateInfoFromPack(
      pack2 as StateInfoPackLike,
      makeRates(),
      3,
    ) as StateInfo;
    expect(info2.diplomacy).toEqual([]);
  });

  it("lock pass-through defaults false", () => {
    const pack = makePack();
    const info = readStateInfoFromPack(
      pack as StateInfoPackLike,
      makeRates(),
      3,
    ) as StateInfo;
    expect(info.lock).toBe(false);

    const pack2 = makePack();
    const s = pack2.states[3];
    if (s) s.lock = true;
    const info2 = readStateInfoFromPack(
      pack2 as StateInfoPackLike,
      makeRates(),
      3,
    ) as StateInfo;
    expect(info2.lock).toBe(true);
  });

  it("string-ref resolves by case-insensitive name or fullName", () => {
    const pack = makePack();
    const byName = readStateInfoFromPack(
      pack as StateInfoPackLike,
      makeRates(),
      "altaria",
    ) as StateInfo;
    expect(byName.i).toBe(3);

    const byFullName = readStateInfoFromPack(
      pack as StateInfoPackLike,
      makeRates(),
      "THE KINGDOM OF ALTARIA",
    ) as StateInfo;
    expect(byFullName.i).toBe(3);
  });

  it("returns 'not-found' for unknown / removed refs", () => {
    const pack = makePack();
    expect(
      readStateInfoFromPack(pack as StateInfoPackLike, makeRates(), 99),
    ).toBe("not-found");
    expect(
      readStateInfoFromPack(
        pack as StateInfoPackLike,
        makeRates(),
        "removed realm",
      ),
    ).toBe("not-found");
    expect(
      readStateInfoFromPack(
        pack as StateInfoPackLike,
        makeRates(),
        "nonexistent",
      ),
    ).toBe("not-found");
  });

  it("returns 'neutral' for state 0", () => {
    const pack = makePack();
    expect(
      readStateInfoFromPack(pack as StateInfoPackLike, makeRates(), 0),
    ).toBe("neutral");
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(readStateInfoFromPack(undefined, makeRates(), 3)).toBe("not-ready");
    expect(
      readStateInfoFromPack(
        { states: undefined } as StateInfoPackLike,
        makeRates(),
        3,
      ),
    ).toBe("not-ready");
  });

  it("tool rejects state 0 directly with a clear message", async () => {
    const tool = createGetStateInfoTool(runtimeReturning("neutral"));
    const result = await tool.execute({ state: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Neutrals/i);
  });

  it("tool rejects non-integer / missing state via parseEntityRef", async () => {
    const pack = makePack();
    const tool = createGetStateInfoTool({
      readState: (ref) =>
        readStateInfoFromPack(pack as StateInfoPackLike, makeRates(), ref),
    });
    for (const bad of [{}, { state: 1.5 }, { state: null }, { state: "" }]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /positive integer id or a non-empty name/i,
      );
    }
  });

  it("tool surfaces not-found as a structured error with the ref quoted", async () => {
    const tool = createGetStateInfoTool(runtimeReturning("not-found"));
    const result = await tool.execute({ state: "foo" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/No state found/i);
    expect(JSON.parse(result.content).error).toMatch(/"foo"/);
  });

  it("tool surfaces not-ready as a structured error", async () => {
    const tool = createGetStateInfoTool(runtimeReturning("not-ready"));
    const result = await tool.execute({ state: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("is exported as getStateInfoTool with the expected schema", () => {
    expect(getStateInfoTool.name).toBe("get_state_info");
    expect(getStateInfoTool.input_schema.type).toBe("object");
    expect(getStateInfoTool.input_schema.required).toEqual(["state"]);
    expect(getStateInfoTool.input_schema.properties.state).toBeDefined();
  });

  it("capital slot that points at a removed burg still echoes the id", () => {
    const pack = makePack();
    const s = pack.states[3];
    if (s) s.capital = 5; // burg 5 is removed
    const info = readStateInfoFromPack(
      pack as StateInfoPackLike,
      makeRates(),
      3,
    ) as StateInfo;
    expect(info.capital).toEqual({ id: 5, name: null, x: null, y: null });
  });
});

// ----- defaultStateInfoRuntime integration -----

describe("defaultStateInfoRuntime (integration)", () => {
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

  it("reads a real packed state through the default runtime", () => {
    const info = defaultStateInfoRuntime.readState(3);
    expect(info).not.toBe("not-ready");
    expect(info).not.toBe("not-found");
    expect(info).not.toBe("neutral");
    const si = info as StateInfo;
    expect(si.i).toBe(3);
    expect(si.name).toBe("Altaria");
    expect(si.culture).toEqual({ id: 2, name: "Highlanders" });
    expect(si.capital?.name).toBe("Stormport");
  });

  it("returns 'not-ready' when pack is missing", async () => {
    globalsRef.pack = undefined;
    expect(defaultStateInfoRuntime.readState(3)).toBe("not-ready");
    const result = await getStateInfoTool.execute({ state: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("returns 'not-found' for unknown state id", async () => {
    expect(defaultStateInfoRuntime.readState(999)).toBe("not-found");
    const result = await getStateInfoTool.execute({ state: 999 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/No state found/i);
  });
});
