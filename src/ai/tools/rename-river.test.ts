import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawRiver } from "./_shared";
import {
  createRenameRiverTool,
  findRiverByRef,
  type RiverRenameRef,
  type RiverRenameRuntime,
  renameRiverTool,
} from "./rename-river";

function makeRuntime(find: (ref: number | string) => RiverRenameRef | null): {
  runtime: RiverRenameRuntime;
  rename: ReturnType<typeof vi.fn<RiverRenameRuntime["rename"]>>;
} {
  const rename = vi.fn<RiverRenameRuntime["rename"]>();
  return { runtime: { find, rename }, rename };
}

describe("rename_river tool", () => {
  it("renames a river by numeric id", async () => {
    const { runtime, rename } = makeRuntime((ref) =>
      ref === 5 ? { i: 5, name: "Old Name" } : null,
    );
    const tool = createRenameRiverTool(runtime);
    const result = await tool.execute({ river: 5, name: "Ashwater" });
    expect(result.isError).toBeFalsy();
    expect(rename).toHaveBeenCalledWith(5, "Ashwater");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 5,
      previousName: "Old Name",
      name: "Ashwater",
    });
  });

  it("renames a river by case-insensitive name", async () => {
    const find = vi.fn<RiverRenameRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "great river"
        ? { i: 1, name: "Great River" }
        : null,
    );
    const { runtime, rename } = makeRuntime(find);
    const tool = createRenameRiverTool(runtime);
    await tool.execute({ river: "GREAT RIVER", name: "Blackflow" });
    expect(find).toHaveBeenCalledWith("GREAT RIVER");
    expect(rename).toHaveBeenCalledWith(1, "Blackflow");
  });

  it("trims the name before writing", async () => {
    const { runtime, rename } = makeRuntime(() => ({ i: 1, name: "x" }));
    const tool = createRenameRiverTool(runtime);
    await tool.execute({ river: 1, name: "  Blackflow  " });
    expect(rename).toHaveBeenCalledWith(1, "Blackflow");
  });

  it("errors when the river is unknown", async () => {
    const { runtime, rename } = makeRuntime(() => null);
    const tool = createRenameRiverTool(runtime);
    const result = await tool.execute({ river: 999, name: "new" });
    expect(result.isError).toBe(true);
    expect(rename).not.toHaveBeenCalled();
  });

  it("rejects invalid river refs", async () => {
    const { runtime, rename } = makeRuntime(() => null);
    const tool = createRenameRiverTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ river: bad, name: "new" });
      expect(r.isError).toBe(true);
    }
    expect(rename).not.toHaveBeenCalled();
  });

  it("rejects invalid name", async () => {
    const { runtime, rename } = makeRuntime(() => ({ i: 1, name: "x" }));
    const tool = createRenameRiverTool(runtime);
    for (const bad of [null, undefined, "", "   ", 42, {}]) {
      const r = await tool.execute({ river: 1, name: bad });
      expect(r.isError).toBe(true);
    }
    expect(rename).not.toHaveBeenCalled();
  });

  it("allows renaming to the same name", async () => {
    const { runtime, rename } = makeRuntime(() => ({
      i: 1,
      name: "Ashwater",
    }));
    const tool = createRenameRiverTool(runtime);
    const result = await tool.execute({ river: 1, name: "Ashwater" });
    expect(result.isError).toBeFalsy();
    expect(rename).toHaveBeenCalledWith(1, "Ashwater");
  });

  it("surfaces runtime failures", async () => {
    const runtime: RiverRenameRuntime = {
      find: () => ({ i: 1, name: "x" }),
      rename: vi.fn(() => {
        throw new Error("pack missing");
      }),
    };
    const tool = createRenameRiverTool(runtime);
    const result = await tool.execute({ river: 1, name: "y" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack missing/);
  });
});

describe("findRiverByRef", () => {
  const rivers: RawRiver[] = [
    { i: 1, name: "Great River" },
    { i: 5, name: "Small Creek" },
    { i: 9, name: "Ghost River", removed: true },
    { i: 12, name: "Lone Flow" },
  ];

  it("returns null when rivers array is missing", () => {
    expect(findRiverByRef(undefined, 1)).toBeNull();
  });

  it("matches by numeric i with non-contiguous ids", () => {
    expect(findRiverByRef(rivers, 5)).toBe(rivers[1]);
    expect(findRiverByRef(rivers, 12)).toBe(rivers[3]);
    expect(findRiverByRef(rivers, 2)).toBeNull();
  });

  it("skips removed rivers", () => {
    expect(findRiverByRef(rivers, 9)).toBeNull();
    expect(findRiverByRef(rivers, "Ghost River")).toBeNull();
  });

  it("matches names case-insensitively and trims whitespace", () => {
    expect(findRiverByRef(rivers, "great river")).toBe(rivers[0]);
    expect(findRiverByRef(rivers, "  SMALL CREEK  ")).toBe(rivers[1]);
  });

  it("rejects invalid refs", () => {
    expect(findRiverByRef(rivers, 1.5)).toBeNull();
    expect(findRiverByRef(rivers, "")).toBeNull();
    expect(findRiverByRef(rivers, "   ")).toBeNull();
  });
});

describe("defaultRiverRenameRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = {
      rivers: [
        { i: 1, name: "Great River" },
        { i: 5, name: "Small Creek" },
        { i: 9, name: "Ghost River", removed: true },
        { i: 12, name: "Lone Flow" },
      ] satisfies RawRiver[],
    };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
  });

  it("renames the matching river at non-contiguous id", async () => {
    const result = await renameRiverTool.execute({
      river: 5,
      name: "Ashwater",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { rivers: RawRiver[] } }).pack;
    expect(pack.rivers[1]?.name).toBe("Ashwater");
  });

  it("refuses to rename a removed river", async () => {
    const result = await renameRiverTool.execute({
      river: 9,
      name: "Something",
    });
    expect(result.isError).toBe(true);
    const pack = (globalThis as { pack: { rivers: RawRiver[] } }).pack;
    expect(pack.rivers[2]?.name).toBe("Ghost River");
  });
});
