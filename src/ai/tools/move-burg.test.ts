import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawBurg, RawState } from "./_shared";
import {
  createMoveBurgTool,
  type MoveBurgCellInfo,
  type MoveBurgRef,
  type MoveBurgRuntime,
  moveBurgTool,
} from "./move-burg";

function makeRuntime(overrides: {
  find?: (ref: number | string) => MoveBurgRef | null;
  findCell?: (x: number, y: number) => MoveBurgCellInfo | null;
  cellOccupiedBy?: (cellId: number) => number;
  move?: MoveBurgRuntime["move"];
}): {
  runtime: MoveBurgRuntime;
  findCell: ReturnType<typeof vi.fn<MoveBurgRuntime["findCell"]>>;
  move: ReturnType<typeof vi.fn<MoveBurgRuntime["move"]>>;
} {
  const findCell = vi.fn<MoveBurgRuntime["findCell"]>(
    overrides.findCell ?? (() => ({ cellId: 42, cellState: 1 })),
  );
  const move = vi.fn<MoveBurgRuntime["move"]>(overrides.move ?? (() => {}));
  const runtime: MoveBurgRuntime = {
    find: overrides.find ?? (() => null),
    findCell,
    cellOccupiedBy: overrides.cellOccupiedBy ?? (() => 0),
    move,
  };
  return { runtime, findCell, move };
}

