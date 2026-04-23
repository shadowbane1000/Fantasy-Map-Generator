import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawRegiment, RawState } from "./_shared";
import {
  type AddRegimentResult,
  type AddRegimentRuntime,
  type AddRegimentStateInfo,
  addRegimentTool,
  createAddRegimentTool,
} from "./add-regiment";

function makeRuntime(
  overrides: {
    findState?: (stateRef: number | string) => AddRegimentStateInfo | null;
    findCell?: (x: number, y: number) => number | null;
    centroid?: (cellId: number) => [number, number] | null;
    naval?: (cellId: number) => number;
    add?: (
      stateId: number,
      cellId: number,
      x: number,
      y: number,
      n: number,
    ) => AddRegimentResult;
  } = {},
): {
  runtime: AddRegimentRuntime;
  add: ReturnType<typeof vi.fn<AddRegimentRuntime["add"]>>;
} {
  const findState = vi.fn<AddRegimentRuntime["findState"]>(
    overrides.findState ?? (() => ({ stateId: 1, stateName: "Altaria" })),
  );
  const findCell = vi.fn<AddRegimentRuntime["findCell"]>(
    overrides.findCell ?? (() => 42),
  );
  const centroid = vi.fn<AddRegimentRuntime["centroid"]>(
    overrides.centroid ?? (() => [150, 250]),
  );
  const naval = vi.fn<AddRegimentRuntime["naval"]>(
    overrides.naval ?? (() => 0),
  );
  const add = vi.fn<AddRegimentRuntime["add"]>(
    overrides.add ??
      ((stateId, cellId, x, y, n) => ({
        i: 3,
        name: "3rd Altaria",
        cell: cellId,
        x,
        y,
        n,
        state: stateId,
      })),
  );
  return {
    runtime: { findState, findCell, centroid, naval, add },
    add,
  };
}

describe("add_regiment tool", () => {
  it("happy path: findState → findCell → centroid → naval → add", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddRegimentTool(runtime);
    const result = await tool.execute({ state: 1, x: 100, y: 200 });
    expect(result.isError).toBeFalsy();
    expect(add).toHaveBeenCalledWith(1, 42, 150, 250, 0);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      stateId: 1,
      stateName: "Altaria",
      i: 3,
      name: "3rd Altaria",
      cell: 42,
      x: 150,
      y: 250,
      n: 0,
    });
  });

  it("resolves state by case-insensitive name", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddRegimentTool(runtime);
    await tool.execute({ state: "ALTARIA", x: 100, y: 200 });
    expect(add).toHaveBeenCalled();
  });

  it("rejects non-finite x", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddRegimentTool(runtime);
    for (const bad of [Number.POSITIVE_INFINITY, Number.NaN, "100", null]) {
      const r = await tool.execute({ state: 1, x: bad, y: 100 });
      expect(r.isError).toBe(true);
    }
    expect(add).not.toHaveBeenCalled();
  });

  it("rejects non-finite y", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddRegimentTool(runtime);
    for (const bad of [Number.NEGATIVE_INFINITY, Number.NaN, "", undefined]) {
      const r = await tool.execute({ state: 1, x: 100, y: bad });
      expect(r.isError).toBe(true);
    }
    expect(add).not.toHaveBeenCalled();
  });

  it("rejects invalid state refs", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddRegimentTool(runtime);
    for (const bad of [null, undefined, -1, 1.5, ""]) {
      const r = await tool.execute({ state: bad, x: 100, y: 200 });
      expect(r.isError).toBe(true);
    }
    expect(add).not.toHaveBeenCalled();
  });

  it("rejects unknown state (findState null)", async () => {
    const { runtime, add } = makeRuntime({ findState: () => null });
    const tool = createAddRegimentTool(runtime);
    const result = await tool.execute({ state: 999, x: 100, y: 200 });
    expect(result.isError).toBe(true);
    expect(add).not.toHaveBeenCalled();
  });

  it("rejects when findCell returns null", async () => {
    const { runtime, add } = makeRuntime({ findCell: () => null });
    const tool = createAddRegimentTool(runtime);
    const result = await tool.execute({ state: 1, x: 100, y: 200 });
    expect(result.isError).toBe(true);
    expect(add).not.toHaveBeenCalled();
  });

  it("surfaces runtime errors", async () => {
    const { runtime } = makeRuntime({
      add: () => {
        throw new Error("Military.getName is not available yet");
      },
    });
    const tool = createAddRegimentTool(runtime);
    const result = await tool.execute({ state: 1, x: 100, y: 200 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Military\.getName/);
  });
});

