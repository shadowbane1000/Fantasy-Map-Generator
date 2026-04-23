import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawProvince } from "./_shared";
import {
  createSetProvinceCoaCustomTool,
  type SetProvinceCoaCustomRef,
  type SetProvinceCoaCustomRuntime,
  setProvinceCoaCustomTool,
} from "./set-province-coa-custom";

function makeRuntime(
  find: (ref: number | string) => SetProvinceCoaCustomRef | null,
): {
  runtime: SetProvinceCoaCustomRuntime;
  apply: ReturnType<typeof vi.fn<SetProvinceCoaCustomRuntime["apply"]>>;
} {
  const apply = vi.fn<SetProvinceCoaCustomRuntime["apply"]>();
  return { runtime: { find, apply }, apply };
}

describe("set_province_coa_custom tool", () => {
  it("sets custom: true when not previously set", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 5,
      name: "Rookwood",
      hasCoa: true,
      previousCustom: false,
    }));
    const tool = createSetProvinceCoaCustomTool(runtime);
    const result = await tool.execute({ province: 5, custom: true });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(5, true);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 5,
      name: "Rookwood",
      previousCustom: false,
      custom: true,
      noop: false,
    });
  });

  it("clears custom when previously true", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 5,
      name: "Rookwood",
      hasCoa: true,
      previousCustom: true,
    }));
    const tool = createSetProvinceCoaCustomTool(runtime);
    const result = await tool.execute({ province: 5, custom: false });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(5, false);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 5,
      name: "Rookwood",
      previousCustom: true,
      custom: false,
      noop: false,
    });
  });

  it("is a noop when custom: true is already set", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 5,
      name: "Rookwood",
      hasCoa: true,
      previousCustom: true,
    }));
    const tool = createSetProvinceCoaCustomTool(runtime);
    const result = await tool.execute({ province: 5, custom: true });
    expect(result.isError).toBeFalsy();
    expect(apply).not.toHaveBeenCalled();
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      i: 5,
      previousCustom: true,
      custom: true,
      noop: true,
    });
  });

  it("is a noop when custom: false is already the state", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 5,
      name: "Rookwood",
      hasCoa: true,
      previousCustom: false,
    }));
    const tool = createSetProvinceCoaCustomTool(runtime);
    const result = await tool.execute({ province: 5, custom: false });
    expect(result.isError).toBeFalsy();
    expect(apply).not.toHaveBeenCalled();
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      noop: true,
    });
  });

  it("resolves by numeric id", async () => {
    const find = vi.fn((_ref: number | string) => ({
      i: 3,
      name: "x",
      hasCoa: true,
      previousCustom: false,
    }));
    const { runtime } = makeRuntime(find);
    const tool = createSetProvinceCoaCustomTool(runtime);
    await tool.execute({ province: 3, custom: true });
    expect(find).toHaveBeenCalledWith(3);
  });

  it("resolves by case-insensitive name", async () => {
    const find = vi.fn((_ref: number | string) => ({
      i: 3,
      name: "Northmark",
      hasCoa: true,
      previousCustom: false,
    }));
    const { runtime } = makeRuntime(find);
    const tool = createSetProvinceCoaCustomTool(runtime);
    await tool.execute({ province: "NORTHMARK", custom: true });
    expect(find).toHaveBeenCalledWith("NORTHMARK");
  });

  it("rejects unknown province", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetProvinceCoaCustomTool(runtime);
    const result = await tool.execute({ province: 999, custom: true });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects province with no coa", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 5,
      name: "x",
      hasCoa: false,
      previousCustom: false,
    }));
    const tool = createSetProvinceCoaCustomTool(runtime);
    const result = await tool.execute({ province: 5, custom: true });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no coat of arms/i);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetProvinceCoaCustomTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ province: bad, custom: true });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects non-boolean custom", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 5,
      name: "x",
      hasCoa: true,
      previousCustom: false,
    }));
    const tool = createSetProvinceCoaCustomTool(runtime);
    for (const bad of ["true", 1, null, undefined]) {
      const r = await tool.execute({ province: 5, custom: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces apply errors", async () => {
    const runtime: SetProvinceCoaCustomRuntime = {
      find: () => ({ i: 5, name: "x", hasCoa: true, previousCustom: false }),
      apply: vi.fn(() => {
        throw new Error("write blocked");
      }),
    };
    const tool = createSetProvinceCoaCustomTool(runtime);
    const result = await tool.execute({ province: 5, custom: true });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/blocked/);
  });
});

