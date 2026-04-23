import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawCulture } from "./_shared";
import {
  type AddCultureCellInfo,
  type AddCultureResult,
  type AddCultureRuntime,
  addCultureTool,
  createAddCultureTool,
} from "./add-culture";

function makeRuntime(
  overrides: {
    findCell?: (x: number, y: number) => number | null;
    validateCell?: (cellId: number) => AddCultureCellInfo;
    add?: (cellId: number) => AddCultureResult;
  } = {},
): {
  runtime: AddCultureRuntime;
  add: ReturnType<typeof vi.fn<AddCultureRuntime["add"]>>;
  findCell: ReturnType<typeof vi.fn<AddCultureRuntime["findCell"]>>;
} {
  const findCell = vi.fn<AddCultureRuntime["findCell"]>(
    overrides.findCell ?? (() => 42),
  );
  const validateCell = vi.fn<AddCultureRuntime["validateCell"]>(
    overrides.validateCell ?? (() => ({ land: true, occupiedBy: null })),
  );
  const add = vi.fn<AddCultureRuntime["add"]>(
    overrides.add ??
      (() => ({
        i: 5,
        name: "Highlanders",
        center: 42,
        color: "#aa3366",
        base: 0,
        expansionism: 1,
        type: "Generic",
      })),
  );
  return { runtime: { findCell, validateCell, add }, add, findCell };
}

describe("add_culture tool", () => {
  it("happy path delegates to runtime.add", async () => {
    const { runtime, add, findCell } = makeRuntime();
    const tool = createAddCultureTool(runtime);
    const result = await tool.execute({ x: 100, y: 200 });
    expect(result.isError).toBeFalsy();
    expect(findCell).toHaveBeenCalledWith(100, 200);
    expect(add).toHaveBeenCalledWith(42);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 5,
      name: "Highlanders",
      center: 42,
      color: "#aa3366",
      base: 0,
      expansionism: 1,
      type: "Generic",
    });
  });

  it("rejects non-finite x", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddCultureTool(runtime);
    for (const bad of [Number.POSITIVE_INFINITY, Number.NaN, "100", null]) {
      const r = await tool.execute({ x: bad, y: 100 });
      expect(r.isError).toBe(true);
    }
    expect(add).not.toHaveBeenCalled();
  });

  it("rejects non-finite y", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddCultureTool(runtime);
    for (const bad of [Number.NEGATIVE_INFINITY, Number.NaN, "", undefined]) {
      const r = await tool.execute({ x: 100, y: bad });
      expect(r.isError).toBe(true);
    }
    expect(add).not.toHaveBeenCalled();
  });

  it("rejects when findCell returns null", async () => {
    const { runtime, add } = makeRuntime({ findCell: () => null });
    const tool = createAddCultureTool(runtime);
    const result = await tool.execute({ x: 100, y: 200 });
    expect(result.isError).toBe(true);
    expect(add).not.toHaveBeenCalled();
  });

  it("rejects water cell", async () => {
    const { runtime, add } = makeRuntime({
      validateCell: () => ({ land: false, occupiedBy: null }),
    });
    const tool = createAddCultureTool(runtime);
    const result = await tool.execute({ x: 100, y: 200 });
    expect(result.isError).toBe(true);
    expect(add).not.toHaveBeenCalled();
  });

  it("rejects occupied culture center", async () => {
    const { runtime, add } = makeRuntime({
      validateCell: () => ({ land: true, occupiedBy: 3 }),
    });
    const tool = createAddCultureTool(runtime);
    const result = await tool.execute({ x: 100, y: 200 });
    expect(result.isError).toBe(true);
    expect(add).not.toHaveBeenCalled();
  });

  it("surfaces runtime errors from add", async () => {
    const { runtime } = makeRuntime({
      add: () => {
        throw new Error("Cultures.add is not available yet");
      },
    });
    const tool = createAddCultureTool(runtime);
    const result = await tool.execute({ x: 100, y: 200 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Cultures\.add/);
  });
});

describe("defaultAddCultureRuntime (integration)", () => {
  const findCellMock = vi.fn((_x: number, _y: number) => 42);
  const culturesAdd = vi.fn();
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalCultures = (globalThis as { Cultures?: unknown }).Cultures;
  const originalFindCell = (globalThis as { findCell?: unknown }).findCell;

  beforeEach(() => {
    findCellMock.mockClear();
    findCellMock.mockImplementation(() => 42);
    culturesAdd.mockReset();
    culturesAdd.mockImplementation((center: number) => {
      const pack = (
        globalThis as unknown as { pack: { cultures: RawCulture[] } }
      ).pack;
      const i = pack.cultures.length;
      pack.cultures.push({
        i,
        name: "New Culture",
        color: "#123456",
        base: 0,
        center,
        expansionism: 1,
        type: "Generic",
      });
    });

    const h = new Array(50).fill(0);
    h[42] = 25; // land
    h[10] = 5; // water
    (globalThis as { pack?: unknown }).pack = {
      cells: { h },
      cultures: [
        { i: 0, name: "Wildlands", removed: true },
        { i: 1, name: "Highlanders", center: 20 },
      ] satisfies RawCulture[],
    };
    (globalThis as { Cultures?: unknown }).Cultures = { add: culturesAdd };
    (globalThis as { findCell?: unknown }).findCell = findCellMock;
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { Cultures?: unknown }).Cultures = originalCultures;
    (globalThis as { findCell?: unknown }).findCell = originalFindCell;
  });

  it("delegates to Cultures.add and returns the new culture", async () => {
    const result = await addCultureTool.execute({ x: 100, y: 200 });
    expect(result.isError).toBeFalsy();
    expect(culturesAdd).toHaveBeenCalledWith(42);
    const body = JSON.parse(result.content);
    expect(body.i).toBe(2);
    expect(body.name).toBe("New Culture");
    expect(body.center).toBe(42);
  });

  it("rejects water cell", async () => {
    findCellMock.mockImplementation(() => 10);
    const result = await addCultureTool.execute({ x: 100, y: 200 });
    expect(result.isError).toBe(true);
    expect(culturesAdd).not.toHaveBeenCalled();
  });

  it("rejects a cell already used as a culture center", async () => {
    findCellMock.mockImplementation(() => 20);
    // Also need land at 20 for water check to pass first
    const pack = (globalThis as unknown as { pack: { cells: { h: number[] } } })
      .pack;
    pack.cells.h[20] = 25;
    const result = await addCultureTool.execute({ x: 100, y: 200 });
    expect(result.isError).toBe(true);
    expect(culturesAdd).not.toHaveBeenCalled();
  });

  it("errors when Cultures.add is missing", async () => {
    (globalThis as { Cultures?: unknown }).Cultures = {};
    const result = await addCultureTool.execute({ x: 100, y: 200 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Cultures\.add/);
  });
});
