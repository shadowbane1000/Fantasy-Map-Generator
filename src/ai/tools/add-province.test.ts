import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawBurg, RawCulture, RawProvince, RawState } from "./_shared";
import {
  type AddProvinceBurgInfo,
  type AddProvinceResult,
  type AddProvinceRuntime,
  type AddProvinceStateInfo,
  addProvinceTool,
  createAddProvinceTool,
  type NewProvinceInput,
} from "./add-province";

function makeRuntime(
  overrides: {
    findBurg?: (ref: number | string) => AddProvinceBurgInfo | null;
    findState?: (ref: number | string) => AddProvinceStateInfo | null;
    stateFor?: (stateId: number) => AddProvinceStateInfo | null;
    cellLand?: (cellId: number) => boolean;
    cellState?: (cellId: number) => number;
    cellProvince?: (cellId: number) => number;
    provinceCenter?: (provinceI: number) => number | null;
    randomColor?: () => string;
    mixColor?: (stateColor: string | undefined) => string;
    generateName?: (cultureId: number, burgName: string) => string;
    generateCoa?: AddProvinceRuntime["generateCoa"];
    apply?: (input: NewProvinceInput) => AddProvinceResult;
    redraw?: (newProvinceI: number) => void;
  } = {},
): {
  runtime: AddProvinceRuntime;
  findBurg: ReturnType<typeof vi.fn<AddProvinceRuntime["findBurg"]>>;
  findState: ReturnType<typeof vi.fn<AddProvinceRuntime["findState"]>>;
  stateFor: ReturnType<typeof vi.fn<AddProvinceRuntime["stateFor"]>>;
  cellLand: ReturnType<typeof vi.fn<AddProvinceRuntime["cellLand"]>>;
  cellState: ReturnType<typeof vi.fn<AddProvinceRuntime["cellState"]>>;
  cellProvince: ReturnType<typeof vi.fn<AddProvinceRuntime["cellProvince"]>>;
  provinceCenter: ReturnType<
    typeof vi.fn<AddProvinceRuntime["provinceCenter"]>
  >;
  randomColor: ReturnType<typeof vi.fn<AddProvinceRuntime["randomColor"]>>;
  mixColor: ReturnType<typeof vi.fn<AddProvinceRuntime["mixColor"]>>;
  generateName: ReturnType<typeof vi.fn<AddProvinceRuntime["generateName"]>>;
  generateCoa: ReturnType<typeof vi.fn<AddProvinceRuntime["generateCoa"]>>;
  apply: ReturnType<typeof vi.fn<AddProvinceRuntime["apply"]>>;
  redraw: ReturnType<typeof vi.fn<AddProvinceRuntime["redraw"]>>;
} {
  const findBurg = vi.fn<AddProvinceRuntime["findBurg"]>(
    overrides.findBurg ??
      (() => ({
        i: 5,
        cell: 42,
        culture: 2,
        name: "TestBurg",
        coa: undefined,
        removed: false,
      })),
  );
  const findState = vi.fn<AddProvinceRuntime["findState"]>(
    overrides.findState ??
      (() => ({
        i: 1,
        name: "Altaria",
        color: "#336699",
        form: "Monarchy",
      })),
  );
  const stateFor = vi.fn<AddProvinceRuntime["stateFor"]>(
    overrides.stateFor ??
      (() => ({
        i: 1,
        name: "Altaria",
        color: "#336699",
        form: "Monarchy",
      })),
  );
  const cellLand = vi.fn<AddProvinceRuntime["cellLand"]>(
    overrides.cellLand ?? (() => true),
  );
  const cellState = vi.fn<AddProvinceRuntime["cellState"]>(
    overrides.cellState ?? (() => 1),
  );
  const cellProvince = vi.fn<AddProvinceRuntime["cellProvince"]>(
    overrides.cellProvince ?? (() => 0),
  );
  const provinceCenter = vi.fn<AddProvinceRuntime["provinceCenter"]>(
    overrides.provinceCenter ?? (() => null),
  );
  const randomColor = vi.fn<AddProvinceRuntime["randomColor"]>(
    overrides.randomColor ?? (() => "#abc123"),
  );
  const mixColor = vi.fn<AddProvinceRuntime["mixColor"]>(
    overrides.mixColor ?? (() => "#deadbe"),
  );
  const generateName = vi.fn<AddProvinceRuntime["generateName"]>(
    overrides.generateName ?? (() => "GeneratedName"),
  );
  const generateCoa = vi.fn<AddProvinceRuntime["generateCoa"]>(
    overrides.generateCoa ?? (() => undefined),
  );
  const apply = vi.fn<AddProvinceRuntime["apply"]>(
    overrides.apply ??
      ((input: NewProvinceInput) => ({
        i: 1,
        name: input.name,
        fullName: input.fullName,
        formName: input.formName,
        color: input.color,
        state: input.state,
        capital: input.burg,
        center: input.center,
      })),
  );
  const redraw = vi.fn<AddProvinceRuntime["redraw"]>(
    overrides.redraw ?? (() => {}),
  );
  return {
    runtime: {
      findBurg,
      findState,
      stateFor,
      cellLand,
      cellState,
      cellProvince,
      provinceCenter,
      randomColor,
      mixColor,
      generateName,
      generateCoa,
      apply,
      redraw,
    },
    findBurg,
    findState,
    stateFor,
    cellLand,
    cellState,
    cellProvince,
    provinceCenter,
    randomColor,
    mixColor,
    generateName,
    generateCoa,
    apply,
    redraw,
  };
}

