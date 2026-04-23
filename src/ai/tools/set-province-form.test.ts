import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawProvince } from "./_shared";
import {
  createSetProvinceFormTool,
  type SetProvinceFormRef,
  type SetProvinceFormRuntime,
  setProvinceFormTool,
} from "./set-province-form";

function makeRuntime(
  resolver: (ref: number | string) => SetProvinceFormRef | null,
) {
  const find = vi.fn(resolver);
  const apply = vi.fn<SetProvinceFormRuntime["apply"]>();
  const runtime: SetProvinceFormRuntime = { find, apply };
  return { runtime, find, apply };
}

describe("set_province_form tool", () => {
  it("sets formName by numeric id and recomposes fullName", async () => {
    const { runtime, apply } = makeRuntime((ref) =>
      ref === 1
        ? {
            i: 1,
            name: "Rookwood",
            previousForm: "County",
            previousFullName: "County of Rookwood",
          }
        : null,
    );
    const tool = createSetProvinceFormTool(runtime);
    const result = await tool.execute({ province: 1, form: "Duchy" });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(1, "Duchy", "Rookwood Duchy");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 1,
      previousForm: "County",
      form: "Duchy",
      previousFullName: "County of Rookwood",
      fullName: "Rookwood Duchy",
    });
  });

  it("uses 'The {form}' when short name is empty", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "",
      previousForm: null,
      previousFullName: null,
    }));
    const tool = createSetProvinceFormTool(runtime);
    const result = await tool.execute({ province: 1, form: "Territory" });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(1, "Territory", "The Territory");
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      i: 1,
      form: "Territory",
      fullName: "The Territory",
    });
  });

  it("resolves province by case-insensitive name", async () => {
    const { runtime, apply } = makeRuntime((ref) =>
      ref === "rookwood"
        ? {
            i: 1,
            name: "Rookwood",
            previousForm: null,
            previousFullName: null,
          }
        : null,
    );
    const tool = createSetProvinceFormTool(runtime);
    const result = await tool.execute({ province: "rookwood", form: "Barony" });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(1, "Barony", "Rookwood Barony");
  });

  it("resolves province by case-insensitive fullName", async () => {
    const { runtime, apply } = makeRuntime((ref) =>
      ref === "county of rookwood"
        ? {
            i: 1,
            name: "Rookwood",
            previousForm: "County",
            previousFullName: "County of Rookwood",
          }
        : null,
    );
    const tool = createSetProvinceFormTool(runtime);
    const result = await tool.execute({
      province: "county of rookwood",
      form: "Duchy",
    });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(1, "Duchy", "Rookwood Duchy");
  });

  it("trims whitespace from form", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "Rookwood",
      previousForm: null,
      previousFullName: null,
    }));
    const tool = createSetProvinceFormTool(runtime);
    const result = await tool.execute({
      province: 1,
      form: "  Principality  ",
    });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(
      1,
      "Principality",
      "Rookwood Principality",
    );
  });

  it("rejects unknown province ref", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetProvinceFormTool(runtime);
    const r = await tool.execute({ province: 999, form: "Duchy" });
    expect(r.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid province refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetProvinceFormTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ province: bad, form: "Duchy" });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects non-string / empty / whitespace form", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "Rookwood",
      previousForm: null,
      previousFullName: null,
    }));
    const tool = createSetProvinceFormTool(runtime);
    for (const bad of [42, null, undefined, "", "   "]) {
      const r = await tool.execute({ province: 1, form: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces runtime apply errors", async () => {
    const { runtime } = makeRuntime(() => ({
      i: 1,
      name: "Rookwood",
      previousForm: null,
      previousFullName: null,
    }));
    runtime.apply = vi.fn(() => {
      throw new Error("customization active");
    });
    const tool = createSetProvinceFormTool(runtime);
    const result = await tool.execute({ province: 1, form: "Duchy" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/customization/);
  });

  it("result includes all previous + new fields", async () => {
    const { runtime } = makeRuntime(() => ({
      i: 1,
      name: "Rookwood",
      previousForm: "County",
      previousFullName: "County of Rookwood",
    }));
    const tool = createSetProvinceFormTool(runtime);
    const result = await tool.execute({ province: 1, form: "Duchy" });
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      i: 1,
      previousForm: "County",
      previousFullName: "County of Rookwood",
      form: "Duchy",
      fullName: "Rookwood Duchy",
    });
  });
});

