import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawCulture } from "./_shared";
import {
  type CultureOriginsRef,
  type CultureOriginsRuntime,
  type CulturesInfo,
  createSetCultureOriginsTool,
  setCultureOriginsTool,
} from "./set-culture-origins";

function makeRuntime(
  resolver: (ref: number | string) => CultureOriginsRef | null,
  info: CulturesInfo = { length: 10, removed: new Set<number>([0]) },
) {
  const find = vi.fn(resolver);
  const getCulturesInfo = vi.fn<CultureOriginsRuntime["getCulturesInfo"]>(
    () => info,
  );
  const apply = vi.fn<CultureOriginsRuntime["apply"]>();
  const runtime: CultureOriginsRuntime = { find, getCulturesInfo, apply };
  return { runtime, find, getCulturesInfo, apply };
}

describe("set_culture_origins tool", () => {
  it("applies origins by culture id", async () => {
    const { runtime, apply } = makeRuntime((ref) =>
      ref === 3
        ? {
            i: 3,
            name: "Highlanders",
            previousOrigins: [0],
            locked: false,
          }
        : null,
    );
    const tool = createSetCultureOriginsTool(runtime);
    const result = await tool.execute({ culture: 3, origins: [1, 2] });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(3, [1, 2]);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 3,
      name: "Highlanders",
      previousOrigins: [0],
      origins: [1, 2],
    });
  });

  it("resolves a case-insensitive name reference", async () => {
    const { runtime, apply } = makeRuntime((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "highlanders"
        ? { i: 1, name: "Highlanders", previousOrigins: [0], locked: false }
        : null,
    );
    const tool = createSetCultureOriginsTool(runtime);
    await tool.execute({ culture: "HIGHLANDERS", origins: [2] });
    expect(apply).toHaveBeenCalledWith(1, [2]);
  });

  it("normalises an empty origins array to [0]", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 2,
      name: "Coastalfolk",
      previousOrigins: [1],
      locked: false,
    }));
    const tool = createSetCultureOriginsTool(runtime);
    const result = await tool.execute({ culture: 2, origins: [] });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(2, [0]);
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      origins: [0],
      previousOrigins: [1],
    });
  });

  it("deduplicates origins preserving first-occurrence order", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 4,
      name: "X",
      previousOrigins: [],
      locked: false,
    }));
    const tool = createSetCultureOriginsTool(runtime);
    const result = await tool.execute({
      culture: 4,
      origins: [2, 1, 2, 3, 1],
    });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(4, [2, 1, 3]);
    expect(JSON.parse(result.content).origins).toEqual([2, 1, 3]);
  });

  it("allows origin 0 (Wildlands sentinel) even though Wildlands is removed", async () => {
    const { runtime, apply } = makeRuntime(
      () => ({
        i: 5,
        name: "Orphans",
        previousOrigins: [1],
        locked: false,
      }),
      { length: 10, removed: new Set<number>([0]) },
    );
    const tool = createSetCultureOriginsTool(runtime);
    const result = await tool.execute({ culture: 5, origins: [0] });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(5, [0]);
  });

  it("rejects culture 0 (Wildlands)", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 0,
      name: "Wildlands",
      previousOrigins: [],
      locked: false,
    }));
    const tool = createSetCultureOriginsTool(runtime);
    const result = await tool.execute({ culture: 0, origins: [1] });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects locked cultures", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 3,
      name: "Ancients",
      previousOrigins: [0],
      locked: true,
    }));
    const tool = createSetCultureOriginsTool(runtime);
    const result = await tool.execute({ culture: 3, origins: [1] });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/locked/);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects unknown refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetCultureOriginsTool(runtime);
    const result = await tool.execute({ culture: 999, origins: [1] });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects a self-loop", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 2,
      name: "X",
      previousOrigins: [],
      locked: false,
    }));
    const tool = createSetCultureOriginsTool(runtime);
    const result = await tool.execute({ culture: 2, origins: [1, 2] });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/itself/);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid origin element types", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 2,
      name: "X",
      previousOrigins: [],
      locked: false,
    }));
    const tool = createSetCultureOriginsTool(runtime);
    for (const bad of [null, "abc", 1.5, -1, Number.NaN, {}]) {
      const result = await tool.execute({ culture: 2, origins: [bad] });
      expect(result.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects out-of-range origins", async () => {
    const { runtime, apply } = makeRuntime(
      () => ({ i: 2, name: "X", previousOrigins: [], locked: false }),
      { length: 5, removed: new Set<number>([0]) },
    );
    const tool = createSetCultureOriginsTool(runtime);
    const result = await tool.execute({ culture: 2, origins: [5] });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/out of range/);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects origins referring to removed cultures", async () => {
    const { runtime, apply } = makeRuntime(
      () => ({ i: 2, name: "X", previousOrigins: [], locked: false }),
      { length: 10, removed: new Set<number>([0, 4]) },
    );
    const tool = createSetCultureOriginsTool(runtime);
    const result = await tool.execute({ culture: 2, origins: [4] });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/removed/);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects non-array origins", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 2,
      name: "X",
      previousOrigins: [],
      locked: false,
    }));
    const tool = createSetCultureOriginsTool(runtime);
    for (const bad of [null, undefined, "1,2", 5, {}]) {
      const result = await tool.execute({ culture: 2, origins: bad });
      expect(result.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid ref types", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetCultureOriginsTool(runtime);
    for (const bad of [null, "", 1.5, -1, {}]) {
      const result = await tool.execute({ culture: bad, origins: [1] });
      expect(result.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("errors when pack.cultures is empty", async () => {
    const { runtime, apply } = makeRuntime(
      () => ({ i: 1, name: "X", previousOrigins: [], locked: false }),
      { length: 0, removed: new Set<number>() },
    );
    const tool = createSetCultureOriginsTool(runtime);
    const result = await tool.execute({ culture: 1, origins: [0] });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack\.cultures/);
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const runtime: CultureOriginsRuntime = {
      find: () => ({
        i: 1,
        name: "X",
        previousOrigins: [],
        locked: false,
      }),
      getCulturesInfo: () => ({ length: 10, removed: new Set<number>([0]) }),
      apply: vi.fn(() => {
        throw new Error("pack missing");
      }),
    };
    const tool = createSetCultureOriginsTool(runtime);
    const result = await tool.execute({ culture: 1, origins: [2] });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack missing/);
  });
});

