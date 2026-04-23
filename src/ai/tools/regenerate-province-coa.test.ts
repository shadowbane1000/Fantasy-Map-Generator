import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawCoa, RawProvince, RawState } from "./_shared";
import {
  createRegenerateProvinceCoaTool,
  type RegenerateProvinceCoaRef,
  type RegenerateProvinceCoaRuntime,
  regenerateProvinceCoaTool,
} from "./regenerate-province-coa";

function makeRuntime(
  find: (ref: number | string) => RegenerateProvinceCoaRef | null,
  generated: RawCoa = { t1: "or", shield: "heater" },
): {
  runtime: RegenerateProvinceCoaRuntime;
  generate: ReturnType<typeof vi.fn<RegenerateProvinceCoaRuntime["generate"]>>;
  apply: ReturnType<typeof vi.fn<RegenerateProvinceCoaRuntime["apply"]>>;
} {
  const generate = vi.fn<RegenerateProvinceCoaRuntime["generate"]>(
    () => generated,
  );
  const apply = vi.fn<RegenerateProvinceCoaRuntime["apply"]>();
  return { runtime: { find, generate, apply }, generate, apply };
}

describe("regenerate_province_coa tool", () => {
  it("regenerates by numeric id and returns previous + new coa", async () => {
    const previousCoa: RawCoa = { t1: "sable", shield: "swiss" };
    const newCoa: RawCoa = { t1: "or", shield: "heater" };
    const { runtime, generate, apply } = makeRuntime(
      () => ({ i: 7, name: "North Mark", coa: previousCoa }),
      newCoa,
    );
    const tool = createRegenerateProvinceCoaTool(runtime);
    const result = await tool.execute({ province: 7 });
    expect(result.isError).toBeFalsy();
    expect(generate).toHaveBeenCalledWith(7, undefined);
    expect(apply).toHaveBeenCalledWith(7, newCoa);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 7,
      previousCoa,
      coa: newCoa,
    });
  });

  it("resolves by case-insensitive name", async () => {
    const find = vi.fn((_ref: number | string) => ({
      i: 3,
      name: "North Mark",
      coa: undefined,
    }));
    const { runtime, generate } = makeRuntime(find);
    const tool = createRegenerateProvinceCoaTool(runtime);
    await tool.execute({ province: "NORTH MARK" });
    expect(find).toHaveBeenCalledWith("NORTH MARK");
    expect(generate).toHaveBeenCalledWith(3, undefined);
  });

  it("passes explicit shield override through to generate", async () => {
    const { runtime, generate } = makeRuntime(() => ({
      i: 2,
      name: "x",
      coa: undefined,
    }));
    const tool = createRegenerateProvinceCoaTool(runtime);
    await tool.execute({ province: 2, shield: "fantasy1" });
    expect(generate).toHaveBeenCalledWith(2, "fantasy1");
  });

  it("trims shield overrides", async () => {
    const { runtime, generate } = makeRuntime(() => ({
      i: 2,
      name: "x",
      coa: undefined,
    }));
    const tool = createRegenerateProvinceCoaTool(runtime);
    await tool.execute({ province: 2, shield: "  noldor  " });
    expect(generate).toHaveBeenCalledWith(2, "noldor");
  });

  it("returns null previousCoa when province had no coa", async () => {
    const { runtime } = makeRuntime(() => ({
      i: 2,
      name: "x",
      coa: undefined,
    }));
    const tool = createRegenerateProvinceCoaTool(runtime);
    const result = await tool.execute({ province: 2 });
    expect(JSON.parse(result.content).previousCoa).toBeNull();
  });

  it("rejects unknown province", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createRegenerateProvinceCoaTool(runtime);
    const result = await tool.execute({ province: 999 });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createRegenerateProvinceCoaTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ province: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects empty-string shield override", async () => {
    const { runtime, generate, apply } = makeRuntime(() => ({
      i: 2,
      name: "x",
      coa: undefined,
    }));
    const tool = createRegenerateProvinceCoaTool(runtime);
    const a = await tool.execute({ province: 2, shield: "" });
    const b = await tool.execute({ province: 2, shield: "   " });
    expect(a.isError).toBe(true);
    expect(b.isError).toBe(true);
    expect(generate).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects non-string shield override", async () => {
    const { runtime, generate } = makeRuntime(() => ({
      i: 2,
      name: "x",
      coa: undefined,
    }));
    const tool = createRegenerateProvinceCoaTool(runtime);
    const result = await tool.execute({ province: 2, shield: 42 });
    expect(result.isError).toBe(true);
    expect(generate).not.toHaveBeenCalled();
  });

  it("surfaces generator errors", async () => {
    const runtime: RegenerateProvinceCoaRuntime = {
      find: () => ({ i: 2, name: "x", coa: undefined }),
      generate: vi.fn(() => {
        throw new Error("COA.generate is not available");
      }),
      apply: vi.fn(),
    };
    const tool = createRegenerateProvinceCoaTool(runtime);
    const result = await tool.execute({ province: 2 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/COA\.generate/);
  });

  it("surfaces apply errors", async () => {
    const runtime: RegenerateProvinceCoaRuntime = {
      find: () => ({ i: 2, name: "x", coa: undefined }),
      generate: () => ({ t1: "or" }),
      apply: vi.fn(() => {
        throw new Error("write blocked");
      }),
    };
    const tool = createRegenerateProvinceCoaTool(runtime);
    const result = await tool.execute({ province: 2 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/blocked/);
  });

  it("errors when generator returns non-object", async () => {
    const runtime: RegenerateProvinceCoaRuntime = {
      find: () => ({ i: 2, name: "x", coa: undefined }),
      generate: () => null as unknown as RawCoa,
      apply: vi.fn(),
    };
    const tool = createRegenerateProvinceCoaTool(runtime);
    const result = await tool.execute({ province: 2 });
    expect(result.isError).toBe(true);
  });
});

