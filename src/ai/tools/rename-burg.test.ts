import { describe, expect, it, vi } from "vitest";
import {
  type BurgMutationRuntime,
  type BurgRef,
  createRenameBurgTool,
  findBurgForRenameInPack,
} from "./rename-burg";

interface FakePackBurg {
  i: number;
  name: string;
  removed?: boolean;
}

function makeRuntime(burgs: FakePackBurg[]) {
  const find = vi.fn((ref: number | string): BurgRef | null => {
    if (typeof ref === "number") {
      const b = burgs[ref];
      if (!b || b.removed) return null;
      return { i: b.i, name: b.name };
    }
    const needle = ref.toLowerCase();
    for (const b of burgs) {
      if (!b || b.i === 0 || b.removed) continue;
      if (b.name.toLowerCase() === needle) return { i: b.i, name: b.name };
    }
    return null;
  });
  const rename = vi.fn((i: number, name: string): void => {
    const b = burgs[i];
    if (!b) throw new Error(`Burg ${i} not found.`);
    b.name = name;
  });
  const runtime: BurgMutationRuntime = { find, rename };
  return { runtime, find, rename, burgs };
}

function baseBurgs(): FakePackBurg[] {
  return [
    { i: 0, name: "Placeholder" },
    { i: 1, name: "Stormport" },
    { i: 2, name: "Hillhold" },
    { i: 3, name: "Gone", removed: true },
  ];
}

describe("rename_burg tool", () => {
  it("renames a burg by numeric id", async () => {
    const { runtime, rename, burgs } = makeRuntime(baseBurgs());
    const tool = createRenameBurgTool(runtime);
    const result = await tool.execute({ burg: 1, name: "Tidegarde" });
    expect(result.isError).toBeFalsy();
    expect(rename).toHaveBeenCalledWith(1, "Tidegarde");
    expect(burgs[1].name).toBe("Tidegarde");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 1,
      previousName: "Stormport",
      name: "Tidegarde",
    });
  });

  it("resolves a case-insensitive string name", async () => {
    const { runtime, rename } = makeRuntime(baseBurgs());
    const tool = createRenameBurgTool(runtime);
    await tool.execute({ burg: "stormport", name: "Tidegarde" });
    expect(rename).toHaveBeenCalledWith(1, "Tidegarde");
  });

  it("refuses the index-0 placeholder", async () => {
    const { runtime, rename } = makeRuntime(baseBurgs());
    const tool = createRenameBurgTool(runtime);
    const result = await tool.execute({ burg: 0, name: "NewName" });
    expect(result.isError).toBe(true);
    expect(rename).not.toHaveBeenCalled();
  });

  it("returns an error for unknown id or name", async () => {
    const { runtime, rename } = makeRuntime(baseBurgs());
    const tool = createRenameBurgTool(runtime);
    const a = await tool.execute({ burg: 99, name: "X" });
    const b = await tool.execute({ burg: "nowhere", name: "X" });
    expect(a.isError).toBe(true);
    expect(b.isError).toBe(true);
    expect(rename).not.toHaveBeenCalled();
  });

  it("trims names and rejects empty/whitespace", async () => {
    const { runtime, rename } = makeRuntime(baseBurgs());
    const tool = createRenameBurgTool(runtime);
    const empty = await tool.execute({ burg: 1, name: "" });
    const ws = await tool.execute({ burg: 1, name: "   " });
    expect(empty.isError).toBe(true);
    expect(ws.isError).toBe(true);
    expect(rename).not.toHaveBeenCalled();
    await tool.execute({ burg: 1, name: "  Tidegarde  " });
    expect(rename).toHaveBeenCalledWith(1, "Tidegarde");
  });

  it("surfaces runtime rename failures as error results", async () => {
    const { runtime } = makeRuntime(baseBurgs());
    runtime.rename = vi.fn(() => {
      throw new Error("write blocked during customization");
    });
    const tool = createRenameBurgTool(runtime);
    const result = await tool.execute({ burg: 1, name: "Tidegarde" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/customization/);
  });

  it("rejects invalid ref types", async () => {
    const { runtime, rename } = makeRuntime(baseBurgs());
    const tool = createRenameBurgTool(runtime);
    const cases = [
      { burg: null, name: "X" },
      { burg: 1.5, name: "X" },
      { burg: -1, name: "X" },
      { burg: "", name: "X" },
    ];
    for (const input of cases) {
      const result = await tool.execute(input);
      expect(result.isError).toBe(true);
    }
    expect(rename).not.toHaveBeenCalled();
  });
});

describe("findBurgForRenameInPack", () => {
  it("finds by id and by case-insensitive name, skipping placeholder and removed", () => {
    const burgs = new Array(4).fill(undefined);
    burgs[0] = { i: 0, name: "Placeholder" };
    burgs[1] = { i: 1, name: "Stormport" };
    burgs[2] = { i: 2, name: "Hillhold" };
    burgs[3] = { i: 3, name: "Gone", removed: true };
    const pack = { burgs };
    expect(findBurgForRenameInPack(pack, 1)).toEqual({
      i: 1,
      name: "Stormport",
    });
    expect(findBurgForRenameInPack(pack, "HILLHOLD")).toEqual({
      i: 2,
      name: "Hillhold",
    });
    expect(findBurgForRenameInPack(pack, 3)).toBeNull();
    expect(findBurgForRenameInPack(pack, 0)).toBeNull();
    expect(findBurgForRenameInPack(pack, 99)).toBeNull();
    expect(findBurgForRenameInPack(pack, "")).toBeNull();
    expect(findBurgForRenameInPack(undefined, 1)).toBeNull();
  });
});
