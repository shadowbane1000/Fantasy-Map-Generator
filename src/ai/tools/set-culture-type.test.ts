import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawCulture } from "./_shared";
import {
  type CultureTypeRef,
  type CultureTypeRuntime,
  createSetCultureTypeTool,
  resolveCultureType,
  setCultureTypeTool,
} from "./set-culture-type";

function makeRuntime(find: (ref: number | string) => CultureTypeRef | null): {
  runtime: CultureTypeRuntime;
  apply: ReturnType<typeof vi.fn<CultureTypeRuntime["apply"]>>;
} {
  const apply = vi.fn<CultureTypeRuntime["apply"]>();
  return { runtime: { find, apply }, apply };
}

describe("resolveCultureType", () => {
  it("resolves canonical values case-insensitively", () => {
    expect(resolveCultureType("Naval")).toBe("Naval");
    expect(resolveCultureType("naval")).toBe("Naval");
    expect(resolveCultureType("HIGHLAND")).toBe("Highland");
  });

  it("returns null for unknown", () => {
    expect(resolveCultureType("Desert")).toBeNull();
    expect(resolveCultureType(42)).toBeNull();
  });
});

describe("set_culture_type tool", () => {
  it("sets by numeric id", async () => {
    const { runtime, apply } = makeRuntime((ref) =>
      ref === 2 ? { i: 2, name: "Coastalfolk", previousType: "Generic" } : null,
    );
    const tool = createSetCultureTypeTool(runtime);
    const result = await tool.execute({ culture: 2, type: "Naval" });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(2, "Naval");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 2,
      name: "Coastalfolk",
      previousType: "Generic",
      type: "Naval",
    });
  });

  it("sets by case-insensitive name", async () => {
    const find = vi.fn<CultureTypeRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "highlanders"
        ? { i: 3, name: "Highlanders", previousType: null }
        : null,
    );
    const { runtime, apply } = makeRuntime(find);
    const tool = createSetCultureTypeTool(runtime);
    await tool.execute({ culture: "HIGHLANDERS", type: "Highland" });
    expect(find).toHaveBeenCalledWith("HIGHLANDERS");
    expect(apply).toHaveBeenCalledWith(3, "Highland");
  });

  it("canonicalizes lowercase type", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 2,
      name: "x",
      previousType: null,
    }));
    const tool = createSetCultureTypeTool(runtime);
    await tool.execute({ culture: 2, type: "naval" });
    expect(apply).toHaveBeenCalledWith(2, "Naval");
  });

  it("rejects unknown type", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 2,
      name: "x",
      previousType: null,
    }));
    const tool = createSetCultureTypeTool(runtime);
    const result = await tool.execute({ culture: 2, type: "Desert" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid culture refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetCultureTypeTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ culture: bad, type: "Naval" });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("refuses to retype Wildlands (culture 0)", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 0,
      name: "Wildlands",
      previousType: null,
    }));
    const tool = createSetCultureTypeTool(runtime);
    const result = await tool.execute({ culture: 0, type: "Naval" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("errors when culture is unknown", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetCultureTypeTool(runtime);
    const result = await tool.execute({ culture: 999, type: "Naval" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const runtime: CultureTypeRuntime = {
      find: () => ({ i: 1, name: "x", previousType: null }),
      apply: vi.fn(() => {
        throw new Error("pack missing");
      }),
    };
    const tool = createSetCultureTypeTool(runtime);
    const result = await tool.execute({ culture: 1, type: "Naval" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack missing/);
  });
});

describe("defaultCultureTypeRuntime (integration)", () => {
  const recalc = vi.fn();
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalRecalc = (globalThis as { recalculateCultures?: unknown })
    .recalculateCultures;

  beforeEach(() => {
    recalc.mockReset();
    (globalThis as { pack?: unknown }).pack = {
      cultures: [
        { i: 0, name: "Wildlands", removed: true, type: "Generic" },
        { i: 1, name: "Highlanders", type: "Generic" },
        { i: 2, name: "Coastalfolk", type: "Generic" },
      ] satisfies RawCulture[],
    };
    (globalThis as { recalculateCultures?: unknown }).recalculateCultures =
      recalc;
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { recalculateCultures?: unknown }).recalculateCultures =
      originalRecalc;
  });

  it("retypes a culture and recalculates", async () => {
    const result = await setCultureTypeTool.execute({
      culture: 2,
      type: "Naval",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { cultures: RawCulture[] } }).pack;
    expect(pack.cultures[2]?.type).toBe("Naval");
    expect(recalc).toHaveBeenCalledTimes(1);
  });

  it("succeeds when recalculateCultures is missing", async () => {
    (globalThis as { recalculateCultures?: unknown }).recalculateCultures =
      undefined;
    const result = await setCultureTypeTool.execute({
      culture: "highlanders",
      type: "Highland",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { cultures: RawCulture[] } }).pack;
    expect(pack.cultures[1]?.type).toBe("Highland");
  });
});
