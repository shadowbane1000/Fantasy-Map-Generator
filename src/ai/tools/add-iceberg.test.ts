import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AddIcebergIceEntry,
  type AddIcebergRuntime,
  addIcebergTool,
  createAddIcebergTool,
} from "./add-iceberg";
import { ToolRegistry } from "./index";

interface FakeRuntimeOptions {
  /** Pass `["override", value]` to force the value (including undefined/null). */
  cellId?: ["override", unknown];
  cellCount?: number;
  pushType?: string;
  pushId?: number;
  pushCount?: number; // 0 = nothing pushed; 2 = double-push (unexpected)
  iceArray?: AddIcebergIceEntry[];
  addIcebergImpl?: (cellId: number, size: number) => void;
  findGridCellImpl?: (x: number, y: number) => number;
  getIceArrayImpl?: () => AddIcebergIceEntry[];
}

function makeRuntime(opts: FakeRuntimeOptions = {}): {
  runtime: AddIcebergRuntime;
  iceArray: AddIcebergIceEntry[];
  findGridCell: ReturnType<typeof vi.fn>;
  addIceberg: ReturnType<typeof vi.fn>;
  getIceArray: ReturnType<typeof vi.fn>;
  getGridCellCount: ReturnType<typeof vi.fn>;
} {
  const iceArray: AddIcebergIceEntry[] =
    opts.iceArray ?? ([] as AddIcebergIceEntry[]);
  const cellId: unknown = opts.cellId ? opts.cellId[1] : 42;
  const cellCount = opts.cellCount ?? 1000;
  const pushType = opts.pushType ?? "iceberg";
  const pushId = opts.pushId ?? 7;
  const pushCount = opts.pushCount === undefined ? 1 : opts.pushCount;

  const findGridCell = vi.fn(
    opts.findGridCellImpl ??
      ((_x: number, _y: number) => cellId as unknown as number),
  );
  const getGridCellCount = vi.fn(() => cellCount);
  const addIceberg = vi.fn(
    opts.addIcebergImpl ??
      ((cId: number, size: number) => {
        for (let k = 0; k < pushCount; k++) {
          iceArray.push({
            i: pushId + k,
            type: pushType,
            cellId: cId,
            size,
          });
        }
      }),
  );
  const getIceArray = vi.fn(opts.getIceArrayImpl ?? (() => iceArray));

  const runtime: AddIcebergRuntime = {
    findGridCell: findGridCell as unknown as AddIcebergRuntime["findGridCell"],
    getGridCellCount,
    addIceberg,
    getIceArray,
  };
  return {
    runtime,
    iceArray,
    findGridCell,
    addIceberg,
    getIceArray,
    getGridCellCount,
  };
}

