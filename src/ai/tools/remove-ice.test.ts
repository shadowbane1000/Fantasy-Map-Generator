import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDefaultRegistry } from "../index";
import {
  createRemoveIceTool,
  defaultRemoveIceRuntime,
  type RemoveIceRef,
  type RemoveIceRuntime,
  removeIceTool,
} from "./remove-ice";

interface RuntimeStubs {
  runtime: RemoveIceRuntime;
  findIce: ReturnType<typeof vi.fn>;
  removeIce: ReturnType<typeof vi.fn>;
  getIceArray: ReturnType<typeof vi.fn>;
}

function makeRuntime(initial: RemoveIceRef[] = []): RuntimeStubs {
  // Mutable underlying array (mirrors pack.ice).
  const ice: RemoveIceRef[] = [...initial];

  const findIce = vi.fn((id: number): RemoveIceRef | null => {
    const entry = ice.find((e) => e.i === id);
    return entry ? { ...entry } : null;
  });
  const removeIce = vi.fn((id: number): void => {
    const idx = ice.findIndex((e) => e.i === id);
    if (idx !== -1) ice.splice(idx, 1);
  });
  const getIceArray = vi.fn(() => ice.map((e) => ({ i: e.i })));

  const runtime: RemoveIceRuntime = { findIce, removeIce, getIceArray };
  return { runtime, findIce, removeIce, getIceArray };
}

