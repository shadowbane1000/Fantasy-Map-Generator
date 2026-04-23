import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawBurg, RawCulture, RawState } from "./_shared";
import {
  type AddStateBurgInfo,
  type AddStateCultureInfo,
  type AddStateResult,
  type AddStateRuntime,
  addStateTool,
  createAddStateTool,
  type NewStateInput,
} from "./add-state";

function makeRuntime(
  overrides: {
    findBurg?: (ref: number | string) => AddStateBurgInfo | null;
    findCulture?: (ref: number | string) => AddStateCultureInfo | null;
    cellLand?: (cellId: number) => boolean;
    cultureFor?: (cultureId: number) => AddStateCultureInfo | null;
    randomColor?: () => string;
    generateName?: (cultureId: number, burgName: string) => string;
    generateCoa?: AddStateRuntime["generateCoa"];
    apply?: (state: NewStateInput, capitalBurgI: number) => AddStateResult;
    redraw?: (newStateI: number) => void;
  } = {},
): {
  runtime: AddStateRuntime;
  findBurg: ReturnType<typeof vi.fn<AddStateRuntime["findBurg"]>>;
  findCulture: ReturnType<typeof vi.fn<AddStateRuntime["findCulture"]>>;
  cellLand: ReturnType<typeof vi.fn<AddStateRuntime["cellLand"]>>;
  cultureFor: ReturnType<typeof vi.fn<AddStateRuntime["cultureFor"]>>;
  randomColor: ReturnType<typeof vi.fn<AddStateRuntime["randomColor"]>>;
  generateName: ReturnType<typeof vi.fn<AddStateRuntime["generateName"]>>;
  generateCoa: ReturnType<typeof vi.fn<AddStateRuntime["generateCoa"]>>;
  apply: ReturnType<typeof vi.fn<AddStateRuntime["apply"]>>;
  redraw: ReturnType<typeof vi.fn<AddStateRuntime["redraw"]>>;
} {
  const findBurg = vi.fn<AddStateRuntime["findBurg"]>(
    overrides.findBurg ??
      (() => ({
        i: 5,
        cell: 42,
        culture: 2,
        name: "TestBurg",
        coa: undefined,
        isCapital: false,
        removed: false,
      })),
  );
  const findCulture = vi.fn<AddStateRuntime["findCulture"]>(
    overrides.findCulture ??
      (() => ({ i: 2, name: "TestCulture", type: "Generic" })),
  );
  const cellLand = vi.fn<AddStateRuntime["cellLand"]>(
    overrides.cellLand ?? (() => true),
  );
  const cultureFor = vi.fn<AddStateRuntime["cultureFor"]>(
    overrides.cultureFor ??
      (() => ({ i: 2, name: "TestCulture", type: "Generic" })),
  );
  const randomColor = vi.fn<AddStateRuntime["randomColor"]>(
    overrides.randomColor ?? (() => "#abc123"),
  );
  const generateName = vi.fn<AddStateRuntime["generateName"]>(
    overrides.generateName ?? (() => "GeneratedName"),
  );
  const generateCoa = vi.fn<AddStateRuntime["generateCoa"]>(
    overrides.generateCoa ?? (() => undefined),
  );
  const apply = vi.fn<AddStateRuntime["apply"]>(
    overrides.apply ??
      ((input: NewStateInput) => ({
        i: 1,
        name: input.name,
        fullName: input.fullName,
        color: input.color,
        type: input.type,
        form: input.form,
        formName: input.formName,
        capital: input.capital,
        center: input.center,
        culture: input.culture,
      })),
  );
  const redraw = vi.fn<AddStateRuntime["redraw"]>(
    overrides.redraw ?? (() => {}),
  );
  return {
    runtime: {
      findBurg,
      findCulture,
      cellLand,
      cultureFor,
      randomColor,
      generateName,
      generateCoa,
      apply,
      redraw,
    },
    findBurg,
    findCulture,
    cellLand,
    cultureFor,
    randomColor,
    generateName,
    generateCoa,
    apply,
    redraw,
  };
}