describe("add_iceberg tool", () => {
  it("happy path: pushes an iceberg and reports its id", async () => {
    const { runtime, addIceberg } = makeRuntime();
    const tool = createAddIcebergTool(runtime);
    const result = await tool.execute({ x: 100, y: 200 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({ ok: true, id: 7, cell_id: 42, size: 1 });
    expect(addIceberg).toHaveBeenCalledWith(42, 1);
  });

  it("custom size propagates to addIceberg and result", async () => {
    const { runtime, addIceberg } = makeRuntime();
    const tool = createAddIcebergTool(runtime);
    const result = await tool.execute({ x: 1, y: 2, size: 2 });
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({ ok: true, size: 2 });
    expect(addIceberg).toHaveBeenCalledWith(42, 2);
  });

  it("default size is 1 when omitted", async () => {
    const { runtime, addIceberg } = makeRuntime();
    const tool = createAddIcebergTool(runtime);
    await tool.execute({ x: 0, y: 0 });
    expect(addIceberg).toHaveBeenCalledWith(42, 1);
  });

  it("rejects when findGridCell returns -1", async () => {
    const { runtime, addIceberg } = makeRuntime({ cellId: ["override", -1] });
    const tool = createAddIcebergTool(runtime);
    const result = await tool.execute({ x: 0, y: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no grid cell/);
    expect(addIceberg).not.toHaveBeenCalled();
  });

  it("rejects when findGridCell returns undefined", async () => {
    const { runtime, addIceberg } = makeRuntime({
      cellId: ["override", undefined],
    });
    const tool = createAddIcebergTool(runtime);
    const result = await tool.execute({ x: 0, y: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no grid cell/);
    expect(addIceberg).not.toHaveBeenCalled();
  });

  it("rejects when findGridCell returns null", async () => {
    const { runtime, addIceberg } = makeRuntime({
      cellId: ["override", null],
    });
    const tool = createAddIcebergTool(runtime);
    const result = await tool.execute({ x: 0, y: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no grid cell/);
    expect(addIceberg).not.toHaveBeenCalled();
  });

  it("rejects when findGridCell returns NaN", async () => {
    const { runtime, addIceberg } = makeRuntime({
      cellId: ["override", Number.NaN],
    });
    const tool = createAddIcebergTool(runtime);
    const result = await tool.execute({ x: 0, y: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no grid cell/);
    expect(addIceberg).not.toHaveBeenCalled();
  });

  it("rejects when findGridCell returns out-of-range index", async () => {
    const { runtime, addIceberg } = makeRuntime({
      cellId: ["override", 1000],
      cellCount: 1000,
    });
    const tool = createAddIcebergTool(runtime);
    const result = await tool.execute({ x: 0, y: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no grid cell/);
    expect(addIceberg).not.toHaveBeenCalled();
  });

  it("rejects when findGridCell returns a non-integer", async () => {
    const { runtime, addIceberg } = makeRuntime({ cellId: ["override", 1.5] });
    const tool = createAddIcebergTool(runtime);
    const result = await tool.execute({ x: 0, y: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no grid cell/);
    expect(addIceberg).not.toHaveBeenCalled();
  });

  it("surfaces addIceberg throwing; pack.ice unchanged", async () => {
    const iceArray: AddIcebergIceEntry[] = [{ i: 0, type: "glacier" }];
    const { runtime } = makeRuntime({
      iceArray,
      addIcebergImpl: () => {
        throw new Error("boom");
      },
    });
    const tool = createAddIcebergTool(runtime);
    const result = await tool.execute({ x: 0, y: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/boom/);
    expect(iceArray).toHaveLength(1);
  });

  it("errors when addIceberg pushes nothing", async () => {
    const { runtime } = makeRuntime({ pushCount: 0 });
    const tool = createAddIcebergTool(runtime);
    const result = await tool.execute({ x: 0, y: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /did not push a new ice element/,
    );
  });

  it("errors when addIceberg pushes a glacier instead of an iceberg", async () => {
    const { runtime } = makeRuntime({ pushType: "glacier" });
    const tool = createAddIcebergTool(runtime);
    const result = await tool.execute({ x: 0, y: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/unexpected type/);
  });

  it("errors when addIceberg pushes more than one entry", async () => {
    const { runtime } = makeRuntime({ pushCount: 2 });
    const tool = createAddIcebergTool(runtime);
    const result = await tool.execute({ x: 0, y: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /did not push a new ice element/,
    );
  });

  it("rejects non-finite x", async () => {
    const { runtime, addIceberg } = makeRuntime();
    const tool = createAddIcebergTool(runtime);
    for (const bad of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      "5",
      null,
      undefined,
    ]) {
      const r = await tool.execute({ x: bad, y: 0 });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/x must be a finite number/);
    }
    expect(addIceberg).not.toHaveBeenCalled();
  });

  it("rejects non-finite y", async () => {
    const { runtime, addIceberg } = makeRuntime();
    const tool = createAddIcebergTool(runtime);
    for (const bad of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      "5",
      null,
      undefined,
    ]) {
      const r = await tool.execute({ x: 0, y: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/y must be a finite number/);
    }
    expect(addIceberg).not.toHaveBeenCalled();
  });

  it("rejects out-of-range / non-finite size", async () => {
    const { runtime, addIceberg } = makeRuntime();
    const tool = createAddIcebergTool(runtime);
    for (const bad of [
      0,
      -1,
      -0.0001,
      5.0001,
      100,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      "1",
    ]) {
      const r = await tool.execute({ x: 0, y: 0, size: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/in \(0, 5\]/);
    }
    expect(addIceberg).not.toHaveBeenCalled();
  });

  it("accepts size at boundary 5", async () => {
    const { runtime, addIceberg } = makeRuntime();
    const tool = createAddIcebergTool(runtime);
    const r = await tool.execute({ x: 0, y: 0, size: 5 });
    expect(r.isError).toBeFalsy();
    expect(addIceberg).toHaveBeenCalledWith(42, 5);
  });

  it("accepts very small positive size", async () => {
    const { runtime, addIceberg } = makeRuntime();
    const tool = createAddIcebergTool(runtime);
    const r = await tool.execute({ x: 0, y: 0, size: 0.0001 });
    expect(r.isError).toBeFalsy();
    expect(addIceberg).toHaveBeenCalledWith(42, 0.0001);
  });

  it("tool name + registry round-trip", async () => {
    const { runtime } = makeRuntime();
    const tool = createAddIcebergTool(runtime);
    expect(tool.name).toBe("add_iceberg");
    const registry = new ToolRegistry();
    registry.register(tool);
    const result = await registry.run("add_iceberg", { x: 1, y: 2 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      id: 7,
      cell_id: 42,
      size: 1,
    });
  });
});

describe("defaultAddIcebergRuntime (integration)", () => {
  type GlobalShape = {
    pack?: unknown;
    grid?: unknown;
    Ice?: unknown;
    findGridCell?: unknown;
  };
  const originalPack = (globalThis as GlobalShape).pack;
  const originalGrid = (globalThis as GlobalShape).grid;
  const originalIce = (globalThis as GlobalShape).Ice;
  const originalFindGridCell = (globalThis as GlobalShape).findGridCell;

  beforeEach(() => {
    (globalThis as GlobalShape).pack = { ice: [] };
    (globalThis as GlobalShape).grid = {
      cells: { i: new Array(1000) },
    };
    (globalThis as GlobalShape).Ice = {
      addIceberg: vi.fn((cellId: number, size: number) => {
        const pack = (globalThis as { pack: { ice: AddIcebergIceEntry[] } })
          .pack;
        pack.ice.push({
          i: pack.ice.length,
          type: "iceberg",
          cellId,
          size,
        });
      }),
    };
    (globalThis as GlobalShape).findGridCell = vi.fn((x: number, _y: number) =>
      Math.floor(x),
    );
  });

  afterEach(() => {
    (globalThis as GlobalShape).pack = originalPack;
    (globalThis as GlobalShape).grid = originalGrid;
    (globalThis as GlobalShape).Ice = originalIce;
    (globalThis as GlobalShape).findGridCell = originalFindGridCell;
  });

  it("happy path end-to-end through addIcebergTool", async () => {
    const result = await addIcebergTool.execute({ x: 12, y: 34 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({ ok: true, id: 0, cell_id: 12, size: 1 });
    const pack = (globalThis as { pack: { ice: AddIcebergIceEntry[] } }).pack;
    expect(pack.ice).toHaveLength(1);
    expect(pack.ice[0]).toMatchObject({
      i: 0,
      type: "iceberg",
      cellId: 12,
      size: 1,
    });
  });

  it("errors when findGridCell is missing", async () => {
    (globalThis as GlobalShape).findGridCell = undefined;
    const result = await addIcebergTool.execute({ x: 0, y: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/findGridCell/);
  });

  it("errors when grid is missing", async () => {
    (globalThis as GlobalShape).grid = undefined;
    const result = await addIcebergTool.execute({ x: 0, y: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/grid/);
  });

  it("errors when Ice is missing", async () => {
    (globalThis as GlobalShape).Ice = undefined;
    const result = await addIcebergTool.execute({ x: 0, y: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Ice\.addIceberg/);
  });

  it("errors when Ice.addIceberg is missing", async () => {
    (globalThis as GlobalShape).Ice = {};
    const result = await addIcebergTool.execute({ x: 0, y: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Ice\.addIceberg/);
  });

  it("errors when pack.ice is missing", async () => {
    (globalThis as GlobalShape).pack = {};
    const result = await addIcebergTool.execute({ x: 0, y: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack\.ice/);
  });

  it("errors when pack itself is missing", async () => {
    (globalThis as GlobalShape).pack = undefined;
    const result = await addIcebergTool.execute({ x: 0, y: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack\.ice/);
  });
});
