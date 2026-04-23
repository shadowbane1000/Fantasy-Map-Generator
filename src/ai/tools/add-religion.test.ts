import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawReligion } from "./_shared";
import {
  type AddReligionCellInfo,
  type AddReligionResult,
  type AddReligionRuntime,
  addReligionTool,
  createAddReligionTool,
} from "./add-religion";

function makeRuntime(
  overrides: {
    findCell?: (x: number, y: number) => number | null;
    validateCell?: (cellId: number) => AddReligionCellInfo;
    add?: (cellId: number) => AddReligionResult;
  } = {},
): {
  runtime: AddReligionRuntime;
  add: ReturnType<typeof vi.fn<AddReligionRuntime["add"]>>;
} {
  const findCell = vi.fn<AddReligionRuntime["findCell"]>(
    overrides.findCell ?? (() => 42),
  );
  const validateCell = vi.fn<AddReligionRuntime["validateCell"]>(
    overrides.validateCell ?? (() => ({ land: true, occupiedBy: null })),
  );
  const add = vi.fn<AddReligionRuntime["add"]>(
    overrides.add ??
      (() => ({
        i: 4,
        name: "Lunarism",
        center: 42,
        color: "#2244aa",
        type: "Organized",
        form: "Monotheism",
        deity: "The Bright Moon",
        expansion: "global",
        expansionism: 2,
      })),
  );
  return { runtime: { findCell, validateCell, add }, add };
}

describe("add_religion tool", () => {
  it("happy path delegates to runtime.add", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddReligionTool(runtime);
    const result = await tool.execute({ x: 100, y: 200 });
    expect(result.isError).toBeFalsy();
    expect(add).toHaveBeenCalledWith(42);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 4,
      name: "Lunarism",
      center: 42,
      color: "#2244aa",
      type: "Organized",
      form: "Monotheism",
      deity: "The Bright Moon",
      expansion: "global",
      expansionism: 2,
    });
  });

  it("rejects non-finite x", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddReligionTool(runtime);
    for (const bad of [Number.POSITIVE_INFINITY, Number.NaN, "100", null]) {
      const r = await tool.execute({ x: bad, y: 100 });
      expect(r.isError).toBe(true);
    }
    expect(add).not.toHaveBeenCalled();
  });

  it("rejects non-finite y", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddReligionTool(runtime);
    for (const bad of [Number.NEGATIVE_INFINITY, Number.NaN, "", undefined]) {
      const r = await tool.execute({ x: 100, y: bad });
      expect(r.isError).toBe(true);
    }
    expect(add).not.toHaveBeenCalled();
  });

  it("rejects when findCell returns null", async () => {
    const { runtime, add } = makeRuntime({ findCell: () => null });
    const tool = createAddReligionTool(runtime);
    const result = await tool.execute({ x: 100, y: 200 });
    expect(result.isError).toBe(true);
    expect(add).not.toHaveBeenCalled();
  });

  it("rejects water cell", async () => {
    const { runtime, add } = makeRuntime({
      validateCell: () => ({ land: false, occupiedBy: null }),
    });
    const tool = createAddReligionTool(runtime);
    const result = await tool.execute({ x: 100, y: 200 });
    expect(result.isError).toBe(true);
    expect(add).not.toHaveBeenCalled();
  });

  it("rejects occupied religion center", async () => {
    const { runtime, add } = makeRuntime({
      validateCell: () => ({ land: true, occupiedBy: 2 }),
    });
    const tool = createAddReligionTool(runtime);
    const result = await tool.execute({ x: 100, y: 200 });
    expect(result.isError).toBe(true);
    expect(add).not.toHaveBeenCalled();
  });

  it("surfaces runtime errors from add", async () => {
    const { runtime } = makeRuntime({
      add: () => {
        throw new Error("Religions.add is not available yet");
      },
    });
    const tool = createAddReligionTool(runtime);
    const result = await tool.execute({ x: 100, y: 200 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Religions\.add/);
  });
});

describe("defaultAddReligionRuntime (integration)", () => {
  const findCellMock = vi.fn((_x: number, _y: number) => 42);
  const religionsAdd = vi.fn();
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalReligions = (globalThis as { Religions?: unknown }).Religions;
  const originalFindCell = (globalThis as { findCell?: unknown }).findCell;

  beforeEach(() => {
    findCellMock.mockClear();
    findCellMock.mockImplementation(() => 42);
    religionsAdd.mockReset();
    religionsAdd.mockImplementation((center: number) => {
      const pack = (
        globalThis as unknown as { pack: { religions: RawReligion[] } }
      ).pack;
      const i = pack.religions.length;
      pack.religions.push({
        i,
        name: "Lunarism",
        color: "#123456",
        type: "Organized",
        form: "Monotheism",
        deity: "The Bright Moon",
        center,
        expansion: "global",
        expansionism: 2,
      });
    });

    const h = new Array(50).fill(0);
    h[42] = 25;
    h[10] = 5;
    (globalThis as { pack?: unknown }).pack = {
      cells: { h },
      religions: [
        { i: 0, name: "No religion" },
        { i: 1, name: "Solarism", center: 20 },
      ] satisfies RawReligion[],
    };
    (globalThis as { Religions?: unknown }).Religions = { add: religionsAdd };
    (globalThis as { findCell?: unknown }).findCell = findCellMock;
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { Religions?: unknown }).Religions = originalReligions;
    (globalThis as { findCell?: unknown }).findCell = originalFindCell;
  });

  it("delegates to Religions.add and returns the new religion", async () => {
    const result = await addReligionTool.execute({ x: 100, y: 200 });
    expect(result.isError).toBeFalsy();
    expect(religionsAdd).toHaveBeenCalledWith(42);
    const body = JSON.parse(result.content);
    expect(body.i).toBe(2);
    expect(body.name).toBe("Lunarism");
    expect(body.center).toBe(42);
  });

  it("rejects water cell", async () => {
    findCellMock.mockImplementation(() => 10);
    const result = await addReligionTool.execute({ x: 100, y: 200 });
    expect(result.isError).toBe(true);
    expect(religionsAdd).not.toHaveBeenCalled();
  });

  it("rejects a cell already used as a religion center", async () => {
    findCellMock.mockImplementation(() => 20);
    const pack = (globalThis as unknown as { pack: { cells: { h: number[] } } })
      .pack;
    pack.cells.h[20] = 25;
    const result = await addReligionTool.execute({ x: 100, y: 200 });
    expect(result.isError).toBe(true);
    expect(religionsAdd).not.toHaveBeenCalled();
  });

  it("errors when Religions.add is missing", async () => {
    (globalThis as { Religions?: unknown }).Religions = {};
    const result = await addReligionTool.execute({ x: 100, y: 200 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Religions\.add/);
  });
});