describe("defaultSetProvinceCoaCustomRuntime (integration)", () => {
  const originalPack = (globalThis as unknown as { pack?: unknown }).pack;

  beforeEach(() => {
    const provinces: RawProvince[] = [];
    provinces[0] = { i: 0 };
    provinces[5] = {
      i: 5,
      name: "Rookwood",
      coa: { t1: "sable", shield: "swiss" },
    };
    provinces[6] = {
      i: 6,
      name: "Locked",
      lock: true,
      coa: { t1: "azure" },
    };
    provinces[7] = {
      i: 7,
      name: "Gone",
      removed: true,
      coa: { t1: "or" },
    };
    provinces[8] = {
      i: 8,
      name: "NoEmblem",
    };
    provinces[9] = {
      i: 9,
      name: "AlreadyCustom",
      coa: { custom: true, size: 2 },
    };
    (globalThis as unknown as { pack?: unknown }).pack = { provinces };
  });

  afterEach(() => {
    (globalThis as unknown as { pack?: unknown }).pack = originalPack;
  });

  it("sets province.coa.custom = true when the province has a coa", async () => {
    const result = await setProvinceCoaCustomTool.execute({
      province: 5,
      custom: true,
    });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as unknown as { pack: { provinces: RawProvince[] } }
    ).pack;
    expect(pack.provinces[5]?.coa?.custom).toBe(true);
    // Other fields preserved.
    expect(pack.provinces[5]?.coa?.t1).toBe("sable");
    expect(pack.provinces[5]?.coa?.shield).toBe("swiss");
  });

  it("deletes the custom key when called with false", async () => {
    const result = await setProvinceCoaCustomTool.execute({
      province: 9,
      custom: false,
    });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as unknown as { pack: { provinces: RawProvince[] } }
    ).pack;
    expect(pack.provinces[9]?.coa).toBeDefined();
    expect("custom" in (pack.provinces[9]!.coa as object)).toBe(false);
    // Other fields preserved.
    expect(pack.provinces[9]?.coa?.size).toBe(2);
  });

  it("returns noop when already custom", async () => {
    const result = await setProvinceCoaCustomTool.execute({
      province: 9,
      custom: true,
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      i: 9,
      previousCustom: true,
      custom: true,
      noop: true,
    });
  });

  it("rejects province 0", async () => {
    const result = await setProvinceCoaCustomTool.execute({
      province: 0,
      custom: true,
    });
    expect(result.isError).toBe(true);
  });

  it("rejects locked provinces", async () => {
    const result = await setProvinceCoaCustomTool.execute({
      province: 6,
      custom: true,
    });
    expect(result.isError).toBe(true);
    const pack = (
      globalThis as unknown as { pack: { provinces: RawProvince[] } }
    ).pack;
    // Unchanged.
    expect(pack.provinces[6]?.coa?.custom).toBeUndefined();
  });

  it("rejects removed provinces", async () => {
    const result = await setProvinceCoaCustomTool.execute({
      province: 7,
      custom: true,
    });
    expect(result.isError).toBe(true);
  });

  it("rejects provinces without a coa", async () => {
    const result = await setProvinceCoaCustomTool.execute({
      province: 8,
      custom: true,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no coat of arms/i);
  });

  it("rejects when pack is missing", async () => {
    (globalThis as unknown as { pack?: unknown }).pack = undefined;
    const result = await setProvinceCoaCustomTool.execute({
      province: 5,
      custom: true,
    });
    expect(result.isError).toBe(true);
  });
});
