import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawBurg, RawCoa, RawProvince, RawState } from "./_shared";
import {
  createRegenerateBurgCoaTool,
  type RegenerateBurgCoaRef,
  type RegenerateBurgCoaRuntime,
  regenerateBurgCoaTool,
} from "./regenerate-burg-coa";

function makeRuntime(
  find: (ref: number | string) => RegenerateBurgCoaRef | null,
  generated: RawCoa = { t1: "or", shield: "heater" },
): {
  runtime: RegenerateBurgCoaRuntime;
  generate: ReturnType<typeof vi.fn<RegenerateBurgCoaRuntime["generate"]>>;
  apply: ReturnType<typeof vi.fn<RegenerateBurgCoaRuntime["apply"]>>;
} {
  const generate = vi.fn<RegenerateBurgCoaRuntime["generate"]>(() => generated);
  const apply = vi.fn<RegenerateBurgCoaRuntime["apply"]>();
  return { runtime: { find, generate, apply }, generate, apply };
}

describe("regenerate_burg_coa tool", () => {
  it("regenerates by numeric id and returns previous + new coa", async () => {
    const previousCoa: RawCoa = { t1: "sable", shield: "swiss" };
    const newCoa: RawCoa = { t1: "or", shield: "heater" };
    const { runtime, generate, apply } = makeRuntime(
      () => ({ i: 5, name: "Rookhold", coa: previousCoa }),
      newCoa,
    );
    const tool = createRegenerateBurgCoaTool(runtime);
    const result = await tool.execute({ burg: 5 });
    expect(result.isError).toBeFalsy();
    expect(generate).toHaveBeenCalledWith(5, undefined);
    expect(apply).toHaveBeenCalledWith(5, newCoa);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 5,
      previousCoa,
      coa: newCoa,
    });
  });

  it("resolves by case-insensitive name", async () => {
    const find = vi.fn((_ref: number | string) => ({
      i: 3,
      name: "Ashholm",
      coa: undefined,
    }));
    const { runtime, generate } = makeRuntime(find);
    const tool = createRegenerateBurgCoaTool(runtime);
    await tool.execute({ burg: "ASHHOLM" });
    expect(find).toHaveBeenCalledWith("ASHHOLM");
    expect(generate).toHaveBeenCalledWith(3, undefined);
  });

  it("passes explicit shield override through to generate", async () => {
    const { runtime, generate } = makeRuntime(() => ({
      i: 5,
      name: "x",
      coa: undefined,
    }));
    const tool = createRegenerateBurgCoaTool(runtime);
    await tool.execute({ burg: 5, shield: "fantasy1" });
    expect(generate).toHaveBeenCalledWith(5, "fantasy1");
  });

  it("trims shield overrides", async () => {
    const { runtime, generate } = makeRuntime(() => ({
      i: 5,
      name: "x",
      coa: undefined,
    }));
    const tool = createRegenerateBurgCoaTool(runtime);
    await tool.execute({ burg: 5, shield: "  noldor  " });
    expect(generate).toHaveBeenCalledWith(5, "noldor");
  });

  it("returns null previousCoa when burg had no coa", async () => {
    const { runtime } = makeRuntime(() => ({
      i: 5,
      name: "x",
      coa: undefined,
    }));
    const tool = createRegenerateBurgCoaTool(runtime);
    const result = await tool.execute({ burg: 5 });
    expect(JSON.parse(result.content).previousCoa).toBeNull();
  });

  it("rejects unknown burg", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createRegenerateBurgCoaTool(runtime);
    const result = await tool.execute({ burg: 999 });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createRegenerateBurgCoaTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ burg: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects empty-string shield override", async () => {
    const { runtime, generate, apply } = makeRuntime(() => ({
      i: 5,
      name: "x",
      coa: undefined,
    }));
    const tool = createRegenerateBurgCoaTool(runtime);
    const a = await tool.execute({ burg: 5, shield: "" });
    const b = await tool.execute({ burg: 5, shield: "   " });
    expect(a.isError).toBe(true);
    expect(b.isError).toBe(true);
    expect(generate).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects non-string shield override", async () => {
    const { runtime, generate } = makeRuntime(() => ({
      i: 5,
      name: "x",
      coa: undefined,
    }));
    const tool = createRegenerateBurgCoaTool(runtime);
    const result = await tool.execute({ burg: 5, shield: 42 });
    expect(result.isError).toBe(true);
    expect(generate).not.toHaveBeenCalled();
  });

  it("surfaces generator errors", async () => {
    const runtime: RegenerateBurgCoaRuntime = {
      find: () => ({ i: 5, name: "x", coa: undefined }),
      generate: vi.fn(() => {
        throw new Error("COA.generate is not available");
      }),
      apply: vi.fn(),
    };
    const tool = createRegenerateBurgCoaTool(runtime);
    const result = await tool.execute({ burg: 5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/COA\.generate/);
  });

  it("surfaces apply errors", async () => {
    const runtime: RegenerateBurgCoaRuntime = {
      find: () => ({ i: 5, name: "x", coa: undefined }),
      generate: () => ({ t1: "or" }),
      apply: vi.fn(() => {
        throw new Error("write blocked");
      }),
    };
    const tool = createRegenerateBurgCoaTool(runtime);
    const result = await tool.execute({ burg: 5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/blocked/);
  });

  it("errors when generator returns non-object", async () => {
    const runtime: RegenerateBurgCoaRuntime = {
      find: () => ({ i: 5, name: "x", coa: undefined }),
      generate: () => null as unknown as RawCoa,
      apply: vi.fn(),
    };
    const tool = createRegenerateBurgCoaTool(runtime);
    const result = await tool.execute({ burg: 5 });
    expect(result.isError).toBe(true);
  });
});