describe("defaultSetProvinceFormRuntime (integration)", () => {
  const labelEl = { textContent: "Old" };
  const getElementById = vi.fn((id: string) =>
    id === "provinceLabel5" ? labelEl : null,
  );

  const originalPack = (globalThis as unknown as { pack?: unknown }).pack;
  const originalDoc = (globalThis as unknown as { document?: unknown })
    .document;

  beforeEach(() => {
    labelEl.textContent = "Old";
    getElementById.mockClear();

    const provinces: RawProvince[] = [];
    provinces[0] = { i: 0 };
    provinces[5] = {
      i: 5,
      name: "Rookwood",
      formName: "County",
      fullName: "County of Rookwood",
    };
    provinces[6] = {
      i: 6,
      name: "Gone",
      formName: "Duchy",
      removed: true,
    };
    provinces[7] = {
      i: 7,
      name: "Locked",
      formName: "County",
      lock: true,
    };
    (globalThis as unknown as { pack?: unknown }).pack = { provinces };
    (globalThis as unknown as { document?: unknown }).document = {
      getElementById,
    };
  });

  afterEach(() => {
    (globalThis as unknown as { pack?: unknown }).pack = originalPack;
    (globalThis as unknown as { document?: unknown }).document = originalDoc;
  });

  it("writes pack.provinces[i].formName + fullName and refreshes the label", async () => {
    const result = await setProvinceFormTool.execute({
      province: 5,
      form: "Duchy",
    });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as unknown as { pack: { provinces: RawProvince[] } }
    ).pack;
    expect(pack.provinces[5]?.formName).toBe("Duchy");
    expect(pack.provinces[5]?.fullName).toBe("Rookwood Duchy");
    expect(labelEl.textContent).toBe("Rookwood");
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      i: 5,
      previousForm: "County",
      previousFullName: "County of Rookwood",
      form: "Duchy",
      fullName: "Rookwood Duchy",
    });
  });

  it("rejects province 0 (placeholder)", async () => {
    const result = await setProvinceFormTool.execute({
      province: 0,
      form: "Duchy",
    });
    expect(result.isError).toBe(true);
  });

  it("rejects removed provinces", async () => {
    const result = await setProvinceFormTool.execute({
      province: 6,
      form: "Duchy",
    });
    expect(result.isError).toBe(true);
    const pack = (
      globalThis as unknown as { pack: { provinces: RawProvince[] } }
    ).pack;
    expect(pack.provinces[6]?.formName).toBe("Duchy");
  });

  it("rejects locked provinces", async () => {
    const result = await setProvinceFormTool.execute({
      province: 7,
      form: "Duchy",
    });
    expect(result.isError).toBe(true);
    const pack = (
      globalThis as unknown as { pack: { provinces: RawProvince[] } }
    ).pack;
    expect(pack.provinces[7]?.formName).toBe("County");
  });

  it("rejects when pack is missing", async () => {
    (globalThis as unknown as { pack?: unknown }).pack = undefined;
    const result = await setProvinceFormTool.execute({
      province: 5,
      form: "Duchy",
    });
    expect(result.isError).toBe(true);
  });

  it("resolves by case-insensitive name in the default runtime", async () => {
    const result = await setProvinceFormTool.execute({
      province: "rookwood",
      form: "Barony",
    });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as unknown as { pack: { provinces: RawProvince[] } }
    ).pack;
    expect(pack.provinces[5]?.formName).toBe("Barony");
    expect(pack.provinces[5]?.fullName).toBe("Rookwood Barony");
  });
});
