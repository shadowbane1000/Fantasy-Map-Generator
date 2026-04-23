import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawRoute } from "./_shared";
import {
  type AddRouteInput,
  type AddRouteRuntime,
  addRouteTool,
  createAddRouteTool,
  type NewRoute,
  type ValidateCellsResult,
} from "./add-route";

function makeRuntime(
  overrides: {
    validateCells?: (cells: number[]) => ValidateCellsResult;
    add?: (input: AddRouteInput) => NewRoute;
  } = {},
): {
  runtime: AddRouteRuntime;
  validateCells: ReturnType<typeof vi.fn<AddRouteRuntime["validateCells"]>>;
  add: ReturnType<typeof vi.fn<AddRouteRuntime["add"]>>;
} {
  const validateCells = vi.fn<AddRouteRuntime["validateCells"]>(
    overrides.validateCells ?? (() => ({ ok: true })),
  );
  const add = vi.fn<AddRouteRuntime["add"]>(
    overrides.add ??
      ((input) => ({
        i: 7,
        group: input.group,
        feature: input.feature ?? 1,
        cells: input.cells,
        points: input.cells.map((c) => [c * 10, c * 10, c]),
        ...(input.name !== undefined ? { name: input.name } : {}),
      })),
  );
  return { runtime: { validateCells, add }, validateCells, add };
}

describe("add_route tool", () => {
  it("minimal call delegates with canonical group", async () => {
    const { runtime, add, validateCells } = makeRuntime();
    const tool = createAddRouteTool(runtime);
    const result = await tool.execute({
      cells: [1, 2, 3],
      group: "roads",
    });
    expect(result.isError).toBeFalsy();
    expect(validateCells).toHaveBeenCalledWith([1, 2, 3]);
    expect(add).toHaveBeenCalledWith({
      cells: [1, 2, 3],
      group: "roads",
    });
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      i: 7,
      group: "roads",
      feature: 1,
      cells: [1, 2, 3],
    });
    expect(body.points).toEqual([
      [10, 10, 1],
      [20, 20, 2],
      [30, 30, 3],
    ]);
  });

  it("resolves group aliases (road / sea lanes)", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddRouteTool(runtime);
    await tool.execute({ cells: [1, 2], group: "road" });
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ group: "roads" }),
    );
    add.mockClear();
    await tool.execute({ cells: [1, 2], group: "sea lanes" });
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ group: "searoutes" }),
    );
  });

  it("passes optional name and feature through (trimmed)", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddRouteTool(runtime);
    await tool.execute({
      cells: [5, 6, 7],
      group: "trails",
      name: "  Silk Trail  ",
      feature: 3,
    });
    expect(add).toHaveBeenCalledWith({
      cells: [5, 6, 7],
      group: "trails",
      name: "Silk Trail",
      feature: 3,
    });
  });

  it("rejects missing / non-array cells", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddRouteTool(runtime);
    for (const bad of [undefined, null, "1,2", 5, {}]) {
      const r = await tool.execute({ cells: bad, group: "roads" });
      expect(r.isError).toBe(true);
    }
    expect(add).not.toHaveBeenCalled();
  });

  it("rejects cells with fewer than 2 entries", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddRouteTool(runtime);
    const r0 = await tool.execute({ cells: [], group: "roads" });
    expect(r0.isError).toBe(true);
    const r1 = await tool.execute({ cells: [5], group: "roads" });
    expect(r1.isError).toBe(true);
    expect(add).not.toHaveBeenCalled();
  });

  it("rejects non-integer / negative cells", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddRouteTool(runtime);
    for (const bad of [
      [1, "2"],
      [1, 2.5],
      [1, -1],
      [1, null],
    ]) {
      const r = await tool.execute({ cells: bad, group: "roads" });
      expect(r.isError).toBe(true);
    }
    expect(add).not.toHaveBeenCalled();
  });

  it("rejects duplicate cells", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddRouteTool(runtime);
    const r1 = await tool.execute({ cells: [1, 2, 1], group: "roads" });
    expect(r1.isError).toBe(true);
    const r2 = await tool.execute({ cells: [1, 1], group: "roads" });
    expect(r2.isError).toBe(true);
    expect(add).not.toHaveBeenCalled();
  });

  it("rejects missing / invalid group", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddRouteTool(runtime);
    for (const bad of [undefined, null, "", "   ", 42, "highways"]) {
      const r = await tool.execute({ cells: [1, 2], group: bad });
      expect(r.isError).toBe(true);
    }
    expect(add).not.toHaveBeenCalled();
  });

  it("rejects invalid name", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddRouteTool(runtime);
    for (const bad of ["", "   ", 42, {}]) {
      const r = await tool.execute({
        cells: [1, 2],
        group: "roads",
        name: bad,
      });
      expect(r.isError).toBe(true);
    }
    expect(add).not.toHaveBeenCalled();
  });

  it("rejects invalid feature", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddRouteTool(runtime);
    for (const bad of ["1", -1, 1.5, {}]) {
      const r = await tool.execute({
        cells: [1, 2],
        group: "roads",
        feature: bad,
      });
      expect(r.isError).toBe(true);
    }
    expect(add).not.toHaveBeenCalled();
  });

  it("surfaces validateCells error without calling add", async () => {
    const { runtime, add } = makeRuntime({
      validateCells: () => ({
        ok: false,
        error: "Cell index 99 is out of range",
      }),
    });
    const tool = createAddRouteTool(runtime);
    const result = await tool.execute({
      cells: [1, 99],
      group: "roads",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/out of range/);
    expect(add).not.toHaveBeenCalled();
  });

  it("surfaces runtime.add failures", async () => {
    const { runtime } = makeRuntime({
      add: () => {
        throw new Error("pack.routes is not available.");
      },
    });
    const tool = createAddRouteTool(runtime);
    const result = await tool.execute({ cells: [1, 2], group: "roads" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack\.routes/);
  });
});