describe("defaultAddRegimentRuntime (integration)", () => {
  const findCellMock = vi.fn((_x: number, _y: number) => 42);
  const getName = vi.fn(
    (_reg: RawRegiment, _military: RawRegiment[]) => "Auto Name",
  );
  const generateNote = vi.fn();
  const drawRegiment = vi.fn();

  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalFindCell = (globalThis as { findCell?: unknown }).findCell;
  const originalMilitary = (globalThis as { Military?: unknown }).Military;
  const originalDraw = (globalThis as { drawRegiment?: unknown }).drawRegiment;

  beforeEach(() => {
    findCellMock.mockClear();
    findCellMock.mockImplementation(() => 42);
    getName.mockReset();
    getName.mockReturnValue("Auto Name");
    generateNote.mockReset();
    drawRegiment.mockReset();
    const h = new Array(50).fill(0);
    h[42] = 25; // land
    h[10] = 5; // water
    const p: [number, number][] = [];
    p[42] = [150, 250];
    p[10] = [50, 60];
    (globalThis as { pack?: unknown }).pack = {
      cells: { h, p },
      states: [
        { i: 0, name: "Neutrals", military: [] },
        {
          i: 1,
          name: "Altaria",
          military: [{ i: 1, name: "1st" } as RawRegiment],
        },
      ] satisfies RawState[],
    };
    (globalThis as { findCell?: unknown }).findCell = findCellMock;
    (globalThis as { Military?: unknown }).Military = {
      getName,
      generateNote,
    };
    (globalThis as { drawRegiment?: unknown }).drawRegiment = drawRegiment;
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { findCell?: unknown }).findCell = originalFindCell;
    (globalThis as { Military?: unknown }).Military = originalMilitary;
    (globalThis as { drawRegiment?: unknown }).drawRegiment = originalDraw;
  });

  it("creates a regiment on land with n=0", async () => {
    const result = await addRegimentTool.execute({
      state: 1,
      x: 100,
      y: 200,
    });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as unknown as {
        pack: { states: { i: number; military?: RawRegiment[] }[] };
      }
    ).pack;
    const military = pack.states[1]?.military ?? [];
    expect(military.length).toBe(2);
    const newReg = military[military.length - 1];
    expect(newReg?.i).toBe(2);
    expect(newReg?.cell).toBe(42);
    expect(newReg?.x).toBe(150);
    expect(newReg?.y).toBe(250);
    expect(newReg?.n).toBe(0);
    expect(newReg?.icon).toBe("🛡️");
    expect(newReg?.name).toBe("Auto Name");
    expect(generateNote).toHaveBeenCalled();
    expect(drawRegiment).toHaveBeenCalled();
  });

  it("creates a regiment on water with n=1", async () => {
    findCellMock.mockImplementation(() => 10);
    const result = await addRegimentTool.execute({
      state: 1,
      x: 50,
      y: 60,
    });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as unknown as {
        pack: { states: { i: number; military?: RawRegiment[] }[] };
      }
    ).pack;
    const military = pack.states[1]?.military ?? [];
    const newReg = military[military.length - 1];
    expect(newReg?.n).toBe(1);
    expect(newReg?.cell).toBe(10);
  });

  it("errors when Military.getName is missing", async () => {
    (globalThis as { Military?: unknown }).Military = {};
    const result = await addRegimentTool.execute({
      state: 1,
      x: 100,
      y: 200,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Military\.getName/);
  });

  it("resolves state by case-insensitive name", async () => {
    await addRegimentTool.execute({ state: "altaria", x: 100, y: 200 });
    const pack = (
      globalThis as unknown as {
        pack: { states: { i: number; military?: RawRegiment[] }[] };
      }
    ).pack;
    const military = pack.states[1]?.military ?? [];
    expect(military.length).toBe(2);
  });
});
