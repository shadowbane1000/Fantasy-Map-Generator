import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawProvince } from "./_shared";
import {
  composeProvinceFullName,
  createRegenerateProvinceNameTool,
  PROVINCE_NAME_MODES,
  type RegenerateProvinceNameRef,
  type RegenerateProvinceNameRuntime,
  regenerateProvinceNameTool,
  resolveProvinceNameMode,
} from "./regenerate-province-name";

describe("resolveProvinceNameMode", () => {
  it("canonicalizes case-insensitively", () => {
    expect(resolveProvinceNameMode("Culture")).toBe("culture");
    expect(resolveProvinceNameMode("RANDOM")).toBe("random");
  });

  it("returns null for unknown / non-string", () => {
    expect(resolveProvinceNameMode("other")).toBeNull();
    expect(resolveProvinceNameMode("")).toBeNull();
    expect(resolveProvinceNameMode(null)).toBeNull();
  });
});

describe("PROVINCE_NAME_MODES", () => {
  it("has 2 modes", () => {
    expect(PROVINCE_NAME_MODES).toEqual(["culture", "random"]);
  });
});

describe("composeProvinceFullName", () => {
  it("returns short + ' ' + form when both are present", () => {
    expect(composeProvinceFullName("North", "Province")).toBe("North Province");
  });

  it("returns 'The {form}' when short is empty", () => {
    expect(composeProvinceFullName("", "Territory")).toBe("The Territory");
  });

  it("returns just short when form is empty", () => {
    expect(composeProvinceFullName("North", "")).toBe("North");
  });

  it("returns empty string when both are empty", () => {
    expect(composeProvinceFullName("", "")).toBe("");
  });
});

function makeRuntime(
  find: (ref: number | string) => RegenerateProvinceNameRef | null,
  generated = "New Short",
): {
  runtime: RegenerateProvinceNameRuntime;
  generate: ReturnType<typeof vi.fn<RegenerateProvinceNameRuntime["generate"]>>;
  apply: ReturnType<typeof vi.fn<RegenerateProvinceNameRuntime["apply"]>>;
} {
  const generate = vi.fn<RegenerateProvinceNameRuntime["generate"]>(
    () => generated,
  );
  const apply = vi.fn<RegenerateProvinceNameRuntime["apply"]>();
  return { runtime: { find, generate, apply }, generate, apply };
}

describe("regenerate_province_name tool", () => {
  it("default mode is culture and composes fullName", async () => {
    const { runtime, generate, apply } = makeRuntime(() => ({
      i: 3,
      name: "Old",
      fullName: "Old Province",
      center: 42,
      formName: "Province",
    }));
    const tool = createRegenerateProvinceNameTool(runtime);
    const result = await tool.execute({ province: 3 });
    expect(result.isError).toBeFalsy();
    expect(generate).toHaveBeenCalledWith("culture", 42);
    expect(apply).toHaveBeenCalledWith(3, "New Short", "New Short Province");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 3,
      previousName: "Old",
      previousFullName: "Old Province",
      name: "New Short",
      fullName: "New Short Province",
      mode: "culture",
    });
  });

  it("explicit random mode", async () => {
    const { runtime, generate } = makeRuntime(() => ({
      i: 3,
      name: "x",
      fullName: "x Province",
      center: 42,
      formName: "Province",
    }));
    const tool = createRegenerateProvinceNameTool(runtime);
    await tool.execute({ province: 3, mode: "RANDOM" });
    expect(generate).toHaveBeenCalledWith("random", 42);
  });

  it("rejects unknown mode", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 3,
      name: "x",
      fullName: "x",
      center: 42,
      formName: "",
    }));
    const tool = createRegenerateProvinceNameTool(runtime);
    const result = await tool.execute({ province: 3, mode: "other" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid province refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createRegenerateProvinceNameTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ province: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects unknown province", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createRegenerateProvinceNameTool(runtime);
    const result = await tool.execute({ province: 999 });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces generator errors", async () => {
    const runtime: RegenerateProvinceNameRuntime = {
      find: () => ({
        i: 3,
        name: "x",
        fullName: "x",
        center: 42,
        formName: "",
      }),
      generate: vi.fn(() => {
        throw new Error("Names.getState is not available");
      }),
      apply: vi.fn(),
    };
    const tool = createRegenerateProvinceNameTool(runtime);
    const result = await tool.execute({ province: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Names/);
  });

  it("rejects empty generator output", async () => {
    const runtime: RegenerateProvinceNameRuntime = {
      find: () => ({
        i: 3,
        name: "x",
        fullName: "x",
        center: 42,
        formName: "",
      }),
      generate: () => "   ",
      apply: vi.fn(),
    };
    const tool = createRegenerateProvinceNameTool(runtime);
    const result = await tool.execute({ province: 3 });
    expect(result.isError).toBe(true);
  });

  it("fullName reflects empty formName as just the short", async () => {
    const { runtime, apply } = makeRuntime(
      () => ({
        i: 3,
        name: "Old",
        fullName: "Old",
        center: 42,
        formName: "",
      }),
      "Fresh",
    );
    const tool = createRegenerateProvinceNameTool(runtime);
    await tool.execute({ province: 3 });
    expect(apply).toHaveBeenCalledWith(3, "Fresh", "Fresh");
  });
});

