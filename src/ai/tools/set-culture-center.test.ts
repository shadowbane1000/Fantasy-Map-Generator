import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawCulture } from "./_shared";
import {
  type CultureCenterRef,
  type CultureCenterRuntime,
  createSetCultureCenterTool,
  setCultureCenterTool,
} from "./set-culture-center";

function makeRuntime(
  resolver: (ref: number | string) => CultureCenterRef | null,
  cellCount = 100,
) {
  const find = vi.fn(resolver);
  const getCellCount = vi.fn<CultureCenterRuntime["getCellCount"]>(
    () => cellCount,
  );
  const apply = vi.fn<CultureCenterRuntime["apply"]>();
  const runtime: CultureCenterRuntime = { find, getCellCount, apply };
  return { runtime, find, getCellCount, apply };
}

describe("set_culture_center tool", () => {
  it("applies a new center by culture id", async () => {
    const { runtime, apply } = makeRuntime(
      (ref) =>
        ref === 2
          ? {
              i: 2,
              name: "Coastalfolk",
              previousCenter: 100,
              locked: false,
            }
          : null,
      2000,
    );
    const tool = createSetCultureCenterTool(runtime);
    const result = await tool.execute({ culture: 2, cell: 1523 });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(2, 1523);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 2,
      name: "Coastalfolk",
      previousCenter: 100,
      center: 1523,
      noop: false,
    });
  });

  it("resolves a case-insensitive name reference", async () => {
    const { runtime, apply } = makeRuntime((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "highlanders"
        ? { i: 1, name: "Highlanders", previousCenter: 50, locked: false }
        : null,
    );
    const tool = createSetCultureCenterTool(runtime);
    await tool.execute({ culture: "HIGHLANDERS", cell: 77 });
    expect(apply).toHaveBeenCalledWith(1, 77);
  });

  it("is idempotent when cell equals current center", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 2,
      name: "Coastalfolk",
      previousCenter: 42,
      locked: false,
    }));
    const tool = createSetCultureCenterTool(runtime);
    const result = await tool.execute({ culture: 2, cell: 42 });
    expect(result.isError).toBeFalsy();
    expect(apply).not.toHaveBeenCalled();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 2,
      name: "Coastalfolk",
      previousCenter: 42,
      center: 42,
      noop: true,
    });
  });

  it("rejects culture 0 (Wildlands)", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 0,
      name: "Wildlands",
      previousCenter: 0,
      locked: false,
    }));
    const tool = createSetCultureCenterTool(runtime);
    const result = await tool.execute({ culture: 0, cell: 10 });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects locked cultures", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 3,
      name: "Ancients",
      previousCenter: 20,
      locked: true,
    }));
    const tool = createSetCultureCenterTool(runtime);
    const result = await tool.execute({ culture: 3, cell: 55 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/locked/);
    expect(apply).not.toHaveBeenCalled();
  });

  it("errors for unknown refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetCultureCenterTool(runtime);
    const result = await tool.execute({ culture: 999, cell: 5 });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects out-of-range cells", async () => {
    const { runtime, apply } = makeRuntime(
      () => ({ i: 1, name: "X", previousCenter: 0, locked: false }),
      50,
    );
    const tool = createSetCultureCenterTool(runtime);
    const result = await tool.execute({ culture: 1, cell: 50 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/out of range/);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid cell types", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "X",
      previousCenter: 0,
      locked: false,
    }));
    const tool = createSetCultureCenterTool(runtime);
    for (const bad of [null, undefined, -1, 1.5, "abc", {}, Number.NaN]) {
      const r = await tool.execute({ culture: 1, cell: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid ref types", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetCultureCenterTool(runtime);
    for (const bad of [null, "", 1.5, -1, {}]) {
      const r = await tool.execute({ culture: bad, cell: 10 });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("errors when pack.cells.i is empty", async () => {
    const { runtime, apply } = makeRuntime(
      () => ({ i: 1, name: "X", previousCenter: 0, locked: false }),
      0,
    );
    const tool = createSetCultureCenterTool(runtime);
    const result = await tool.execute({ culture: 1, cell: 10 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack\.cells\.i/);
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const runtime: CultureCenterRuntime = {
      find: () => ({ i: 1, name: "X", previousCenter: 0, locked: false }),
      getCellCount: () => 100,
      apply: vi.fn(() => {
        throw new Error("pack missing");
      }),
    };
    const tool = createSetCultureCenterTool(runtime);
    const result = await tool.execute({ culture: 1, cell: 10 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack missing/);
  });
});

describe("defaultCultureCenterRuntime (integration)", () => {
  const originalPack = (globalThis as unknown as { pack?: unknown }).pack;

  beforeEach(() => {
    (globalThis as unknown as { pack?: unknown }).pack = {
      cultures: [
        { i: 0, name: "Wildlands", removed: true, center: 0 },
        { i: 1, name: "Highlanders", center: 50, lock: false },
        { i: 2, name: "Coastalfolk", center: 75, lock: true },
        { i: 3, name: "Gone", removed: true, center: 20 },
      ] satisfies RawCulture[],
      cells: { i: new Array(200).fill(0).map((_, k) => k) },
    };
  });

  afterEach(() => {
    (globalThis as unknown as { pack?: unknown }).pack = originalPack;
  });

  it("writes culture.center in the live pack", async () => {
    const result = await setCultureCenterTool.execute({
      culture: 1,
      cell: 123,
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as unknown as { pack: { cultures: RawCulture[] } })
      .pack;
    expect(pack.cultures[1]?.center).toBe(123);
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      i: 1,
      previousCenter: 50,
      center: 123,
      noop: false,
    });
  });

  it("refuses locked cultures", async () => {
    const result = await setCultureCenterTool.execute({
      culture: 2,
      cell: 60,
    });
    expect(result.isError).toBe(true);
    const pack = (globalThis as unknown as { pack: { cultures: RawCulture[] } })
      .pack;
    expect(pack.cultures[2]?.center).toBe(75);
  });

  it("rejects an out-of-range cell id", async () => {
    const result = await setCultureCenterTool.execute({
      culture: 1,
      cell: 9999,
    });
    expect(result.isError).toBe(true);
    const pack = (globalThis as unknown as { pack: { cultures: RawCulture[] } })
      .pack;
    expect(pack.cultures[1]?.center).toBe(50);
  });

  it("is a noop when cell matches current center", async () => {
    const result = await setCultureCenterTool.execute({
      culture: 1,
      cell: 50,
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).noop).toBe(true);
  });
});