describe("remove_ice tool (injected runtime)", () => {
  it("removes an iceberg by id and reports type + cell_id", async () => {
    const { runtime, removeIce, getIceArray } = makeRuntime([
      { i: 7, type: "iceberg", cellId: 42 },
      { i: 8, type: "iceberg", cellId: 43 },
    ]);
    const tool = createRemoveIceTool(runtime);
    const result = await tool.execute({ id: 7 });
    expect(result.isError).toBeFalsy();
    expect(removeIce).toHaveBeenCalledWith(7);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: 7,
      type: "iceberg",
      cell_id: 42,
    });
    // Verify post-call state did not contain the removed entry.
    const post = getIceArray.mock.results.at(-1)?.value as { i: number }[];
    expect(post.map((e) => e.i)).toEqual([8]);
  });

  it("removes a glacier by id (cellId may be null)", async () => {
    const { runtime, removeIce } = makeRuntime([
      { i: 0, type: "glacier", cellId: null },
    ]);
    const tool = createRemoveIceTool(runtime);
    const result = await tool.execute({ id: 0 });
    expect(result.isError).toBeFalsy();
    expect(removeIce).toHaveBeenCalledWith(0);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: 0,
      type: "glacier",
      cell_id: null,
    });
  });

  it("errors when no ice element matches the id", async () => {
    const { runtime, removeIce } = makeRuntime([
      { i: 1, type: "iceberg", cellId: 10 },
    ]);
    const tool = createRemoveIceTool(runtime);
    const result = await tool.execute({ id: 99 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/No ice element found/);
    expect(removeIce).not.toHaveBeenCalled();
  });

  it("rejects non-integer / non-number / negative ids", async () => {
    const { runtime, removeIce } = makeRuntime([
      { i: 1, type: "iceberg", cellId: 10 },
    ]);
    const tool = createRemoveIceTool(runtime);
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
      const result = await tool.execute({ id: bad });
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content).error).toMatch(
        /id must be a non-negative integer/,
      );
    }
    expect(removeIce).not.toHaveBeenCalled();
  });

  it("rejects missing id (undefined / null / absent)", async () => {
    const { runtime, removeIce } = makeRuntime();
    const tool = createRemoveIceTool(runtime);
    expect((await tool.execute({})).isError).toBe(true);
    expect((await tool.execute({ id: undefined })).isError).toBe(true);
    expect((await tool.execute({ id: null })).isError).toBe(true);
    expect(removeIce).not.toHaveBeenCalled();
  });

  it("surfaces errors thrown by runtime.findIce (e.g. pack missing)", async () => {
    const { runtime, removeIce } = makeRuntime([
      { i: 1, type: "iceberg", cellId: 10 },
    ]);
    runtime.findIce = vi.fn(() => {
      throw new Error("pack.ice is not available.");
    });
    const tool = createRemoveIceTool(runtime);
    const result = await tool.execute({ id: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack\.ice/);
    expect(removeIce).not.toHaveBeenCalled();
  });

  it("surfaces errors thrown by runtime.removeIce", async () => {
    const initial: RemoveIceRef[] = [{ i: 7, type: "iceberg", cellId: 42 }];
    const { runtime } = makeRuntime(initial);
    runtime.removeIce = vi.fn(() => {
      throw new Error("Ice.removeIce is not available yet");
    });
    const tool = createRemoveIceTool(runtime);
    const result = await tool.execute({ id: 7 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not available/);
    // pack.ice unchanged.
    const post = runtime.getIceArray() as { i: number }[];
    expect(post.map((e) => e.i)).toEqual([7]);
  });

  it("errors when removeIce silently no-ops (entry still present)", async () => {
    const { runtime, removeIce } = makeRuntime([
      { i: 7, type: "iceberg", cellId: 42 },
    ]);
    runtime.removeIce = vi.fn(); // does nothing
    const tool = createRemoveIceTool(runtime);
    const result = await tool.execute({ id: 7 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /Failed to remove ice element 7/,
    );
    expect(runtime.removeIce).toHaveBeenCalledWith(7);
    // The original (working) removeIce stub should not have been called.
    expect(removeIce).not.toHaveBeenCalled();
  });
});

describe("defaultRemoveIceRuntime", () => {
  let prevPack: unknown;
  let prevIce: unknown;
  beforeEach(() => {
    prevPack = (globalThis as { pack?: unknown }).pack;
    prevIce = (globalThis as { Ice?: unknown }).Ice;
  });
  afterEach(() => {
    if (prevPack === undefined) {
      delete (globalThis as { pack?: unknown }).pack;
    } else {
      (globalThis as { pack?: unknown }).pack = prevPack;
    }
    if (prevIce === undefined) {
      delete (globalThis as { Ice?: unknown }).Ice;
    } else {
      (globalThis as { Ice?: unknown }).Ice = prevIce;
    }
  });

  it("happy path: stubs Ice.removeIce + pack.ice and round-trips", async () => {
    const ice: Array<{
      i: number;
      type: "glacier" | "iceberg";
      cellId?: number;
    }> = [
      { i: 0, type: "glacier" },
      { i: 1, type: "iceberg", cellId: 42 },
    ];
    (globalThis as { pack?: unknown }).pack = { ice };
    (globalThis as { Ice?: unknown }).Ice = {
      removeIce: vi.fn((id: number) => {
        const idx = ice.findIndex((e) => e.i === id);
        if (idx !== -1) ice.splice(idx, 1);
      }),
    };
    const tool = createRemoveIceTool();
    const result = await tool.execute({ id: 1 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: 1,
      type: "iceberg",
      cell_id: 42,
    });
    expect(ice.map((e) => e.i)).toEqual([0]);
  });

  it("findIce throws when pack is missing", () => {
    delete (globalThis as { pack?: unknown }).pack;
    expect(() => defaultRemoveIceRuntime.findIce(0)).toThrow(/pack/);
  });

  it("findIce throws when pack.ice is missing", () => {
    (globalThis as { pack?: unknown }).pack = {};
    expect(() => defaultRemoveIceRuntime.findIce(0)).toThrow(/pack\.ice/);
  });

  it("default tool returns clear error when pack.ice is missing", async () => {
    (globalThis as { pack?: unknown }).pack = {};
    (globalThis as { Ice?: unknown }).Ice = { removeIce: vi.fn() };
    const tool = createRemoveIceTool();
    const result = await tool.execute({ id: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack\.ice/);
  });

  it("removeIce throws when Ice global is missing", () => {
    delete (globalThis as { Ice?: unknown }).Ice;
    expect(() => defaultRemoveIceRuntime.removeIce(0)).toThrow(
      /Ice\.removeIce/,
    );
  });

  it("removeIce throws when Ice.removeIce is not a function", () => {
    (globalThis as { Ice?: unknown }).Ice = {};
    expect(() => defaultRemoveIceRuntime.removeIce(0)).toThrow(
      /Ice\.removeIce/,
    );
  });

  it("getIceArray returns null when pack/pack.ice is missing", () => {
    delete (globalThis as { pack?: unknown }).pack;
    expect(defaultRemoveIceRuntime.getIceArray()).toBeNull();
    (globalThis as { pack?: unknown }).pack = {};
    expect(defaultRemoveIceRuntime.getIceArray()).toBeNull();
  });
});

describe("remove_ice tool registration", () => {
  it("exposes the expected tool name", () => {
    expect(removeIceTool.name).toBe("remove_ice");
  });

  it("is reachable via buildDefaultRegistry", () => {
    const registry = buildDefaultRegistry();
    const tool = registry.list().find((t) => t.name === "remove_ice");
    expect(tool).toBeDefined();
  });
});
