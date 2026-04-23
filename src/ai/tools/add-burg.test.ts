import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawBurg } from "./_shared";
import {
  type AddBurgLandInfo,
  type AddBurgResult,
  type AddBurgRuntime,
  addBurgTool,
  createAddBurgTool,
} from "./add-burg";

function makeRuntime(
  overrides: {
    findCell?: (x: number, y: number) => number | null;
    landOccupancy?: (cellId: number) => AddBurgLandInfo;
    add?: (x: number, y: number) => AddBurgResult;
  } = {},
): {
  runtime: AddBurgRuntime;
  add: ReturnType<typeof vi.fn<AddBurgRuntime["add"]>>;
  findCell: ReturnType<typeof vi.fn<AddBurgRuntime["findCell"]>>;
} {
  const findCell = vi.fn<AddBurgRuntime["findCell"]>(
    overrides.findCell ?? (() => 42),
  );
  const landOccupancy = vi.fn<AddBurgRuntime["landOccupancy"]>(
    overrides.landOccupancy ?? (() => ({ land: true, occupiedBy: 0 })),
  );
  const add = vi.fn<AddBurgRuntime["add"]>(
    overrides.add ??
      (() => ({
        i: 10,
        cell: 42,
        state: 1,
        culture: 2,
        name: "New Haven",
        x: 100,
        y: 200,
        port: 0,
        capital: 0,
      })),
  );
  return { runtime: { findCell, landOccupancy, add }, add, findCell };
}

describe("add_burg tool", () => {
  it("happy path: findCell + landOccupancy + add delegation", async () => {
    const { runtime, add, findCell } = makeRuntime();
    const tool = createAddBurgTool(runtime);
    const result = await tool.execute({ x: 100, y: 200 });
    expect(result.isError).toBeFalsy();
    expect(findCell).toHaveBeenCalledWith(100, 200);
    expect(add).toHaveBeenCalledWith(100, 200);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 10,
      cell: 42,
      state: 1,
      culture: 2,
      name: "New Haven",
      x: 100,
      y: 200,
      port: 0,
      capital: 0,
    });
  });

  it("rejects non-finite x", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddBurgTool(runtime);
    for (const bad of [Number.POSITIVE_INFINITY, Number.NaN, "100", null]) {
      const r = await tool.execute({ x: bad, y: 100 });
      expect(r.isError).toBe(true);
    }
    expect(add).not.toHaveBeenCalled();
  });

  it("rejects non-finite y", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddBurgTool(runtime);
    for (const bad of [Number.NEGATIVE_INFINITY, Number.NaN, "", undefined]) {
      const r = await tool.execute({ x: 100, y: bad });
      expect(r.isError).toBe(true);
    }
    expect(add).not.toHaveBeenCalled();
  });

  it("rejects when findCell returns null", async () => {
    const { runtime, add } = makeRuntime({ findCell: () => null });
    const tool = createAddBurgTool(runtime);
    const result = await tool.execute({ x: 100, y: 200 });
    expect(result.isError).toBe(true);
    expect(add).not.toHaveBeenCalled();
  });

  it("rejects water cell (land: false)", async () => {
    const { runtime, add } = makeRuntime({
      landOccupancy: () => ({ land: false, occupiedBy: 0 }),
    });
    const tool = createAddBurgTool(runtime);
    const result = await tool.execute({ x: 100, y: 200 });
    expect(result.isError).toBe(true);
    expect(add).not.toHaveBeenCalled();
  });

  it("rejects occupied cell", async () => {
    const { runtime, add } = makeRuntime({
      landOccupancy: () => ({ land: true, occupiedBy: 5 }),
    });
    const tool = createAddBurgTool(runtime);
    const result = await tool.execute({ x: 100, y: 200 });
    expect(result.isError).toBe(true);
    expect(add).not.toHaveBeenCalled();
  });

  it("surfaces runtime errors from add", async () => {
    const { runtime } = makeRuntime({
      add: () => {
        throw new Error("Burgs.add is not available yet");
      },
    });
    const tool = createAddBurgTool(runtime);
    const result = await tool.execute({ x: 100, y: 200 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Burgs\.add/);
  });
});

describe("defaultAddBurgRuntime (integration)", () => {
  const findCellMock = vi.fn((_x: number, _y: number) => 42);
  const burgsAdd = vi.fn();
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalBurgs = (globalThis as { Burgs?: unknown }).Burgs;
  const originalFindCell = (globalThis as { findCell?: unknown }).findCell;

  beforeEach(() => {
    findCellMock.mockClear();
    findCellMock.mockImplementation(() => 42);
    burgsAdd.mockReset();
    burgsAdd.mockImplementation((point: [number, number]) => {
      const pack = (globalThis as unknown as { pack: { burgs: RawBurg[] } })
        .pack;
      const id = pack.burgs.length;
      pack.burgs.push({
        i: id,
        name: "New Haven",
        x: point[0],
        y: point[1],
        cell: 42,
        state: 1,
        culture: 2,
        capital: 0,
        port: 0,
      });
      return id;
    });

    const h = new Array(50).fill(0);
    h[42] = 25; // land
    h[10] = 5; // water
    const burgCells = new Array(50).fill(0);
    burgCells[20] = 3; // occupied
    (globalThis as { pack?: unknown }).pack = {
      cells: { h, burg: burgCells },
      burgs: [{ i: 0 }],
    };
    (globalThis as { Burgs?: unknown }).Burgs = { add: burgsAdd };
    (globalThis as { findCell?: unknown }).findCell = findCellMock;
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { Burgs?: unknown }).Burgs = originalBurgs;
    (globalThis as { findCell?: unknown }).findCell = originalFindCell;
  });

  it("delegates to Burgs.add and returns the new burg's fields", async () => {
    const result = await addBurgTool.execute({ x: 100, y: 200 });
    expect(result.isError).toBeFalsy();
    expect(burgsAdd).toHaveBeenCalledWith([100, 200]);
    const body = JSON.parse(result.content);
    expect(body.i).toBe(1);
    expect(body.cell).toBe(42);
    expect(body.state).toBe(1);
    expect(body.culture).toBe(2);
    expect(body.name).toBe("New Haven");
  });

  it("rejects water cell", async () => {
    findCellMock.mockImplementation(() => 10);
    const result = await addBurgTool.execute({ x: 100, y: 200 });
    expect(result.isError).toBe(true);
    expect(burgsAdd).not.toHaveBeenCalled();
  });

  it("rejects occupied cell", async () => {
    findCellMock.mockImplementation(() => 20);
    // Need land at 20 too for the water check to pass before the occupied check
    const pack = (globalThis as unknown as { pack: { cells: { h: number[] } } })
      .pack;
    pack.cells.h[20] = 25;
    const result = await addBurgTool.execute({ x: 100, y: 200 });
    expect(result.isError).toBe(true);
    expect(burgsAdd).not.toHaveBeenCalled();
  });

  it("errors when Burgs.add is missing", async () => {
    (globalThis as { Burgs?: unknown }).Burgs = {};
    const result = await addBurgTool.execute({ x: 100, y: 200 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Burgs\.add/);
  });
});