describe("add_province tool", () => {
  it("happy path: seams called, defaults applied, result shape correct", async () => {
    const {
      runtime,
      findBurg,
      cellLand,
      cellState,
      stateFor,
      mixColor,
      apply,
      redraw,
    } = makeRuntime();
    const tool = createAddProvinceTool(runtime);
    const result = await tool.execute({ capital: 5 });
    expect(result.isError).toBeFalsy();
    expect(findBurg).toHaveBeenCalledWith(5);
    expect(cellLand).toHaveBeenCalledWith(42);
    expect(cellState).toHaveBeenCalledWith(42);
    expect(stateFor).toHaveBeenCalledWith(1);
    expect(mixColor).toHaveBeenCalledWith("#336699");
    expect(apply).toHaveBeenCalledTimes(1);
    expect(redraw).toHaveBeenCalledWith(1);
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      i: 1,
      name: "GeneratedName",
      color: "#deadbe",
      formName: "Province",
      fullName: "GeneratedName Province",
      capital: 5,
      center: 42,
      state: 1,
    });
  });

  it("passes explicit name / color / form through and composes fullName", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createAddProvinceTool(runtime);
    const result = await tool.execute({
      capital: 5,
      name: "Eldoria",
      color: "#ff00ff",
      form: "Duchy",
    });
    expect(result.isError).toBeFalsy();
    const callArgs = apply.mock.calls[0][0];
    expect(callArgs.name).toBe("Eldoria");
    expect(callArgs.color).toBe("#ff00ff");
    expect(callArgs.formName).toBe("Duchy");
    expect(callArgs.fullName).toBe("Eldoria Duchy");
  });

  it("resolves explicit state ref via runtime.findState and passes match", async () => {
    const findState = vi.fn(() => ({
      i: 1,
      name: "Altaria",
      color: "#ffffff",
      form: "Republic",
    }));
    const { runtime, apply } = makeRuntime({ findState });
    const tool = createAddProvinceTool(runtime);
    const result = await tool.execute({ capital: 5, state: "altaria" });
    expect(result.isError).toBeFalsy();
    expect(findState).toHaveBeenCalledWith("altaria");
    expect(apply.mock.calls[0][0].state).toBe(1);
  });

  it("rejects missing / invalid capital ref", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createAddProvinceTool(runtime);
    for (const bad of [undefined, null, 0, -1, "", 1.5]) {
      const r = await tool.execute({ capital: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects empty / whitespace / non-string name", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createAddProvinceTool(runtime);
    for (const bad of ["", "   ", 42]) {
      const r = await tool.execute({ capital: 5, name: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects empty color / form", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createAddProvinceTool(runtime);
    expect((await tool.execute({ capital: 5, color: "" })).isError).toBe(true);
    expect((await tool.execute({ capital: 5, form: "" })).isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid state ref", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createAddProvinceTool(runtime);
    const r = await tool.execute({ capital: 5, state: "" });
    expect(r.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects when findBurg returns null", async () => {
    const { runtime, apply } = makeRuntime({ findBurg: () => null });
    const tool = createAddProvinceTool(runtime);
    const r = await tool.execute({ capital: 99 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/No burg found/);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects removed burg", async () => {
    const { runtime, apply } = makeRuntime({
      findBurg: () => ({
        i: 5,
        cell: 42,
        culture: 2,
        name: "Gone",
        removed: true,
      }),
    });
    const tool = createAddProvinceTool(runtime);
    const r = await tool.execute({ capital: 5 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/removed/);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects burg on water cell", async () => {
    const { runtime, apply } = makeRuntime({ cellLand: () => false });
    const tool = createAddProvinceTool(runtime);
    const r = await tool.execute({ capital: 5 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not land/);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects burg in neutral cell (cellState === 0)", async () => {
    const { runtime, apply } = makeRuntime({ cellState: () => 0 });
    const tool = createAddProvinceTool(runtime);
    const r = await tool.execute({ capital: 5 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/neutral lands/);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects cell already a province center", async () => {
    const { runtime, apply } = makeRuntime({
      cellProvince: () => 3,
      provinceCenter: () => 42,
    });
    const tool = createAddProvinceTool(runtime);
    const r = await tool.execute({ capital: 5 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/already the center/);
    expect(apply).not.toHaveBeenCalled();
  });

  it("accepts existing non-center province on the cell", async () => {
    // Cell belongs to province 3 but province 3's center is a DIFFERENT cell.
    const { runtime, apply } = makeRuntime({
      cellProvince: () => 3,
      provinceCenter: () => 99,
    });
    const tool = createAddProvinceTool(runtime);
    const r = await tool.execute({ capital: 5 });
    expect(r.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("rejects explicit state ref that doesn't resolve", async () => {
    const { runtime, apply } = makeRuntime({ findState: () => null });
    const tool = createAddProvinceTool(runtime);
    const r = await tool.execute({ capital: 5, state: "ghost" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/No state found/);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects explicit state ref that doesn't match cellState", async () => {
    const findState = vi.fn(() => ({
      i: 7,
      name: "Wrong",
      color: "",
      form: "",
    }));
    const { runtime, apply } = makeRuntime({ findState });
    const tool = createAddProvinceTool(runtime);
    const r = await tool.execute({ capital: 5, state: "wrong" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/does not own/);
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces runtime.apply errors", async () => {
    const { runtime } = makeRuntime({
      apply: () => {
        throw new Error("pack.provinces is not available.");
      },
    });
    const tool = createAddProvinceTool(runtime);
    const r = await tool.execute({ capital: 5 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/pack\.provinces/);
  });

  it("calls redraw after successful apply", async () => {
    const { runtime, redraw } = makeRuntime();
    const tool = createAddProvinceTool(runtime);
    const r = await tool.execute({ capital: 5 });
    expect(r.isError).toBeFalsy();
    expect(redraw).toHaveBeenCalledTimes(1);
  });
});

describe("defaultAddProvinceRuntime (integration)", () => {
  const drawProvinces = vi.fn();
  const drawBorders = vi.fn();
  const getRandomColor = vi.fn(() => "#deadbe");
  const namesGetState = vi.fn(() => "GenName");
  const namesGetCultureShort = vi.fn(() => "base");

  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalDrawProvinces = (globalThis as { drawProvinces?: unknown })
    .drawProvinces;
  const originalDrawBorders = (globalThis as { drawBorders?: unknown })
    .drawBorders;
  const originalGetRandomColor = (globalThis as { getRandomColor?: unknown })
    .getRandomColor;
  const originalNames = (globalThis as { Names?: unknown }).Names;
  const originalCOA = (globalThis as { COA?: unknown }).COA;
  const originalD3 = (globalThis as { d3?: unknown }).d3;

  beforeEach(() => {
    drawProvinces.mockReset();
    drawBorders.mockReset();
    getRandomColor.mockReset().mockReturnValue("#deadbe");
    namesGetState.mockReset().mockReturnValue("GenName");
    namesGetCultureShort.mockReset().mockReturnValue("base");

    const h = new Array(50).fill(0);
    h[42] = 25; // land
    h[10] = 5; // water
    const cellState = new Array(50).fill(0);
    cellState[42] = 1; // owned by Altaria
    const cellProvince = new Array(50).fill(0);
    const cellBurg = new Array(50).fill(0);
    cellBurg[42] = 1;

    const burgs: RawBurg[] = [
      { i: 0 },
      {
        i: 1,
        name: "Capitalia",
        cell: 42,
        culture: 2,
        state: 1,
        capital: 0,
      },
    ];
    const cultures: RawCulture[] = [
      { i: 0, name: "Wildlands", type: "Generic" },
      { i: 1, name: "Other", type: "Generic" },
      { i: 2, name: "TestCulture", type: "Highland" },
    ];
    const states: RawState[] = [
      { i: 0, name: "Neutrals", diplomacy: ["x"] },
      {
        i: 1,
        name: "Altaria",
        color: "#336699",
        form: "Monarchy",
        provinces: [],
      },
    ];
    const provinces: RawProvince[] = [0 as unknown as RawProvince];

    (globalThis as { pack?: unknown }).pack = {
      cells: {
        h,
        state: cellState,
        province: cellProvince,
        burg: cellBurg,
      },
      burgs,
      cultures,
      states,
      provinces,
    };
    (globalThis as { drawProvinces?: unknown }).drawProvinces = drawProvinces;
    (globalThis as { drawBorders?: unknown }).drawBorders = drawBorders;
    (globalThis as { getRandomColor?: unknown }).getRandomColor =
      getRandomColor;
    (globalThis as { Names?: unknown }).Names = {
      getState: namesGetState,
      getCultureShort: namesGetCultureShort,
    };
    (globalThis as { COA?: unknown }).COA = undefined; // no COA by default
    (globalThis as { d3?: unknown }).d3 = undefined; // no d3 mixing by default
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { drawProvinces?: unknown }).drawProvinces =
      originalDrawProvinces;
    (globalThis as { drawBorders?: unknown }).drawBorders = originalDrawBorders;
    (globalThis as { getRandomColor?: unknown }).getRandomColor =
      originalGetRandomColor;
    (globalThis as { Names?: unknown }).Names = originalNames;
    (globalThis as { COA?: unknown }).COA = originalCOA;
    (globalThis as { d3?: unknown }).d3 = originalD3;
  });

  it("minimal call creates a new province at id 1, mutates cells + state.provinces, redraws", async () => {
    const result = await addProvinceTool.execute({ capital: 1 });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as unknown as {
        pack: {
          provinces: RawProvince[];
          states: RawState[];
          burgs: RawBurg[];
          cells: { province: number[] };
        };
      }
    ).pack;
    expect(pack.provinces).toHaveLength(2);
    expect(pack.provinces[1]).toMatchObject({
      i: 1,
      name: "Capitalia",
      formName: "Province",
      fullName: "Capitalia Province",
      state: 1,
      center: 42,
      burg: 1,
    });
    expect(pack.states[1].provinces).toEqual([1]);
    expect(pack.cells.province[42]).toBe(1);
    // burg.capital should NOT be touched — it's for state capitals only.
    expect(pack.burgs[1].capital).toBe(0);
    expect(drawProvinces).toHaveBeenCalled();
    expect(drawBorders).toHaveBeenCalled();
  });

  it("accepts explicit state ref by name", async () => {
    const result = await addProvinceTool.execute({
      capital: "Capitalia",
      state: "Altaria",
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.state).toBe(1);
  });

  it("rejects state mismatch when caller provides inconsistent state ref", async () => {
    const pack = (globalThis as unknown as { pack: { states: RawState[] } })
      .pack;
    pack.states.push({
      i: 2,
      name: "Brighton",
      color: "#aa0000",
      form: "Republic",
      provinces: [],
    });
    const result = await addProvinceTool.execute({
      capital: 1,
      state: "Brighton",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/does not own/);
  });

  it("rejects removed burg", async () => {
    const pack = (globalThis as unknown as { pack: { burgs: RawBurg[] } }).pack;
    pack.burgs[1].removed = true;
    const result = await addProvinceTool.execute({ capital: 1 });
    expect(result.isError).toBe(true);
  });

  it("rejects neutral burg (state = 0)", async () => {
    const pack = (
      globalThis as unknown as { pack: { cells: { state: number[] } } }
    ).pack;
    pack.cells.state[42] = 0;
    const result = await addProvinceTool.execute({ capital: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/neutral lands/);
  });

  it("rejects cell already a province center", async () => {
    const pack = (
      globalThis as unknown as {
        pack: { provinces: RawProvince[]; cells: { province: number[] } };
      }
    ).pack;
    pack.provinces.push({
      i: 1,
      name: "Existing",
      formName: "Province",
      fullName: "Existing Province",
      color: "#00ff00",
      state: 1,
      center: 42,
      burg: 1,
    });
    pack.cells.province[42] = 1;
    const result = await addProvinceTool.execute({ capital: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/already the center/);
  });

  it("falls back to default color when getRandomColor is missing", async () => {
    (globalThis as { getRandomColor?: unknown }).getRandomColor = undefined;
    const result = await addProvinceTool.execute({ capital: 1 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.color).toBe("#888888");
  });

  it("swallows redraw errors (province still created)", async () => {
    drawProvinces.mockImplementation(() => {
      throw new Error("boom");
    });
    const result = await addProvinceTool.execute({ capital: 1 });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as unknown as { pack: { provinces: RawProvince[] } }
    ).pack;
    expect(pack.provinces).toHaveLength(2);
  });
});
