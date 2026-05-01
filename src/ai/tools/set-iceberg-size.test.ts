import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDefaultRegistry } from "../index";
import { ToolRegistry } from "./index";
import {
  createSetIcebergSizeTool,
  defaultSetIcebergSizeRuntime,
  type SetIcebergSizeIceRef,
  type SetIcebergSizeRuntime,
  setIcebergSizeTool,
} from "./set-iceberg-size";

interface RuntimeStubs {
  runtime: SetIcebergSizeRuntime;
  ice: SetIcebergSizeIceRef[];
  findIce: ReturnType<typeof vi.fn>;
  changeIcebergSize: ReturnType<typeof vi.fn>;
  redrawIceberg: ReturnType<typeof vi.fn>;
}

function makeRuntime(initial: SetIcebergSizeIceRef[] = []): RuntimeStubs {
  // Mutable underlying array (mirrors pack.ice).
  const ice: SetIcebergSizeIceRef[] = [...initial];

  const findIce = vi.fn((id: number): SetIcebergSizeIceRef | null => {
    const entry = ice.find((e) => e.i === id);
    return entry ? { ...entry } : null;
  });
  const changeIcebergSize = vi.fn((id: number, size: number): void => {
    const entry = ice.find((e) => e.i === id);
    if (entry) entry.size = size;
  });
  const redrawIceberg = vi.fn();

  const runtime: SetIcebergSizeRuntime = {
    findIce,
    changeIcebergSize,
    redrawIceberg,
  };
  return { runtime, ice, findIce, changeIcebergSize, redrawIceberg };
}