describe("move_burg tool", () => {
  it("moves by numeric id", async () => {
    const { runtime, findCell, move } = makeRuntime({
      find: (ref) =>
        ref === 3
          ? {
              i: 3,
              name: "Rookhold",
              previousX: 100,
              previousY: 200,
              previousCell: 11,
              previousState: 1,
              isCapital: false,
            }
          : null,
    });
    const tool = createMoveBurgTool(runtime);
    const result = await tool.execute({ burg: 3, x: 500, y: 600 });
    expect(result.isError).toBeFalsy();
    expect(findCell).toHaveBeenCalledWith(500, 600);
    expect(move).toHaveBeenCalled();
    const moveArgs = move.mock.calls[0];
    expect(moveArgs?.[1]).toBe(500);
    expect(moveArgs?.[2]).toBe(600);
    expect(moveArgs?.[3]).toBe(42);
    expect(moveArgs?.[4]).toBe(1);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 3,
      name: "Rookhold",
      x: 500,
      y: 600,
      cell: 42,
      state: 1,
      previousX: 100,
      previousY: 200,
      previousCell: 11,
      previousState: 1,
      noop: false,
    });
  });

  it("resolves by case-insensitive name", async () => {
    const find = vi.fn<MoveBurgRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "rookhold"
        ? {
            i: 3,
            name: "Rookhold",
            previousX: 0,
            previousY: 0,
            previousCell: 0,
            previousState: 1,
            isCapital: false,
          }
        : null,
    );
    const { runtime, move } = makeRuntime({ find });
    const tool = createMoveBurgTool(runtime);
    await tool.execute({ burg: "ROOKHOLD", x: 10, y: 20 });
    expect(find).toHaveBeenCalledWith("ROOKHOLD");
    expect(move).toHaveBeenCalled();
  });

  it("is a noop when coords unchanged and doesn't call findCell", async () => {
    const { runtime, findCell, move } = makeRuntime({
      find: () => ({
        i: 3,
        name: "x",
        previousX: 100,
        previousY: 200,
        previousCell: 11,
        previousState: 1,
        isCapital: false,
      }),
    });
    const tool = createMoveBurgTool(runtime);
    const result = await tool.execute({ burg: 3, x: 100, y: 200 });
    expect(findCell).not.toHaveBeenCalled();
    expect(move).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).noop).toBe(true);
  });

  it("rejects non-finite x", async () => {
    const { runtime, move } = makeRuntime({
      find: () => ({
        i: 3,
        name: "x",
        previousX: 0,
        previousY: 0,
        previousCell: 0,
        previousState: 1,
        isCapital: false,
      }),
    });
    const tool = createMoveBurgTool(runtime);
    for (const bad of [Number.POSITIVE_INFINITY, Number.NaN, "100", null]) {
      const r = await tool.execute({ burg: 3, x: bad, y: 20 });
      expect(r.isError).toBe(true);
    }
    expect(move).not.toHaveBeenCalled();
  });

  it("rejects non-finite y", async () => {
    const { runtime, move } = makeRuntime({
      find: () => ({
        i: 3,
        name: "x",
        previousX: 0,
        previousY: 0,
        previousCell: 0,
        previousState: 1,
        isCapital: false,
      }),
    });
    const tool = createMoveBurgTool(runtime);
    for (const bad of [Number.NEGATIVE_INFINITY, Number.NaN, "", undefined]) {
      const r = await tool.execute({ burg: 3, x: 10, y: bad });
      expect(r.isError).toBe(true);
    }
    expect(move).not.toHaveBeenCalled();
  });

  it("rejects invalid refs", async () => {
    const { runtime, move } = makeRuntime({});
    const tool = createMoveBurgTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ burg: bad, x: 10, y: 20 });
      expect(r.isError).toBe(true);
    }
    expect(move).not.toHaveBeenCalled();
  });

  it("rejects unknown burg", async () => {
    const { runtime, move } = makeRuntime({});
    const tool = createMoveBurgTool(runtime);
    const result = await tool.execute({ burg: 999, x: 10, y: 20 });
    expect(result.isError).toBe(true);
    expect(move).not.toHaveBeenCalled();
  });

  it("errors when findCell returns null", async () => {
    const { runtime, move } = makeRuntime({
      find: () => ({
        i: 3,
        name: "x",
        previousX: 0,
        previousY: 0,
        previousCell: 0,
        previousState: 1,
        isCapital: false,
      }),
      findCell: () => null,
    });
    const tool = createMoveBurgTool(runtime);
    const result = await tool.execute({ burg: 3, x: 10, y: 20 });
    expect(result.isError).toBe(true);
    expect(move).not.toHaveBeenCalled();
  });

  it("rejects occupied target cell", async () => {
    const { runtime, move } = makeRuntime({
      find: () => ({
        i: 3,
        name: "x",
        previousX: 0,
        previousY: 0,
        previousCell: 0,
        previousState: 1,
        isCapital: false,
      }),
      cellOccupiedBy: () => 99,
    });
    const tool = createMoveBurgTool(runtime);
    const result = await tool.execute({ burg: 3, x: 10, y: 20 });
    expect(result.isError).toBe(true);
    expect(move).not.toHaveBeenCalled();
  });

  it("allows a target cell occupied by the same burg", async () => {
    const { runtime, move } = makeRuntime({
      find: () => ({
        i: 3,
        name: "x",
        previousX: 0,
        previousY: 0,
        previousCell: 42,
        previousState: 1,
        isCapital: false,
      }),
      findCell: () => ({ cellId: 42, cellState: 1 }),
      cellOccupiedBy: () => 3,
    });
    const tool = createMoveBurgTool(runtime);
    const result = await tool.execute({ burg: 3, x: 500, y: 600 });
    expect(result.isError).toBeFalsy();
    expect(move).toHaveBeenCalled();
  });

  it("rejects cross-state capital relocation", async () => {
    const { runtime, move } = makeRuntime({
      find: () => ({
        i: 3,
        name: "x",
        previousX: 0,
        previousY: 0,
        previousCell: 0,
        previousState: 1,
        isCapital: true,
      }),
      findCell: () => ({ cellId: 42, cellState: 2 }),
    });
    const tool = createMoveBurgTool(runtime);
    const result = await tool.execute({ burg: 3, x: 10, y: 20 });
    expect(result.isError).toBe(true);
    expect(move).not.toHaveBeenCalled();
  });

  it("surfaces runtime errors", async () => {
    const { runtime } = makeRuntime({
      find: () => ({
        i: 3,
        name: "x",
        previousX: 0,
        previousY: 0,
        previousCell: 0,
        previousState: 1,
        isCapital: false,
      }),
      move: vi.fn(() => {
        throw new Error("Burg 3 not found.");
      }),
    });
    const tool = createMoveBurgTool(runtime);
    const result = await tool.execute({ burg: 3, x: 10, y: 20 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Burg/);
  });
});

