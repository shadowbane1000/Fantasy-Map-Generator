import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDefaultRegistry } from "../index";
import type { RawZone } from "./_shared";
import {
  type CellRangeResult,
  createSetZoneCellsTool,
  setZoneCellsTool,
  type ZoneCellsRef,
  type ZoneCellsRuntime,
} from "./set-zone-cells";

function makeRuntime(
  overrides: {
    find?: (ref: number | string) => ZoneCellsRef | null;
    getValidCellRange?: () => CellRangeResult;
    setCells?: (i: number, cells: number[]) => void;
  } = {},
): {
  runtime: ZoneCellsRuntime;
  find: ReturnType<typeof vi.fn<ZoneCellsRuntime["find"]>>;
  getValidCellRange: ReturnType<
    typeof vi.fn<ZoneCellsRuntime["getValidCellRange"]>
  >;
  setCells: ReturnType<typeof vi.fn<ZoneCellsRuntime["setCells"]>>;
} {
  const find = vi.fn<ZoneCellsRuntime["find"]>(
    overrides.find ??
      ((ref) =>
        typeof ref === "number"
          ? {
              i: ref,
              name: `Zone${ref}`,
              removed: false,
              previousCells: [1, 2, 3],
            }
          : null),
  );
  const getValidCellRange = vi.fn<ZoneCellsRuntime["getValidCellRange"]>(
    overrides.getValidCellRange ?? (() => ({ ok: true, max: 1000 })),
  );
  const setCells = vi.fn<ZoneCellsRuntime["setCells"]>(
    overrides.setCells ?? (() => {}),
  );
  return {
    runtime: { find, getValidCellRange, setCells },
    find,
    getValidCellRange,
    setCells,
  };
}

