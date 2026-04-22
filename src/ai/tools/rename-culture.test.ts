import { describe, expect, it, vi } from "vitest";
import {
  type CultureMutationRuntime,
  type CultureRef,
  createRenameCultureTool,
  fallbackAbbreviate,
  findCultureForRenameInPack,
  type RenameResult,
} from "./rename-culture";

interface FakeCulture {
  i: number;
  name: string;
  code?: string;
  removed?: boolean;
}

function makeRuntime(cultures: FakeCulture[]) {
  const find = vi.fn((ref: number | string): CultureRef | null => {
    if (typeof ref === "number") {
      const c = cultures[ref];
      if (!c || c.removed) return null;
      return { i: c.i, name: c.name, code: c.code ?? null };
    }
    const needle = ref.toLowerCase();
    for (const c of cultures) {
      if (!c || c.i === 0 || c.removed) continue;
      if (c.name.toLowerCase() === needle)
        return { i: c.i, name: c.name, code: c.code ?? null };
    }
    return null;
  });
  const rename = vi.fn((i: number, name: string): RenameResult => {
    const c = cultures[i];
    if (!c) throw new Error(`Culture ${i} not found.`);
    c.name = name;
    c.code = fallbackAbbreviate(
      name,
      cultures
        .filter((x) => x && x.i !== i && !x.removed)
        .map((x) => x.code ?? ""),
    );
    return { code: c.code };
  });
  const runtime: CultureMutationRuntime = { find, rename };
  return { runtime, find, rename, cultures };
}

function baseCultures(): FakeCulture[] {
  return [
    { i: 0, name: "Wildlands", code: "Wi" },
    { i: 1, name: "Highlanders", code: "Hi" },
    { i: 2, name: "Coastalfolk", code: "Co" },
    { i: 3, name: "Gone", code: "Go", removed: true },
  ];
}

describe("rename_culture tool", () => {
  it("renames by numeric id and regenerates the code", async () => {
    const { runtime, rename, cultures } = makeRuntime(baseCultures());
    const tool = createRenameCultureTool(runtime);
    const result = await tool.execute({ culture: 1, name: "Pinegarde" });
    expect(result.isError).toBeFalsy();
    expect(rename).toHaveBeenCalledWith(1, "Pinegarde");
    expect(cultures[1].name).toBe("Pinegarde");
    expect(cultures[1].code).toBe("Pi");
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      i: 1,
      previousName: "Highlanders",
      previousCode: "Hi",
      name: "Pinegarde",
      code: "Pi",
    });
  });

  it("resolves a case-insensitive name reference", async () => {
    const { runtime, rename } = makeRuntime(baseCultures());
    const tool = createRenameCultureTool(runtime);
    await tool.execute({ culture: "HIGHLANDERS", name: "Pinegarde" });
    expect(rename).toHaveBeenCalledWith(1, "Pinegarde");
  });

  it("refuses the index-0 Wildlands placeholder", async () => {
    const { runtime, rename } = makeRuntime(baseCultures());
    const tool = createRenameCultureTool(runtime);
    const result = await tool.execute({ culture: 0, name: "Anything" });
    expect(result.isError).toBe(true);
    expect(rename).not.toHaveBeenCalled();
  });

  it("errors on unknown id / name", async () => {
    const { runtime, rename } = makeRuntime(baseCultures());
    const tool = createRenameCultureTool(runtime);
    const a = await tool.execute({ culture: 99, name: "x" });
    const b = await tool.execute({ culture: "nowhere", name: "x" });
    expect(a.isError).toBe(true);
    expect(b.isError).toBe(true);
    expect(rename).not.toHaveBeenCalled();
  });

  it("trims names and rejects empty/whitespace", async () => {
    const { runtime, rename } = makeRuntime(baseCultures());
    const tool = createRenameCultureTool(runtime);
    for (const input of [
      { culture: 1, name: "" },
      { culture: 1, name: "   " },
    ]) {
      const result = await tool.execute(input);
      expect(result.isError).toBe(true);
    }
    expect(rename).not.toHaveBeenCalled();
    await tool.execute({ culture: 1, name: "  Pinegarde  " });
    expect(rename).toHaveBeenCalledWith(1, "Pinegarde");
  });

  it("surfaces runtime rename failures", async () => {
    const { runtime } = makeRuntime(baseCultures());
    runtime.rename = vi.fn(() => {
      throw new Error("lock is engaged");
    });
    const tool = createRenameCultureTool(runtime);
    const result = await tool.execute({ culture: 1, name: "Pinegarde" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/lock/);
  });

  it("rejects invalid ref types", async () => {
    const { runtime, rename } = makeRuntime(baseCultures());
    const tool = createRenameCultureTool(runtime);
    for (const bad of [null, "", 1.5, -1, {}]) {
      const r = await tool.execute({ culture: bad, name: "x" });
      expect(r.isError).toBe(true);
    }
    expect(rename).not.toHaveBeenCalled();
  });
});

describe("findCultureForRenameInPack", () => {
  it("finds by id and name, skips placeholder/removed", () => {
    const pack = {
      cultures: [
        { i: 0, name: "Wildlands" },
        { i: 1, name: "Highlanders", code: "Hi" },
        { i: 2, name: "Gone", removed: true },
      ],
    };
    expect(findCultureForRenameInPack(pack, 1)).toEqual({
      i: 1,
      name: "Highlanders",
      code: "Hi",
    });
    expect(findCultureForRenameInPack(pack, "highlanders")).toEqual({
      i: 1,
      name: "Highlanders",
      code: "Hi",
    });
    expect(findCultureForRenameInPack(pack, 2)).toBeNull();
    expect(findCultureForRenameInPack(pack, 0)).toBeNull();
    expect(findCultureForRenameInPack(pack, 99)).toBeNull();
    expect(findCultureForRenameInPack(pack, "")).toBeNull();
    expect(findCultureForRenameInPack(undefined, 1)).toBeNull();
  });
});

describe("fallbackAbbreviate", () => {
  it("uses first letters of two-word names", () => {
    expect(fallbackAbbreviate("Highland Folk", [])).toBe("HF");
  });
  it("slices single-word names", () => {
    expect(fallbackAbbreviate("Pinegarde", [])).toBe("Pi");
  });
  it("avoids codes that are already taken by uppercasing a later letter", () => {
    // "Pinegarde" starts with "Pi". If "Pi" is taken the algorithm substitutes
    // letters[i] (uppercased) for the second char until a free code is found.
    expect(fallbackAbbreviate("Pinegarde", ["Pi"])).toBe("PI");
    expect(fallbackAbbreviate("Pinegarde", ["Pi", "PI"])).toBe("PN");
  });
  it("strips 'Old ' prefix and parentheses like abbreviate does", () => {
    expect(fallbackAbbreviate("Old Kingdom", [])).toBe("OK");
    expect(fallbackAbbreviate("Ring (North)", [])).toBe("RN");
  });
});