describe("defaultMoveBurgRuntime (integration)", () => {
  const findCellMock = vi.fn((_x: number, _y: number) => 42);
  const drawBurgIcon = vi.fn();
  const drawBurgLabel = vi.fn();
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalFindCell = (globalThis as { findCell?: unknown }).findCell;
  const originalDrawIcon = (globalThis as { drawBurgIcon?: unknown })
    .drawBurgIcon;
  const originalDrawLabel = (globalThis as { drawBurgLabel?: unknown })
    .drawBurgLabel;

  beforeEach(() => {
    findCellMock.mockClear();
    findCellMock.mockImplementation(() => 42);
    drawBurgIcon.mockReset();
    drawBurgLabel.mockReset();

    const burgCells = new Array(50).fill(0);
    burgCells[10] = 1; // capital at cell 10
    burgCells[11] = 3; // Rookhold at cell 11
    burgCells[30] = 2; // Other at cell 30
    const stateCells = new Array(50).fill(0);
    stateCells[10] = 1;
    stateCells[11] = 1;
    stateCells[20] = 1; // unoccupied state-1 cell for capital test
    stateCells[30] = 2;
    stateCells[42] = 2; // state-2 cell used by happy path + cross-state test
    (globalThis as { pack?: unknown }).pack = {
      cells: { burg: burgCells, state: stateCells },
      burgs: [
        { i: 0 },
        { i: 1, name: "Capital", state: 1, capital: 1, cell: 10, x: 0, y: 0 },
        { i: 2, name: "Other", state: 2, cell: 30, x: 0, y: 0 },
        { i: 3, name: "Rookhold", state: 1, cell: 11, x: 100, y: 200 },
      ] satisfies RawBurg[],
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "Altaria", center: 10 },
        { i: 2, name: "Brighton", center: 30 },
      ] satisfies RawState[],
    };
    (globalThis as { findCell?: unknown }).findCell = findCellMock;
    (globalThis as { drawBurgIcon?: unknown }).drawBurgIcon = drawBurgIcon;
    (globalThis as { drawBurgLabel?: unknown }).drawBurgLabel = drawBurgLabel;
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { findCell?: unknown }).findCell = originalFindCell;
    (globalThis as { drawBurgIcon?: unknown }).drawBurgIcon = originalDrawIcon;
    (globalThis as { drawBurgLabel?: unknown }).drawBurgLabel =
      originalDrawLabel;
  });

  it("happy path: writes pack fields and clears old cell", async () => {
    const result = await moveBurgTool.execute({ burg: 3, x: 300, y: 400 });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as unknown as {
        pack: {
          cells: { burg: number[]; state: number[] };
          burgs: RawBurg[];
          states: RawState[];
        };
      }
    ).pack;
    expect(pack.cells.burg[11]).toBe(0);
    expect(pack.cells.burg[42]).toBe(3);
    expect(pack.burgs[3]?.cell).toBe(42);
    expect(pack.burgs[3]?.x).toBe(300);
    expect(pack.burgs[3]?.y).toBe(400);
    // findCell → 42 → cells.state[42] = 2 (cross-state non-capital move)
    expect(pack.burgs[3]?.state).toBe(2);
    expect(drawBurgIcon).toHaveBeenCalledTimes(1);
    expect(drawBurgLabel).toHaveBeenCalledTimes(1);
  });

  it("updates state.center when the moved burg is a capital", async () => {
    // cell 20 is in state 1 (same as capital) and unoccupied
    findCellMock.mockImplementation(() => 20);
    const result = await moveBurgTool.execute({ burg: 1, x: 200, y: 300 });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as unknown as { pack: { states: RawState[] } })
      .pack;
    expect(pack.states[1]?.center).toBe(20);
  });

  it("rejects occupied target cell and leaves pack unchanged", async () => {
    findCellMock.mockImplementation(() => 11);
    const result = await moveBurgTool.execute({ burg: 2, x: 500, y: 500 });
    expect(result.isError).toBe(true);
    const pack = (
      globalThis as unknown as {
        pack: { cells: { burg: number[] }; burgs: RawBurg[] };
      }
    ).pack;
    // cell 11 still points at burg 3 (unchanged)
    expect(pack.cells.burg[11]).toBe(3);
    // burg 2 still at old cell 30
    expect(pack.burgs[2]?.cell).toBe(30);
  });

  it("rejects cross-state capital relocation", async () => {
    findCellMock.mockImplementation(() => 42);
    const result = await moveBurgTool.execute({ burg: 1, x: 500, y: 500 });
    expect(result.isError).toBe(true);
    const pack = (
      globalThis as unknown as {
        pack: { burgs: RawBurg[]; states: RawState[] };
      }
    ).pack;
    expect(pack.burgs[1]?.cell).toBe(10);
    expect(pack.states[1]?.center).toBe(10);
  });
});
