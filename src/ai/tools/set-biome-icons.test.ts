import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type BiomeIconsRef,
  type BiomeIconsRuntime,
  createSetBiomeIconsTool,
  setBiomeIconsTool,
} from "./set-biome-icons";

function makeRuntime(find: (ref: number | string) => BiomeIconsRef | null): {
  runtime: BiomeIconsRuntime;
  apply: ReturnType<typeof vi.fn<BiomeIconsRuntime["apply"]>>;
} {
  const apply = vi.fn<BiomeIconsRuntime["apply"]>();
  return { runtime: { find, apply }, apply };
}

describe("set_biome_icons tool", () => {
  it("sets icons by numeric id", async () => {
    const { runtime, apply } = makeRuntime((ref) =>
      ref === 3
        ? {
            i: 3,
            name: "Savanna",
            previousIcons: ["acacia", "grass", "grass", "grass"],
          }
        : null,
    );
    const tool = createSetBiomeIconsTool(runtime);
    const result = await tool.execute({ biome: 3, icons: ["palm", "palm"] });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(3, ["palm", "palm"]);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 3,
      name: "Savanna",
      previousIcons: ["acacia", "grass", "grass", "grass"],
      icons: ["palm", "palm"],
    });
  });

  it("sets by case-insensitive name", async () => {
    const find = vi.fn<BiomeIconsRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "wetland"
        ? { i: 12, name: "Wetland", previousIcons: ["swamp"] }
        : null,
    );
    const { runtime, apply } = makeRuntime(find);
    const tool = createSetBiomeIconsTool(runtime);
    await tool.execute({ biome: "WETLAND", icons: ["deciduous"] });
    expect(find).toHaveBeenCalledWith("WETLAND");
    expect(apply).toHaveBeenCalledWith(12, ["deciduous"]);
  });

  it("accepts empty icons array", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousIcons: ["dune"],
    }));
    const tool = createSetBiomeIconsTool(runtime);
    const result = await tool.execute({ biome: 1, icons: [] });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(1, []);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 1,
      name: "x",
      previousIcons: ["dune"],
      icons: [],
    });
  });

  it("accepts long lists with duplicates (no upper cap)", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousIcons: [],
    }));
    const tool = createSetBiomeIconsTool(runtime);
    const big = Array.from({ length: 50 }, (_, i) =>
      i < 40 ? "grass" : "acacia",
    );
    const result = await tool.execute({ biome: 1, icons: big });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(1, big);
    expect(JSON.parse(result.content).icons).toEqual(big);
  });

  it("rejects invalid biome refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetBiomeIconsTool(runtime);
    for (const bad of [null, undefined, -1, 1.5, ""]) {
      const r = await tool.execute({ biome: bad, icons: ["grass"] });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid icons (non-array / non-string / empty-string entries)", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousIcons: [],
    }));
    const tool = createSetBiomeIconsTool(runtime);
    for (const bad of [
      null,
      undefined,
      "grass",
      42,
      {},
      [1, 2, 3],
      ["grass", ""],
      ["grass", "   "],
      ["grass", 5],
      ["grass", null],
    ]) {
      const r = await tool.execute({ biome: 1, icons: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("errors when the biome is unknown", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetBiomeIconsTool(runtime);
    const result = await tool.execute({ biome: 999, icons: ["grass"] });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const runtime: BiomeIconsRuntime = {
      find: () => ({ i: 1, name: "x", previousIcons: [] }),
      apply: vi.fn(() => {
        throw new Error("biomesData missing");
      }),
    };
    const tool = createSetBiomeIconsTool(runtime);
    const result = await tool.execute({ biome: 1, icons: ["grass"] });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/biomesData missing/);
  });
});