describe("set_zone_cells tool", () => {
  it("happy path: replaces cells, returns counts and samples", async () => {
    const { runtime, setCells } = makeRuntime();
    const tool = createSetZoneCellsTool(runtime);
    const result = await tool.execute({ zone: 5, cells: [10, 20, 30, 40] });
    expect(result.isError).toBeFalsy();
    expect(setCells).toHaveBeenCalledWith(5, [10, 20, 30, 40]);
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      zone: { i: 5, name: "Zone5" },
      previous_count: 3,
      count: 4,
      previous_cells_sample: [1, 2, 3],
      cells_sample: [10, 20, 30, 40],
    });
  });

  it("accepts empty cells array", async () => {
    const { runtime, setCells } = makeRuntime();
    const tool = createSetZoneCellsTool(runtime);
    const result = await tool.execute({ zone: 5, cells: [] });
    expect(result.isError).toBeFalsy();
    expect(setCells).toHaveBeenCalledWith(5, []);
    const body = JSON.parse(result.content);
    expect(body.count).toBe(0);
    expect(body.cells_sample).toEqual([]);
  });

  it("collapses duplicates preserving first occurrence", async () => {
    const { runtime, setCells } = makeRuntime();
    const tool = createSetZoneCellsTool(runtime);
    const result = await tool.execute({ zone: 5, cells: [1, 2, 1, 3, 2] });
    expect(result.isError).toBeFalsy();
    expect(setCells).toHaveBeenCalledWith(5, [1, 2, 3]);
    expect(JSON.parse(result.content).count).toBe(3);
  });

  it("errors when a cell is out of range and does not call setCells", async () => {
    const { runtime, setCells } = makeRuntime({
      getValidCellRange: () => ({ ok: true, max: 50 }),
    });
    const tool = createSetZoneCellsTool(runtime);
    const result = await tool.execute({ zone: 5, cells: [10, 999] });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "cells[1] (999) is out of range (max 50).",
    );
    expect(setCells).not.toHaveBeenCalled();
  });

  it("errors when a cell is non-integer", async () => {
    const { runtime, setCells } = makeRuntime();
    const tool = createSetZoneCellsTool(runtime);
    const result = await tool.execute({ zone: 5, cells: [1, "x", 3] });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "cells[1] must be a non-negative integer.",
    );
    expect(setCells).not.toHaveBeenCalled();
  });

  it("errors when a cell is negative", async () => {
    const { runtime, setCells } = makeRuntime();
    const tool = createSetZoneCellsTool(runtime);
    const result = await tool.execute({ zone: 5, cells: [1, -2, 3] });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "cells[1] must be a non-negative integer.",
    );
    expect(setCells).not.toHaveBeenCalled();
  });

  it("errors when cells is not an array", async () => {
    const { runtime, setCells } = makeRuntime();
    const tool = createSetZoneCellsTool(runtime);
    for (const bad of [{ a: 1 }, 42, "list"]) {
      const r = await tool.execute({ zone: 5, cells: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe("cells must be an array.");
    }
    expect(setCells).not.toHaveBeenCalled();
  });

  it("errors when cells field is missing", async () => {
    const { runtime, setCells } = makeRuntime();
    const tool = createSetZoneCellsTool(runtime);
    const result = await tool.execute({ zone: 5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("cells must be an array.");
    expect(setCells).not.toHaveBeenCalled();
  });

  it("errors when the zone is not found", async () => {
    const { runtime, setCells } = makeRuntime({ find: () => null });
    const tool = createSetZoneCellsTool(runtime);
    const result = await tool.execute({ zone: 999, cells: [] });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("Zone 999 not found.");
    expect(setCells).not.toHaveBeenCalled();
  });

  it("errors when the zone is removed", async () => {
    const { runtime, setCells } = makeRuntime({
      find: () => ({
        i: 5,
        name: "Plague",
        removed: true,
        previousCells: [],
      }),
    });
    const tool = createSetZoneCellsTool(runtime);
    const result = await tool.execute({ zone: 5, cells: [] });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Cannot set cells on removed zone 5.",
    );
    expect(setCells).not.toHaveBeenCalled();
  });

  it("rejects invalid zone refs", async () => {
    const { runtime, setCells } = makeRuntime();
    const tool = createSetZoneCellsTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ zone: bad, cells: [] });
      expect(r.isError).toBe(true);
    }
    expect(setCells).not.toHaveBeenCalled();
  });

  it("propagates runtime.setCells failures", async () => {
    const { runtime } = makeRuntime({
      setCells: () => {
        throw new Error("pack missing");
      },
    });
    const tool = createSetZoneCellsTool(runtime);
    const result = await tool.execute({ zone: 5, cells: [10] });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("pack missing");
  });

  it("truncates samples and sets the truncated flag", async () => {
    const previous = Array.from({ length: 25 }, (_, i) => 100 + i);
    const incoming = Array.from({ length: 30 }, (_, i) => 200 + i);
    const { runtime } = makeRuntime({
      find: () => ({
        i: 5,
        name: "BigZone",
        removed: false,
        previousCells: previous,
      }),
      getValidCellRange: () => ({ ok: true, max: 1000 }),
    });
    const tool = createSetZoneCellsTool(runtime);
    const result = await tool.execute({ zone: 5, cells: incoming });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.previous_cells_sample).toHaveLength(10);
    expect(body.previous_cells_sample).toEqual(previous.slice(0, 10));
    expect(body.previous_cells_sample_truncated).toBe(true);
    expect(body.cells_sample).toHaveLength(10);
    expect(body.cells_sample).toEqual(incoming.slice(0, 10));
    expect(body.cells_sample_truncated).toBe(true);
    expect(body.previous_count).toBe(25);
    expect(body.count).toBe(30);
  });

  it("captures previous_count BEFORE setCells (call order: find → getValidCellRange → setCells)", async () => {
    const calls: string[] = [];
    const find = vi.fn<ZoneCellsRuntime["find"]>(() => {
      calls.push("find");
      return {
        i: 5,
        name: "Zone5",
        removed: false,
        previousCells: [1, 2, 3],
      };
    });
    const getValidCellRange = vi.fn<ZoneCellsRuntime["getValidCellRange"]>(
      () => {
        calls.push("getValidCellRange");
        return { ok: true, max: 1000 };
      },
    );
    const setCells = vi.fn<ZoneCellsRuntime["setCells"]>(() => {
      calls.push("setCells");
    });
    const tool = createSetZoneCellsTool({ find, getValidCellRange, setCells });
    const result = await tool.execute({ zone: 5, cells: [10, 20] });
    expect(result.isError).toBeFalsy();
    expect(calls).toEqual(["find", "getValidCellRange", "setCells"]);
    // previous_count comes from find()'s snapshot (captured before mutation).
    expect(JSON.parse(result.content).previous_count).toBe(3);
  });
});

describe("set_zone_cells registry round-trip", () => {
  it("buildDefaultRegistry exposes set_zone_cells", () => {
    const registry = buildDefaultRegistry();
    const names = registry.list().map((t) => t.name);
    expect(names).toContain("set_zone_cells");
  });
});