describe("set_iceberg_size tool (injected runtime)", () => {
  it("happy path: resize 1 -> 0.5, mutates entry, redraws once", async () => {
    const { runtime, ice, changeIcebergSize, redrawIceberg } = makeRuntime([
      { i: 7, type: "iceberg", size: 1 },
    ]);
    const tool = createSetIcebergSizeTool(runtime);
    const result = await tool.execute({ id: 7, size: 0.5 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: 7,
      old_size: 1,
      new_size: 0.5,
    });
    expect(changeIcebergSize).toHaveBeenCalledTimes(1);
    expect(changeIcebergSize).toHaveBeenCalledWith(7, 0.5);
    expect(redrawIceberg).toHaveBeenCalledTimes(1);
    expect(redrawIceberg).toHaveBeenCalledWith(7);
    expect(ice[0].size).toBe(0.5);
  });

  it("accepts boundary value 0.05", async () => {
    const { runtime, changeIcebergSize } = makeRuntime([
      { i: 1, type: "iceberg", size: 1 },
    ]);
    const tool = createSetIcebergSizeTool(runtime);
    const result = await tool.execute({ id: 1, size: 0.05 });
    expect(result.isError).toBeFalsy();
    expect(changeIcebergSize).toHaveBeenCalledWith(1, 0.05);
  });

  it("accepts boundary value 2", async () => {
    const { runtime, changeIcebergSize } = makeRuntime([
      { i: 1, type: "iceberg", size: 1 },
    ]);
    const tool = createSetIcebergSizeTool(runtime);
    const result = await tool.execute({ id: 1, size: 2 });
    expect(result.isError).toBeFalsy();
    expect(changeIcebergSize).toHaveBeenCalledWith(1, 2);
  });

  it("rejects size out of [0.05, 2] range with named bounds", async () => {
    const { runtime, changeIcebergSize, redrawIceberg } = makeRuntime([
      { i: 1, type: "iceberg", size: 1 },
    ]);
    const tool = createSetIcebergSizeTool(runtime);
    for (const bad of [0.04, 2.01, 0, -1, 100]) {
      const r = await tool.execute({ id: 1, size: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/\[0\.05, 2\]/);
    }
    expect(changeIcebergSize).not.toHaveBeenCalled();
    expect(redrawIceberg).not.toHaveBeenCalled();
  });

  it("rejects non-finite / non-number size", async () => {
    const { runtime, changeIcebergSize, redrawIceberg } = makeRuntime([
      { i: 1, type: "iceberg", size: 1 },
    ]);
    const tool = createSetIcebergSizeTool(runtime);
    for (const bad of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      "1",
      true,
      {},
      [],
    ]) {
      const r = await tool.execute({ id: 1, size: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/\[0\.05, 2\]/);
    }
    expect(changeIcebergSize).not.toHaveBeenCalled();
    expect(redrawIceberg).not.toHaveBeenCalled();
  });

  it("rejects missing size (undefined / null / absent)", async () => {
    const { runtime, changeIcebergSize } = makeRuntime([
      { i: 1, type: "iceberg", size: 1 },
    ]);
    const tool = createSetIcebergSizeTool(runtime);
    expect(JSON.parse((await tool.execute({ id: 1 })).content).error).toMatch(
      /size is required/,
    );
    expect(
      JSON.parse((await tool.execute({ id: 1, size: undefined })).content)
        .error,
    ).toMatch(/size is required/);
    expect(
      JSON.parse((await tool.execute({ id: 1, size: null })).content).error,
    ).toMatch(/size is required/);
    expect(changeIcebergSize).not.toHaveBeenCalled();
  });

  it("rejects glacier id with explicit message", async () => {
    const { runtime, changeIcebergSize, redrawIceberg } = makeRuntime([
      { i: 0, type: "glacier", size: 0 },
    ]);
    const tool = createSetIcebergSizeTool(runtime);
    const result = await tool.execute({ id: 0, size: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /Glaciers cannot be resized/,
    );
    expect(changeIcebergSize).not.toHaveBeenCalled();
    expect(redrawIceberg).not.toHaveBeenCalled();
  });

  it("errors when no ice element matches the id", async () => {
    const { runtime, changeIcebergSize, redrawIceberg } = makeRuntime([
      { i: 1, type: "iceberg", size: 1 },
    ]);
    const tool = createSetIcebergSizeTool(runtime);
    const result = await tool.execute({ id: 99, size: 0.5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /No ice element found with id 99/,
    );
    expect(changeIcebergSize).not.toHaveBeenCalled();
    expect(redrawIceberg).not.toHaveBeenCalled();
  });

  it("rejects non-integer / non-number / negative ids", async () => {
    const { runtime, changeIcebergSize } = makeRuntime([
      { i: 1, type: "iceberg", size: 1 },
    ]);
    const tool = createSetIcebergSizeTool(runtime);
    for (const bad of [
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -1,
      "1",
      true,
      {},
      [],
    ]) {
      const result = await tool.execute({ id: bad, size: 0.5 });
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content).error).toMatch(
        /id must be a non-negative integer/,
      );
    }
    expect(changeIcebergSize).not.toHaveBeenCalled();
  });

  it("rejects missing id (undefined / null / absent)", async () => {
    const { runtime, changeIcebergSize } = makeRuntime();
    const tool = createSetIcebergSizeTool(runtime);
    expect((await tool.execute({ size: 0.5 })).isError).toBe(true);
    expect((await tool.execute({ id: undefined, size: 0.5 })).isError).toBe(
      true,
    );
    expect((await tool.execute({ id: null, size: 0.5 })).isError).toBe(true);
    expect(changeIcebergSize).not.toHaveBeenCalled();
  });

  it("surfaces errors thrown by runtime.findIce (e.g. pack missing)", async () => {
    const { runtime, changeIcebergSize } = makeRuntime();
    runtime.findIce = vi.fn(() => {
      throw new Error("pack.ice is not available.");
    });
    const tool = createSetIcebergSizeTool(runtime);
    const result = await tool.execute({ id: 1, size: 0.5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack\.ice/);
    expect(changeIcebergSize).not.toHaveBeenCalled();
  });

  it("surfaces errors thrown by changeIcebergSize; redraw not called; entry unchanged", async () => {
    const initial: SetIcebergSizeIceRef[] = [
      { i: 7, type: "iceberg", size: 1 },
    ];
    const { runtime, ice, redrawIceberg } = makeRuntime(initial);
    runtime.changeIcebergSize = vi.fn(() => {
      throw new Error("Ice.changeIcebergSize blew up");
    });
    const tool = createSetIcebergSizeTool(runtime);
    const result = await tool.execute({ id: 7, size: 0.5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /Ice\.changeIcebergSize blew up/,
    );
    expect(redrawIceberg).not.toHaveBeenCalled();
    expect(ice[0].size).toBe(1);
  });

  it("surfaces errors thrown by redrawIceberg", async () => {
    const { runtime, changeIcebergSize } = makeRuntime([
      { i: 7, type: "iceberg", size: 1 },
    ]);
    runtime.redrawIceberg = vi.fn(() => {
      throw new Error("redrawIceberg blew up");
    });
    const tool = createSetIcebergSizeTool(runtime);
    const result = await tool.execute({ id: 7, size: 0.5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/redrawIceberg blew up/);
    // changeIcebergSize was still called (redraw failure is downstream).
    expect(changeIcebergSize).toHaveBeenCalledWith(7, 0.5);
  });

  it("tool name + ToolRegistry round-trip", async () => {
    const { runtime } = makeRuntime([{ i: 7, type: "iceberg", size: 1 }]);
    const tool = createSetIcebergSizeTool(runtime);
    expect(tool.name).toBe("set_iceberg_size");
    const registry = new ToolRegistry();
    registry.register(tool);
    const result = await registry.run("set_iceberg_size", {
      id: 7,
      size: 0.25,
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      id: 7,
      old_size: 1,
      new_size: 0.25,
    });
  });
});

describe("defaultSetIcebergSizeRuntime", () => {
  type GlobalShape = {
    pack?: unknown;
    Ice?: unknown;
    redrawIceberg?: unknown;
  };
  let prevPack: unknown;
  let prevIce: unknown;
  let prevRedraw: unknown;

  beforeEach(() => {
    prevPack = (globalThis as GlobalShape).pack;
    prevIce = (globalThis as GlobalShape).Ice;
    prevRedraw = (globalThis as GlobalShape).redrawIceberg;
  });
  afterEach(() => {
    if (prevPack === undefined) {
      delete (globalThis as GlobalShape).pack;
    } else {
      (globalThis as GlobalShape).pack = prevPack;
    }
    if (prevIce === undefined) {
      delete (globalThis as GlobalShape).Ice;
    } else {
      (globalThis as GlobalShape).Ice = prevIce;
    }
    if (prevRedraw === undefined) {
      delete (globalThis as GlobalShape).redrawIceberg;
    } else {
      (globalThis as GlobalShape).redrawIceberg = prevRedraw;
    }
  });

  it("happy path: stubs Ice.changeIcebergSize + redrawIceberg + pack.ice and round-trips", async () => {
    const ice: Array<{
      i: number;
      type: "glacier" | "iceberg";
      size: number;
    }> = [
      { i: 0, type: "glacier", size: 0 },
      { i: 1, type: "iceberg", size: 1 },
    ];
    (globalThis as GlobalShape).pack = { ice };
    (globalThis as GlobalShape).Ice = {
      changeIcebergSize: vi.fn((id: number, size: number) => {
        const e = ice.find((entry) => entry.i === id);
        if (e) e.size = size;
      }),
    };
    (globalThis as GlobalShape).redrawIceberg = vi.fn();
    const tool = createSetIcebergSizeTool();
    const result = await tool.execute({ id: 1, size: 0.5 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: 1,
      old_size: 1,
      new_size: 0.5,
    });
    expect(ice[1].size).toBe(0.5);
    const stubbedRedraw = (
      globalThis as unknown as {
        redrawIceberg: ReturnType<typeof vi.fn>;
      }
    ).redrawIceberg;
    expect(stubbedRedraw).toHaveBeenCalledWith(1);
  });

  it("findIce throws when pack is missing", () => {
    delete (globalThis as GlobalShape).pack;
    expect(() => defaultSetIcebergSizeRuntime.findIce(0)).toThrow(/pack/);
  });

  it("findIce throws when pack.ice is missing", () => {
    (globalThis as GlobalShape).pack = {};
    expect(() => defaultSetIcebergSizeRuntime.findIce(0)).toThrow(/pack\.ice/);
  });

  it("default tool returns clear error when pack.ice is missing", async () => {
    (globalThis as GlobalShape).pack = {};
    (globalThis as GlobalShape).Ice = { changeIcebergSize: vi.fn() };
    (globalThis as GlobalShape).redrawIceberg = vi.fn();
    const tool = createSetIcebergSizeTool();
    const result = await tool.execute({ id: 0, size: 0.5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack\.ice/);
  });

  it("changeIcebergSize throws when Ice global is missing", () => {
    delete (globalThis as GlobalShape).Ice;
    expect(() => defaultSetIcebergSizeRuntime.changeIcebergSize(0, 1)).toThrow(
      /Ice\.changeIcebergSize/,
    );
  });

  it("changeIcebergSize throws when Ice.changeIcebergSize is not a function", () => {
    (globalThis as GlobalShape).Ice = {};
    expect(() => defaultSetIcebergSizeRuntime.changeIcebergSize(0, 1)).toThrow(
      /Ice\.changeIcebergSize/,
    );
  });

  it("redrawIceberg throws when global redrawIceberg is missing", () => {
    delete (globalThis as GlobalShape).redrawIceberg;
    expect(() => defaultSetIcebergSizeRuntime.redrawIceberg(0)).toThrow(
      /redrawIceberg/,
    );
  });

  it("default tool returns clear error when redrawIceberg is missing", async () => {
    const ice = [{ i: 1, type: "iceberg" as const, size: 1 }];
    (globalThis as GlobalShape).pack = { ice };
    (globalThis as GlobalShape).Ice = {
      changeIcebergSize: vi.fn((id: number, size: number) => {
        const e = ice.find((entry) => entry.i === id);
        if (e) e.size = size;
      }),
    };
    delete (globalThis as GlobalShape).redrawIceberg;
    const tool = createSetIcebergSizeTool();
    const result = await tool.execute({ id: 1, size: 0.5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/redrawIceberg/);
  });

  it("default tool returns clear error when Ice.changeIcebergSize is missing", async () => {
    const ice = [{ i: 1, type: "iceberg" as const, size: 1 }];
    (globalThis as GlobalShape).pack = { ice };
    (globalThis as GlobalShape).Ice = {};
    (globalThis as GlobalShape).redrawIceberg = vi.fn();
    const tool = createSetIcebergSizeTool();
    const result = await tool.execute({ id: 1, size: 0.5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Ice\.changeIcebergSize/);
  });
});

describe("set_iceberg_size tool registration", () => {
  it("exposes the expected tool name", () => {
    expect(setIcebergSizeTool.name).toBe("set_iceberg_size");
  });

  it("is reachable via buildDefaultRegistry", () => {
    const registry = buildDefaultRegistry();
    const tool = registry.list().find((t) => t.name === "set_iceberg_size");
    expect(tool).toBeDefined();
  });
});