describe("defaultRegenerateBurgCoaRuntime (integration)", () => {
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
    id === "burgCOA5" ? existingCoaEl : null,
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
      id === "burgCOA5" ? existingCoaEl : null,
    );

    const burgs: RawBurg[] = [];
    burgs[0] = { i: 0 };
    burgs[5] = {
      i: 5,
      name: "Rookhold",
      culture: 3,
      state: 2,
      cell: 42,
      coa: { t1: "sable", shield: "swiss" },
    };
    const states: RawState[] = [];
    states[0] = { i: 0, name: "Neutrals" };
    states[2] = {
      i: 2,
      name: "Altaria",
      culture: 3,
      coa: { t1: "gules", shield: "swiss" },
    };
    const provinces: RawProvince[] = [];
    provinces[0] = { i: 0 };
    provinces[7] = {
      i: 7,
      name: "North Mark",
      state: 2,
      coa: { t1: "azure", shield: "swiss" },
    };
    const cellProvince: number[] = [];
    cellProvince[42] = 7;

    (globalThis as { pack?: unknown }).pack = {
      burgs,
      states,
      provinces,
      cells: { province: cellProvince },
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

  it("regenerates with explicit shield, updates burg.coa and triggers renderer", async () => {
    generateCoa.mockImplementation(() => ({ t1: "or" }));
    const result = await regenerateBurgCoaTool.execute({
      burg: 5,
      shield: "noldor",
    });
    expect(result.isError).toBeFalsy();

    const pack = (globalThis as { pack: { burgs: RawBurg[] } }).pack;
    expect(pack.burgs[5]?.coa).toEqual({ t1: "or", shield: "noldor" });

    expect(generateCoa).toHaveBeenCalledTimes(1);
    // parent should be the province (id 7) since cells.province[42] = 7
    const parentArg = generateCoa.mock.calls[0]?.[0];
    expect(parentArg).toEqual({ t1: "azure", shield: "swiss" });
    // kinship / dominion
    expect(generateCoa.mock.calls[0]?.[1]).toBe(0.3);
    expect(generateCoa.mock.calls[0]?.[2]).toBe(0.1);

    expect(existingCoaEl.remove).toHaveBeenCalled();
    expect(trigger).toHaveBeenCalledWith("burgCOA5", {
      t1: "or",
      shield: "noldor",
    });
  });

  it("preserves existing burg.coa.shield when no override provided", async () => {
    generateCoa.mockImplementation(() => ({ t1: "or" }));
    await regenerateBurgCoaTool.execute({ burg: 5 });
    const pack = (globalThis as { pack: { burgs: RawBurg[] } }).pack;
    expect(pack.burgs[5]?.coa?.shield).toBe("swiss");
    expect(getShield).not.toHaveBeenCalled();
  });

  it("falls back to COA.getShield when no existing shield and no override", async () => {
    const pack = (globalThis as { pack: { burgs: RawBurg[] } }).pack;
    pack.burgs[5] = {
      ...pack.burgs[5]!,
      coa: { t1: "sable" }, // no shield
    };
    generateCoa.mockImplementation(() => ({ t1: "or" }));
    getShield.mockReturnValue("heater");
    await regenerateBurgCoaTool.execute({ burg: 5 });
    expect(getShield).toHaveBeenCalledWith(3, 2);
    expect(pack.burgs[5]?.coa?.shield).toBe("heater");
  });

  it("falls back to state parent when cell has no province", async () => {
    const pack = (
      globalThis as unknown as {
        pack: { burgs: RawBurg[]; cells: { province: number[] } };
      }
    ).pack;
    pack.cells.province[42] = 0;
    generateCoa.mockImplementation(() => ({ t1: "or" }));
    await regenerateBurgCoaTool.execute({ burg: 5 });
    const parentArg = generateCoa.mock.calls[0]?.[0];
    expect(parentArg).toEqual({ t1: "gules", shield: "swiss" });
  });

  it("errors when pack is missing", async () => {
    (globalThis as { pack?: unknown }).pack = undefined;
    const result = await regenerateBurgCoaTool.execute({ burg: 5 });
    expect(result.isError).toBe(true);
  });

  it("errors when COA is missing", async () => {
    (globalThis as { COA?: unknown }).COA = undefined;
    const result = await regenerateBurgCoaTool.execute({ burg: 5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/COA/);
  });

  it("errors when burg is unknown", async () => {
    const result = await regenerateBurgCoaTool.execute({ burg: 999 });
    expect(result.isError).toBe(true);
  });

  it("rejects locked burgs", async () => {
    const pack = (globalThis as { pack: { burgs: RawBurg[] } }).pack;
    pack.burgs[5] = { ...pack.burgs[5]!, lock: true };
    const result = await regenerateBurgCoaTool.execute({ burg: 5 });
    expect(result.isError).toBe(true);
    expect(generateCoa).not.toHaveBeenCalled();
  });

  it("rejects removed burgs", async () => {
    const pack = (globalThis as { pack: { burgs: RawBurg[] } }).pack;
    pack.burgs[5] = { ...pack.burgs[5]!, removed: true };
    const result = await regenerateBurgCoaTool.execute({ burg: 5 });
    expect(result.isError).toBe(true);
    expect(generateCoa).not.toHaveBeenCalled();
  });

  it("succeeds even when COArenderer is missing (best-effort DOM refresh)", async () => {
    (globalThis as { COArenderer?: unknown }).COArenderer = undefined;
    generateCoa.mockImplementation(() => ({ t1: "or" }));
    const result = await regenerateBurgCoaTool.execute({
      burg: 5,
      shield: "noldor",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { burgs: RawBurg[] } }).pack;
    expect(pack.burgs[5]?.coa).toEqual({ t1: "or", shield: "noldor" });
  });

  it("does not throw when #burgCOA{i} DOM node is missing", async () => {
    getElementById.mockReturnValue(null);
    generateCoa.mockImplementation(() => ({ t1: "or" }));
    const result = await regenerateBurgCoaTool.execute({
      burg: 5,
      shield: "noldor",
    });
    expect(result.isError).toBeFalsy();
    expect(trigger).toHaveBeenCalledWith("burgCOA5", {
      t1: "or",
      shield: "noldor",
    });
  });
});