describe("defaultRegenerateProvinceNameRuntime (integration)", () => {
  const getState = vi.fn(
    (_base: string, _c?: number, _bi?: number) => "Generated",
  );
  const getCultureShort = vi.fn((_c: number) => "Short");
  const getBase = vi.fn((_b: number) => "BaseName");
  const labelEl = { textContent: "Old" };
  const getElementById = vi.fn((id: string) =>
    id === "provinceLabel3" ? labelEl : null,
  );

  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalNames = (globalThis as { Names?: unknown }).Names;
  const originalNameBases = (globalThis as { nameBases?: unknown }).nameBases;
  const originalDoc = (globalThis as { document?: unknown }).document;

  beforeEach(() => {
    getState.mockReset();
    getState.mockReturnValue("Generated");
    getCultureShort.mockReset();
    getCultureShort.mockReturnValue("Short");
    getBase.mockReset();
    getBase.mockReturnValue("BaseName");
    labelEl.textContent = "Old";
    getElementById.mockClear();

    const cultureArr = new Array(100).fill(0);
    cultureArr[42] = 7;
    const provinces: RawProvince[] = [];
    provinces[0] = { i: 0 };
    provinces[3] = {
      i: 3,
      name: "OldName",
      fullName: "OldName Province",
      center: 42,
      formName: "Province",
    };
    (globalThis as { pack?: unknown }).pack = {
      cells: { culture: cultureArr },
      provinces,
    };
    (globalThis as { Names?: unknown }).Names = {
      getState,
      getCultureShort,
      getBase,
    };
    (globalThis as { nameBases?: unknown }).nameBases = [
      { name: "A" },
      { name: "B" },
    ];
    (globalThis as { document?: unknown }).document = { getElementById };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { Names?: unknown }).Names = originalNames;
    (globalThis as { nameBases?: unknown }).nameBases = originalNameBases;
    (globalThis as { document?: unknown }).document = originalDoc;
  });

  it("culture mode: generates via getCultureShort + getState; writes name + fullName", async () => {
    const result = await regenerateProvinceNameTool.execute({ province: 3 });
    expect(result.isError).toBeFalsy();
    expect(getCultureShort).toHaveBeenCalledWith(7);
    expect(getState).toHaveBeenCalledWith("Short", 7);
    const pack = (globalThis as { pack: { provinces: RawProvince[] } }).pack;
    expect(pack.provinces[3]?.name).toBe("Generated");
    expect(pack.provinces[3]?.fullName).toBe("Generated Province");
    expect(labelEl.textContent).toBe("Generated");
  });

  it("random mode: calls getBase + getState", async () => {
    const result = await regenerateProvinceNameTool.execute({
      province: 3,
      mode: "random",
    });
    expect(result.isError).toBeFalsy();
    expect(getBase).toHaveBeenCalled();
    const call = getState.mock.calls[0];
    expect(call?.[1]).toBeUndefined();
    expect(typeof call?.[2]).toBe("number");
  });

  it("errors when Names is missing", async () => {
    (globalThis as { Names?: unknown }).Names = undefined;
    const result = await regenerateProvinceNameTool.execute({ province: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Names/);
  });

  it("errors when nameBases missing (random mode)", async () => {
    (globalThis as { nameBases?: unknown }).nameBases = undefined;
    const result = await regenerateProvinceNameTool.execute({
      province: 3,
      mode: "random",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/nameBases/);
  });
});