describe("defaultRegenerateProvinceCoaRuntime (integration)", () => {
  const generateCoa =
    vi.fn<
      (
        parent: RawCoa | null,
        kinship: number | null,
        dominion: number | null,
        type?: string | null,
      ) => RawCoa
    >();
  const getShield = vi.fn((_culture: number, _state?: number) => "heater");
  const trigger = vi.fn();
  const existingCoaEl = { remove: vi.fn() };
  const getElementById = vi.fn((id: string) =>
    id === "provinceCOA7" ? existingCoaEl : null,
  );

  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalCoa = (globalThis as { COA?: unknown }).COA;
  const originalRenderer = (globalThis as { COArenderer?: unknown })
    .COArenderer;
  const originalDoc = (globalThis as { document?: unknown }).document;

  beforeEach(() => {
    generateCoa.mockReset();
    generateCoa.mockImplementation(() => ({ t1: "or" }));
    getShield.mockReset();
    getShield.mockReturnValue("heater");
    trigger.mockReset();
    existingCoaEl.remove.mockReset();
    getElementById.mockReset();
    getElementById.mockImplementation((id: string) =>
      id === "provinceCOA7" ? existingCoaEl : null,
    );

    const provinces: RawProvince[] = [];
    provinces[0] = { i: 0 };
    provinces[7] = {
      i: 7,
      name: "North Mark",
      state: 2,
      coa: { t1: "azure", shield: "swiss" },
    };
    const states: RawState[] = [];
    states[0] = { i: 0, name: "Neutrals" };
    states[2] = {
      i: 2,
      name: "Altaria",
      culture: 3,
      coa: { t1: "gules", shield: "swiss" },
    };

    (globalThis as unknown as { pack?: unknown }).pack = {
      provinces,
      states,
    };
    (globalThis as { COA?: unknown }).COA = {
      generate: generateCoa,
      getShield,
    };
    (globalThis as { COArenderer?: unknown }).COArenderer = { trigger };
    (globalThis as { document?: unknown }).document = { getElementById };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { COA?: unknown }).COA = originalCoa;
    (globalThis as { COArenderer?: unknown }).COArenderer = originalRenderer;
    (globalThis as { document?: unknown }).document = originalDoc;
  });

  it("regenerates with explicit shield, updates province.coa and triggers renderer", async () => {
    generateCoa.mockImplementation(() => ({ t1: "or" }));
    const result = await regenerateProvinceCoaTool.execute({
      province: 7,
      shield: "noldor",
    });
    expect(result.isError).toBeFalsy();

    const pack = (
      globalThis as unknown as { pack: { provinces: RawProvince[] } }
    ).pack;
    expect(pack.provinces[7]?.coa).toEqual({ t1: "or", shield: "noldor" });

    expect(generateCoa).toHaveBeenCalledTimes(1);
    // parent coa = owning state's coa
    expect(generateCoa.mock.calls[0]?.[0]).toEqual({
      t1: "gules",
      shield: "swiss",
    });
    expect(generateCoa.mock.calls[0]?.[1]).toBe(0.3);
    expect(generateCoa.mock.calls[0]?.[2]).toBe(0.1);
    expect(generateCoa.mock.calls[0]?.[3]).toBeNull();

    expect(existingCoaEl.remove).toHaveBeenCalled();
    expect(trigger).toHaveBeenCalledWith("provinceCOA7", {
      t1: "or",
      shield: "noldor",
    });
  });

  it("preserves existing province.coa.shield when no override provided", async () => {
    generateCoa.mockImplementation(() => ({ t1: "or" }));
    await regenerateProvinceCoaTool.execute({ province: 7 });
    const pack = (
      globalThis as unknown as { pack: { provinces: RawProvince[] } }
    ).pack;
    expect(pack.provinces[7]?.coa?.shield).toBe("swiss");
    expect(getShield).not.toHaveBeenCalled();
  });

  it("falls back to COA.getShield when no existing shield and no override", async () => {
    const pack = (
      globalThis as unknown as { pack: { provinces: RawProvince[] } }
    ).pack;
    pack.provinces[7] = {
      ...pack.provinces[7]!,
      coa: { t1: "sable" }, // no shield
    };
    generateCoa.mockImplementation(() => ({ t1: "or" }));
    getShield.mockReturnValue("heater");
    await regenerateProvinceCoaTool.execute({ province: 7 });
    // culture comes from parent state (culture 3), state = 2
    expect(getShield).toHaveBeenCalledWith(3, 2);
    expect(pack.provinces[7]?.coa?.shield).toBe("heater");
  });

  it("passes null parent when state has no coa", async () => {
    const pack = (
      globalThis as unknown as {
        pack: { provinces: RawProvince[]; states: RawState[] };
      }
    ).pack;
    pack.states[2] = { ...pack.states[2]!, coa: undefined };
    generateCoa.mockImplementation(() => ({ t1: "or" }));
    await regenerateProvinceCoaTool.execute({
      province: 7,
      shield: "noldor",
    });
    expect(generateCoa.mock.calls[0]?.[0]).toBeNull();
  });

  it("passes null parent when state coa is custom", async () => {
    const pack = (
      globalThis as unknown as {
        pack: { provinces: RawProvince[]; states: RawState[] };
      }
    ).pack;
    pack.states[2] = { ...pack.states[2]!, coa: { custom: true } };
    generateCoa.mockImplementation(() => ({ t1: "or" }));
    await regenerateProvinceCoaTool.execute({
      province: 7,
      shield: "noldor",
    });
    expect(generateCoa.mock.calls[0]?.[0]).toBeNull();
  });

  it("errors when pack is missing", async () => {
    (globalThis as { pack?: unknown }).pack = undefined;
    const result = await regenerateProvinceCoaTool.execute({ province: 7 });
    expect(result.isError).toBe(true);
  });

  it("errors when COA is missing", async () => {
    (globalThis as { COA?: unknown }).COA = undefined;
    const result = await regenerateProvinceCoaTool.execute({ province: 7 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/COA/);
  });

  it("errors when province is unknown", async () => {
    const result = await regenerateProvinceCoaTool.execute({ province: 999 });
    expect(result.isError).toBe(true);
  });

  it("rejects locked provinces", async () => {
    const pack = (
      globalThis as unknown as { pack: { provinces: RawProvince[] } }
    ).pack;
    pack.provinces[7] = { ...pack.provinces[7]!, lock: true };
    const result = await regenerateProvinceCoaTool.execute({ province: 7 });
    expect(result.isError).toBe(true);
    expect(generateCoa).not.toHaveBeenCalled();
  });

  it("rejects removed provinces", async () => {
    const pack = (
      globalThis as unknown as { pack: { provinces: RawProvince[] } }
    ).pack;
    pack.provinces[7] = { ...pack.provinces[7]!, removed: true };
    const result = await regenerateProvinceCoaTool.execute({ province: 7 });
    expect(result.isError).toBe(true);
    expect(generateCoa).not.toHaveBeenCalled();
  });

  it("rejects province 0 (placeholder)", async () => {
    const result = await regenerateProvinceCoaTool.execute({ province: 0 });
    expect(result.isError).toBe(true);
    expect(generateCoa).not.toHaveBeenCalled();
  });

  it("succeeds even when COArenderer is missing (best-effort DOM refresh)", async () => {
    (globalThis as { COArenderer?: unknown }).COArenderer = undefined;
    generateCoa.mockImplementation(() => ({ t1: "or" }));
    const result = await regenerateProvinceCoaTool.execute({
      province: 7,
      shield: "noldor",
    });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as unknown as { pack: { provinces: RawProvince[] } }
    ).pack;
    expect(pack.provinces[7]?.coa).toEqual({ t1: "or", shield: "noldor" });
  });

  it("does not throw when #provinceCOA{i} DOM node is missing", async () => {
    getElementById.mockReturnValue(null);
    generateCoa.mockImplementation(() => ({ t1: "or" }));
    const result = await regenerateProvinceCoaTool.execute({
      province: 7,
      shield: "noldor",
    });
    expect(result.isError).toBeFalsy();
    expect(trigger).toHaveBeenCalledWith("provinceCOA7", {
      t1: "or",
      shield: "noldor",
    });
  });
});
