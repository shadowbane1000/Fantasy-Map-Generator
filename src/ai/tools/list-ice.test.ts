import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDefaultRegistry } from "../index";
import {
  createListIceTool,
  defaultListIceRuntime,
  type ListIceEntry,
  type ListIceRuntime,
  listIceTool,
} from "./list-ice";

function makeRuntime(initial: ListIceEntry[]): ListIceRuntime {
  const ice = [...initial];
  return {
    getIceArray: vi.fn(() => ice),
  };
}

describe("list_ice tool (injected runtime)", () => {
  it("returns all ice elements in order when no filter is provided", async () => {
    const runtime = makeRuntime([
      { i: 0, type: "glacier" },
      { i: 1, type: "iceberg", cellId: 42, size: 0.5 },
      { i: 2, type: "iceberg", cellId: 43, size: 0.7 },
    ]);
    const tool = createListIceTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      count: 3,
      total: 3,
      items: [
        {
          id: 0,
          type: "glacier",
          cell_id: null,
          size: null,
          has_offset: false,
        },
        {
          id: 1,
          type: "iceberg",
          cell_id: 42,
          size: 0.5,
          has_offset: false,
        },
        {
          id: 2,
          type: "iceberg",
          cell_id: 43,
          size: 0.7,
          has_offset: false,
        },
      ],
    });
  });

  it("filters to glacier when type=glacier", async () => {
    const runtime = makeRuntime([
      { i: 0, type: "glacier" },
      { i: 1, type: "iceberg", cellId: 42, size: 0.5 },
      { i: 2, type: "iceberg", cellId: 43, size: 0.7 },
    ]);
    const tool = createListIceTool(runtime);
    const result = await tool.execute({ type: "glacier" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.count).toBe(1);
    expect(body.total).toBe(3);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toEqual({
      id: 0,
      type: "glacier",
      cell_id: null,
      size: null,
      has_offset: false,
    });
  });

  it("filters to iceberg when type=iceberg", async () => {
    const runtime = makeRuntime([
      { i: 0, type: "glacier" },
      { i: 1, type: "iceberg", cellId: 42, size: 0.5 },
      { i: 2, type: "iceberg", cellId: 43, size: 0.7 },
    ]);
    const tool = createListIceTool(runtime);
    const result = await tool.execute({ type: "iceberg" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.count).toBe(2);
    expect(body.total).toBe(3);
    expect(body.items.map((it: { id: number }) => it.id)).toEqual([1, 2]);
  });

  it("returns count=0 / total=0 / items=[] for empty pack.ice", async () => {
    const runtime = makeRuntime([]);
    const tool = createListIceTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      count: 0,
      total: 0,
      items: [],
    });
  });

  it("renders cell_id and size as null when missing on a glacier", async () => {
    const runtime = makeRuntime([{ i: 5, type: "glacier" }]);
    const tool = createListIceTool(runtime);
    const result = await tool.execute({});
    const body = JSON.parse(result.content);
    expect(body.items[0].cell_id).toBeNull();
    expect(body.items[0].size).toBeNull();
  });

  it("reports has_offset=true when offset is an array", async () => {
    const runtime = makeRuntime([
      {
        i: 7,
        type: "iceberg",
        cellId: 12,
        size: 0.3,
        offset: [1.5, -2.5],
      },
    ]);
    const tool = createListIceTool(runtime);
    const result = await tool.execute({});
    const body = JSON.parse(result.content);
    expect(body.items[0].has_offset).toBe(true);
  });

  it("reports has_offset=false when offset is absent", async () => {
    const runtime = makeRuntime([
      { i: 7, type: "iceberg", cellId: 12, size: 0.3 },
    ]);
    const tool = createListIceTool(runtime);
    const result = await tool.execute({});
    const body = JSON.parse(result.content);
    expect(body.items[0].has_offset).toBe(false);
  });

  it("reports has_offset=false (no crash) for malformed offset values", async () => {
    const malformed: unknown[] = [
      "nope",
      5,
      true,
      {},
      null,
      Number.NaN,
      undefined,
    ];
    for (const offset of malformed) {
      const runtime = makeRuntime([
        {
          i: 7,
          type: "iceberg",
          cellId: 12,
          size: 0.3,
          offset,
        },
      ]);
      const tool = createListIceTool(runtime);
      const result = await tool.execute({});
      expect(result.isError).toBeFalsy();
      const body = JSON.parse(result.content);
      expect(body.items[0].has_offset).toBe(false);
    }
  });

  it("rejects invalid type filter values", async () => {
    const runtime = makeRuntime([{ i: 0, type: "glacier" }]);
    const tool = createListIceTool(runtime);
    for (const bad of ["snow", "Glacier", "ICEBERG", "", 42, true, {}, []]) {
      const result = await tool.execute({ type: bad });
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content).error).toMatch(
        /type must be 'glacier' or 'iceberg'/,
      );
    }
  });

  it("treats undefined / null type the same as omitted (no filter)", async () => {
    const runtime = makeRuntime([
      { i: 0, type: "glacier" },
      { i: 1, type: "iceberg", cellId: 1, size: 0.2 },
    ]);
    const tool = createListIceTool(runtime);
    for (const value of [undefined, null]) {
      const result = await tool.execute({ type: value });
      expect(result.isError).toBeFalsy();
      const body = JSON.parse(result.content);
      expect(body.count).toBe(2);
      expect(body.total).toBe(2);
    }
  });

  it("surfaces errors thrown by runtime.getIceArray", async () => {
    const runtime: ListIceRuntime = {
      getIceArray: vi.fn(() => {
        throw new Error("pack.ice is not available.");
      }),
    };
    const tool = createListIceTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack\.ice/);
  });

  it("validates type filter before reading pack.ice", async () => {
    const getIceArray = vi.fn(() => {
      throw new Error("pack is not available.");
    });
    const tool = createListIceTool({ getIceArray });
    const result = await tool.execute({ type: "snow" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/glacier.*iceberg/);
    // type validation should run BEFORE runtime is called.
    expect(getIceArray).not.toHaveBeenCalled();
  });
});

