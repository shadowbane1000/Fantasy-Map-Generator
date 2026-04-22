import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type BiomeRemovalRuntime,
  createRemoveBiomeTool,
  DEFAULT_BIOME_COUNT,
  type RemoveBiomeRef,
  removeBiomeTool,
} from "./remove-biome";

function makeRuntime(find: (ref: number | string) => RemoveBiomeRef | null): {
  runtime: BiomeRemovalRuntime;
  remove: ReturnType<typeof vi.fn<BiomeRemovalRuntime["remove"]>>;
} {
  const remove = vi.fn<BiomeRemovalRuntime["remove"]>();
  return { runtime: { find, remove }, remove };
}

describe("remove_biome tool", () => {
  it("removes a custom biome by id", async () => {
    const { runtime, remove } = makeRuntime((ref) =>
      ref === 13 ? { i: 13, name: "Magic Grove" } : null,
    );
    const tool = createRemoveBiomeTool(runtime);
    const result = await tool.execute({ biome: 13 });
    expect(result.isError).toBeFalsy();
    expect(remove).toHaveBeenCalledWith(13);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 13,
      name: "Magic Grove",
    });
  });

  it("removes a custom biome by case-insensitive name", async () => {
    const find = vi.fn<BiomeRemovalRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "magic grove"
        ? { i: 13, name: "Magic Grove" }
        : null,
    );
    const { runtime, remove } = makeRuntime(find);
    const tool = createRemoveBiomeTool(runtime);
    await tool.execute({ biome: "MAGIC GROVE" });
    expect(find).toHaveBeenCalledWith("MAGIC GROVE");
    expect(remove).toHaveBeenCalledWith(13);
  });

  it("rejects invalid biome refs", async () => {
    const { runtime, remove } = makeRuntime(() => null);
    const tool = createRemoveBiomeTool(runtime);
    for (const bad of [null, undefined, -1, 1.5, ""]) {
      const r = await tool.execute({ biome: bad });
      expect(r.isError).toBe(true);
    }
    expect(remove).not.toHaveBeenCalled();
  });

  it("errors when the biome is unknown", async () => {
    const { runtime, remove } = makeRuntime(() => null);
    const tool = createRemoveBiomeTool(runtime);
    const result = await tool.execute({ biome: 999 });
    expect(result.isError).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  it("refuses to remove a default biome", async () => {
    for (const id of [0, 5, DEFAULT_BIOME_COUNT - 1]) {
      const { runtime, remove } = makeRuntime(() => ({
        i: id,
        name: "default",
      }));
      const tool = createRemoveBiomeTool(runtime);
      const result = await tool.execute({ biome: id });
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content).error).toMatch(/default biome/);
      expect(remove).not.toHaveBeenCalled();
    }
  });

  it("surfaces runtime failures", async () => {
    const runtime: BiomeRemovalRuntime = {
      find: () => ({ i: 13, name: "x" }),
      remove: vi.fn(() => {
        throw new Error("biomesData missing");
      }),
    };
    const tool = createRemoveBiomeTool(runtime);
    const result = await tool.execute({ biome: 13 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/biomesData missing/);
  });
});

describe("defaultBiomeRemovalRuntime (integration)", () => {
  const originalBiomes = (globalThis as { biomesData?: unknown }).biomesData;

  beforeEach(() => {
    const defaults = [
      "Marine",
      "Hot desert",
      "Cold desert",
      "Savanna",
      "Grassland",
      "Tropical seasonal forest",
      "Temperate deciduous forest",
      "Tropical rainforest",
      "Temperate rainforest",
      "Taiga",
      "Tundra",
      "Glacier",
      "Wetland",
    ];
    (globalThis as { biomesData?: unknown }).biomesData = {
      i: Array.from({ length: 15 }, (_, k) => k),
      name: [...defaults, "Custom1", "removed"],
    };
  });

  afterEach(() => {
    (globalThis as { biomesData?: unknown }).biomesData = originalBiomes;
  });

  it("marks a custom biome as removed by id", async () => {
    const result = await removeBiomeTool.execute({ biome: 13 });
    expect(result.isError).toBeFalsy();
    const biomesData = (globalThis as { biomesData: { name: string[] } })
      .biomesData;
    expect(biomesData.name[13]).toBe("removed");
  });

  it("marks a custom biome as removed by name", async () => {
    const result = await removeBiomeTool.execute({ biome: "custom1" });
    expect(result.isError).toBeFalsy();
    const biomesData = (globalThis as { biomesData: { name: string[] } })
      .biomesData;
    expect(biomesData.name[13]).toBe("removed");
  });

  it("refuses to remove a default biome", async () => {
    const result = await removeBiomeTool.execute({ biome: 5 });
    expect(result.isError).toBe(true);
    const biomesData = (globalThis as { biomesData: { name: string[] } })
      .biomesData;
    expect(biomesData.name[5]).toBe("Tropical seasonal forest");
  });

  it("already-removed biomes don't resolve (returns 404)", async () => {
    const result = await removeBiomeTool.execute({ biome: 14 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/No biome found/);
  });
});
