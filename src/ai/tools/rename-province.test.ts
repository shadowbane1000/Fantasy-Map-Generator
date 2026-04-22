import { describe, expect, it, vi } from "vitest";
import {
  createRenameProvinceTool,
  findProvinceForRenameInPack,
  type ProvinceMutationRuntime,
  type ProvinceRef,
  type ProvinceRenameUpdates,
} from "./rename-province";

interface FakeProvince {
  i: number;
  name: string;
  formName?: string;
  fullName?: string;
  removed?: boolean;
}

function makeRuntime(provinces: FakeProvince[]) {
  const find = vi.fn((ref: number | string): ProvinceRef | null => {
    if (typeof ref === "number") {
      const p = provinces[ref];
      if (!p || p.removed) return null;
      return {
        i: p.i,
        name: p.name,
        formName: p.formName ?? null,
        fullName: p.fullName ?? null,
      };
    }
    const needle = ref.toLowerCase();
    for (const p of provinces) {
      if (!p || p.i === 0 || p.removed) continue;
      if (
        p.name.toLowerCase() === needle ||
        (p.fullName ?? "").toLowerCase() === needle
      )
        return {
          i: p.i,
          name: p.name,
          formName: p.formName ?? null,
          fullName: p.fullName ?? null,
        };
    }
    return null;
  });
  const rename = vi.fn((i: number, updates: ProvinceRenameUpdates): void => {
    const p = provinces[i];
    if (!p) throw new Error(`Province ${i} not found.`);
    p.name = updates.name;
    if (updates.formName !== undefined) p.formName = updates.formName;
    if (updates.fullName !== undefined) p.fullName = updates.fullName;
  });
  const runtime: ProvinceMutationRuntime = { find, rename };
  return { runtime, find, rename, provinces };
}

function baseProvinces(): FakeProvince[] {
  return [
    { i: 0, name: "Placeholder" },
    {
      i: 1,
      name: "Rookwood",
      formName: "Duchy",
      fullName: "Duchy of Rookwood",
    },
    {
      i: 2,
      name: "Seavale",
      formName: "County",
      fullName: "County of Seavale",
    },
    { i: 3, name: "Gone", removed: true },
  ];
}

describe("rename_province tool", () => {
  it("renames by id with just the name field", async () => {
    const { runtime, rename, provinces } = makeRuntime(baseProvinces());
    const tool = createRenameProvinceTool(runtime);
    const result = await tool.execute({ province: 1, name: "Glenhold" });
    expect(result.isError).toBeFalsy();
    expect(rename).toHaveBeenCalledWith(1, { name: "Glenhold" });
    expect(provinces[1].name).toBe("Glenhold");
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      i: 1,
      previousName: "Rookwood",
      previousFormName: "Duchy",
      previousFullName: "Duchy of Rookwood",
      name: "Glenhold",
    });
  });

  it("updates formName + fullName when provided", async () => {
    const { runtime, rename, provinces } = makeRuntime(baseProvinces());
    const tool = createRenameProvinceTool(runtime);
    await tool.execute({
      province: "rookwood",
      name: "Glenhold",
      formName: "Kingdom",
      fullName: "Kingdom of Glenhold",
    });
    expect(rename).toHaveBeenCalledWith(1, {
      name: "Glenhold",
      formName: "Kingdom",
      fullName: "Kingdom of Glenhold",
    });
    expect(provinces[1].formName).toBe("Kingdom");
    expect(provinces[1].fullName).toBe("Kingdom of Glenhold");
  });

  it("rejects the index-0 placeholder", async () => {
    const { runtime, rename } = makeRuntime(baseProvinces());
    const tool = createRenameProvinceTool(runtime);
    const result = await tool.execute({ province: 0, name: "X" });
    expect(result.isError).toBe(true);
    expect(rename).not.toHaveBeenCalled();
  });

  it("errors on unknown ref", async () => {
    const { runtime, rename } = makeRuntime(baseProvinces());
    const tool = createRenameProvinceTool(runtime);
    const a = await tool.execute({ province: 999, name: "X" });
    const b = await tool.execute({ province: "nowhere", name: "X" });
    expect(a.isError).toBe(true);
    expect(b.isError).toBe(true);
    expect(rename).not.toHaveBeenCalled();
  });

  it("rejects empty / whitespace name or optional fields", async () => {
    const { runtime, rename } = makeRuntime(baseProvinces());
    const tool = createRenameProvinceTool(runtime);
    for (const bad of [
      { province: 1, name: "" },
      { province: 1, name: "   " },
      { province: 1, name: "Glenhold", formName: "   " },
      { province: 1, name: "Glenhold", fullName: "" },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
    }
    expect(rename).not.toHaveBeenCalled();
  });

  it("trims the name and forwards trimmed optional fields", async () => {
    const { runtime, rename } = makeRuntime(baseProvinces());
    const tool = createRenameProvinceTool(runtime);
    await tool.execute({
      province: 1,
      name: "  Glenhold  ",
      formName: "  Duchy  ",
      fullName: "  Duchy of Glenhold  ",
    });
    expect(rename).toHaveBeenCalledWith(1, {
      name: "Glenhold",
      formName: "Duchy",
      fullName: "Duchy of Glenhold",
    });
  });

  it("surfaces runtime rename failures", async () => {
    const { runtime } = makeRuntime(baseProvinces());
    runtime.rename = vi.fn(() => {
      throw new Error("customization active");
    });
    const tool = createRenameProvinceTool(runtime);
    const result = await tool.execute({ province: 1, name: "Glenhold" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/customization/);
  });

  it("rejects invalid ref types", async () => {
    const { runtime, rename } = makeRuntime(baseProvinces());
    const tool = createRenameProvinceTool(runtime);
    for (const bad of [null, "", 1.5, -1, {}]) {
      const r = await tool.execute({ province: bad, name: "X" });
      expect(r.isError).toBe(true);
    }
    expect(rename).not.toHaveBeenCalled();
  });
});

describe("findProvinceForRenameInPack", () => {
  it("finds by id and name/fullName, skips placeholder/removed", () => {
    const pack = {
      provinces: [
        { i: 0, name: "Placeholder" },
        { i: 1, name: "Rookwood", fullName: "Duchy of Rookwood" },
        { i: 2, name: "Gone", removed: true },
      ],
    };
    expect(findProvinceForRenameInPack(pack, 1)).toMatchObject({
      i: 1,
      name: "Rookwood",
    });
    expect(findProvinceForRenameInPack(pack, "rookwood")).toMatchObject({
      i: 1,
    });
    expect(
      findProvinceForRenameInPack(pack, "duchy of rookwood"),
    ).toMatchObject({ i: 1 });
    expect(findProvinceForRenameInPack(pack, 2)).toBeNull();
    expect(findProvinceForRenameInPack(pack, 0)).toBeNull();
    expect(findProvinceForRenameInPack(pack, 99)).toBeNull();
    expect(findProvinceForRenameInPack(pack, "")).toBeNull();
    expect(findProvinceForRenameInPack(undefined, 1)).toBeNull();
  });
});