describe("defaultListIceRuntime", () => {
  let prevPack: unknown;
  beforeEach(() => {
    prevPack = (globalThis as { pack?: unknown }).pack;
  });
  afterEach(() => {
    if (prevPack === undefined) {
      delete (globalThis as { pack?: unknown }).pack;
    } else {
      (globalThis as { pack?: unknown }).pack = prevPack;
    }
  });

  it("happy path: stubs pack.ice and round-trips", async () => {
    (globalThis as { pack?: unknown }).pack = {
      ice: [
        { i: 0, type: "glacier" },
        { i: 1, type: "iceberg", cellId: 42, size: 0.5 },
      ],
    };
    const tool = createListIceTool();
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      count: 2,
      total: 2,
      items: [
        {
          id: 0,
          type: "glacier",
          cell_id: null,
          size: null,
          has_offset: false,
        },
        {
          id: 1,
          type: "iceberg",
          cell_id: 42,
          size: 0.5,
          has_offset: false,
        },
      ],
    });
  });

  it("getIceArray throws when pack is missing", () => {
    delete (globalThis as { pack?: unknown }).pack;
    expect(() => defaultListIceRuntime.getIceArray()).toThrow(/pack/);
  });

  it("getIceArray throws when pack.ice is missing", () => {
    (globalThis as { pack?: unknown }).pack = {};
    expect(() => defaultListIceRuntime.getIceArray()).toThrow(/pack\.ice/);
  });

  it("getIceArray throws when pack.ice is not an array", () => {
    (globalThis as { pack?: unknown }).pack = { ice: "not an array" };
    expect(() => defaultListIceRuntime.getIceArray()).toThrow(/pack\.ice/);
  });

  it("default tool surfaces 'pack is not available' when pack is missing", async () => {
    delete (globalThis as { pack?: unknown }).pack;
    const tool = createListIceTool();
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack is not available/);
  });

  it("default tool surfaces 'pack.ice is not available' when pack.ice is missing", async () => {
    (globalThis as { pack?: unknown }).pack = {};
    const tool = createListIceTool();
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /pack\.ice is not available/,
    );
  });
});

describe("list_ice tool registration", () => {
  it("exposes the expected tool name", () => {
    expect(listIceTool.name).toBe("list_ice");
  });

  it("is reachable via buildDefaultRegistry", () => {
    const registry = buildDefaultRegistry();
    const tool = registry.list().find((t) => t.name === "list_ice");
    expect(tool).toBeDefined();
  });
});