describe("add_state tool", () => {
  it("happy path: seams called, defaults applied, result shape correct", async () => {
    const { runtime, findBurg, cellLand, cultureFor, apply, redraw } =
      makeRuntime();
    const tool = createAddStateTool(runtime);
    const result = await tool.execute({ capital: 5 });
    expect(result.isError).toBeFalsy();
    expect(findBurg).toHaveBeenCalledWith(5);
    expect(cellLand).toHaveBeenCalledWith(42);
    expect(cultureFor).toHaveBeenCalledWith(2);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(redraw).toHaveBeenCalledWith(1);
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      i: 1,
      name: "GeneratedName",
      color: "#abc123",
      type: "Generic",
      form: "Monarchy",
      formName: "Monarchy",
      fullName: "Monarchy of GeneratedName",
      capital: 5,
      center: 42,
      culture: 2,
    });
  });

  it("passes explicit name / color / type / form through and composes fullName", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createAddStateTool(runtime);
    const result = await tool.execute({
      capital: 5,
      name: "Eldoria",
      color: "#ff00ff",
      type: "Naval",
      form: "Republic",
    });
    expect(result.isError).toBeFalsy();
    const callArgs = apply.mock.calls[0][0];
    expect(callArgs.name).toBe("Eldoria");
    expect(callArgs.color).toBe("#ff00ff");
    expect(callArgs.type).toBe("Naval");
    expect(callArgs.form).toBe("Republic");
    expect(callArgs.formName).toBe("Republic");
    expect(callArgs.fullName).toBe("Republic of Eldoria");
  });

  it("resolves explicit culture ref via runtime.findCulture", async () => {
    const findCulture = vi.fn(() => ({
      i: 7,
      name: "Explicit",
      type: "Highland",
    }));
    const { runtime, cultureFor, apply } = makeRuntime({ findCulture });
    const tool = createAddStateTool(runtime);
    const result = await tool.execute({ capital: 5, culture: "explicit" });
    expect(result.isError).toBeFalsy();
    expect(findCulture).toHaveBeenCalledWith("explicit");
    expect(cultureFor).not.toHaveBeenCalled();
    expect(apply.mock.calls[0][0].culture).toBe(7);
  });

  it("rejects missing / invalid capital ref", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createAddStateTool(runtime);
    for (const bad of [undefined, null, 0, -1, "", 1.5]) {
      const r = await tool.execute({ capital: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects empty / whitespace / non-string name", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createAddStateTool(runtime);
    for (const bad of ["", "   ", 42]) {
      const r = await tool.execute({ capital: 5, name: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects empty color / type / form", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createAddStateTool(runtime);
    expect((await tool.execute({ capital: 5, color: "" })).isError).toBe(true);
    expect((await tool.execute({ capital: 5, type: "" })).isError).toBe(true);
    expect((await tool.execute({ capital: 5, form: "" })).isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid culture ref", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createAddStateTool(runtime);
    const r = await tool.execute({ capital: 5, culture: "" });
    expect(r.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects when findBurg returns null", async () => {
    const { runtime, apply } = makeRuntime({ findBurg: () => null });
    const tool = createAddStateTool(runtime);
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
        isCapital: false,
        removed: true,
      }),
    });
    const tool = createAddStateTool(runtime);
    const r = await tool.execute({ capital: 5 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/removed/);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects already-capital burg", async () => {
    const { runtime, apply } = makeRuntime({
      findBurg: () => ({
        i: 5,
        cell: 42,
        culture: 2,
        name: "AlreadyCap",
        isCapital: true,
        removed: false,
      }),
    });
    const tool = createAddStateTool(runtime);
    const r = await tool.execute({ capital: 5 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/already a capital/);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects burg on water cell", async () => {
    const { runtime, apply } = makeRuntime({ cellLand: () => false });
    const tool = createAddStateTool(runtime);
    const r = await tool.execute({ capital: 5 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not land/);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects explicit culture ref that doesn't resolve", async () => {
    const { runtime, apply } = makeRuntime({ findCulture: () => null });
    const tool = createAddStateTool(runtime);
    const r = await tool.execute({ capital: 5, culture: "ghost" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/No culture found/);
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces runtime.apply errors", async () => {
    const { runtime } = makeRuntime({
      apply: () => {
        throw new Error("pack.states is not available.");
      },
    });
    const tool = createAddStateTool(runtime);
    const r = await tool.execute({ capital: 5 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/pack\.states/);
  });

  it("calls redraw after successful apply", async () => {
    const { runtime, redraw } = makeRuntime();
    const tool = createAddStateTool(runtime);
    const r = await tool.execute({ capital: 5 });
    expect(r.isError).toBeFalsy();
    expect(redraw).toHaveBeenCalledTimes(1);
  });
});

describe("defaultAddStateRuntime (integration)", () => {
  const drawStates = vi.fn();
  const drawStateLabels = vi.fn();
  const drawBorders = vi.fn();
  const getRandomColor = vi.fn(() => "#deadbe");
  const namesGetState = vi.fn(() => "GenName");
  const namesGetCultureShort = vi.fn(() => "base");

  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalDrawStates = (globalThis as { drawStates?: unknown })
    .drawStates;
  const originalDrawStateLabels = (globalThis as { drawStateLabels?: unknown })
    .drawStateLabels;
  const originalDrawBorders = (globalThis as { drawBorders?: unknown })
    .drawBorders;
  const originalGetRandomColor = (globalThis as { getRandomColor?: unknown })
    .getRandomColor;
  const originalNames = (globalThis as { Names?: unknown }).Names;
  const originalCOA = (globalThis as { COA?: unknown }).COA;

  beforeEach(() => {
    drawStates.mockReset();
    drawStateLabels.mockReset();
    drawBorders.mockReset();
    getRandomColor.mockReset().mockReturnValue("#deadbe");
    namesGetState.mockReset().mockReturnValue("GenName");
    namesGetCultureShort.mockReset().mockReturnValue("base");

    const h = new Array(50).fill(0);
    h[42] = 25; // land
    h[10] = 5; // water
    const cellState = new Array(50).fill(0);
    const cellBurg = new Array(50).fill(0);
    cellBurg[42] = 1;

    const burgs: RawBurg[] = [
      { i: 0 },
      {
        i: 1,
        name: "Capitalia",
        cell: 42,
        culture: 2,
        state: 0,
        capital: 0,
      },
    ];
    const cultures: RawCulture[] = [
      { i: 0, name: "Wildlands", type: "Generic" },
      { i: 1, name: "Other", type: "Generic" },
      { i: 2, name: "TestCulture", type: "Highland" },
    ];
    const states: RawState[] = [{ i: 0, name: "Neutrals", diplomacy: ["x"] }];

    (globalThis as { pack?: unknown }).pack = {
      cells: { h, state: cellState, burg: cellBurg },
      burgs,
      cultures,
      states,
    };
    (globalThis as { drawStates?: unknown }).drawStates = drawStates;
    (globalThis as { drawStateLabels?: unknown }).drawStateLabels =
      drawStateLabels;
    (globalThis as { drawBorders?: unknown }).drawBorders = drawBorders;
    (globalThis as { getRandomColor?: unknown }).getRandomColor =
      getRandomColor;
    (globalThis as { Names?: unknown }).Names = {
      getState: namesGetState,
      getCultureShort: namesGetCultureShort,
    };
    (globalThis as { COA?: unknown }).COA = undefined; // no COA by default
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { drawStates?: unknown }).drawStates = originalDrawStates;
    (globalThis as { drawStateLabels?: unknown }).drawStateLabels =
      originalDrawStateLabels;
    (globalThis as { drawBorders?: unknown }).drawBorders = originalDrawBorders;
    (globalThis as { getRandomColor?: unknown }).getRandomColor =
      originalGetRandomColor;
    (globalThis as { Names?: unknown }).Names = originalNames;
    (globalThis as { COA?: unknown }).COA = originalCOA;
  });

  it("minimal call creates a new state at id 1, mutates burg + cells, redraws", async () => {
    const result = await addStateTool.execute({ capital: 1 });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as unknown as {
        pack: {
          states: RawState[];
          burgs: RawBurg[];
          cells: { state: number[] };
        };
      }
    ).pack;
    expect(pack.states).toHaveLength(2);
    expect(pack.states[1]).toMatchObject({
      i: 1,
      name: "GenName",
      color: "#deadbe",
      type: "Generic",
      form: "Monarchy",
      formName: "Monarchy",
      fullName: "Monarchy of GenName",
      capital: 1,
      center: 42,
      culture: 2,
      expansionism: 0.5,
      burgs: 1,
      cells: 1,
      alert: 1,
    });
    expect(pack.states[1].diplomacy).toEqual(["x", "x"]);
    expect(pack.burgs[1].capital).toBe(1);
    expect(pack.burgs[1].state).toBe(1);
    expect(pack.cells.state[42]).toBe(1);
    expect(drawStates).toHaveBeenCalled();
    expect(drawStateLabels).toHaveBeenCalledWith([1]);
    expect(drawBorders).toHaveBeenCalled();
  });

  it("accepts explicit culture ref by name", async () => {
    const result = await addStateTool.execute({
      capital: "Capitalia",
      culture: "Other",
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.culture).toBe(1);
  });

  it("rejects already-capital burg", async () => {
    const pack = (globalThis as unknown as { pack: { burgs: RawBurg[] } }).pack;
    pack.burgs[1].capital = 1;
    const result = await addStateTool.execute({ capital: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/already a capital/);
  });

  it("rejects removed burg", async () => {
    const pack = (globalThis as unknown as { pack: { burgs: RawBurg[] } }).pack;
    pack.burgs[1].removed = true;
    const result = await addStateTool.execute({ capital: 1 });
    expect(result.isError).toBe(true);
  });

  it("falls back to default color when getRandomColor is missing", async () => {
    (globalThis as { getRandomColor?: unknown }).getRandomColor = undefined;
    const result = await addStateTool.execute({ capital: 1 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.color).toBe("#888888");
  });

  it("swallows redraw errors (state still created)", async () => {
    drawStates.mockImplementation(() => {
      throw new Error("boom");
    });
    const result = await addStateTool.execute({ capital: 1 });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as unknown as { pack: { states: RawState[] } })
      .pack;
    expect(pack.states).toHaveLength(2);
  });
});
