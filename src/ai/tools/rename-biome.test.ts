import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type BiomeRenameRef,
  type BiomeRenameRuntime,
  createRenameBiomeTool,
  findBiomeByRef,
  renameBiomeTool,
} from "./rename-biome";

function makeRuntime(find: (ref: number | string) => BiomeRenameRef | null): {
  runtime: BiomeRenameRuntime;
  rename: ReturnType<typeof vi.fn<BiomeRenameRuntime["rename"]>>;
} {
  const rename = vi.fn<BiomeRenameRuntime["rename"]>();
  return { runtime: { find, rename }, rename };
}

describe("rename_biome tool", () => {
  it("renames by numeric id", async () => {
    const { runtime, rename } = makeRuntime((ref) =>
      ref === 1 ? { i: 1, name: "Hot desert" } : null,
    );
    const tool = createRenameBiomeTool(runtime);
    const result = await tool.execute({ biome: 1, name: "Scorched Waste" });
    expect(result.isError).toBeFalsy();
    expect(rename).toHaveBeenCalledWith(1, "Scorched Waste");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 1,
      previousName: "Hot desert",
      name: "Scorched Waste",
    });
  });

  it("renames by case-insensitive name", async () => {
    const find = vi.fn<BiomeRenameRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "grassland"
        ? { i: 4, name: "Grassland" }
        : null,
    );
    const { runtime, rename } = makeRuntime(find);
    const tool = createRenameBiomeTool(runtime);
    await tool.execute({ biome: "GRASSLAND", name: "Green Sea" });
    expect(find).toHaveBeenCalledWith("GRASSLAND");
    expect(rename).toHaveBeenCalledWith(4, "Green Sea");
  });

  it("trims the new name", async () => {
    const { runtime, rename } = makeRuntime(() => ({
      i: 1,
      name: "Hot desert",
    }));
    const tool = createRenameBiomeTool(runtime);
    await tool.execute({ biome: 1, name: "  Scorched  " });
    expect(rename).toHaveBeenCalledWith(1, "Scorched");
  });

  it("refuses rename-to 'removed'", async () => {
    const { runtime, rename } = makeRuntime(() => ({
      i: 1,
      name: "x",
    }));
    const tool = createRenameBiomeTool(runtime);
    const result = await tool.execute({ biome: 1, name: "removed" });
    expect(result.isError).toBe(true);
    expect(rename).not.toHaveBeenCalled();
  });

  it("errors when the biome is unknown", async () => {
    const { runtime, rename } = makeRuntime(() => null);
    const tool = createRenameBiomeTool(runtime);
    const result = await tool.execute({ biome: 999, name: "X" });
    expect(result.isError).toBe(true);
    expect(rename).not.toHaveBeenCalled();
  });

  it("rejects invalid biome refs", async () => {
    const { runtime, rename } = makeRuntime(() => null);
    const tool = createRenameBiomeTool(runtime);
    for (const bad of [null, undefined, -1, 1.5, ""]) {
      const r = await tool.execute({ biome: bad, name: "X" });
      expect(r.isError).toBe(true);
    }
    expect(rename).not.toHaveBeenCalled();
  });

  it("rejects invalid names", async () => {
    const { runtime, rename } = makeRuntime(() => ({
      i: 1,
      name: "Hot desert",
    }));
    const tool = createRenameBiomeTool(runtime);
    for (const bad of [null, undefined, "", "   ", 42, {}]) {
      const r = await tool.execute({ biome: 1, name: bad });
      expect(r.isError).toBe(true);
    }
    expect(rename).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const runtime: BiomeRenameRuntime = {
      find: () => ({ i: 1, name: "x" }),
      rename: vi.fn(() => {
        throw new Error("biomesData missing");
      }),
    };
    const tool = createRenameBiomeTool(runtime);
    const result = await tool.execute({ biome: 1, name: "X" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/biomesData missing/);
  });
});

describe("findBiomeByRef", () => {
  const biomesData = {
    i: [0, 1, 2, 3],
    name: ["Marine", "Hot desert", "removed", "Savanna"],
  };

  it("returns null when biomesData is missing or malformed", () => {
    expect(findBiomeByRef(undefined, 1)).toBeNull();
    expect(findBiomeByRef({}, 1)).toBeNull();
    expect(findBiomeByRef({ i: [] }, 1)).toBeNull();
  });

  it("matches by numeric id including 0 (Marine)", () => {
    expect(findBiomeByRef(biomesData, 0)).toEqual({
      k: 0,
      id: 0,
      name: "Marine",
    });
    expect(findBiomeByRef(biomesData, 3)).toEqual({
      k: 3,
      id: 3,
      name: "Savanna",
    });
  });

  it("skips 'removed' slots for id lookups", () => {
    expect(findBiomeByRef(biomesData, 2)).toBeNull();
  });

  it("matches by case-insensitive name and trims whitespace", () => {
    expect(findBiomeByRef(biomesData, "hot desert")?.id).toBe(1);
    expect(findBiomeByRef(biomesData, "  SAVANNA  ")?.id).toBe(3);
  });

  it("skips 'removed' slots for name lookups", () => {
    expect(findBiomeByRef(biomesData, "removed")).toBeNull();
  });

  it("rejects invalid refs", () => {
    expect(findBiomeByRef(biomesData, -1)).toBeNull();
    expect(findBiomeByRef(biomesData, 1.5)).toBeNull();
    expect(findBiomeByRef(biomesData, "")).toBeNull();
  });
});

describe("defaultBiomeRenameRuntime (integration)", () => {
  const originalBiomes = (globalThis as { biomesData?: unknown }).biomesData;

  beforeEach(() => {
    (globalThis as { biomesData?: unknown }).biomesData = {
      i: [0, 1, 2, 3],
      name: ["Marine", "Hot desert", "removed", "Savanna"],
    };
  });

  afterEach(() => {
    (globalThis as { biomesData?: unknown }).biomesData = originalBiomes;
  });

  it("renames by numeric id", async () => {
    const result = await renameBiomeTool.execute({
      biome: 1,
      name: "Scorched Waste",
    });
    expect(result.isError).toBeFalsy();
    const biomesData = (globalThis as { biomesData: { name: string[] } })
      .biomesData;
    expect(biomesData.name[1]).toBe("Scorched Waste");
  });

  it("renames by name", async () => {
    const result = await renameBiomeTool.execute({
      biome: "savanna",
      name: "Grasssea",
    });
    expect(result.isError).toBeFalsy();
    const biomesData = (globalThis as { biomesData: { name: string[] } })
      .biomesData;
    expect(biomesData.name[3]).toBe("Grasssea");
  });

  it("refuses to rename a removed biome", async () => {
    const result = await renameBiomeTool.execute({ biome: 2, name: "X" });
    expect(result.isError).toBe(true);
    const biomesData = (globalThis as { biomesData: { name: string[] } })
      .biomesData;
    expect(biomesData.name[2]).toBe("removed");
  });
});