describe("defaultCultureOriginsRuntime (integration)", () => {
  const originalPack = (globalThis as unknown as { pack?: unknown }).pack;

  beforeEach(() => {
    (globalThis as unknown as { pack?: unknown }).pack = {
      cultures: [
        { i: 0, name: "Wildlands", removed: true, origins: [] },
        { i: 1, name: "Highlanders", origins: [0], lock: false },
        { i: 2, name: "Coastalfolk", origins: [1], lock: false },
        { i: 3, name: "Gone", removed: true, origins: [0] },
        { i: 4, name: "Locked", origins: [0], lock: true },
      ] satisfies RawCulture[],
    };
  });

  afterEach(() => {
    (globalThis as unknown as { pack?: unknown }).pack = originalPack;
  });

  it("writes culture.origins in the live pack", async () => {
    const result = await setCultureOriginsTool.execute({
      culture: 2,
      origins: [1],
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as unknown as { pack: { cultures: RawCulture[] } })
      .pack;
    expect(pack.cultures[2]?.origins).toEqual([1]);
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      i: 2,
      previousOrigins: [1],
      origins: [1],
    });
  });

  it("refuses locked cultures", async () => {
    const result = await setCultureOriginsTool.execute({
      culture: 4,
      origins: [1],
    });
    expect(result.isError).toBe(true);
    const pack = (globalThis as unknown as { pack: { cultures: RawCulture[] } })
      .pack;
    expect(pack.cultures[4]?.origins).toEqual([0]);
  });

  it("rejects an origin referencing a removed culture", async () => {
    const result = await setCultureOriginsTool.execute({
      culture: 1,
      origins: [3],
    });
    expect(result.isError).toBe(true);
    const pack = (globalThis as unknown as { pack: { cultures: RawCulture[] } })
      .pack;
    expect(pack.cultures[1]?.origins).toEqual([0]);
  });

  it("resets an empty array to [0] in the live pack", async () => {
    const result = await setCultureOriginsTool.execute({
      culture: 2,
      origins: [],
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as unknown as { pack: { cultures: RawCulture[] } })
      .pack;
    expect(pack.cultures[2]?.origins).toEqual([0]);
  });

  it("rejects an out-of-range origin id", async () => {
    const result = await setCultureOriginsTool.execute({
      culture: 1,
      origins: [999],
    });
    expect(result.isError).toBe(true);
    const pack = (globalThis as unknown as { pack: { cultures: RawCulture[] } })
      .pack;
    expect(pack.cultures[1]?.origins).toEqual([0]);
  });
});