describe("defaultZoneCellsRuntime (integration)", () => {
  const drawMock = vi.fn();
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalDraw = (globalThis as { drawZones?: unknown }).drawZones;

  beforeEach(() => {
    drawMock.mockReset();
    (globalThis as { pack?: unknown }).pack = {
      zones: [
        {
          i: 2,
          name: "Invasion",
          color: "#ff0000",
          type: "Invasion",
          cells: [10, 11, 12],
        },
        {
          i: 5,
          name: "Plague",
          color: "#550055",
          type: "Disease",
          cells: [],
        },
        {
          i: 8,
          name: "Crusade",
          color: "#ffff00",
          type: "Crusade",
          cells: [40, 41, 42, 43, 44],
          hidden: true,
        },
      ] satisfies RawZone[],
      cells: { i: new Uint32Array(100) },
    };
    (globalThis as { drawZones?: () => void }).drawZones = drawMock;
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { drawZones?: unknown }).drawZones = originalDraw;
  });

  it("REASSIGNS zone.cells (new array, not in-place mutation)", async () => {
    const pack = (globalThis as { pack: { zones: RawZone[] } }).pack;
    const originalRef = pack.zones[0]?.cells;
    const result = await setZoneCellsTool.execute({
      zone: 2,
      cells: [1, 2, 3, 4],
    });
    expect(result.isError).toBeFalsy();
    expect(pack.zones[0]?.cells).not.toBe(originalRef);
    expect(pack.zones[0]?.cells).toEqual([1, 2, 3, 4]);
  });

  it("preserves other zone fields (color, type, name, hidden, i)", async () => {
    const result = await setZoneCellsTool.execute({
      zone: 8,
      cells: [50, 51],
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { zones: RawZone[] } }).pack;
    expect(pack.zones[2]).toEqual({
      i: 8,
      name: "Crusade",
      color: "#ffff00",
      type: "Crusade",
      cells: [50, 51],
      hidden: true,
    });
  });

  it("calls drawZones once on success", async () => {
    await setZoneCellsTool.execute({ zone: 5, cells: [1] });
    expect(drawMock).toHaveBeenCalledTimes(1);
  });

  it("succeeds when drawZones is missing", async () => {
    delete (globalThis as { drawZones?: unknown }).drawZones;
    const result = await setZoneCellsTool.execute({ zone: 5, cells: [1] });
    expect(result.isError).toBeFalsy();
  });

  it("succeeds when drawZones throws", async () => {
    drawMock.mockImplementation(() => {
      throw new Error("draw boom");
    });
    const result = await setZoneCellsTool.execute({ zone: 5, cells: [1] });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { zones: RawZone[] } }).pack;
    expect(pack.zones[1]?.cells).toEqual([1]);
  });

  it("errors when pack.zones is missing", async () => {
    (globalThis as { pack?: unknown }).pack = {
      cells: { i: new Uint32Array(100) },
    };
    const result = await setZoneCellsTool.execute({
      zone: 5,
      cells: [1],
    });
    expect(result.isError).toBe(true);
    // find returns null when zones is missing → "Zone 5 not found."
    // (the find/range checks are independent of one another — find runs first).
    expect(JSON.parse(result.content).error).toBe("Zone 5 not found.");
  });

  it("errors when pack.cells.i is missing", async () => {
    (globalThis as { pack?: unknown }).pack = {
      zones: [
        {
          i: 5,
          name: "Plague",
          color: "#550055",
          type: "Disease",
          cells: [],
        },
      ] satisfies RawZone[],
    };
    const result = await setZoneCellsTool.execute({
      zone: 5,
      cells: [1],
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.pack.cells.i is not available; the map hasn't finished loading.",
    );
  });

  it("collapses duplicates end-to-end", async () => {
    await setZoneCellsTool.execute({ zone: 5, cells: [5, 7, 5, 9, 7] });
    const pack = (globalThis as { pack: { zones: RawZone[] } }).pack;
    expect(pack.zones[1]?.cells).toEqual([5, 7, 9]);
  });

  it("captures previous_count BEFORE mutation", async () => {
    // zone 2 starts with cells: [10, 11, 12] (length 3). After the call,
    // its cells become [99] (length 1). previous_count must be 3, not 1.
    const result = await setZoneCellsTool.execute({
      zone: 2,
      cells: [99],
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.previous_count).toBe(3);
    expect(body.count).toBe(1);
    expect(body.previous_cells_sample).toEqual([10, 11, 12]);
    expect(body.cells_sample).toEqual([99]);
  });
});
