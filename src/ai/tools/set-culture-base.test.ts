import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawCulture } from "./_shared";
import {
  type CultureBaseRef,
  type CultureBaseRuntime,
  createSetCultureBaseTool,
  type NameBase,
  resolveNameBase,
  setCultureBaseTool,
} from "./set-culture-base";

function makeRuntime(
  find: (ref: number | string) => CultureBaseRef | null,
  nameBases: NameBase[] | undefined = [
    { name: "German" },
    { name: "Norse" },
    { name: "Elven" },
  ],
): {
  runtime: CultureBaseRuntime;
  apply: ReturnType<typeof vi.fn<CultureBaseRuntime["apply"]>>;
} {
  const apply = vi.fn<CultureBaseRuntime["apply"]>();
  return {
    runtime: { find, apply, getNameBases: () => nameBases },
    apply,
  };
}

describe("resolveNameBase", () => {
  const nameBases: NameBase[] = [
    { name: "German" },
    { name: "Norse" },
    { name: "Elven" },
  ];

  it("returns null when nameBases is missing", () => {
    expect(resolveNameBase(0, undefined)).toBeNull();
  });

  it("accepts in-range integers", () => {
    expect(resolveNameBase(0, nameBases)).toBe(0);
    expect(resolveNameBase(2, nameBases)).toBe(2);
  });

  it("rejects out-of-range, negative, non-integer", () => {
    expect(resolveNameBase(-1, nameBases)).toBeNull();
    expect(resolveNameBase(3, nameBases)).toBeNull();
    expect(resolveNameBase(1.5, nameBases)).toBeNull();
  });

  it("matches by case-insensitive name", () => {
    expect(resolveNameBase("norse", nameBases)).toBe(1);
    expect(resolveNameBase("  ELVEN  ", nameBases)).toBe(2);
  });

  it("returns null for unknown name or invalid input", () => {
    expect(resolveNameBase("Dwarven", nameBases)).toBeNull();
    expect(resolveNameBase("", nameBases)).toBeNull();
    expect(resolveNameBase(null, nameBases)).toBeNull();
    expect(resolveNameBase({}, nameBases)).toBeNull();
  });
});

describe("set_culture_base tool", () => {
  it("sets by culture id + numeric base", async () => {
    const { runtime, apply } = makeRuntime((ref) =>
      ref === 2
        ? {
            i: 2,
            name: "Highlanders",
            previousBase: 0,
            previousBaseName: "German",
          }
        : null,
    );
    const tool = createSetCultureBaseTool(runtime);
    const result = await tool.execute({ culture: 2, base: 1 });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(2, 1);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 2,
      name: "Highlanders",
      previousBase: 0,
      previousBaseName: "German",
      base: 1,
      baseName: "Norse",
    });
  });

  it("sets by culture name + base name", async () => {
    const find = vi.fn<CultureBaseRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "highlanders"
        ? {
            i: 2,
            name: "Highlanders",
            previousBase: 0,
            previousBaseName: "German",
          }
        : null,
    );
    const { runtime, apply } = makeRuntime(find);
    const tool = createSetCultureBaseTool(runtime);
    await tool.execute({ culture: "HIGHLANDERS", base: "norse" });
    expect(find).toHaveBeenCalledWith("HIGHLANDERS");
    expect(apply).toHaveBeenCalledWith(2, 1);
  });

  it("rejects invalid culture refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetCultureBaseTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ culture: bad, base: 0 });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid base values", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousBase: null,
      previousBaseName: null,
    }));
    const tool = createSetCultureBaseTool(runtime);
    for (const bad of [-1, 99, 1.5, "Dwarven", "", null, undefined, {}]) {
      const r = await tool.execute({ culture: 1, base: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("refuses to set base on Wildlands (culture 0)", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 0,
      name: "Wildlands",
      previousBase: null,
      previousBaseName: null,
    }));
    const tool = createSetCultureBaseTool(runtime);
    const result = await tool.execute({ culture: 0, base: 0 });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("errors when nameBases is missing", async () => {
    const apply = vi.fn<CultureBaseRuntime["apply"]>();
    const runtime: CultureBaseRuntime = {
      find: () => null,
      apply,
      getNameBases: () => undefined,
    };
    const tool = createSetCultureBaseTool(runtime);
    const result = await tool.execute({ culture: 1, base: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/nameBases/);
    expect(apply).not.toHaveBeenCalled();
  });

  it("errors when culture is unknown", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetCultureBaseTool(runtime);
    const result = await tool.execute({ culture: 999, base: 0 });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const runtime: CultureBaseRuntime = {
      find: () => ({
        i: 1,
        name: "x",
        previousBase: null,
        previousBaseName: null,
      }),
      apply: vi.fn(() => {
        throw new Error("pack missing");
      }),
      getNameBases: () => [{ name: "German" }],
    };
    const tool = createSetCultureBaseTool(runtime);
    const result = await tool.execute({ culture: 1, base: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack missing/);
  });
});

describe("defaultCultureBaseRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalBases = (globalThis as { nameBases?: unknown }).nameBases;

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = {
      cultures: [
        { i: 0, name: "Wildlands", removed: true, base: 0 },
        { i: 1, name: "Highlanders", base: 0 },
        { i: 2, name: "Coastalfolk", base: 1 },
      ] satisfies RawCulture[],
    };
    (globalThis as { nameBases?: unknown }).nameBases = [
      { name: "German" },
      { name: "Norse" },
      { name: "Elven" },
    ];
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { nameBases?: unknown }).nameBases = originalBases;
  });

  it("sets base by numeric index in live pack", async () => {
    const result = await setCultureBaseTool.execute({
      culture: 1,
      base: 2,
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { cultures: RawCulture[] } }).pack;
    expect(pack.cultures[1]?.base).toBe(2);
  });

  it("resolves base by name in live pack", async () => {
    await setCultureBaseTool.execute({
      culture: "coastalfolk",
      base: "norse",
    });
    const pack = (globalThis as { pack: { cultures: RawCulture[] } }).pack;
    expect(pack.cultures[2]?.base).toBe(1);
  });

  it("refuses when culture is removed", async () => {
    const pack = (globalThis as { pack: { cultures: RawCulture[] } }).pack;
    if (pack.cultures[1]) pack.cultures[1].removed = true;
    const result = await setCultureBaseTool.execute({
      culture: 1,
      base: 1,
    });
    expect(result.isError).toBe(true);
  });
});