describe("defaultAddRouteRuntime (integration)", () => {
  const drawMock = vi.fn();
  const getNextIdMock = vi.fn<() => number>();
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalRoutes = (globalThis as { Routes?: unknown }).Routes;
  const originalDraw = (globalThis as { drawRoutes?: unknown }).drawRoutes;

  beforeEach(() => {
    drawMock.mockReset();
    getNextIdMock.mockReset();
    getNextIdMock.mockImplementation(() => {
      const pack = (globalThis as unknown as { pack: { routes: RawRoute[] } })
        .pack;
      const routes = pack.routes;
      if (!routes.length) return 0;
      return Math.max(...routes.map((r) => r.i)) + 1;
    });
    const p: [number, number][] = [];
    const f: number[] = [];
    for (let k = 0; k < 10; k++) {
      p.push([k * 100, k * 50]);
      f.push(k < 5 ? 1 : 2);
    }
    (globalThis as unknown as { pack?: unknown }).pack = {
      routes: [],
      cells: {
        i: new Uint32Array(10),
        p,
        f,
        routes: {},
      },
    };
    (globalThis as unknown as { Routes?: unknown }).Routes = {
      getNextId: getNextIdMock,
    };
    (globalThis as unknown as { drawRoutes?: unknown }).drawRoutes = drawMock;
  });

  afterEach(() => {
    (globalThis as unknown as { pack?: unknown }).pack = originalPack;
    (globalThis as unknown as { Routes?: unknown }).Routes = originalRoutes;
    (globalThis as unknown as { drawRoutes?: unknown }).drawRoutes =
      originalDraw;
  });

  it("pushes a minimal route with i=0, derived points, feature from cells.f, and calls drawRoutes", async () => {
    const result = await addRouteTool.execute({
      cells: [1, 2, 3],
      group: "roads",
    });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as unknown as {
        pack: {
          routes: RawRoute[];
          cells: { routes: Record<number, Record<number, number>> };
        };
      }
    ).pack;
    expect(pack.routes).toHaveLength(1);
    expect(pack.routes[0]).toMatchObject({
      i: 0,
      group: "roads",
      feature: 1,
    });
    expect(pack.routes[0].points).toEqual([
      [100, 50, 1],
      [200, 100, 2],
      [300, 150, 3],
    ]);
    // adjacency map updated bidirectionally
    expect(pack.cells.routes[1][2]).toBe(0);
    expect(pack.cells.routes[2][1]).toBe(0);
    expect(pack.cells.routes[2][3]).toBe(0);
    expect(pack.cells.routes[3][2]).toBe(0);
    expect(drawMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      i: 0,
      group: "roads",
      feature: 1,
      cells: [1, 2, 3],
    });
  });

  it("uses Routes.getNextId when available for id assignment", async () => {
    const pack = (globalThis as unknown as { pack: { routes: RawRoute[] } })
      .pack;
    pack.routes.push({ i: 5, group: "roads" });
    getNextIdMock.mockReturnValueOnce(6);
    await addRouteTool.execute({ cells: [0, 1], group: "trails" });
    expect(getNextIdMock).toHaveBeenCalled();
    expect(pack.routes[1]?.i).toBe(6);
    expect(pack.routes[1]?.group).toBe("trails");
  });

  it("falls back to max(route.i)+1 when Routes.getNextId is missing", async () => {
    (globalThis as unknown as { Routes?: unknown }).Routes = undefined;
    const pack = (globalThis as unknown as { pack: { routes: RawRoute[] } })
      .pack;
    pack.routes.push({ i: 9, group: "roads" });
    pack.routes.push({ i: 3, group: "trails" });
    await addRouteTool.execute({ cells: [0, 1], group: "searoutes" });
    expect(pack.routes[2]?.i).toBe(10);
  });

  it("preserves explicit name and feature", async () => {
    await addRouteTool.execute({
      cells: [1, 2],
      group: "roads",
      name: "Silk Trail",
      feature: 42,
    });
    const pack = (globalThis as unknown as { pack: { routes: RawRoute[] } })
      .pack;
    expect(pack.routes[0]?.name).toBe("Silk Trail");
    expect(pack.routes[0]?.feature).toBe(42);
  });

  it("errors when a cell index is out of range and does not push or redraw", async () => {
    const result = await addRouteTool.execute({
      cells: [0, 999],
      group: "roads",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/out of range/);
    const pack = (globalThis as unknown as { pack: { routes: RawRoute[] } })
      .pack;
    expect(pack.routes).toHaveLength(0);
    expect(drawMock).not.toHaveBeenCalled();
  });

  it("errors when pack.routes is missing", async () => {
    (globalThis as unknown as { pack?: unknown }).pack = {
      cells: { i: new Uint32Array(10), p: [], f: [], routes: {} },
    };
    const result = await addRouteTool.execute({
      cells: [0, 1],
      group: "roads",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack\.routes/);
  });

  it("swallows drawRoutes errors (data mutation still happens)", async () => {
    drawMock.mockImplementation(() => {
      throw new Error("draw boom");
    });
    const result = await addRouteTool.execute({
      cells: [1, 2],
      group: "roads",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as unknown as { pack: { routes: RawRoute[] } })
      .pack;
    expect(pack.routes).toHaveLength(1);
  });
});