describe("defaultBiomeIconsRuntime (integration)", () => {
  const originalBiomes = (globalThis as { biomesData?: unknown }).biomesData;
  const originalDraw = (globalThis as { drawReliefIcons?: unknown })
    .drawReliefIcons;

  const savannaDefault = [
    "acacia",
    "grass",
    "grass",
    "grass",
    "grass",
    "grass",
    "grass",
    "grass",
    "grass",
    "grass",
  ];

  beforeEach(() => {
    (globalThis as unknown as { biomesData: unknown }).biomesData = {
      i: [0, 1, 2, 3],
      name: ["Marine", "Hot desert", "removed", "Savanna"],
      icons: [
        [],
        [
          "dune",
          "dune",
          "dune",
          "cactus",
          "cactus",
          "cactus",
          "cactus",
          "cactus",
          "cactus",
          "deadTree",
        ],
        [],
        [...savannaDefault],
      ],
    };
    (globalThis as unknown as { drawReliefIcons: unknown }).drawReliefIcons =
      vi.fn();
  });

  afterEach(() => {
    (globalThis as unknown as { biomesData: unknown }).biomesData =
      originalBiomes;
    (globalThis as unknown as { drawReliefIcons: unknown }).drawReliefIcons =
      originalDraw;
  });

  it("updates icons at the correct slot by id", async () => {
    const result = await setBiomeIconsTool.execute({
      biome: 1,
      icons: ["swamp"],
    });
    expect(result.isError).toBeFalsy();
    const biomesData = (
      globalThis as unknown as { biomesData: { icons: string[][] } }
    ).biomesData;
    expect(biomesData.icons[1]).toEqual(["swamp"]);
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.i).toBe(1);
    expect(body.name).toBe("Hot desert");
    expect(body.previousIcons).toEqual([
      "dune",
      "dune",
      "dune",
      "cactus",
      "cactus",
      "cactus",
      "cactus",
      "cactus",
      "cactus",
      "deadTree",
    ]);
    expect(body.icons).toEqual(["swamp"]);
  });

  it("finds by case-insensitive name and accepts empty", async () => {
    const result = await setBiomeIconsTool.execute({
      biome: "savanna",
      icons: [],
    });
    expect(result.isError).toBeFalsy();
    const biomesData = (
      globalThis as unknown as { biomesData: { icons: string[][] } }
    ).biomesData;
    expect(biomesData.icons[3]).toEqual([]);
    expect(JSON.parse(result.content).previousIcons).toEqual(savannaDefault);
  });

  it("stores a copy of the input (mutating input after the call is isolated)", async () => {
    const input = ["palm", "palm"];
    const result = await setBiomeIconsTool.execute({ biome: 1, icons: input });
    expect(result.isError).toBeFalsy();
    input.push("cactus");
    const biomesData = (
      globalThis as unknown as { biomesData: { icons: string[][] } }
    ).biomesData;
    expect(biomesData.icons[1]).toEqual(["palm", "palm"]);
  });

  it("previousIcons is a copy, not aliased to the stored array", async () => {
    const result = await setBiomeIconsTool.execute({
      biome: 3,
      icons: ["deciduous"],
    });
    expect(result.isError).toBeFalsy();
    const prev = JSON.parse(result.content).previousIcons as string[];
    // Mutate the response payload; stored array should be independent.
    prev.push("mutated");
    const biomesData = (
      globalThis as unknown as { biomesData: { icons: string[][] } }
    ).biomesData;
    expect(biomesData.icons[3]).toEqual(["deciduous"]);
  });

  it("calls drawReliefIcons best-effort", async () => {
    const draw = (globalThis as unknown as { drawReliefIcons: unknown })
      .drawReliefIcons as ReturnType<typeof vi.fn>;
    await setBiomeIconsTool.execute({ biome: 1, icons: ["swamp"] });
    expect(draw).toHaveBeenCalledTimes(1);
  });

  it("swallows drawReliefIcons throw (data still mutates)", async () => {
    (globalThis as unknown as { drawReliefIcons: unknown }).drawReliefIcons =
      vi.fn(() => {
        throw new Error("render failed");
      });
    const result = await setBiomeIconsTool.execute({
      biome: 3,
      icons: ["deciduous"],
    });
    expect(result.isError).toBeFalsy();
    const biomesData = (
      globalThis as unknown as { biomesData: { icons: string[][] } }
    ).biomesData;
    expect(biomesData.icons[3]).toEqual(["deciduous"]);
  });

  it("refuses to update a removed biome", async () => {
    const result = await setBiomeIconsTool.execute({
      biome: 2,
      icons: ["grass"],
    });
    expect(result.isError).toBe(true);
    const biomesData = (
      globalThis as unknown as { biomesData: { icons: string[][] } }
    ).biomesData;
    expect(biomesData.icons[2]).toEqual([]);
  });

  it("errors when biomesData is missing entirely", async () => {
    (globalThis as unknown as { biomesData: unknown }).biomesData = undefined;
    const result = await setBiomeIconsTool.execute({
      biome: 1,
      icons: ["grass"],
    });
    expect(result.isError).toBe(true);
  });
});
